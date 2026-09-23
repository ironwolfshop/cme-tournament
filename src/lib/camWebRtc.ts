import {
  getPeerId,
  sendCam,
  subscribeCam,
  type CamRelayMessage,
} from './obsSync'

/** Team cams + dedicated shoutcaster publish slot */
export type TeamCamId = 'blue' | 'red'
export type CamSlotId = TeamCamId | 'caster'

export const TEAM_CAMS: TeamCamId[] = ['blue', 'red']
export const CAM_SLOTS: CamSlotId[] = ['blue', 'red', 'caster']

export function isTeamCamId(id: string): id is TeamCamId {
  return id === 'blue' || id === 'red'
}

export function isCamSlotId(id: string): id is CamSlotId {
  return id === 'blue' || id === 'red' || id === 'caster'
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/** Publish local camera to any viewers that request this slot. */
export function createCamPublisher(opts: {
  slotId: string
  stream: MediaStream
  label?: string
  onViewerCount?: (n: number) => void
}) {
  const peers = new Map<string, RTCPeerConnection>()
  let alive = true

  const unsub = subscribeCam(async (msg) => {
    if (!alive) return
    if (msg.slotId !== opts.slotId) return
    if (msg.fromId === getPeerId()) return

    if (msg.kind === 'need-offer') {
      await connectViewer(msg.fromId)
      return
    }
    if (msg.kind === 'answer' && msg.toId === getPeerId() && msg.sdp) {
      const pc = peers.get(msg.fromId)
      if (!pc) return
      await pc.setRemoteDescription(msg.sdp)
      return
    }
    if (msg.kind === 'ice' && msg.toId === getPeerId() && msg.candidate) {
      const pc = peers.get(msg.fromId)
      if (!pc) return
      try {
        await pc.addIceCandidate(msg.candidate)
      } catch {
        /* ignore */
      }
    }
  })

  async function connectViewer(viewerId: string) {
    if (peers.has(viewerId)) {
      peers.get(viewerId)?.close()
      peers.delete(viewerId)
    }
    const pc = new RTCPeerConnection(ICE)
    peers.set(viewerId, pc)
    opts.onViewerCount?.(peers.size)

    for (const track of opts.stream.getTracks()) {
      pc.addTrack(track, opts.stream)
    }

    pc.onicecandidate = (ev) => {
      sendCam({
        kind: 'ice',
        slotId: opts.slotId,
        toId: viewerId,
        candidate: ev.candidate ? ev.candidate.toJSON() : null,
      })
    }

    pc.onconnectionstatechange = () => {
      // 'disconnected' is often a brief ICE blip — do NOT drop the peer or the
      // viewer will request a fresh offer and the feed blacks out every second.
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peers.delete(viewerId)
        opts.onViewerCount?.(peers.size)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendCam({
      kind: 'offer',
      slotId: opts.slotId,
      toId: viewerId,
      sdp: offer,
      label: opts.label,
    })
  }

  sendCam({ kind: 'announce', slotId: opts.slotId, label: opts.label })

  return {
    announce() {
      sendCam({ kind: 'announce', slotId: opts.slotId, label: opts.label })
    },
    stop() {
      alive = false
      unsub()
      for (const pc of peers.values()) pc.close()
      peers.clear()
      sendCam({ kind: 'bye', slotId: opts.slotId })
      opts.onViewerCount?.(0)
    },
  }
}

/** Receive a remote camera into a <video> element. */
export function createCamViewer(opts: {
  slotId: string
  video: HTMLVideoElement
  onStatus?: (status: 'connecting' | 'live' | 'idle' | 'error') => void
}) {
  let pc: RTCPeerConnection | null = null
  let alive = true
  let retryTimer: number | null = null
  let live = false

  function isHealthy() {
    if (!pc) return false
    const s = pc.connectionState
    return s === 'connected' || s === 'connecting'
  }

  function requestOffer(force = false) {
    if (!alive) return
    // Stay on a healthy stream — polling must not force reconnect blackouts
    if (!force && isHealthy() && opts.video.srcObject) return
    if (!opts.video.srcObject) opts.onStatus?.('connecting')
    sendCam({ kind: 'need-offer', slotId: opts.slotId })
  }

  const unsub = subscribeCam(async (msg: CamRelayMessage) => {
    if (!alive) return
    if (msg.slotId !== opts.slotId) return
    if (msg.fromId === getPeerId()) return

    if (msg.kind === 'announce') {
      requestOffer()
      return
    }
    if (msg.kind === 'bye') {
      teardownPc()
      live = false
      opts.onStatus?.('idle')
      opts.video.srcObject = null
      return
    }
    if (msg.kind === 'offer' && msg.toId === getPeerId() && msg.sdp) {
      // If already live, ignore duplicate offers from the 8s poll / announce spam
      if (isHealthy() && opts.video.srcObject && live) return

      const previous = pc
      pc = new RTCPeerConnection(ICE)
      pc.ontrack = (ev) => {
        opts.video.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
        void opts.video.play().catch(() => undefined)
        live = true
        opts.onStatus?.('live')
        // Close old PC only after the new track is attached (no black frame)
        if (previous && previous !== pc) {
          try {
            previous.close()
          } catch {
            /* ignore */
          }
        }
      }
      pc.onicecandidate = (ev) => {
        sendCam({
          kind: 'ice',
          slotId: opts.slotId,
          toId: msg.fromId,
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        })
      }
      pc.onconnectionstatechange = () => {
        if (!pc) return
        if (pc.connectionState === 'failed') {
          live = false
          opts.onStatus?.('error')
          scheduleRetry()
        }
      }
      try {
        await pc.setRemoteDescription(msg.sdp)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendCam({
          kind: 'answer',
          slotId: opts.slotId,
          toId: msg.fromId,
          sdp: answer,
        })
      } catch {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
        pc = previous
      }
      return
    }
    if (msg.kind === 'ice' && msg.toId === getPeerId() && msg.candidate && pc) {
      try {
        await pc.addIceCandidate(msg.candidate)
      } catch {
        /* ignore */
      }
    }
  })

  function teardownPc() {
    pc?.close()
    pc = null
  }

  function scheduleRetry() {
    if (retryTimer != null) return
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      requestOffer(true)
    }, 2000)
  }

  window.setTimeout(() => requestOffer(true), 300)
  // Health check only — requestOffer is a no-op while connected
  const poll = window.setInterval(() => requestOffer(false), 12000)

  return {
    refresh: () => requestOffer(true),
    stop() {
      alive = false
      unsub()
      window.clearInterval(poll)
      if (retryTimer != null) window.clearTimeout(retryTimer)
      teardownPc()
      opts.video.srcObject = null
    },
  }
}

