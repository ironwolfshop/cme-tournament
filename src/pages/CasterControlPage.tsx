import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Brand, Icon } from '../components/cme/Icon'
import StudioShell from '../components/cme/StudioShell'
import {
  openGameplayViewerWindow,
} from '../lib/gameplayCapture'
import { absoluteUrl, useLanOrigins } from '../lib/lanOrigins'
import { initCasterSync, useCasterStore } from '../store/casterStore'
import { initCamsSync, useCamsStore } from '../store/camsStore'
import GameplayCastControls from '../components/gameplay/GameplayCastControls'
import '../styles/gameplay-preview.css'

type CasterTab = 'desk' | 'preview'

export default function CasterControlPage() {
  const showTitle = useCasterStore((s) => s.showTitle)
  const setShowTitle = useCasterStore((s) => s.setShowTitle)
  const [params, setParams] = useSearchParams()
  const tab: CasterTab = params.get('tab') === 'preview' ? 'preview' : 'desk'
  const gameplayLive = useCamsStore((s) => s.gameplayLive)
  const [copied, setCopied] = useState('')
  const origins = useLanOrigins()

  useEffect(() => {
    initCasterSync()
    initCamsSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
    document.documentElement.style.overflowY = 'auto'
    document.body.style.overflowY = 'auto'
    document.body.style.height = 'auto'
    return () => {
      document.documentElement.style.overflowY = ''
      document.body.style.overflowY = ''
      document.body.style.height = ''
    }
  }, [])

  const previewUrl = absoluteUrl(origins.local, '/overlay/caster?preview=1&v=desk7')
  const obsUrl = absoluteUrl(origins.local, '/overlay/caster?v=desk7')
  const obsLanUrl = origins.lan
    ? absoluteUrl(origins.lan, '/overlay/caster?v=desk7')
    : null
  const watchLocal = absoluteUrl(origins.local, '/watch/gameplay')
  const watchLan = origins.lan
    ? absoluteUrl(origins.lan, '/watch/gameplay')
    : null

  function setTab(next: CasterTab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'preview') nextParams.set('tab', 'preview')
    else nextParams.delete('tab')
    setParams(nextParams, { replace: true })
  }

  function copyWatch(url: string, key: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(key)
      window.setTimeout(() => setCopied(''), 1600)
    })
  }

  return (
    <StudioShell
      crumb={
        <>
          <Link to="/control/tournament">Workspace</Link>
          <span>/</span>
          <span>Shoutcasters</span>
        </>
      }
      note={
        <>
          <span className="dot" />
          Overlay linked
        </>
      }
    >
    <div className="cme-gc">
      <header className="topbar">
        <Brand />
        <div className="connection connected">Overlay linked</div>
      </header>

      <main className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">
              {tab === 'preview' ? 'Talent · live game feed' : 'Talent · desk scene'}
            </div>
            <h1>
              {tab === 'preview' ? (
                <>
                  Gameplay Preview<span>.</span>
                </>
              ) : (
                <>
                  Shoutcasters<span>.</span>
                </>
              )}
            </h1>
          </div>
          <div className="actions">
            <a className="btn" href={previewUrl} target="_blank" rel="noreferrer">
              <Icon name="external" />
              Preview
            </a>
            <a className="btn gold" href={obsUrl} target="_blank" rel="noreferrer">
              <Icon name="external" />
              Open overlay
            </a>
          </div>
        </div>

        {tab === 'desk' ? (
        <section className="surface" style={{ marginBottom: 20 }}>
          <div className="surface-head">
            <h3>OBS Browser Source</h3>
          </div>
          <div className="display-body">
            <p className="display-note" style={{ marginTop: 0 }}>
              Full desk scene · 1920×1080 · camera hole is transparent. Put the webcam source
              under this browser source in OBS.
            </p>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', marginTop: 10 }}>
              LOCALHOST · THIS PC / OBS
            </div>
            <code
              style={{
                display: 'block',
                marginTop: 4,
                padding: '10px 12px',
                borderRadius: 6,
                background: '#0e1623',
                border: '1px solid var(--line)',
                color: '#68adff',
                fontSize: 13,
                wordBreak: 'break-all',
              }}
            >
              {obsUrl}
            </code>
            {obsLanUrl ? (
              <>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', marginTop: 10 }}>
                  LAN IP · LAPTOP
                </div>
                <code
                  style={{
                    display: 'block',
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: '#0e1623',
                    border: '1px solid var(--line)',
                    color: '#7ddea8',
                    fontSize: 13,
                    wordBreak: 'break-all',
                  }}
                >
                  {obsLanUrl}
                </code>
              </>
            ) : null}
          </div>
        </section>
        ) : null}

        <div className="tabs" role="tablist">
          <button
            className={`tab${tab === 'desk' ? ' active' : ''}`}
            type="button"
            onClick={() => setTab('desk')}
          >
            <Icon name="spark" />
            Desk
          </button>
          <button
            className={`tab${tab === 'preview' ? ' active' : ''}`}
            type="button"
            onClick={() => setTab('preview')}
          >
            <Icon name="monitor" />
            Gameplay Preview
            {gameplayLive ? <span className="tab-count">LIVE</span> : null}
          </button>
        </div>

        {tab === 'preview' ? (
          <section className="tab-panel gpv-desk">
            <div className="section-heading">
              <div>
                <h2>Gameplay preview</h2>
                <p>
                  Cast the game window on <b>localhost</b> (this PC) or HTTPS
                  Wi‑Fi. Shoutcaster laptops open the <b>LAN IP</b> watch link —
                  they do not Select window.
                </p>
              </div>
              <div className="gpv-actions">
                <button className="btn gold" type="button" onClick={openGameplayViewerWindow}>
                  <Icon name="expand" />
                  Open Windows viewer
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => copyWatch(watchLocal, 'watch-local')}
                >
                  <Icon name="link" />
                  {copied === 'watch-local' ? 'Copied' : 'Copy localhost'}
                </button>
                {watchLan ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => copyWatch(watchLan, 'watch-lan')}
                  >
                    <Icon name="link" />
                    {copied === 'watch-lan' ? 'Copied' : 'Copy LAN IP'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="surface">
              <div className="display-body">
                <GameplayCastControls />
              </div>
            </div>
            <div className="surface">
              <div className="surface-head">
                <h3>Share with shoutcaster PCs</h3>
                <span className={`connection${gameplayLive ? ' connected' : ''}`}>
                  {gameplayLive ? 'Window connected' : 'Waiting for window'}
                </span>
              </div>
              <div className="display-body">
                <p className="display-note" style={{ marginTop: 0 }}>
                  On the laptop use the <b>LAN IP</b> watch link (same Wi‑Fi). Do
                  not use Select window on the laptop — that only works on the
                  operator PC via localhost. Press F11 for fullscreen. Keep the
                  selected window cast running on the operator PC.
                </p>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', marginTop: 8 }}>
                  LOCALHOST
                </div>
                <code className="gpv-link">{watchLocal}</code>
                {watchLan ? (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', marginTop: 10 }}>
                      LAN IP · LAPTOP
                    </div>
                    <code className="gpv-link" style={{ color: '#7ddea8' }}>
                      {watchLan}
                    </code>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'desk' ? (
        <>
        <div className="display-grid">
          <div className="surface">
            <div className="surface-head">
              <h3>Show title</h3>
            </div>
            <div className="display-body">
              <label className="field">
                <span>Podium headline when no caster names are set</span>
                <input
                  maxLength={40}
                  placeholder="SHOUTCASTER"
                  value={showTitle}
                  onChange={(e) => setShowTitle(e.target.value)}
                />
              </label>
              <p className="display-note">
                If a caster name is entered, the podium shows the name instead of this title.
              </p>
            </div>
          </div>

          <div className="surface">
            <div className="surface-head">
              <h3>Live preview</h3>
            </div>
            <div className="display-body">
              <p className="display-note" style={{ marginTop: 0 }}>
                Open Preview in a separate window (embedded preview was freezing the desk).
              </p>
              <a className="btn" href={previewUrl} target="_blank" rel="noreferrer">
                <Icon name="external" />
                Open preview window
              </a>
            </div>
          </div>
        </div>

        <section className="surface" style={{ marginTop: 20 }}>
          <div className="surface-head">
            <h3>Caster names</h3>
          </div>
          <div className="display-body">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <CasterFields which={1} />
              <CasterFields which={2} />
            </div>
            <p className="display-note">
              Turn a caster off to hide their name card. Names sync live to the shoutcaster overlay.
            </p>
          </div>
        </section>

        <footer className="footer">
          <span>Shoutcaster desk · names and roles sync live</span>
          <span>
            Also listed under <b>Scenes</b>.
          </span>
        </footer>
        </>
        ) : null}
      </main>
    </div>
    </StudioShell>
  )
}

function CasterFields({ which }: { which: 1 | 2 }) {
  const person = useCasterStore((s) => (which === 1 ? s.caster1 : s.caster2))
  const setCaster = useCasterStore((s) => s.setCaster)
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 14,
        background: '#0e1623',
      }}
    >
      <label className="check-label" style={{ marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={person.visible}
          onChange={(e) => setCaster(which, { visible: e.target.checked })}
        />
        Show caster {which}
      </label>
      <label className="field">
        <span>Name</span>
        <input
          maxLength={32}
          placeholder={`Caster ${which} name`}
          value={person.name}
          onChange={(e) => setCaster(which, { name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Role</span>
        <input
          maxLength={28}
          placeholder={which === 1 ? 'Play-by-play' : 'Color'}
          value={person.role}
          onChange={(e) => setCaster(which, { role: e.target.value })}
        />
      </label>
    </div>
  )
}
