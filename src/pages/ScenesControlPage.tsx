import { useState } from 'react'
import { Link } from 'react-router-dom'
import StudioShell from '../components/cme/StudioShell'
import { absoluteUrl, useLanOrigins } from '../lib/lanOrigins'
import '../styles/draft-room.css'

type Scene = {
  id: string
  name: string
  blurb: string
  overlayPath: string
  controlPath?: string
  size: string
}

const SCENES: Scene[] = [
  {
    id: 'standby',
    name: 'Standby / Starting Soon',
    blurb:
      'Animated "Live — Starting Soon" holding screen. Add ?minutes=10 or ?until=20:30 for a countdown.',
    overlayPath: '/overlay/standby',
    size: '1920 × 1080',
  },
  {
    id: 'draft',
    name: 'Draft / Ban-Pick',
    blurb: 'Bottom dock with bans, picks, and reveal popup.',
    overlayPath: '/overlay',
    controlPath: '/control/draft',
    size: '1920 × 1080',
  },
  {
    id: 'lineup',
    name: 'Team Reveal',
    blurb: 'Single-team roster reveal with cutout photos, accent stage, and reveal sequence.',
    overlayPath: '/overlay/lineup',
    controlPath: '/control/lineup',
    size: '1920 × 1080',
  },
  {
    id: 'match',
    name: 'Match Day',
    blurb:
      'Head-to-head match scene for today — featured players, team tags, and Match/Game banner synced from Draft + Live Desk.',
    overlayPath: '/overlay/match',
    controlPath: '/control/live',
    size: '1920 × 1080',
  },
  {
    id: 'victory',
    name: 'Victory',
    blurb:
      'Post-game victory board — winning team full name plus MVP player photo and name from Gameplay desk.',
    overlayPath: '/overlay/victory',
    controlPath: '/control/game',
    size: '1920 × 1080',
  },
  {
    id: 'match-preview',
    name: 'Match Preview',
    blurb: 'Blue vs Red logo matchup card from the active tournament.',
    overlayPath: '/overlay/match-preview',
    controlPath: '/control/tournament',
    size: '1920 × 1080',
  },
  {
    id: 'game',
    name: 'Gameplay HUD',
    blurb: 'In-game scoreboard, sidebars, events, and featured cams.',
    overlayPath: '/overlay/game',
    controlPath: '/control/game',
    size: '1920 × 1080',
  },
  {
    id: 'caster',
    name: 'Shoutcasters',
    blurb: 'Full shoutcaster desk — naval frame, camera hole, and live nameplate.',
    overlayPath: '/overlay/caster?v=desk7',
    controlPath: '/control/casters',
    size: '1920 × 1080',
  },
  {
    id: 'gameplay-preview',
    name: 'Gameplay Preview',
    blurb: 'Windows viewer for shoutcasters — live BlueStacks / game feed after Capture window.',
    overlayPath: '/watch/gameplay',
    controlPath: '/control/casters?tab=preview',
    size: 'Viewer window',
  },
  {
    id: 'bracket',
    name: 'Bracket',
    blurb: 'Single-elim pyramid bracket for OBS.',
    overlayPath: '/overlay/bracket',
    controlPath: '/control/bracket',
    size: '1920 × 1080',
  },
  {
    id: 'stinger',
    name: 'Stinger / Transition',
    blurb: 'Full-screen wipe transition. Fire from draft or broadcast.',
    overlayPath: '/overlay/stinger',
    controlPath: '/control/draft',
    size: '1920 × 1080',
  },
  {
    id: 'cams-grid',
    name: 'Team Cams Grid',
    blurb: 'Blue + red homebase feeds side by side.',
    overlayPath: '/overlay/cams',
    controlPath: '/control/cams',
    size: '1920 × 1080',
  },
  {
    id: 'cam-blue',
    name: 'Blue Team Cam',
    blurb: 'Solo blue side WebRTC team feed.',
    overlayPath: '/overlay/cam/blue',
    controlPath: '/control/cams',
    size: '1920 × 1080',
  },
  {
    id: 'cam-red',
    name: 'Red Team Cam',
    blurb: 'Solo red side WebRTC team feed.',
    overlayPath: '/overlay/cam/red',
    controlPath: '/control/cams',
    size: '1920 × 1080',
  },
]

