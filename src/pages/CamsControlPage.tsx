import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { initCamsSync, useCamsStore } from '../store/camsStore'

const PHONE_PORT = 5174

/** Operator: set code + match name, copy phone link, OBS URLs */
export default function CamsControlPage() {
  const store = useCamsStore()

  useEffect(() => {
    initCamsSync()
    document.documentElement.style.background = '#0b1220'
    document.body.style.background = '#0b1220'
  }, [])

  const obsOrigin = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:5173'
    // Always prefer HTTP localhost for OBS (self-signed HTTPS stays blank in OBS)
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5173'
    }
    return `http://${host}:5173`
  }, [])

  const phoneOrigin = useMemo(() => {
    if (typeof window === 'undefined') return `https://localhost:${PHONE_PORT}`
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      // Show placeholder — operator should use LAN IP on phones
      return `https://YOUR-LAN-IP:${PHONE_PORT}`
    }
    return `https://${host}:${PHONE_PORT}`
  }, [])

  const joinUrl = `${phoneOrigin}/cam`

  function copy(text: string) {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }

  return (
    <div className="min-h-screen bg-[#0b1220] px-4 py-6 text-slate-100 font-ui">
      <div className="mx-auto max-w-lg space-y-5">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white">
              Team cams
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              OBS uses HTTP. Phones use HTTPS (port {PHONE_PORT}).
            </p>
          </div>
          <Link
            to="/control"
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Draft
          </Link>
        </header>

        <section className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
          <b>OBS blank on HTTPS?</b> Put this in Browser Source (HTTP):
          <code className="mt-2 block break-all rounded bg-black/40 px-2 py-2 text-xs text-sky-300">
            {obsOrigin}/overlay/game
          </code>
          Do <b>not</b> use https:// for OBS — CEF rejects the self-signed cert.
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Access code</span>
            <input
              value={store.accessCode}
              onChange={(e) => store.setAccessCode(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-center text-2xl font-bold tracking-[0.25em]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Match name</span>
            <input
              value={store.matchName}
              onChange={(e) => store.setMatchName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-sky-300/80">Blue name</span>
              <input
                value={store.blueName}
                onChange={(e) => store.setTeamName('blue', e.target.value)}
                className="w-full rounded-lg border border-sky-500/30 bg-black/40 px-2 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-rose-300/80">Red name</span>
              <input
                value={store.redName}
                onChange={(e) => store.setTeamName('red', e.target.value)}
                className="w-full rounded-lg border border-rose-500/30 bg-black/40 px-2 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-amber-300/80">Shoutcaster label</span>
            <input
              value={store.casterName}
              onChange={(e) => store.setCasterName(e.target.value)}
              className="w-full rounded-lg border border-amber-500/30 bg-black/40 px-2 py-2"
            />
          </label>
        </section>

        <section className="rounded-xl border border-teal-500/30 bg-teal-950/30 p-4">
          <div className="text-sm font-bold text-teal-100">Phone join (HTTPS)</div>
          <code className="mt-2 block break-all rounded bg-black/40 px-2 py-2 text-xs text-teal-200">
            {joinUrl}
          </code>
          <button
            type="button"
            onClick={() => copy(joinUrl)}
            className="mt-3 w-full rounded-lg bg-teal-600 py-3 font-bold hover:bg-teal-500"
          >
            Copy phone link
          </button>
          <p className="mt-2 text-xs text-slate-400">
            On iPhone: accept the certificate warning, then enter code{' '}
            <b className="text-white">{store.accessCode}</b>
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 text-sm font-bold">OBS Browser Sources (HTTP)</div>
          <div className="space-y-2 text-sm">
            <ObsRow
              label="Gameplay (with feeds)"
              live={store.blueLive || store.redLive || store.casterLive}
              url={`${obsOrigin}/overlay/game`}
              onCopy={copy}
              tone="teal"
            />
            <ObsRow
              label={`${store.casterName} cam`}
              live={store.casterLive}
              url={`${obsOrigin}/overlay/cam/caster`}
              onCopy={copy}
              tone="teal"
            />
            <ObsRow
              label={`${store.blueName} cam`}
              live={store.blueLive}
              url={`${obsOrigin}/overlay/cam/blue`}
              onCopy={copy}
              tone="blue"
            />
            <ObsRow
              label={`${store.redName} cam`}
              live={store.redLive}
              url={`${obsOrigin}/overlay/cam/red`}
              onCopy={copy}
              tone="red"
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Assign the shoutcaster window feed under{' '}
            <a className="text-teal-300 underline" href="/control/game">
              Gameplay → Display
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}

function ObsRow({
  label,
  url,
  live,
  onCopy,
  tone,
}: {
  label: string
  url: string
  live: boolean
  onCopy: (t: string) => void
  tone: 'blue' | 'red' | 'teal'
}) {
  const color =
    tone === 'blue'
      ? 'text-sky-300'
      : tone === 'red'
        ? 'text-rose-300'
        : 'text-teal-300'
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          live ? 'bg-emerald-400' : 'bg-slate-600'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className={`font-semibold ${color}`}>{label}</div>
        <div className="truncate text-[10px] text-slate-500">{url}</div>
      </div>
      <button
        type="button"
        onClick={() => onCopy(url)}
        className="rounded bg-slate-700 px-2 py-1 text-xs font-bold hover:bg-slate-600"
      >
        Copy
      </button>
    </div>
  )
}
