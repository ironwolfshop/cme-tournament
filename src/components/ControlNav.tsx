import { Link, useLocation } from 'react-router-dom'

const PRIMARY = [
  { to: '/control/tournament', label: 'Tournament' },
  { to: '/control/live', label: 'Live Desk' },
  { to: '/control/scenes', label: 'Scenes' },
] as const

const SECONDARY = [
  { to: '/control', label: 'Draft', end: true },
  { to: '/control/game', label: 'Broadcast' },
  { to: '/control/casters', label: 'Shoutcasters' },
  { to: '/control/lineup', label: 'Lineup' },
  { to: '/control/cams', label: 'Cams' },
  { to: '/control/bracket', label: 'Bracket' },
] as const

export default function ControlNav() {
  const { pathname } = useLocation()

  function isActive(to: string, end?: boolean) {
    return end
      ? pathname === to
      : pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <nav className="nav" aria-label="Tournament tools">
      {PRIMARY.map((tab) => {
        const active = isActive(tab.to)
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={active ? 'nav-link active' : 'nav-link'}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
      <span
        aria-hidden
        style={{
          width: 1,
          alignSelf: 'stretch',
          background: 'var(--line)',
          margin: '10px 4px',
          opacity: 0.7,
        }}
      />
      {SECONDARY.map((tab) => {
        const active = isActive(tab.to, 'end' in tab && tab.end)
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={active ? 'nav-link active' : 'nav-link'}
            aria-current={active ? 'page' : undefined}
            style={{ opacity: active ? 1 : 0.72, fontSize: '0.92em' }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
