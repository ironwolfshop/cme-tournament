import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  initTournamentSync,
  selectActiveProject,
  useTournamentStore,
} from '../store/tournamentStore'
import '../styles/match-preview.css'

export default function MatchPreviewOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'
  const active = useTournamentStore(selectActiveProject)
  const blueTeamId = useTournamentStore((s) => s.blueTeamId)
  const redTeamId = useTournamentStore((s) => s.redTeamId)
  const getTeam = useTournamentStore((s) => s.getTeam)
  const status = useTournamentStore((s) => s.status)

  const blue = getTeam(blueTeamId) ?? active.teams[0] ?? null
  const red = getTeam(redTeamId) ?? active.teams[1] ?? null

  useEffect(() => {
    initTournamentSync()
    document.documentElement.style.background = preview
      ? '#041830'
      : 'transparent'
    document.body.style.background = preview ? '#041830' : 'transparent'
  }, [preview])

  return (
    <div
      className={`overlay-root match-preview ${preview ? 'is-preview' : ''}`}
    >
      <div className="mp-bg" aria-hidden />
      <div className="mp-vignette" aria-hidden />

      <header className="mp-header">
        <div className="mp-tournament">{active.name}</div>
        <div className="mp-match-title">{active.matchTitle}</div>
      </header>

      <div className="mp-vs-row">
        <TeamLogoBlock team={blue} side="blue" />
        <div className="mp-vs">
          <span className="mp-vs-label">VS</span>
          {status !== 'idle' ? (
            <span className="mp-phase">{status.toUpperCase()}</span>
          ) : null}
        </div>
        <TeamLogoBlock team={red} side="red" />
      </div>

      <footer className="mp-footer">
        <span className="mp-footer-side blue">{blue?.name ?? 'Blue'}</span>
        <span className="mp-footer-sep" />
        <span className="mp-footer-side red">{red?.name ?? 'Red'}</span>
      </footer>
    </div>
  )
}

function TeamLogoBlock({
  team,
  side,
}: {
  team: { name: string; tag: string; logo: string } | null
  side: 'blue' | 'red'
}) {
  return (
    <div className={`mp-team mp-team-${side}`}>
      <div className="mp-logo-ring">
        <div className="mp-logo">
          {team?.logo ? (
            <img src={team.logo} alt="" />
          ) : (
            <span className="mp-logo-fallback">
              {(team?.tag ?? '?').slice(0, 3)}
            </span>
          )}
        </div>
      </div>
      <div className="mp-tag">{team?.tag ?? 'TBD'}</div>
    </div>
  )
}
