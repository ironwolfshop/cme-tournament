import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ControlNav from '../components/ControlNav'
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
    id: 'draft',
    name: 'Draft / Ban-Pick',
    blurb: 'Bottom dock with bans, picks, timer, and reveal popup.',
    overlayPath: '/overlay',
    controlPath: '/control',
    size: '1920 × 1080',
  },
  {
    id: 'lineup',
    name: 'Team Lineup',
    blurb: 'Blue vs Red dual roster — 5 vertical player cards per side.',
    overlayPath: '/overlay/lineup',
    controlPath: '/control/lineup',
    size: '1920 × 1080',
  },
  {
    id: 'match-preview',
    name: 'Match Preview',
    blurb: 'Blue vs Red matchup card from the active tournament.',
    overlayPath: '/overlay/match-preview',
    controlPath: '/control/tournament',
    size: '1920 × 1080',
  },
  {
    id: 'standby',
    name: 'Live on Standby',
    blurb: 'Looping blank-hold splash — school logos + CME FEST MLBB.',
    overlayPath: '/overlay/standby',
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
    blurb: 'Lower-third name cards for shoutcasters.',
    overlayPath: '/overlay/caster',
    controlPath: '/control/casters',
    size: '1920 × 1080',
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
    controlPath: '/control',
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

function obsOrigin() {
  if (typeof window === 'undefined') return 'http://localhost:5173'
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5173'
  return `http://${host}:5173`
}

export default function ScenesControlPage() {
  const origin = useMemo(() => obsOrigin(), [])
  const [copied, setCopied] = useState<string | null>(null)
  const [preview, setPreview] = useState(SCENES[0]?.overlayPath ?? '/overlay')

  function copy(url: string, id: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1600)
    })
  }

  const previewUrl = `${origin}${preview}`

  return (
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
        <ControlNav />
        <div className="operator">
          <a
            className="preview-tag"
            href={previewUrl}
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
            margin: '0 0 18px',
            color: 'var(--muted)',
            fontSize: 14,
            maxWidth: 720,
          }}
        >
          OBS Browser Sources must use <b style={{ color: 'var(--text)' }}>HTTP</b>{' '}
          (not https) — e.g.{' '}
          <code style={{ color: '#68adff' }}>http://localhost:5173/overlay/game</code>.
          Self-signed HTTPS blanks out in OBS. Control desk + overlays sync live over
          the same hub.
        </p>

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
              const url = `${origin}${scene.overlayPath}`
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
                    <div>
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
                      <code
                        style={{
                          display: 'block',
                          marginTop: 10,
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: '#0a0e16',
                          border: '1px solid var(--line)',
                          color: '#68adff',
                          fontSize: 12,
                          wordBreak: 'break-all',
                        }}
                      >
                        {url}
                      </code>
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
                      onClick={() => copy(url, scene.id)}
                    >
                      {copied === scene.id ? 'Copied' : 'Copy OBS link'}
                    </button>
                    <a
                      className="btn ghost small"
                      href={url}
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
                key={previewUrl}
                title="Scene preview"
                src={previewUrl}
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
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn gold small"
                style={{ flex: 1 }}
                onClick={() => copy(previewUrl, 'preview')}
              >
                {copied === 'preview' ? 'Copied' : 'Copy this link'}
              </button>
              <a
                className="btn ghost small"
                href={previewUrl}
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
  )
}
