import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import '../../styles/tournament-manager.css'
import '../../styles/studio-shell.css'

const NAV_GROUPS = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/control/tournament', label: 'Tournaments', icon: 'trophy' },
      { to: '/control/live', label: 'Live desk', icon: 'monitor' },
      { to: '/control/scenes', label: 'Scenes', icon: 'layers' },
    ],
  },
  {
    label: 'MATCH DAY',
    items: [
      { to: '/control/draft', label: 'Draft room', icon: 'swords', end: true },
      { to: '/control/game', label: 'Gameplay desk', icon: 'sliders' },
      { to: '/control/bracket', label: 'Bracket', icon: 'bracket' },
      { to: '/control/lineup', label: 'Team reveal', icon: 'photo' },
    ],
  },
  {
    label: 'TALENT & CAMS',
    items: [
      { to: '/control/casters', label: 'Shoutcasters', icon: 'spark' },
      { to: '/control/casters?tab=preview', label: 'Gameplay preview', icon: 'monitor' },
      { to: '/control/cams', label: 'Cams', icon: 'camera' },
    ],
  },
] as const

function isActive(pathname: string, search: string, to: string, end?: boolean) {
  const [path, query] = to.split('?')
  if (query) {
    if (pathname !== path) return false
    const params = new URLSearchParams(search)
    const want = new URLSearchParams(query)
    for (const [key, value] of want) {
      if (params.get(key) !== value) return false
    }
    return true
  }
  if (path === '/control/casters' && new URLSearchParams(search).get('tab') === 'preview') {
    return false
  }
  if (end) return pathname === to
  if (to === '/control/tournament') {
    return pathname === to || pathname.startsWith(`${to}/`)
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function StudioSidebar() {
  const { pathname, search } = useLocation()

  return (
    <aside className="sidebar">
      <Link className="brand" to="/control/tournament" aria-label="CME Tournament Studio">
        <span className="brandmark">
          <Icon name="trophy" />
        </span>
        <span>
          <strong>CME ML</strong>
          <small>TOURNAMENT STUDIO</small>
        </span>
      </Link>

      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="nav-label">{group.label}</div>
          <nav className="sidenav" aria-label={group.label}>
            {group.items.map((item) => {
              const on = isActive(pathname, search, item.to, 'end' in item && item.end)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={on ? 'active' : undefined}
                  title={item.label}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-foot">
        <strong>Built for match day.</strong>
        Set up your teams.
        <br />
        Bring the tournament to life.
      </div>
    </aside>
  )
}

type StudioShellProps = {
  children: ReactNode
  crumb?: ReactNode
  note?: ReactNode
  topRight?: ReactNode
  presenting?: boolean
  className?: string
  /** Hide the studio topbar (page supplies its own heading). */
  hideTopbar?: boolean
}

export default function StudioShell({
  children,
  crumb,
  note,
  topRight,
  presenting = false,
  className = '',
  hideTopbar = false,
}: StudioShellProps) {
  return (
    <div
      className={`cme-tm studio-shell${presenting ? ' presenting' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="shell">
        <StudioSidebar />
        <div className="app">
          {!hideTopbar ? (
            <header className="topbar">
              <div className="crumb">
                {crumb ?? (
                  <>
                    <Link to="/control/tournament">Workspace</Link>
                    <span>/</span>
                    <span>Control</span>
                  </>
                )}
              </div>
              <div className="topbar-actions">
                {topRight}
                <div className="topbar-note">
                  {note ?? (
                    <>
                      <span className="dot" />
                      Tournament workspace
                    </>
                  )}
                </div>
              </div>
            </header>
          ) : null}
          <div className="studio-body">{children}</div>
        </div>
      </div>
    </div>
  )
}
