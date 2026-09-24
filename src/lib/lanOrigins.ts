import { useEffect, useState } from 'react'

export const LOCAL_OBS_ORIGIN = 'http://localhost:5173'
const DEFAULT_PORT = 5173
const DEFAULT_HTTPS_PORT = 5174

export type LanOrigins = {
  /** OBS / this PC */
  local: string
  /** First LAN IP (HTTP) — laptop viewers / OBS on LAN */
  lan: string | null
  /**
   * First LAN IP over HTTPS (:5174).
   * Required for getDisplayMedia / getUserMedia when not on localhost.
   */
  secureLan: string | null
  /** All discovered LAN IPs */
  lanIps: string[]
  port: number
  httpsPort: number
  ready: boolean
}

function currentOriginFallback(): string {
  if (typeof window === 'undefined') return LOCAL_OBS_ORIGIN
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return LOCAL_OBS_ORIGIN
  const port = window.location.port || String(DEFAULT_PORT)
  const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
  return `${proto}//${host}:${port}`
}

export function emptyLanOrigins(): LanOrigins {
  return {
    local: LOCAL_OBS_ORIGIN,
    lan: null,
    secureLan: null,
    lanIps: [],
    port: DEFAULT_PORT,
    httpsPort: DEFAULT_HTTPS_PORT,
    ready: false,
  }
}

/** Fetch LAN IPs from the Vite hub (`/api/lan`). */
export async function fetchLanOrigins(): Promise<LanOrigins> {
  const local = LOCAL_OBS_ORIGIN
  try {
    const res = await fetch('/api/lan')
    if (!res.ok) {
      return { ...emptyLanOrigins(), local: currentOriginFallback(), ready: true }
    }
    const data = (await res.json()) as {
      ips?: string[]
      port?: number
      httpsPort?: number
    }
    const port = data.port || DEFAULT_PORT
    const httpsPort = data.httpsPort || DEFAULT_HTTPS_PORT
    const lanIps = (data.ips ?? []).filter(Boolean)
    const host =
      typeof window !== 'undefined' ? window.location.hostname : ''
    // If already browsing via LAN IP, keep that as primary lan
    const preferred =
      lanIps.find((ip) => ip === host) ?? lanIps[0] ?? null
    return {
      local,
      lan: preferred ? `http://${preferred}:${port}` : null,
      secureLan: preferred ? `https://${preferred}:${httpsPort}` : null,
      lanIps,
      port,
      httpsPort,
      ready: true,
    }
  } catch {
    return { ...emptyLanOrigins(), local: currentOriginFallback(), ready: true }
  }
}

export function absoluteUrl(origin: string, path: string) {
  if (!path) return origin
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

/** React hook — localhost + LAN origins for scene / OBS links. */
export function useLanOrigins() {
  const [origins, setOrigins] = useState<LanOrigins>(() => ({
    ...emptyLanOrigins(),
    local: currentOriginFallback(),
  }))

  useEffect(() => {
    let cancelled = false
    void fetchLanOrigins().then((next) => {
      if (!cancelled) setOrigins(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return origins
}

/** Browsers only expose getDisplayMedia on localhost or HTTPS. */
export function canUseDisplayCapture() {
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getDisplayMedia)
}

/**
 * True when this page is open on plain HTTP over a LAN IP
 * (Wi‑Fi) — window share / camera APIs will be missing.
 */
export function isInsecureLanHttp() {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return false
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return false
  return window.location.protocol === 'http:'
}

export function displayCaptureBlockedMessage() {
  if (canUseDisplayCapture()) return null
  if (isInsecureLanHttp()) {
    return 'Window share is blocked on Wi‑Fi HTTP. Open localhost on this PC, or use the HTTPS Wi‑Fi link (port 5174) and accept the cert warning once.'
  }
  return 'This browser cannot share a window here. Use Chrome/Edge on http://localhost:5173 or https://LAN-IP:5174.'
}
