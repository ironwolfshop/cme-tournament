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
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 2,
}

type VideoElHints = HTMLVideoElement & { playoutDelayHint?: number }

export function tuneLowLatencyVideo(video: HTMLVideoElement) {
  video.playsInline = true
  video.muted = true
  video.autoplay = true
  video.disablePictureInPicture = true
  const hinted = video as VideoElHints
  // Small buffer — too low (0) causes flicker/stutter on LAN
  hinted.playoutDelayHint = 0.08
}

function isPcHealthy(pc: RTCPeerConnection | null | undefined) {
  if (!pc) return false
  const s = pc.connectionState
  return s === 'connected' || s === 'connecting'
}

async function tuneGameplaySender(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue
    try {
      // Detail keeps HUD text / UI sharper than "motion"
      sender.track.contentHint = 'detail'
    } catch {
      /* ignore */
    }
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }
      for (const enc of params.encodings) {
        enc.maxBitrate = 12_000_000
        enc.maxFramerate = 60
        enc.scaleResolutionDownBy = 1
        enc.priority = 'high'
        enc.networkPriority = 'high'
      }
      // Prefer sharpness over dropping resolution when the link hiccups
      params.degradationPreference = 'maintain-resolution'
      await sender.setParameters(params)
    } catch {
      /* some browsers reject encodings before negotiation */
    }
  }
}

function tuneGameplayReceiver(pc: RTCPeerConnection) {
  for (const receiver of pc.getReceivers()) {
    if (receiver.track?.kind !== 'video') continue
    try {
      const hinted = receiver as RTCRtpReceiver & { jitterBufferTarget?: number }
      // ~120ms buffer — smooth without looking delayed
      hinted.jitterBufferTarget = 120
    } catch {
      /* ignore */
    }
  }
}

/** Publish local camera to any viewers that request this slot. */
export function createCamPublisher(opts: {
  slotId: string
  stream: MediaStream
  label?: string
  onViewerCount?: (n: number) => void
  /** High-quality low-churn settings for BlueStacks gameplay share. */
  lowLatency?: boolean
}) {
  const peers = new Map<string, RTCPeerConnection>()
  let alive = true
  const connecting = new Set<string>()

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
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(msg.sdp)
        }
      } catch {
        /* ignore duplicate answers */
      }
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
    // Already healthy — do NOT tear down (that was the flicker)
    const existing = peers.get(viewerId)
    if (isPcHealthy(existing)) return
    if (connecting.has(viewerId)) return
    connecting.add(viewerId)

    try {
      if (existing) {
        existing.close()
        peers.delete(viewerId)
      }
      const pc = new RTCPeerConnection(ICE)
      peers.set(viewerId, pc)
      opts.onViewerCount?.(peers.size)

      for (const track of opts.stream.getTracks()) {
        pc.addTrack(track, opts.stream)
      }
      if (opts.lowLatency) {
        void tuneGameplaySender(pc)
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
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          peers.delete(viewerId)
          opts.onViewerCount?.(peers.size)
        }
        // Ignore brief "disconnected" — ICE may recover without full renegotiation
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })
      await pc.setLocalDescription(offer)
      // Apply bitrate after local description when browsers allow it
      if (opts.lowLatency) {
        void tuneGameplaySender(pc)
      }
      sendCam({
        kind: 'offer',
        slotId: opts.slotId,
        toId: viewerId,
        sdp: offer,
        label: opts.label,
      })
    } finally {
      connecting.delete(viewerId)
    }
  }

  sendCam({ kind: 'announce', slotId: opts.slotId, label: opts.label })
  // Soft re-announce for late joiners only — viewers ignore if already live
  const announceTimer = opts.lowLatency
    ? window.setInterval(() => {
        if (alive) sendCam({ kind: 'announce', slotId: opts.slotId, label: opts.label })
      }, 15000)
    : null

  return {
    announce() {
      sendCam({ kind: 'announce', slotId: opts.slotId, label: opts.label })
    },
    stop() {
      alive = false
      if (announceTimer != null) window.clearInterval(announceTimer)
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
  lowLatency?: boolean
}) {
  let pc: RTCPeerConnection | null = null
  let alive = true
  let retryTimer: number | null = null
  let live = false

  function requestOffer(force = false) {
    if (!alive) return
    // Stay on a healthy link — renegotiating every announce caused flicker
    if (!force && (live || isPcHealthy(pc))) return
    if (!live) opts.onStatus?.('connecting')
    sendCam({ kind: 'need-offer', slotId: opts.slotId })
  }

  const unsub = subscribeCam(async (msg: CamRelayMessage) => {
    if (!alive) return
    if (msg.slotId !== opts.slotId) return
    if (msg.fromId === getPeerId()) return

    if (msg.kind === 'announce') {
      requestOffer(false)
      return
    }
    if (msg.kind === 'bye') {
      live = false
      teardownPc()
      opts.onStatus?.('idle')
      opts.video.srcObject = null
      return
    }
    if (msg.kind === 'offer' && msg.toId === getPeerId() && msg.sdp) {
      // Ignore duplicate offers while already live
      if (live && isPcHealthy(pc)) return

      teardownPc()
      pc = new RTCPeerConnection(ICE)
      if (opts.lowLatency) tuneLowLatencyVideo(opts.video)
      pc.ontrack = (ev) => {
        if (opts.lowLatency) tuneGameplayReceiver(pc!)
        const stream = ev.streams[0] ?? new MediaStream([ev.track])
        // Keep the same srcObject if identical — avoids flash
        if (opts.video.srcObject !== stream) {
          opts.video.srcObject = stream
        }
        void opts.video.play().catch(() => undefined)
        live = true
        opts.onStatus?.('live')
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
        if (pc.connectionState === 'connected') {
          live = true
          opts.onStatus?.('live')
        } else if (pc.connectionState === 'failed') {
          live = false
          opts.onStatus?.('error')
          scheduleRetry()
        }
      }
      await pc.setRemoteDescription(msg.sdp)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendCam({
        kind: 'answer',
        slotId: opts.slotId,
        toId: msg.fromId,
        sdp: answer,
      })
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
    }, 2500)
  }

  window.setTimeout(() => requestOffer(false), 300)
  // Rare poll for late publishers — skipped while already live
  const poll = window.setInterval(() => requestOffer(false), 20000)

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

export async function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  })
}
