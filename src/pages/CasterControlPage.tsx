import { useEffect, useMemo } from 'react'
import { Brand, Icon } from '../components/cme/Icon'
import ControlNav from '../components/ControlNav'
import { initCasterSync, useCasterStore } from '../store/casterStore'

export default function CasterControlPage() {
  const showTitle = useCasterStore((s) => s.showTitle)
  const setShowTitle = useCasterStore((s) => s.setShowTitle)

  useEffect(() => {
    initCasterSync()
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

  const obsOrigin = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:5173'
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5173'
    return `http://${host}:5173`
  }, [])

  const previewUrl = `${obsOrigin}/overlay/caster?preview=1`
  const obsUrl = `${obsOrigin}/overlay/caster`

  return (
    <div className="cme-gc">
      <header className="topbar">
        <Brand />
        <ControlNav />
        <div className="connection connected">Overlay linked</div>
      </header>

      <main className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">Talent · lower third</div>
            <h1>
              Shoutcasters<span>.</span>
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

        <section className="surface" style={{ marginBottom: 20 }}>
          <div className="surface-head">
            <h3>OBS Browser Source</h3>
          </div>
          <div className="display-body">
            <p className="display-note" style={{ marginTop: 0 }}>
              Lower-third name cards only · 1920×1080 · keep background transparent in OBS.
            </p>
            <code
              style={{
                display: 'block',
                marginTop: 10,
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
          </div>
        </section>

        <div className="display-grid">
          <div className="surface">
            <div className="surface-head">
              <h3>Show title</h3>
            </div>
            <div className="display-body">
              <label className="field">
                <span>Eyebrow above name cards · optional</span>
                <input
                  maxLength={40}
                  placeholder="SHOUTCASTERS"
                  value={showTitle}
                  onChange={(e) => setShowTitle(e.target.value)}
                />
              </label>
              <p className="display-note">Leave blank to hide the title line on the overlay.</p>
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
          <span>Shoutcaster lower third · changes sync to the overlay</span>
          <span>
            Also listed under <b>Scenes</b>.
          </span>
        </footer>
      </main>
    </div>
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
