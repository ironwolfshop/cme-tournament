import { createCamPublisher } from './camWebRtc'
import {
  absoluteUrl,
  canUseDisplayCapture,
  displayCaptureBlockedMessage,
  fetchLanOrigins,
  LOCAL_OBS_ORIGIN,
} from './lanOrigins'
import { useCamsStore } from '../store/camsStore'

/** Dedicated WebRTC slot for the BlueStacks / game-window share. */
export const GAMEPLAY_SLOT = 'gameplay'

type Listener = () => void

let stream: MediaStream | null = null
let publisher: ReturnType<typeof createCamPublisher> | null = null
let viewerCount = 0
let sourceLabel = ''
let unloadBound = false
const listeners = new Set<Listener>()

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

function bindUnload() {
  if (unloadBound || typeof window === 'undefined') return
  unloadBound = true
  window.addEventListener('pagehide', () => stopGameplayCapture())
}

function labelFromTrack(track: MediaStreamTrack | undefined) {
  if (!track) return 'Shared window'
  const settings = track.getSettings() as MediaTrackSettings & {
    displaySurface?: string
  }
  const raw = (track.label || '').trim()
  if (raw) return raw
  if (settings.displaySurface === 'monitor') return 'Entire screen'
  if (settings.displaySurface === 'browser') return 'Browser tab'
  return 'Shared window'
}

export function subscribeGameplayCapture(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getGameplayStream() {
  return stream
}

export function getGameplaySourceLabel() {
  return sourceLabel
}

export function isGameplayCapturing() {
  return Boolean(
    stream?.getVideoTracks().some((track) => track.readyState === 'live'),
  )
}

export function getGameplayViewerCount() {
  return viewerCount
}

export function gameplayWatchPath() {
  return '/watch/gameplay'
}

export function gameplayWatchUrl() {
  if (typeof window === 'undefined') return `${LOCAL_OBS_ORIGIN}/watch/gameplay`
  return `${window.location.origin}/watch/gameplay`
}

/** Prefer a LAN IP so shoutcaster PCs can open the viewer. */
export async function resolveGameplayWatchUrl() {
  const origins = await fetchLanOrigins()
  if (origins.lan) return absoluteUrl(origins.lan, '/watch/gameplay')
  return absoluteUrl(origins.local, '/watch/gameplay')
}

export function openGameplayViewerWindow() {
  const url = gameplayWatchUrl()
  window.open(
    url,
    'cme-gameplay-preview',
    'popup=yes,noopener,noreferrer,width=1600,height=900',
  )
}

/**
 * Opens the browser picker so you choose Window / Screen / Tab.
 * Prefer Window (BlueStacks). Pass `{ force: true }` to pick a different
 * source even when already sharing.
 */
export async function startGameplayCapture(opts?: {
  force?: boolean
}): Promise<MediaStream> {
  if (!opts?.force && isGameplayCapturing() && stream) return stream

  if (!canUseDisplayCapture()) {
    throw new Error(
      displayCaptureBlockedMessage() ||
        'Window share unavailable in this browser context.',
    )
  }

  stopGameplayCapture()

  // Prefer Window tab in Chrome's picker — cast BlueStacks / App Player, not the whole monitor.
  const next = await navigator.mediaDevices!.getDisplayMedia({
    video: {
      displaySurface: 'window',
      // Ask for a sharp, smooth capture — browser may settle lower if the window is smaller
      frameRate: { ideal: 60, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    } as MediaTrackConstraints,
    audio: false,
    // Chromium extras — hide monitor / this tab when supported
    ...({
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      systemAudio: 'exclude',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude',
    } as DisplayMediaStreamOptions),
  })

  const track = next.getVideoTracks()[0]
  sourceLabel = labelFromTrack(track)
  if (track) {
    try {
      await track.applyConstraints({
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      })
    } catch {
      /* some browsers reject post-constraints */
    }
    try {
      // Detail keeps BlueStacks UI / text sharper than motion
      track.contentHint = 'detail'
    } catch {
      /* ignore */
    }
    track.addEventListener('ended', () => stopGameplayCapture())
  }

  stream = next
  viewerCount = 0
  publisher = createCamPublisher({
    slotId: GAMEPLAY_SLOT,
    stream: next,
    label: sourceLabel || 'Gameplay',
    lowLatency: true,
    onViewerCount: (n) => {
      viewerCount = n
      emit()
    },
  })
  useCamsStore.getState().setGameplayLive(true)
  bindUnload()
  emit()
  return next
}

export function stopGameplayCapture() {
  publisher?.stop()
  publisher = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  viewerCount = 0
  sourceLabel = ''
  useCamsStore.getState().setGameplayLive(false)
  emit()
}