export function cameraApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export function isInsecureCamContext(): boolean {
  if (typeof window === 'undefined') return false
  // localhost / 127.0.0.1 stay secure on HTTP; LAN IPs need HTTPS for camera
  const host = window.location.hostname
  const local =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  return !window.isSecureContext && !local
}

/** Phone publisher URL on the dedicated HTTPS port (:5174). */
export function phoneCamHttpsUrl(path = '/cam'): string {
  if (typeof window === 'undefined') return `https://localhost:5174${path}`
  const host = window.location.hostname
  const safeHost =
    host === 'localhost' || host === '127.0.0.1' ? 'localhost' : host
  return `https://${safeHost}:5174${path}${window.location.search}`
}

export async function openCamera(deviceId?: string) {
  const media = navigator.mediaDevices
  if (!media?.getUserMedia) {
    const needsHttps = isInsecureCamContext()
    throw new Error(
      needsHttps
        ? `Camera needs HTTPS — open ${phoneCamHttpsUrl('/cam')} (accept the certificate warning once)`
        : 'Camera API unavailable in this browser. Use Chrome/Safari over HTTPS.',
    )
  }

  try {
    return await media.getUserMedia({
      audio: false,
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
    })
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied — allow camera access and try again')
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera found on this device')
      }
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Camera is in use by another app — close it and retry')
      }
    }
    throw err instanceof Error ? err : new Error('Could not open camera')
  }
}
