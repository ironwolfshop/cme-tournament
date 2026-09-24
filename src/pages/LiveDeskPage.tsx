import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/cme/Icon'
import StudioShell from '../components/cme/StudioShell'
import {
  getTeam,
  roundLabel,
  type BracketMatch,
} from '../lib/bracketEngine'
import { syncSeriesToDraft } from '../lib/syncSeriesLabel'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import {
  initGameplaySync,
  useGameplayStore,
} from '../store/gameplayStore'
import {
  initTournamentSync,
  PLAYER_ROLES,
  selectActiveProject,
  useTournamentStore,
} from '../store/tournamentStore'

export default function LiveDeskPage() {
  const bracket = useBracketStore()
  const tournament = useTournamentStore()
  const active = useTournamentStore(selectActiveProject)
  const seriesComplete = useGameplayStore((s) => s.isSeriesComplete())
  const seriesLeader = useGameplayStore((s) => s.seriesLeader())
  const currentGame = useGameplayStore((s) => s.currentGame)
  const bestOf = useGameplayStore((s) => s.bestOf)
  const blueScore = useGameplayStore((s) => s.blue.seriesScore)
  const redScore = useGameplayStore((s) => s.red.seriesScore)

  useEffect(() => {
    initBracketSync()
    initTournamentSync()
    initGameplaySync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
  }, [])

  const rounds = useMemo(() => {
    const maxRound = Math.max(0, ...bracket.matches.map((m) => m.round))
    return Array.from({ length: maxRound + 1 }, (_, r) =>
      bracket.matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.index - b.index),
    )
  }, [bracket.matches])

  const { leftCols, rightCols, finalMatch } = useMemo(() => {
    if (rounds.length === 0) {
      return {
        leftCols: [] as BracketMatch[][],
        rightCols: [] as BracketMatch[][],
        finalMatch: null as BracketMatch | null,
      }
    }
    const finalRound = rounds.length - 1
    const final = rounds[finalRound]?.[0] ?? null
    const left: BracketMatch[][] = []
    const right: BracketMatch[][] = []
    for (let r = 0; r < finalRound; r++) {
      const ms = rounds[r]
      const mid = Math.ceil(ms.length / 2)
      left.push(ms.slice(0, mid))
      right.push(ms.slice(mid))
    }
    return { leftCols: left, rightCols: [...right].reverse(), finalMatch: final }
  }, [rounds])

  const selectedId = bracket.activeMatchId
  const selected = bracket.matches.find((m) => m.id === selectedId)
  const blueT = selected
    ? tournament.getTeam(selected.teamAId) ?? getTeam(bracket, selected.teamAId)
    : null
  const redT = selected
    ? tournament.getTeam(selected.teamBId) ?? getTeam(bracket, selected.teamBId)
    : null
  const canFight = Boolean(
    selected?.teamAId &&
      selected.teamBId &&
      selected.status !== 'done' &&
      blueT &&
      redT,
  )
  const fightLive =
    tournament.status !== 'idle' && tournament.activeMatchId === selected?.id

  const champion =
    finalMatch?.status === 'done' && finalMatch.winnerId
      ? getTeam(bracket, finalMatch.winnerId)
      : null

  const emptyBracket = bracket.matches.length === 0

  return (
    <StudioShell
      crumb={
        <>
          <Link to="/control/tournament">Workspace</Link>
          <span>/</span>
          <span>Live desk</span>
        </>
      }
      note={
        <>
          <span className="dot" />
          {active.name}
        </>
      }
      topRight={
        <Link className="btn quiet small" to="/control/scenes">
          <Icon name="layers" />
          Scenes
        </Link>
      }
    >
      <div className="studio-page live-desk-page">
        <header className="page-head">
          <div>
            <div className="eyebrow">Match day</div>
            <h1>
              Live desk<span style={{ color: 'var(--gold)' }}>.</span>
            </h1>
            <p>
              {active.name} · select a match, then start fight for Draft / Lineup /
              Game.
            </p>
          </div>
          <div className="actions">
            <Link className="btn quiet small" to="/control/tournament">
              <Icon name="trophy" />
              Tournament
            </Link>
            <Link className="btn quiet small" to="/control/bracket">
              <Icon name="bracket" />
              Bracket
            </Link>
            <Link className="btn quiet small" to="/control/scenes">
              <Icon name="layers" />
              Scenes
            </Link>
          </div>
        </header>

        {emptyBracket ? (
          <div className="notice">
            <span>
              No bracket yet. Seed teams from the tournament workspace first.
            </span>
            <Link className="btn gold small" to="/control/tournament">
              Open tournament
            </Link>
          </div>
        ) : null}

        <div className="live-desk-layout">
          <section className="panel live-desk-board" aria-label="Bracket">
            <div className="live-desk-board-scroll">
              <div className="live-desk-bracket">
                <div className="live-desk-cols live-desk-cols-left">
                  {leftCols.map((matches, col) => (
                    <DeskRound
                      key={`L${col}`}
                      label={roundLabel(col, bracket.bracketSize)}
                      matches={matches}
                    />
                  ))}
                </div>

                <div className="live-desk-final">
                  <div className="live-desk-champion">
                    <div className="eyebrow">Champion</div>
                    <strong>{champion?.tag ?? 'Awaits'}</strong>
                  </div>
                  {finalMatch ? (
                    <>
                      <div className="live-desk-round-label">Grand final</div>
                      <DeskMatchCard match={finalMatch} />
                    </>
                  ) : null}
                </div>

                <div className="live-desk-cols live-desk-cols-right">
                  {rightCols.map((matches, col) => {
                    const originalRound = leftCols.length - 1 - col
                    return (
                      <DeskRound
                        key={`R${col}`}
                        label={roundLabel(originalRound, bracket.bracketSize)}
                        matches={matches}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <aside className="panel live-desk-side" aria-label="Selected match">
            <div className="section-top">
              <h2>Selected match</h2>
            </div>

            {!selected ? (
              <p className="panel-intro">
                Click a match on the bracket to load both rosters and start the
                fight.
              </p>
            ) : !canFight ? (
              <p className="panel-intro">
                This match needs both teams filled and must not be finished yet.
              </p>
            ) : (
              <>
                <div className="live-desk-vs">
                  <span className="side-blue">{blueT?.tag}</span>
                  <span className="vs">vs</span>
                  <span className="side-red">{redT?.tag}</span>
                </div>

                <RosterPreview
                  label={blueT?.name ?? 'Blue'}
                  side="blue"
                  teamId={selected.teamAId}
                />
                <RosterPreview
                  label={redT?.name ?? 'Red'}
                  side="red"
                  teamId={selected.teamBId}
                />

                {!fightLive ? (
                  <button
                    type="button"
                    className="btn gold live-desk-start"
                    onClick={() => tournament.startFight(selected.id)}
                  >
                    <Icon name="play" />
                    Start fight
                  </button>
                ) : (
                  <div className="live-desk-live-block">
                    <div className="notice" style={{ marginBottom: 0 }}>
                      <span>
                        Live · phase{' '}
                        <strong>{tournament.status.toUpperCase()}</strong>
                      </span>
                    </div>

                    <div className="live-desk-phase-links">
                      <a
                        href="/overlay/match"
                        target="_blank"
                        rel="noreferrer"
                        className="btn quiet small"
                      >
                        Match
                        <Icon name="external" />
                      </a>
                      <a
                        href="/overlay/lineup"
                        target="_blank"
                        rel="noreferrer"
                        className="btn quiet small"
                        onClick={() => tournament.setPhase('lineup')}
                      >
                        Lineup
                        <Icon name="external" />
                      </a>
                      <a
                        href="/overlay"
                        target="_blank"
                        rel="noreferrer"
                        className="btn quiet small"
                        onClick={() => tournament.setPhase('draft')}
                      >
                        Draft
                        <Icon name="external" />
                      </a>
                      <a
                        href="/overlay/game"
                        target="_blank"
                        rel="noreferrer"
                        className="btn quiet small"
                        onClick={() => tournament.setPhase('live')}
                      >
                        Game
                        <Icon name="external" />
                      </a>
                    </div>

                    <div className="live-desk-winners">
                      <div
                        className="small-muted"
                        style={{
                          width: '100%',
                          marginBottom: 4,
                          letterSpacing: '0.04em',
                          fontWeight: 700,
                        }}
                      >
                        Bo{bestOf} · GAME {currentGame} · {blueScore}–{redScore}
                      </div>
                      {!seriesComplete ? (
                        <>
                          <button
                            type="button"
                            className="btn small live-desk-win-blue"
                            onClick={() => {
                              useGameplayStore.getState().declareGameWinner('blue')
                              syncSeriesToDraft()
                            }}
                          >
                            Blue wins map
                          </button>
                          <button
                            type="button"
                            className="btn small live-desk-win-red"
                            onClick={() => {
                              useGameplayStore.getState().declareGameWinner('red')
                              syncSeriesToDraft()
                            }}
                          >
                            Red wins map
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn small gold"
                          onClick={() => {
                            if (!seriesLeader) return
                            bracket.reportDraftWinner(seriesLeader)
                          }}
                        >
                          Report series to bracket (
                          {seriesLeader === 'blue' ? 'Blue' : 'Red'})
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn quiet small live-desk-clear"
                      onClick={() => tournament.clearActiveMatch()}
                    >
                      Clear fight
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </StudioShell>
  )
}

function DeskRound({
  label,
  matches,
}: {
  label: string
  matches: BracketMatch[]
}) {
  return (
    <div className="live-desk-round">
      <div className="live-desk-round-label">{label}</div>
      <div
        className="live-desk-round-stack"
        style={{ minHeight: `${Math.max(1, matches.length) * 88}px` }}
      >
        {matches.map((m) => (
          <DeskMatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  )
}

function DeskMatchCard({ match }: { match: BracketMatch }) {
  const bracket = useBracketStore()
  const a = getTeam(bracket, match.teamAId)
  const b = getTeam(bracket, match.teamBId)
  const selected = match.id === bracket.activeMatchId
  const ready = Boolean(a && b)

  return (
    <button
      type="button"
      onClick={() => bracket.setActiveMatch(match.id)}
      className={`live-desk-match${selected ? ' is-selected' : ''}${
        match.status === 'live' ? ' is-live' : ''
      }${match.status === 'done' ? ' is-done' : ''}`}
    >
      <div className="live-desk-match-row">
        <span className="side-blue">{a?.tag ?? 'TBD'}</span>
        <span className="score">
          {match.status === 'done' ? match.scoreA : '–'}
        </span>
      </div>
      <div className="live-desk-match-row">
        <span className="side-red">{b?.tag ?? 'TBD'}</span>
        <span className="score">
          {match.status === 'done' ? match.scoreB : '–'}
        </span>
      </div>
      {match.status === 'live' ? (
        <div className="live-desk-badge live">Live</div>
      ) : null}
      {!ready && match.status === 'pending' ? (
        <div className="live-desk-badge muted">Waiting</div>
      ) : null}
    </button>
  )
}

function RosterPreview({
  label,
  side,
  teamId,
}: {
  label: string
  side: 'blue' | 'red'
  teamId: string | null
}) {
  const team = useTournamentStore((s) => s.getTeam(teamId))
  const players = team
    ? [...team.players].sort((a, b) => a.order - b.order)
    : []

  return (
    <div className={`live-desk-roster ${side}`}>
      <div className="live-desk-roster-label">{label}</div>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span className="live-desk-photo">
              {p.photo ? <img src={p.photo} alt="" /> : null}
            </span>
            <span className="name">{p.name}</span>
            <span className="role">
              {PLAYER_ROLES.find((r) => r.id === p.role)?.label ?? p.role}
            </span>
          </li>
        ))}
        {!players.length ? (
          <li className="empty">No roster in project</li>
        ) : null}
      </ul>
    </div>
  )
}
