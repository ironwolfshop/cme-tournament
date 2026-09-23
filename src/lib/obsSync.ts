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

const listeners = new Map<SyncChannel, Set<Listener>>()
const camListeners = new Set<CamListener>()
let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let started = false
let pingTimer: number | null = null
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

function scheduleReconnect() {
  if (reconnectTimer != null) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 800)
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

  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  socket.addEventListener('open', () => {
    if (pingTimer != null) window.clearInterval(pingTimer)
    pingTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)
  })

  socket.addEventListener('message', (event) => {
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

  socket.addEventListener('close', () => {
    socket = null
    if (pingTimer != null) {
      window.clearInterval(pingTimer)
      pingTimer = null
    }
    scheduleReconnect()
  })

  socket.addEventListener('error', () => {
    try {
      socket?.close()
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

export function sendCam(msg: Omit<CamRelayMessage, 'type' | 'fromId'> & { fromId?: string }) {
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
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(full))
    return
  }
  // Retry shortly once WS is up
  window.setTimeout(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(full))
    }
  }, 400)
}

export function pushSync(channel: SyncChannel, payload: unknown) {
  ensureObsSync()
  const body = JSON.stringify(payload ?? null)
  const envelope = JSON.stringify({ type: 'push', channel, payload })

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(envelope)
    return
  }

  // WS still connecting — POST so the hub updates, then also retry WS once open
  void fetch(`/api/sync/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    /* ignore */
  })

  if (socket?.readyState === WebSocket.CONNECTING) {
    const retry = () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(envelope)
      }
    }
    socket.addEventListener('open', retry, { once: true })
  }
}

export function fetchSync(channel: SyncChannel): Promise<unknown> {
  return fetch(`/api/sync/${channel}`)
    .then((r) => r.json())
    .catch(() => null)
}
