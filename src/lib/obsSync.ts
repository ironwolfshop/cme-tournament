export type SyncChannel =
  | 'draft'
  | 'gameplay'
  | 'stinger'
  | 'bracket'
  | 'cams'
  | 'lineup'
  | 'tournament'
  | 'casters'

type Listener = (payload: unknown) => void
type CamListener = (msg: CamRelayMessage) => void

export type CamRelayMessage = {
  type: 'cam'
  kind: 'announce' | 'bye' | 'need-offer' | 'offer' | 'answer' | 'ice'
  slotId: string
  fromId: string
  toId?: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit | null
  label?: string
}

type HubMessage =
  | { type: 'snapshot'; channels: Partial<Record<SyncChannel, unknown>> }
  | { type: 'update'; channel: SyncChannel; payload: unknown }
  | { type: 'pong' }
  | CamRelayMessage

type Outbound =
  | { type: 'push'; channel: SyncChannel; payload: unknown }
  | CamRelayMessage
  | { type: 'ping' }

const listeners = new Map<SyncChannel, Set<Listener>>()
const camListeners = new Set<CamListener>()
let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let started = false
let pingTimer: number | null = null
let reconnectAttempt = 0
let connectGeneration = 0
/** Latest push per channel while offline — flushed on reconnect. */
const pendingByChannel = new Map<SyncChannel, unknown>()
const pendingCam: Outbound[] = []
const MAX_PENDING_CAM = 64

const peerId =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function getPeerId() {
  return peerId
}

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/sync/ws`
}

function emit(channel: SyncChannel, payload: unknown) {
  const set = listeners.get(channel)
  if (!set) return
  for (const fn of [...set]) {
    try {
      fn(payload)
    } catch {
      /* ignore */
    }
  }
}

function emitCam(msg: CamRelayMessage) {
  for (const fn of [...camListeners]) {
    try {
      fn(msg)
    } catch {
      /* ignore */
    }
  }
}

function sendRaw(msg: Outbound) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  try {
    socket.send(JSON.stringify(msg))
    return true
  } catch {
    return false
  }
}

function flushPending() {
  for (const [channel, payload] of pendingByChannel) {
    if (!sendRaw({ type: 'push', channel, payload })) break
    pendingByChannel.delete(channel)
  }
  while (pendingCam.length) {
    const next = pendingCam[0]
    if (!sendRaw(next)) break
    pendingCam.shift()
  }
}

function scheduleReconnect() {
  if (reconnectTimer != null) return
  const delay = Math.min(8000, 400 * 2 ** Math.min(reconnectAttempt, 4))
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function connect() {
  if (typeof window === 'undefined') return
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  const gen = ++connectGeneration

  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  const current = socket

  current.addEventListener('open', () => {
    if (gen !== connectGeneration || socket !== current) return
    reconnectAttempt = 0
    if (pingTimer != null) window.clearInterval(pingTimer)
    pingTimer = window.setInterval(() => {
      sendRaw({ type: 'ping' })
    }, 20000)
    flushPending()
  })

  current.addEventListener('message', (event) => {
    if (gen !== connectGeneration) return
    try {
      const msg = JSON.parse(String(event.data)) as HubMessage
      if (msg.type === 'snapshot' && msg.channels) {
        for (const [key, value] of Object.entries(msg.channels)) {
          if (value != null) emit(key as SyncChannel, value)
        }
        return
      }
      if (msg.type === 'update' && msg.channel) {
        emit(msg.channel, msg.payload)
        return
      }
      if (msg.type === 'cam') {
        emitCam(msg)
      }
    } catch {
      /* ignore */
    }
  })

  current.addEventListener('close', () => {
    if (gen !== connectGeneration) return
    if (socket === current) socket = null
    if (pingTimer != null) {
      window.clearInterval(pingTimer)
      pingTimer = null
    }
    scheduleReconnect()
  })

  current.addEventListener('error', () => {
    if (gen !== connectGeneration) return
    try {
      current.close()
    } catch {
      /* ignore */
    }
  })
}

export function ensureObsSync() {
  if (started) return
  started = true
  connect()
}

export function subscribeSync(channel: SyncChannel, listener: Listener) {
  ensureObsSync()
  let set = listeners.get(channel)
  if (!set) {
    set = new Set()
    listeners.set(channel, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
  }
}

export function subscribeCam(listener: CamListener) {
  ensureObsSync()
  camListeners.add(listener)
  return () => {
    camListeners.delete(listener)
  }
}

export function sendCam(
  msg: Omit<CamRelayMessage, 'type' | 'fromId'> & { fromId?: string },
) {
  ensureObsSync()
  const full: CamRelayMessage = {
    type: 'cam',
    fromId: msg.fromId ?? peerId,
    kind: msg.kind,
    slotId: msg.slotId,
    toId: msg.toId,
    sdp: msg.sdp,
    candidate: msg.candidate,
    label: msg.label,
  }
  if (sendRaw(full)) return
  pendingCam.push(full)
  while (pendingCam.length > MAX_PENDING_CAM) pendingCam.shift()
}

export function pushSync(channel: SyncChannel, payload: unknown) {
  ensureObsSync()
  // Always keep the newest payload for this channel (coalesce bursts).
  pendingByChannel.set(channel, payload ?? null)
  if (sendRaw({ type: 'push', channel, payload: payload ?? null })) {
    pendingByChannel.delete(channel)
    return
  }
  // Offline: queued until open; HTTP fallback so OBS still gets a copy.
  void fetch(`/api/sync/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? null),
  }).catch(() => {
    /* ignore */
  })
}

export function fetchSync(channel: SyncChannel): Promise<unknown> {
  return fetch(`/api/sync/${channel}`)
    .then(async (r) => {
      const text = await r.text()
      if (!r.ok) return null
      if (text.trimStart().startsWith('<')) return null
      try {
        return JSON.parse(text) as unknown
      } catch {
        return null
      }
    })
    .catch(() => null)
}

/** True when the hub socket is open (for control UI status). */
export function isObsSyncConnected() {
  return socket?.readyState === WebSocket.OPEN
}