export default function ScenesControlPage() {
  const origins = useLanOrigins()
  const [copied, setCopied] = useState<string | null>(null)
  const [preview, setPreview] = useState(SCENES[0]?.overlayPath ?? '/overlay')

  function copy(url: string, id: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1600)
    })
  }

  const localPreview = absoluteUrl(origins.local, preview)
  const lanPreview = origins.lan ? absoluteUrl(origins.lan, preview) : null

  return (
    <StudioShell
      crumb={
        <>
          <Link to="/control/tournament">Workspace</Link>
          <span>/</span>
          <span>Scenes</span>
        </>
      }
      note={
        <>
          <span className="dot" />
          Broadcast workspace
        </>
      }
      topRight={
        <a className="btn quiet small" href={localPreview} target="_blank" rel="noreferrer">
          Overlay
        </a>
      }
    >
    <div className="cme-draft">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            ⚔
          </div>
          <div>
            <div className="brand-name">CME TOURNAMENT</div>
            <div className="brand-sub">MOBILE LEGENDS: BANG BANG</div>
          </div>
        </div>
        <div className="operator">
          <a
            className="preview-tag"
            href={localPreview}
            target="_blank"
            rel="noreferrer"
          >
            Overlay
          </a>
          <span className="operator-badge" title="Tournament operator">
            OP
          </span>
        </div>
      </header>

      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">Broadcast workspace</div>
            <h1>
              Scenes<span style={{ color: 'var(--gold)' }}>.</span>
            </h1>
          </div>
        </div>

        <p
          style={{
            margin: '0 0 10px',
            color: 'var(--muted)',
            fontSize: 14,
            maxWidth: 820,
          }}
        >
          OBS on this PC → use <b style={{ color: 'var(--text)' }}>Localhost</b>. Laptop /
          other PCs on Wi‑Fi → use <b style={{ color: 'var(--text)' }}>LAN IP</b>. Always{' '}
          <b style={{ color: 'var(--text)' }}>HTTP</b> (not https) so OBS does not go blank.
        </p>
        <div
          style={{
            margin: '0 0 18px',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: '#121824',
            fontSize: 13,
            color: 'var(--muted)',
            maxWidth: 820,
          }}
        >
          <div>
            Localhost ·{' '}
            <code style={{ color: '#68adff' }}>{origins.local}</code>
          </div>
          <div style={{ marginTop: 4 }}>
            LAN (laptop) ·{' '}
            {origins.lan ? (
              <code style={{ color: '#7ddea8' }}>{origins.lan}</code>
            ) : (
              <span>detecting…</span>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {SCENES.map((scene) => {
              const localUrl = absoluteUrl(origins.local, scene.overlayPath)
              const lanUrl = origins.lan
                ? absoluteUrl(origins.lan, scene.overlayPath)
                : null
              const active = preview === scene.overlayPath
              return (
                <article
                  key={scene.id}
                  onClick={() => setPreview(scene.overlayPath)}
                  style={{
                    border: active
                      ? '1px solid var(--gold)'
                      : '1px solid var(--line)',
                    background: active ? '#1a1812' : 'var(--surface)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: active ? '0 0 0 1px #e8bf7222' : undefined,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 750,
                          fontSize: 16,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {scene.name}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          color: 'var(--muted)',
                          fontSize: 13,
                          lineHeight: 1.45,
                        }}
                      >
                        {scene.blurb}
                      </div>

                      <LinkBlock
                        label="Localhost · this PC / OBS"
                        url={localUrl}
                        tone="#68adff"
                      />
                      {lanUrl ? (
                        <LinkBlock
                          label="LAN IP · laptop / other PCs"
                          url={lanUrl}
                          tone="#7ddea8"
                        />
                      ) : (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: 'var(--muted)',
                          }}
                        >
                          LAN IP detecting…
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          letterSpacing: '0.08em',
                          color: 'var(--muted)',
                        }}
                      >
                        {scene.size} · transparent canvas
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 12,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn gold small"
                      onClick={() => copy(localUrl, `${scene.id}-local`)}
                    >
                      {copied === `${scene.id}-local` ? 'Copied' : 'Copy localhost'}
                    </button>
                    {lanUrl ? (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => copy(lanUrl, `${scene.id}-lan`)}
                      >
                        {copied === `${scene.id}-lan` ? 'Copied' : 'Copy LAN IP'}
                      </button>
                    ) : null}
                    <a
                      className="btn ghost small"
                      href={lanUrl ?? localUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open scene
                    </a>
                    {scene.controlPath && (
                      <Link className="btn ghost small" to={scene.controlPath}>
                        Control
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setPreview(scene.overlayPath)}
                    >
                      Preview
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <aside
            style={{
              position: 'sticky',
              top: 16,
              border: '1px solid var(--line)',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#0a0e16',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 12px',
                borderBottom: '1px solid var(--line)',
                fontSize: 12,
                letterSpacing: '0.1em',
                color: 'var(--muted)',
              }}
            >
              <span>LIVE PREVIEW</span>
              <span style={{ color: 'var(--gold)' }}>{preview}</span>
            </div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                background:
                  'conic-gradient(#1a2030 25%, transparent 0 50%, #1a2030 0 75%, transparent 0)',
                backgroundSize: '18px 18px',
                backgroundColor: '#121826',
              }}
            >
              <iframe
                key={localPreview}
                title="Scene preview"
                src={localPreview}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 0,
                  transform: 'scale(1)',
                  background: 'transparent',
                }}
              />
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              <button
                type="button"
                className="btn gold small"
                onClick={() => copy(localPreview, 'preview-local')}
              >
                {copied === 'preview-local' ? 'Copied' : 'Copy localhost'}
              </button>
              {lanPreview ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => copy(lanPreview, 'preview-lan')}
                >
                  {copied === 'preview-lan' ? 'Copied' : 'Copy LAN IP'}
                </button>
              ) : null}
              <a
                className="btn ghost small"
                href={lanPreview ?? localPreview}
                target="_blank"
                rel="noreferrer"
              >
                Fullscreen
              </a>
            </div>
          </aside>
        </div>
      </main>
    </div>
    </StudioShell>
  )
}

function LinkBlock({
  label,
  url,
  tone,
}: {
  label: string
  url: string
  tone: string
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <code
        style={{
          display: 'block',
          padding: '8px 10px',
          borderRadius: 6,
          background: '#0a0e16',
          border: '1px solid var(--line)',
          color: tone,
          fontSize: 12,
          wordBreak: 'break-all',
        }}
      >
        {url}
      </code>
    </div>
  )
}
