import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import StudioShell from '../components/cme/StudioShell'
import { absoluteUrl, useLanOrigins } from '../lib/lanOrigins'
import { initCamsSync, useCamsStore } from '../store/camsStore'

const PHONE_PORT = 5174

/** Operator: set code + match name, copy phone link, OBS URLs */
export default function CamsControlPage() {
  const store = useCamsStore()
  const origins = useLanOrigins()

  useEffect(() => {
    initCamsSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
  }, [])

  const phoneLan =
    origins.lanIps[0] != null
      ? `https://${origins.lanIps[0]}:${PHONE_PORT}`
      : null
  const joinUrl = phoneLan
    ? `${phoneLan}/control`
    : `https://YOUR-LAN-IP:${PHONE_PORT}/control`

  function copy(text: string) {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }

  const rows: {
    label: string
    path: string
    live: boolean
    tone: 'blue' | 'red' | 'teal'
  }[] = [
    {
      label: 'Gameplay (with feeds)',
      path: '/overlay/game',
      live: store.blueLive || store.redLive || store.casterLive,
      tone: 'teal',
    },
    {
      label: 'Gameplay preview (shoutcasters)',
      path: '/watch/gameplay',
      live: store.gameplayLive,
      tone: 'teal',
    },
    {
      label: `${store.casterName} cam`,
      path: '/overlay/cam/caster',
      live: store.casterLive,
      tone: 'teal',
    },
    {
      label: `${store.blueName} cam`,
      path: '/overlay/cam/blue',
      live: store.blueLive,
      tone: 'blue',
    },
    {
      label: `${store.redName} cam`,
      path: '/overlay/cam/red',
      live: store.redLive,
      tone: 'red',
    },
  ]

  return (
    <StudioShell
      crumb={
        <>
          <Link to="/control/tournament">Workspace</Link>
          <span>/</span>
          <span>Cams</span>
        </>
      }
      note={
        <>
          <span className="dot" />
          Phone join + OBS feeds
        </>
      }
    >
      <div className="studio-page" style={{ maxWidth: 720 }}>
        <header className="page-head">
          <div>
            <div className="eyebrow">TALENT & CAMS</div>
            <h1>Team cams</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              OBS / this PC → localhost. Laptop → LAN IP. Phones use HTTPS (port{' '}
              {PHONE_PORT}).
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
          <b>OBS blank on HTTPS?</b> Use HTTP localhost on this PC:
          <code className="mt-2 block break-all rounded bg-black/40 px-2 py-2 text-xs text-sky-300">
            {absoluteUrl(origins.local, '/overlay/game')}
          </code>
          {origins.lan ? (
            <>
              <div className="mt-2 text-xs text-amber-200/80">Laptop / LAN:</div>
              <code className="mt-1 block break-all rounded bg-black/40 px-2 py-2 text-xs text-emerald-300">
                {absoluteUrl(origins.lan, '/overlay/game')}
              </code>
            </>
          ) : null}
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
          <div className="text-sm font-bold text-teal-100">
            Send to players (phone cam)
          </div>
          <code className="mt-2 block break-all rounded bg-black/40 px-2 py-3 text-sm text-teal-200">
            {joinUrl}
          </code>
          <button
            type="button"
            onClick={() => copy(joinUrl)}
            className="mt-3 w-full rounded-lg bg-teal-600 py-3.5 text-lg font-bold hover:bg-teal-500"
          >
            Copy player link
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Same Wi‑Fi. Accept the certificate warning, then enter code{' '}
            <b className="text-white">{store.accessCode}</b>
          </p>
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Localhost join (this PC)
            </div>
            <code className="mt-1 block break-all text-xs text-sky-300">
              {absoluteUrl(origins.local, '/control')}
            </code>
            <button
              type="button"
              onClick={() => copy(absoluteUrl(origins.local, '/control'))}
              className="mt-2 rounded bg-slate-700 px-3 py-1.5 text-xs font-bold hover:bg-slate-600"
            >
              Copy localhost
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 text-sm font-bold">Browser Sources (HTTP)</div>
          <div className="space-y-3 text-sm">
            {rows.map((row) => (
              <ObsRow
                key={row.path}
                label={row.label}
                localUrl={absoluteUrl(origins.local, row.path)}
                lanUrl={origins.lan ? absoluteUrl(origins.lan, row.path) : null}
                live={row.live}
                onCopy={copy}
                tone={row.tone}
              />
            ))}
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
    </StudioShell>
  )
}

function ObsRow({
  label,
  localUrl,
  lanUrl,
  live,
  onCopy,
  tone,
}: {
  label: string
  localUrl: string
  lanUrl: string | null
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
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            live ? 'bg-emerald-400' : 'bg-slate-600'
          }`}
        />
        <div className={`min-w-0 flex-1 font-semibold ${color}`}>{label}</div>
      </div>
      <div className="space-y-1.5">
        <UrlLine label="Localhost" url={localUrl} tone="sky" onCopy={onCopy} />
        {lanUrl ? (
          <UrlLine label="LAN IP" url={lanUrl} tone="emerald" onCopy={onCopy} />
        ) : (
          <div className="text-[10px] text-slate-500">LAN IP detecting…</div>
        )}
      </div>
    </div>
  )
}

function UrlLine({
  label,
  url,
  tone,
  onCopy,
}: {
  label: string
  url: string
  tone: 'sky' | 'emerald'
  onCopy: (t: string) => void
}) {
  const color = tone === 'sky' ? 'text-sky-300' : 'text-emerald-300'
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className={`truncate text-[10px] ${color}`}>{url}</div>
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
