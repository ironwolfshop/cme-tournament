import { useEffect, useRef, useState } from 'react'
import {
  cameraApiAvailable,
  createCamPublisher,
  isCamSlotId,
  isInsecureCamContext,
  openCamera,
  phoneCamHttpsUrl,
  type CamSlotId,
} from '../lib/camWebRtc'
import { ensureObsSync } from '../lib/obsSync'
import {
  codesMatch,
  initCamsSync,
  useCamsStore,
} from '../store/camsStore'

/**
 * Phone/laptop join page — access code → pick slot → publish feed.
 * Camera requires a secure context (HTTPS :5174 on phones / LAN).
 */
export default function CamJoinPage() {
  const store = useCamsStore()
  const [code, setCode] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [slot, setSlot] = useState<CamSlotId | null>(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [httpsReady, setHttpsReady] = useState(() => cameraApiAvailable())

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const publisherRef = useRef<ReturnType<typeof createCamPublisher> | null>(null)
  const phoneUrl = phoneCamHttpsUrl('/cam')

  useEffect(() => {
    ensureObsSync()
    initCamsSync()
    document.documentElement.style.background = '#071018'
    document.body.style.background = '#071018'
  }, [])

  // Auto-bounce insecure LAN HTTP → phone HTTPS so getUserMedia exists
  useEffect(() => {
    if (!isInsecureCamContext()) {
      setHttpsReady(cameraApiAvailable())
      return
    }
    const target = phoneCamHttpsUrl('/cam')
    setError('Camera blocked on HTTP. Redirecting to secure cam link…')
    const t = window.setTimeout(() => {
      window.location.replace(target)
    }, 600)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    return () => {
      publisherRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (slot) useCamsStore.getState().setSlotLive(slot, false)
    }
  }, [slot])

  function unlock(e: React.FormEvent) {
    e.preventDefault()
    if (!codesMatch(code, store.accessCode)) {
      setError('Wrong access code')
      return
    }
    setError(null)
    setUnlocked(true)
  }

  async function publish() {
    if (!slot || !isCamSlotId(slot)) return
    if (!cameraApiAvailable()) {
      setError(
        `Camera needs HTTPS — open ${phoneUrl} (accept the certificate warning once)`,
      )
      setHttpsReady(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      publisherRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())

      const stream = await openCamera()
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }

      const label =
        slot === 'blue'
          ? store.blueName
          : slot === 'red'
            ? store.redName
            : store.casterName
      publisherRef.current = createCamPublisher({
        slotId: slot,
        stream,
        label,
      })
      setLive(true)
      store.setSlotLive(slot, true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Camera blocked — use HTTPS and allow camera',
      )
      setLive(false)
      store.setSlotLive(slot, false)
    } finally {
      setBusy(false)
    }
  }

  function stop() {
    publisherRef.current?.stop()
    publisherRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setLive(false)
    if (slot) store.setSlotLive(slot, false)
  }

  const slotName =
    slot === 'blue'
      ? store.blueName
      : slot === 'red'
        ? store.redName
        : slot === 'caster'
          ? store.casterName
          : ''

  const showSecureGate = !httpsReady || isInsecureCamContext()

  return (
    <div className="min-h-screen bg-[#071018] px-4 py-8 text-white font-ui">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.35em] text-teal-300">
            CME ML TOURNAMENT
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold">Cam publisher</h1>
          <p className="mt-1 text-sm text-slate-400">{store.matchName}</p>
        </div>

        {showSecureGate ? (
          <div className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-5 text-center">
            <p className="text-sm leading-relaxed text-amber-100">
              Camera publish only works over <b>HTTPS</b> (port 5174). HTTP LAN
              links hide the camera API and break Publish feed.
            </p>
            <a
              href={phoneUrl}
              className="block w-full rounded-xl bg-emerald-600 py-3.5 text-lg font-bold hover:bg-emerald-500"
            >
              Open secure cam link
            </a>
            <p className="break-all text-xs text-amber-200/80">{phoneUrl}</p>
            <p className="text-xs text-slate-400">
              Accept the certificate warning once, then publish again.
            </p>
            {error && (
              <p className="text-center text-sm text-rose-300">{error}</p>
            )}
          </div>
        ) : !unlocked ? (
          <form
            onSubmit={unlock}
            className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"
          >
            <label className="block text-sm">
              <span className="mb-1.5 block text-slate-400">Access code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                placeholder="Enter code"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3.5 text-center text-2xl font-bold tracking-[0.2em] text-white"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-teal-600 py-3.5 text-lg font-bold hover:bg-teal-500"
            >
              Enter
            </button>
            {error && (
              <p className="text-center text-sm text-rose-300">{error}</p>
            )}
          </form>
        ) : !slot ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-center text-sm text-slate-300">Which camera?</p>
            <button
              type="button"
              onClick={() => setSlot('caster')}
              className="w-full rounded-xl bg-amber-600 py-4 text-lg font-bold hover:bg-amber-500"
            >
              {store.casterName}
              <span className="mt-1 block text-xs font-semibold uppercase tracking-wider text-amber-100/80">
                Shoutcaster window
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSlot('blue')}
              className="w-full rounded-xl bg-sky-600 py-4 text-lg font-bold hover:bg-sky-500"
            >
              {store.blueName}
            </button>
            <button
              type="button"
              onClick={() => setSlot('red')}
              className="w-full rounded-xl bg-rose-600 py-4 text-lg font-bold hover:bg-rose-500"
            >
              {store.redName}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`rounded-2xl border p-3 text-center ${
                slot === 'blue'
                  ? 'border-sky-400/40 bg-sky-950/40'
                  : slot === 'red'
                    ? 'border-rose-400/40 bg-rose-950/40'
                    : 'border-amber-400/40 bg-amber-950/40'
              }`}
            >
              <div className="text-xs tracking-widest text-slate-400">
                {store.matchName}
              </div>
              <div className="mt-1 text-xl font-bold">{slotName}</div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="aspect-[4/3] w-full scale-x-[-1] object-cover"
              />
            </div>

            {!live ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                className="w-full rounded-2xl bg-emerald-600 py-4 text-xl font-extrabold hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy ? 'Starting…' : 'Publish feed'}
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="w-full rounded-2xl bg-rose-700 py-4 text-xl font-extrabold hover:bg-rose-600"
              >
                Stop feed
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stop()
                setSlot(null)
              }}
              className="w-full text-sm text-slate-400 underline"
            >
              Switch camera
            </button>

            {error && (
              <p className="text-center text-sm text-rose-300">{error}</p>
            )}
            {live && (
              <p className="text-center text-sm font-bold text-emerald-300">
                LIVE — keep this page open
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
