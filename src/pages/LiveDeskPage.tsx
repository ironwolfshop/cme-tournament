import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import ControlNav from '../components/ControlNav'
import {
  getTeam,
  roundLabel,
  type BracketMatch,
} from '../lib/bracketEngine'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import {
  initTournamentSync,
  PLAYER_ROLES,
  useTournamentStore,
} from '../store/tournamentStore'
import '../styles/draft-room.css'

export default function LiveDeskPage() {
  const bracket = useBracketStore()
  const tournament = useTournamentStore()

  useEffect(() => {
    initBracketSync()
    initTournamentSync()
    document.documentElement.style.background = '#041830'
    document.body.style.background = '#041830'
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

  const champion =
    finalMatch?.status === 'done' && finalMatch.winnerId
      ? getTeam(bracket, finalMatch.winnerId)
      : null

  return (
    <div className="min-h-screen bg-[#041830] px-4 py-6 text-slate-100 font-ui">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `url('/underwater-bg.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          opacity: 0.35,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(4,24,48,0.75) 0%, rgba(4,24,48,0.9) 100%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-maritime text-[11px] font-semibold tracking-[0.4em] text-teal-300/90">
              TECHNICALS ONLY
            </div>
            <h1 className="font-maritime mt-1 text-3xl font-bold tracking-wide text-[#f3e6c8]">
              Live Desk
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {tournament.projectName} · click a match → Start fight
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/control/tournament"
              className="rounded border border-white/10 bg-slate-800/80 px-3 py-2 text-sm font-semibold hover:bg-slate-700"
            >
              Tournament hub
            </Link>
            <Link
              to="/control/scenes"
              className="rounded border border-teal-500/30 bg-teal-900/40 px-3 py-2 text-sm font-semibold text-teal-100"
            >
              Scenes
            </Link>
          </div>
        </header>

        <div className="cme-draft !min-h-0 !bg-transparent p-0">
          <ControlNav />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="overflow-x-auto rounded-lg border border-[#d4a84b]/25 bg-[#061525]/90 p-4">
            <div className="flex min-w-max items-stretch gap-3">
              <div className="flex items-stretch justify-end gap-3">
                {leftCols.map((matches, col) => (
                  <DeskRound
                    key={`L${col}`}
                    label={roundLabel(col, bracket.bracketSize)}
                    matches={matches}
                  />
                ))}
              </div>

              <div className="flex w-52 shrink-0 flex-col items-center justify-center gap-3 border-x border-[#d4a84b]/25 px-3">
                <div className="w-full rounded border-2 border-[#d4a84b]/60 bg-[#d4a84b]/10 px-3 py-4 text-center">
                  <div className="font-maritime text-[10px] tracking-[0.35em] text-[#d4a84b]">
                    CHAMPION
                  </div>
                  <div className="mt-1 font-maritime text-xl font-bold text-[#f0d78c]">
                    {champion?.tag ?? 'AWAITS'}
                  </div>
                </div>
                {finalMatch ? (
                  <>
                    <div className="font-maritime text-[10px] tracking-[0.3em] text-[#d4a84b]/80">
                      GRAND FINAL
                    </div>
                    <DeskMatchCard match={finalMatch} />
                  </>
                ) : null}
              </div>

              <div className="flex items-stretch justify-start gap-3">
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
          </section>

          <aside className="rounded-lg border border-teal-500/30 bg-teal-950/40 p-4 space-y-4 h-fit sticky top-4">
            <h2 className="font-maritime text-lg font-bold text-teal-100">
              Selected match
            </h2>
            {!selected || !canFight ? (
              <p className="text-sm text-slate-400">
                Select a pending match with both teams filled.
              </p>
            ) : (
              <>
                <div className="text-center font-maritime text-xl font-bold">
                  <span className="text-sky-300">{blueT?.tag}</span>
                  <span className="mx-2 text-slate-500">vs</span>
                  <span className="text-rose-300">{redT?.tag}</span>
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
                <button
                  type="button"
                  className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 text-sm font-extrabold text-slate-900 hover:brightness-110"
                  onClick={() => tournament.startFight(selected.id)}
                >
                  Start fight
                </button>
                {tournament.status !== 'idle' &&
                tournament.activeMatchId === selected.id ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-200/90">
                      Live · phase: {tournament.status.toUpperCase()}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="/overlay/lineup"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-slate-800 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-700"
                        onClick={() => tournament.setPhase('lineup')}
                      >
                        Lineup
                      </a>
                      <a
                        href="/overlay"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-slate-800 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-700"
                        onClick={() => tournament.setPhase('draft')}
                      >
                        Draft
                      </a>
                      <a
                        href="/overlay/game"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-slate-800 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-700"
                        onClick={() => tournament.setPhase('live')}
                      >
                        Game
                      </a>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => bracket.reportDraftWinner('blue')}
                        className="flex-1 rounded bg-blue-700/80 px-2 py-2 text-xs font-bold hover:bg-blue-600"
                      >
                        Blue wins
                      </button>
                      <button
                        type="button"
                        onClick={() => bracket.reportDraftWinner('red')}
                        className="flex-1 rounded bg-rose-700/80 px-2 py-2 text-xs font-bold hover:bg-rose-600"
                      >
                        Red wins
                      </button>
                    </div>
                    <button
                      type="button"
                      className="w-full rounded border border-white/15 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                      onClick={() => tournament.clearActiveMatch()}
                    >
                      Clear fight (blank Draft / Gameplay)
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
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
    <div className="flex w-44 flex-col gap-2">
      <div className="text-center font-maritime text-[10px] font-bold tracking-[0.25em] text-teal-300/80">
        {label}
      </div>
      <div
        className="flex flex-1 flex-col justify-around gap-2"
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
      className={`w-full rounded border p-2 text-left transition ${
        selected
          ? 'border-[#d4a84b] bg-[#d4a84b]/15'
          : match.status === 'live'
            ? 'border-teal-400/70 bg-teal-950/50'
            : 'border-[#d4a84b]/20 bg-black/40 hover:border-[#d4a84b]/45'
      }`}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="truncate font-bold text-sky-200">{a?.tag ?? 'TBD'}</span>
        <span className="text-slate-500">
          {match.status === 'done' ? match.scoreA : '–'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-xs">
        <span className="truncate font-bold text-rose-200">{b?.tag ?? 'TBD'}</span>
        <span className="text-slate-500">
          {match.status === 'done' ? match.scoreB : '–'}
        </span>
      </div>
      {match.status === 'live' ? (
        <div className="mt-1 text-[9px] font-bold tracking-widest text-teal-300">
          LIVE
        </div>
      ) : null}
      {!ready && match.status === 'pending' ? (
        <div className="mt-1 text-[9px] text-slate-500">Waiting</div>
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
    <div
      className={`rounded-lg border p-2 ${
        side === 'blue' ? 'border-sky-500/30' : 'border-rose-500/30'
      }`}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <ul className="space-y-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            <span
              className="h-7 w-7 overflow-hidden rounded bg-black/40"
              style={{ flexShrink: 0 }}
            >
              {p.photo ? (
                <img
                  src={p.photo}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
            <span className="text-[10px] text-slate-500">
              {PLAYER_ROLES.find((r) => r.id === p.role)?.label ?? p.role}
            </span>
          </li>
        ))}
        {!players.length ? (
          <li className="text-xs text-slate-500">No roster in project</li>
        ) : null}
      </ul>
    </div>
  )
}
