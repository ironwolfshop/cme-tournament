import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/cme/Icon'
import StudioShell from '../components/cme/StudioShell'
import HeroImage from '../components/HeroImage'
import { buildPickQueue, PICK_BLOCKS, type PickTarget } from '../data/pickOrder'
import { getHero, heroSplashUrl, HEROES, searchHeroes, type Hero } from '../data/heroes'
import { getTeam } from '../lib/bracketEngine'
import { isObsSyncConnected } from '../lib/obsSync'
import { syncSeriesToDraft } from '../lib/syncSeriesLabel'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import {
  initDraftSync,
  useDraftStore,
  type TeamSide,
  type TeamState,
} from '../store/draftStore'
import {
  formatSeriesLabel,
  initGameplaySync,
  useGameplayStore,
} from '../store/gameplayStore'
import { initStingerSync, useStingerStore } from '../store/stingerStore'
import { initTournamentSync, useTournamentStore } from '../store/tournamentStore'
import '../styles/draft-control.css'

const ROLES: { id: string; label: string; icon: string | null }[] = [
  { id: 'All', label: 'All', icon: null },
  { id: 'Tank', label: 'Tank', icon: 'shield' },
  { id: 'Fighter', label: 'Fighter', icon: 'swords' },
  { id: 'Assassin', label: 'Assassin', icon: 'dagger' },
  { id: 'Mage', label: 'Mage', icon: 'wand' },
  { id: 'Marksman', label: 'Marksman', icon: 'target' },
  { id: 'Support', label: 'Support', icon: 'heart' },
]

const DEFAULT_ART: Record<TeamSide, string> = { blue: 'alucard', red: 'yu-zhong' }

type SlotTarget = { side: TeamSide; index: number; type: 'picks' | 'bans' }
type Taken = Map<string, { side: TeamSide; type: 'picks' | 'bans' }>
type Dialog =
  | null
  | { kind: 'match' }
  | { kind: 'teams' }
  | { kind: 'team'; side: TeamSide }
  | { kind: 'reset' }
  | { kind: 'broadcast' }
  | { kind: 'advance' }

function teamTag(team: TeamState, side: TeamSide) {
  return team.tag || team.name || (side === 'blue' ? 'BLUE' : 'RED')
}

function teamName(team: TeamState, side: TeamSide) {
  return team.name || (side === 'blue' ? 'Blue team' : 'Red team')
}

/** 0-based position of a ban in the alternating ban order. */
function banStep(side: TeamSide, index: number, first: TeamSide) {
  return index * 2 + (side === first ? 0 : 1)
}

export default function ControlPage() {
  const navigate = useNavigate()
  const phase = useDraftStore((s) => s.phase)
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  const firstPickSide = useDraftStore((s) => s.firstPickSide ?? 'blue')
  const matchLabel = useDraftStore((s) => s.matchLabel)
  const historyLen = useDraftStore((s) => s.history.length)
  const bracket = useBracketStore()
  const seriesBestOf = useGameplayStore((s) => s.bestOf)
  const seriesGame = useGameplayStore((s) => s.currentGame)
  const gBlue = useGameplayStore((s) => s.blue)
  const gRed = useGameplayStore((s) => s.red)
  const [lastLocked, setLastLocked] = useState<string | null>(null)
  const [manual, setManual] = useState<SlotTarget | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState('')
  const [syncOk, setSyncOk] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initDraftSync()
    initGameplaySync()
    initStingerSync()
    initBracketSync()
    initTournamentSync()
    document.documentElement.style.background = '#040a1a'
    document.body.style.background = '#040a1a'
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setSyncOk(isObsSyncConnected())
      setNow(Date.now())
    }, 1000)
    setSyncOk(isObsSyncConnected())
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!lastLocked) return
    const id = window.setTimeout(() => setLastLocked(null), 650)
    return () => window.clearTimeout(id)
  }, [lastLocked])

  const taken = useMemo<Taken>(() => {
    const map: Taken = new Map()
    for (const side of ['blue', 'red'] as const) {
      const team = side === 'blue' ? blue : red
      team.bans.forEach((id) => id && map.set(id, { side, type: 'bans' }))
      team.picks.forEach((id) => id && map.set(id, { side, type: 'picks' }))
    }
    return map
  }, [blue, red])

  const queue = useMemo(() => buildPickQueue(firstPickSide), [firstPickSide])

  const target = useMemo<SlotTarget | null>(() => {
    if (phase === 'done') return null
    if (manual && phase === (manual.type === 'bans' ? 'ban' : 'pick')) return manual
    if (phase === 'ban') {
      const order: TeamSide[] = [firstPickSide, firstPickSide === 'red' ? 'blue' : 'red']
      for (let i = 0; i < 5; i++) {
        for (const side of order) {
          const team = side === 'blue' ? blue : red
          if (!team.bans[i]) return { side, index: i, type: 'bans' }
        }
      }
      return null
    }
    const next = queue.find((step) => {
      const team = step.side === 'blue' ? blue : red
      return !team.picks[step.slot]
    })
    if (!next) return null
    return { side: next.side, index: next.slot, type: 'picks' }
  }, [manual, queue, phase, firstPickSide, blue, red])

  function focusSlot(next: SlotTarget) {
    if (phase === 'done') return
    const nextPhase = next.type === 'bans' ? 'ban' : 'pick'
    useDraftStore.getState().selectSlot(next.side, next.index, nextPhase)
    setManual(next)
  }

  function clearSlot(side: TeamSide, type: 'picks' | 'bans', index: number) {
    useDraftStore.getState().clearSlot(type === 'bans' ? 'ban' : 'pick', side, index)
    setManual({ side, index, type })
  }

  /** Click = lock immediately into the active ban/pick slot. */
  const lockHero = useCallback(
    (heroId: string) => {
      if (!heroId || !target || taken.has(heroId)) return
      const draft = useDraftStore.getState()
      if (draft.phase === 'done') return
      if (target.type === 'bans') draft.setBan(target.side, target.index, heroId)
      else draft.setPick(target.side, target.index, heroId)
      const hero = getHero(heroId)
      const team = target.side === 'blue' ? draft.blue : draft.red
      setToast(
        `${hero?.name ?? 'Hero'} ${target.type === 'bans' ? 'banned' : 'locked'} for ${teamTag(team, target.side)}`,
      )
      setLastLocked(heroId)
      setManual(null)
    },
    [target, taken],
  )

  function setPhase(next: 'ban' | 'pick' | 'done') {
    const draft = useDraftStore.getState()
    if (next === 'done') {
      const ready = [...draft.blue.picks, ...draft.red.picks].every(Boolean)
      if (!ready) {
        setToast('Fill all 10 pick slots before finishing the draft.')
        return
      }
    }
    draft.setPhase(next)
    setManual(null)
  }

  function saveAndContinue() {
    if (phase !== 'done') {
      setToast('Draft saved. Finish all 10 picks to continue.')
      return
    }
    navigate('/control/game')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (dialog) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if ((e.key === '/' && !editing) || (mod && key === 'f')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (mod && key === 'z' && !editing) {
        e.preventDefault()
        useDraftStore.getState().undo()
      } else if (mod && key === 's') {
        e.preventDefault()
        setToast('All changes saved.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  const lockedCount = (['blue', 'red'] as const).reduce((n, side) => {
    const team = side === 'blue' ? blue : red
    return n + (phase === 'ban' ? team.bans : team.picks).filter(Boolean).length
  }, 0)

  const activeMatch = bracket.matches.find((m) => m.id === bracket.activeMatchId)
  const targetTeam = target ? (target.side === 'blue' ? blue : red) : null

  const phaseTitle =
    phase === 'ban' ? 'Ban phase' : phase === 'pick' ? 'Pick phase' : 'Draft complete'
  const phaseSub = target
    ? `${teamTag(targetTeam!, target.side)} is ${target.type === 'bans' ? 'banning' : 'picking'}… · Slot ${target.index + 1}`
    : phase === 'ban'
      ? 'Bans complete — move to picks'
      : 'Both teams are locked in'

  const artHero = (side: TeamSide) => {
    const team = side === 'blue' ? blue : red
    const picked = queue
      .filter((q) => q.side === side && team.picks[q.slot])
      .map((q) => team.picks[q.slot])
    return picked[picked.length - 1] ?? DEFAULT_ART[side]
  }

  return (
    <StudioShell hideTopbar className="dcx-shell">
    <div className="dcx">
      <div className="dcx-backdrop" aria-hidden="true">
        <CornerArt side="blue" heroId={artHero('blue')} />
        <CornerArt side="red" heroId={artHero('red')} />
      </div>

      <header className="dcx-header">
        <Link className="dcx-brand" to="/control/tournament" title="Back to tournament workspace">
          <span className="dcx-emblem">
            <Icon name="swords" />
          </span>
          <span>
            <small>Tournament workspace</small>
            <strong>Draft Control</strong>
            <em>Manage · Pick · Ban · Dominate</em>
          </span>
        </Link>

        <nav className="dcx-steps" aria-label="Match workflow">
          <StepButton n={1} label="Settings" onClick={() => setDialog({ kind: 'match' })} />
          <StepButton n={2} label="Teams" onClick={() => setDialog({ kind: 'teams' })} />
          <StepButton n={3} label="Draft" active />
          <StepButton n={4} label="Results" onClick={() => setDialog({ kind: 'advance' })} />
        </nav>

        <div className="dcx-actions">
          <button
            className="dcx-btn icon"
            type="button"
            title="Broadcast overlay"
            aria-label="Broadcast overlay"
            onClick={() => setDialog({ kind: 'broadcast' })}
          >
            <Icon name="monitor" />
          </button>
          <button
            className="dcx-btn"
            type="button"
            disabled={!historyLen}
            onClick={() => useDraftStore.getState().undo()}
          >
            <Icon name="undo" />
            Undo
          </button>
          <button className="dcx-btn" type="button" onClick={() => setDialog({ kind: 'reset' })}>
            <Icon name="rotate" />
            Reset Draft
          </button>
          <button className="dcx-btn primary" type="button" onClick={saveAndContinue}>
            <Icon name="save" />
            Save &amp; Continue
          </button>
        </div>

        <div className="dcx-org">
          <img src="/logos/cme.png" alt="College of Maritime Education" draggable={false} />
          <span>
            <strong>CME Tournament</strong>
            <small>Young Sailors Club</small>
            <em>Discipline · Honor · Integrity</em>
          </span>
        </div>
      </header>

      <section className="dcx-matchbar" aria-label="Match status">
        <div className="dcx-match">
          <small>Match</small>
          <strong>
            BO{seriesBestOf} · Game {seriesGame}
          </strong>
          <span className="dcx-pair">
            <b className="blue">{teamTag(blue, 'blue')}</b>
            <i>vs</i>
            <b className="red">{teamTag(red, 'red')}</b>
            <span className="dcx-score">
              {gBlue.seriesScore}–{gRed.seriesScore}
            </span>
          </span>
        </div>

        <div className="dcx-phase">
          <div className={`dcx-phase-plate${target?.side === 'red' ? ' red' : ''}`} role="status">
            <small>Current phase</small>
            <strong>{phaseTitle}</strong>
            <span>{phaseSub}</span>
          </div>
          <PhaseTimeline
            queue={queue}
            blue={blue}
            red={red}
            target={target}
            lockedLabel={`${lockedCount}/10 ${phase === 'ban' ? 'bans' : 'picks'}`}
          />
        </div>

        <div className="dcx-match-right">
          <div className="dcx-game">
            <small>Game {seriesGame}</small>
            <span>
              <b className="blue">{teamTag(blue, 'blue')}</b> vs{' '}
              <b className="red">{teamTag(red, 'red')}</b>
            </span>
            <button type="button" className="dcx-chip-btn" onClick={() => setDialog({ kind: 'match' })}>
              <Icon name="refresh" />
              Change
            </button>
          </div>
          <div className="dcx-sync">
            <small>Sync label</small>
            <div>
              <span title={matchLabel}>{matchLabel || 'No label'}</span>
              <button
                type="button"
                className="dcx-btn icon small"
                title="Refresh match label from series score"
                aria-label="Refresh match label from series score"
                onClick={() => {
                  syncSeriesToDraft()
                  setToast(formatSeriesLabel(useGameplayStore.getState()))
                }}
              >
                <Icon name="edit" />
              </button>
            </div>
          </div>
          <div className="dcx-mode">
            <small>Draft phase</small>
            <div className="dcx-seg" role="group" aria-label="Draft phase">
              {(['ban', 'pick', 'done'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={phase === p ? 'active' : ''}
                  aria-pressed={phase === p}
                  onClick={() => setPhase(p)}
                >
                  {p === 'ban' ? 'Bans' : p === 'pick' ? 'Picks' : 'Done'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="dcx-work">
        <TeamPanel
          side="blue"
          team={blue}
          first={firstPickSide === 'blue'}
          target={target}
          phase={phase}
          onFocus={focusSlot}
          onClear={(type, i) => clearSlot('blue', type, i)}
          onEdit={() => setDialog({ kind: 'team', side: 'blue' })}
        />
        <HeroPanel
          searchRef={searchRef}
          taken={taken}
          phase={phase}
          canLock={!!target}
          lastLocked={lastLocked}
          onLock={lockHero}
        />
        <TeamPanel
          side="red"
          team={red}
          first={firstPickSide === 'red'}
          target={target}
          phase={phase}
          onFocus={focusSlot}
          onClear={(type, i) => clearSlot('red', type, i)}
          onEdit={() => setDialog({ kind: 'team', side: 'red' })}
        />
      </div>

      <section className="dcx-sequence" aria-label="Draft sequence">
        <div className="dcx-seq-title">Draft sequence</div>
        <SequenceSide
          side="blue"
          team={blue}
          first={firstPickSide}
          queue={queue}
          target={target}
          onFocus={focusSlot}
        />
        <div className="dcx-vs">VS</div>
        <SequenceSide
          side="red"
          team={red}
          first={firstPickSide}
          queue={queue}
          target={target}
          onFocus={focusSlot}
        />
      </section>

      <footer className="dcx-footer">
        <div className="dcx-keys">
          <span className="dcx-keys-label">Keyboard shortcuts:</span>
          <span>
            <kbd>Ctrl + S</kbd>Save
          </span>
          <span>
            <kbd>Ctrl + Z</kbd>Undo
          </span>
          <span>
            <kbd>Ctrl + F</kbd>Search
          </span>
          <span>
            <kbd>Enter</kbd>Lock top result
          </span>
        </div>
        <div className="dcx-notes">
          <b>Notes:</b>
          Picks and bans save automatically and sync to the broadcast overlay.
        </div>
        <div className="dcx-status">
          <span className={`dcx-dot${syncOk ? '' : ' warn'}`} />
          {syncOk ? 'All changes saved' : 'Saved locally · overlay reconnecting…'}
        </div>
        <time className="dcx-clock">
          {new Date(now).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </time>
      </footer>

      {dialog?.kind === 'match' && (
        <MatchSettingsDialog
          onClose={() => setDialog(null)}
          onSaved={() => setToast('Match settings updated.')}
        />
      )}

      {dialog?.kind === 'teams' && (
        <Modal title="Teams" wide onClose={() => setDialog(null)}>
          {activeMatch?.teamAId && activeMatch.teamBId && (
            <div className="dcx-load-match">
              <span>
                <small>Active bracket match</small>
                <b>
                  <span className="blue">{getTeam(bracket, activeMatch.teamAId)?.tag ?? 'BLUE'}</span>
                  {' vs '}
                  <span className="red">{getTeam(bracket, activeMatch.teamBId)?.tag ?? 'RED'}</span>
                </b>
              </span>
              <button
                type="button"
                className="dcx-btn primary"
                onClick={() => {
                  const loaded = useTournamentStore.getState().loadMatchScenes(activeMatch.id)
                  if (!loaded) bracket.loadMatchIntoDraft(activeMatch.id)
                  setDialog(null)
                  setToast('Active match loaded into the draft and overlay.')
                }}
              >
                <Icon name="refresh" />
                Load into draft
              </button>
            </div>
          )}
          <p className="dialog-note">Edit team names, codes, logos, and player rosters.</p>
          <div className="dcx-teams-pick">
            {(['blue', 'red'] as const).map((side) => {
              const team = side === 'blue' ? blue : red
              return (
                <button
                  key={side}
                  type="button"
                  className={`dcx-team-card ${side}`}
                  onClick={() => setDialog({ kind: 'team', side })}
                >
                  <span className="dcx-logo">
                    {team.logo ? <img src={team.logo} alt="" /> : teamTag(team, side).slice(0, 2)}
                  </span>
                  <span>
                    <b>{teamTag(team, side)}</b>
                    <small>{teamName(team, side)}</small>
                  </span>
                  <Icon name="edit" />
                </button>
              )
            })}
          </div>
        </Modal>
      )}

      {dialog?.kind === 'team' && (
        <TeamDialog side={dialog.side} onClose={() => setDialog(null)} onSaved={() => setToast('Team updated.')} />
      )}

      {dialog?.kind === 'reset' && (
        <Modal title="Reset this draft?" onClose={() => setDialog(null)}>
          <p className="dialog-note">
            Clear all hero picks and bans for both teams. Team names and player rosters will stay in place.
          </p>
          <div className="dialog-actions">
            <button className="dcx-btn" type="button" onClick={() => setDialog(null)}>
              Keep draft
            </button>
            <button
              className="dcx-btn danger"
              type="button"
              onClick={() => {
                useDraftStore.getState().resetDraft()
                setManual(null)
                setDialog(null)
                setToast('Draft reset. Begin with the bans.')
              }}
            >
              Reset draft
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'broadcast' && (
        <Modal title="Broadcast overlay" wide onClose={() => setDialog(null)}>
          <p className="dialog-note">Teams, picks, and bans appear on the broadcast overlay.</p>
          <div className="dcx-broadcast-tools">
            <button className="dcx-btn" type="button" onClick={() => useStingerStore.getState().fire('wipe')}>
              Stinger · Wipe
            </button>
            <button className="dcx-btn" type="button" onClick={() => useStingerStore.getState().fire('slam')}>
              Slam
            </button>
            <button className="dcx-btn" type="button" onClick={() => useStingerStore.getState().fire('split')}>
              Split
            </button>
          </div>
          <p className="dialog-note">Open the overlay in OBS as a browser source at /overlay.</p>
          <div className="dialog-actions">
            <Link className="dcx-btn" to="/control/live" onClick={() => setDialog(null)}>
              Live desk
            </Link>
            <a className="dcx-btn primary" href="/overlay" target="_blank" rel="noreferrer">
              Open full overlay
            </a>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'advance' && (
        <Modal title="Report series to bracket" onClose={() => setDialog(null)}>
          <p className="dialog-note">
            Only use this when the Bo{seriesBestOf} series is decided. Single map wins do not
            move the bracket — log those on the Gameplay desk.
          </p>
          {activeMatch?.teamAId && activeMatch.teamBId && (
            <div className="dcx-result">
              <AdvanceTeam
                tag={getTeam(bracket, activeMatch.teamAId)?.tag ?? 'BLUE'}
                name={getTeam(bracket, activeMatch.teamAId)?.name ?? 'Blue'}
                side="blue"
                onWin={() => {
                  bracket.reportDraftWinner('blue')
                  setDialog(null)
                  setToast('Series winner reported — blue advances on the bracket.')
                }}
              />
              <span className="dcx-muted">vs</span>
              <AdvanceTeam
                tag={getTeam(bracket, activeMatch.teamBId)?.tag ?? 'RED'}
                name={getTeam(bracket, activeMatch.teamBId)?.name ?? 'Red'}
                side="red"
                onWin={() => {
                  bracket.reportDraftWinner('red')
                  setDialog(null)
                  setToast('Series winner reported — red advances on the bracket.')
                }}
              />
            </div>
          )}
          <div className="dialog-actions">
            <Link className="dcx-btn" to="/control/game" onClick={() => setDialog(null)}>
              Gameplay desk
            </Link>
            <Link className="dcx-btn" to="/control/bracket" onClick={() => setDialog(null)}>
              Open bracket
            </Link>
            <button className="dcx-btn primary" type="button" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      <div className={`dcx-toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
    </StudioShell>
  )
}

function CornerArt({ side, heroId }: { side: TeamSide; heroId: string }) {
  const hero = getHero(heroId)
  const src = hero ? heroSplashUrl(hero.name) : null
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) return null
  return (
    <img
      key={src}
      className={`dcx-art ${side}`}
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(src)}
    />
  )
}

function StepButton({
  n,
  label,
  active,
  onClick,
}: {
  n: number
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`dcx-step${active ? ' active' : ''}`}
      aria-current={active ? 'step' : undefined}
      onClick={onClick}
    >
      <span className="dcx-step-n">{n}</span>
      <span className="dcx-step-label">{label}</span>
    </button>
  )
}

function PhaseTimeline({
  queue,
  blue,
  red,
  target,
  lockedLabel,
}: {
  queue: PickTarget[]
  blue: TeamState
  red: TeamState
  target: SlotTarget | null
  lockedLabel: string
}) {
  const nodes = [
    ...[0, 1, 2, 3, 4].map((i) => ({
      key: `b${i}`,
      label: `Ban ${i + 1}`,
      kind: 'ban' as const,
      side: null as TeamSide | null,
      done: !!blue.bans[i] && !!red.bans[i],
      current: target?.type === 'bans' && target.index === i,
    })),
    ...PICK_BLOCKS.map((_, bi) => {
      const steps = queue.filter((q) => q.blockIndex === bi)
      const a = steps[0].orderIndex + 1
      const z = a + steps.length - 1
      return {
        key: `p${bi}`,
        label: a === z ? `Pick ${a}` : `Pick ${a}-${z}`,
        kind: 'pick' as const,
        side: steps[0].side as TeamSide | null,
        done: steps.every((s) => !!(s.side === 'blue' ? blue : red).picks[s.slot]),
        current:
          target?.type === 'picks' &&
          steps.some((s) => s.side === target.side && s.slot === target.index),
      }
    }),
  ]
  const currentIndex = nodes.findIndex((n) => n.current)
  const lastDone = nodes.reduce((acc, n, i) => (n.done ? i : acc), -1)
  const reach = currentIndex >= 0 ? currentIndex : lastDone
  const fill = reach <= 0 ? 0 : (reach / (nodes.length - 1)) * 100

  return (
    <div className="dcx-timeline" aria-label={`Draft progress, ${lockedLabel}`}>
      <div className="dcx-timeline-track">
        <span className="dcx-timeline-fill" style={{ width: `${fill}%` }} />
      </div>
      <ol>
        {nodes.map((n) => (
          <li
            key={n.key}
            className={`${n.kind}${n.side ? ` ${n.side}` : ''}${n.done ? ' done' : ''}${n.current ? ' current' : ''}`}
          >
            <span className="dcx-node" />
            <span className="dcx-node-label">{n.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function TeamPanel({
  side,
  team,
  first,
  target,
  phase,
  onFocus,
  onClear,
  onEdit,
}: {
  side: TeamSide
  team: TeamState
  first: boolean
  target: SlotTarget | null
  phase: string
  onFocus: (target: SlotTarget) => void
  onClear: (type: 'picks' | 'bans', index: number) => void
  onEdit: () => void
}) {
  const bansFilled = team.bans.filter(Boolean).length
  const done = phase === 'done'

  return (
    <section className={`dcx-team ${side}`} aria-label={`${side} team`}>
      <button className="dcx-team-head" type="button" onClick={onEdit} title="Edit team">
        <span className="dcx-logo">
          {team.logo ? <img src={team.logo} alt="" /> : teamTag(team, side).slice(0, 2)}
        </span>
        <span className="dcx-team-names">
          <b>{teamTag(team, side)}</b>
          <strong>{teamName(team, side)}</strong>
        </span>
        <span className="dcx-side-badges">
          <span className="dcx-side-badge">{side} side</span>
          {first && <span className="dcx-first">First pick</span>}
        </span>
      </button>

      <div className="dcx-players">
        {team.players.map((player, i) => {
          const heroId = team.picks[i]
          const hero = getHero(heroId)
          const active = target?.side === side && target.index === i && target.type === 'picks'
          return (
            <div
              key={i}
              className={`dcx-player${heroId ? ' filled' : ''}${active ? ' active' : ''}`}
            >
              <button
                type="button"
                className="dcx-player-btn"
                disabled={done}
                onClick={() => onFocus({ side, index: i, type: 'picks' })}
              >
                <span className="dcx-slot-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="dcx-portrait">
                  {heroId ? (
                    <HeroImage heroId={heroId} className="dcx-fill" showNameFallback={false} />
                  ) : (
                    <Icon name={active ? 'swords' : 'edit'} />
                  )}
                </span>
                <span className="dcx-player-copy">
                  <b>{player.name || `Player ${i + 1}`}</b>
                  <small>{hero ? hero.name : active ? 'Picking…' : 'Waiting…'}</small>
                </span>
              </button>
              {heroId && !done && (
                <button
                  className="dcx-remove"
                  type="button"
                  aria-label={`Remove ${hero?.name ?? 'hero'}`}
                  onClick={() => onClear('picks', i)}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="dcx-bans">
        <div className="dcx-bans-label">Bans ({bansFilled}/5)</div>
        <div className="dcx-ban-row">
          {team.bans.map((heroId, i) => {
            const active = target?.side === side && target.index === i && target.type === 'bans'
            const hero = getHero(heroId)
            return (
              <div key={i} className={`dcx-ban${heroId ? ' filled' : ''}${active ? ' active' : ''}`}>
                <button
                  type="button"
                  disabled={done}
                  title={hero ? `${hero.name} (ban ${i + 1})` : `Ban ${i + 1}`}
                  onClick={() => onFocus({ side, index: i, type: 'bans' })}
                >
                  {heroId ? (
                    <HeroImage heroId={heroId} variant="ban" className="dcx-fill" showNameFallback={false} />
                  ) : (
                    <Icon name="ban" />
                  )}
                </button>
                <span className="dcx-ban-who">
                  {(team.players[i]?.name || `P${i + 1}`).split(/[,\s]+/)[0]}
                </span>
                {heroId && !done && (
                  <button
                    className="dcx-remove"
                    type="button"
                    aria-label={`Remove ban ${hero?.name ?? ''}`}
                    onClick={() => onClear('bans', i)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function HeroPanel({
  searchRef,
  taken,
  phase,
  canLock,
  lastLocked,
  onLock,
}: {
  searchRef: RefObject<HTMLInputElement | null>
  taken: Taken
  phase: string
  canLock: boolean
  lastLocked: string | null
  onLock: (heroId: string) => void
}) {
  const [tab, setTab] = useState<'pool' | 'quick'>('pool')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('All')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sortAz, setSortAz] = useState(false)

  const heroes = useMemo(() => {
    let list = searchHeroes(query).filter((h) => role === 'All' || h.role === role)
    if (tab === 'quick') list = list.filter((h) => !taken.has(h.id))
    if (sortAz || tab === 'quick') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [query, role, tab, taken, sortAz])

  const topPick = query.trim() ? heroes.find((h) => !taken.has(h.id)) : undefined
  const available = HEROES.length - taken.size

  return (
    <section className="dcx-pool" aria-label="Hero pool">
      <div className="dcx-pool-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pool'}
          className={tab === 'pool' ? 'active' : ''}
          onClick={() => setTab('pool')}
        >
          Hero Pool
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'quick'}
          className={tab === 'quick' ? 'active' : ''}
          onClick={() => {
            setTab('quick')
            searchRef.current?.focus()
          }}
        >
          Quick Pick
        </button>
        <span className="dcx-pool-count">
          {heroes.length} Heroes
          <small>{available} available</small>
        </span>
      </div>

      <div className="dcx-pool-tools">
        <label className="dcx-search">
          <Icon name="search" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={tab === 'quick' ? 'Type a hero, press Enter…' : 'Search heroes…'}
            aria-label="Search heroes"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && topPick && canLock) {
                e.preventDefault()
                onLock(topPick.id)
                setQuery('')
              } else if (e.key === 'Escape') {
                setQuery('')
              }
            }}
          />
        </label>
        <div className="dcx-roles" role="group" aria-label="Filter heroes by role">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={role === r.id ? 'active' : ''}
              aria-pressed={role === r.id}
              aria-label={r.label}
              title={r.label}
              onClick={() => setRole(r.id)}
            >
              {r.icon && <Icon name={r.icon} />}
              <span className={r.icon ? 'dcx-role-label' : undefined}>{r.label}</span>
            </button>
          ))}
        </div>
        <div className="dcx-view" role="group" aria-label="Layout">
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            aria-pressed={view === 'grid'}
            aria-label="Grid"
            title="Grid"
            onClick={() => setView('grid')}
          >
            <Icon name="grid" />
            <span className="dcx-role-label">Grid</span>
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            aria-pressed={view === 'list'}
            aria-label="List"
            title="List"
            onClick={() => setView('list')}
          >
            <Icon name="list" />
            <span className="dcx-role-label">List</span>
          </button>
        </div>
        <button
          type="button"
          className={`dcx-btn icon small${sortAz ? ' on' : ''}`}
          title={sortAz ? 'Sorted A–Z (click for release order)' : 'Sort A–Z'}
          aria-pressed={sortAz}
          onClick={() => setSortAz((v) => !v)}
        >
          <Icon name="filter" />
        </button>
      </div>

      {topPick && (
        <div className="dcx-quick-hint">
          Press <kbd>Enter</kbd> to {phase === 'ban' ? 'ban' : 'lock'} <b>{topPick.name}</b>
        </div>
      )}

      <HeroGrid
        heroes={heroes}
        taken={taken}
        view={view}
        disabled={phase === 'done' || !canLock}
        lastLocked={lastLocked}
        onLock={onLock}
      />
    </section>
  )
}

const HeroGrid = memo(function HeroGrid({
  heroes,
  taken,
  view,
  disabled,
  lastLocked,
  onLock,
}: {
  heroes: Hero[]
  taken: Taken
  view: 'grid' | 'list'
  disabled: boolean
  lastLocked: string | null
  onLock: (heroId: string) => void
}) {
  if (heroes.length === 0) {
    return (
      <div className="dcx-grid-wrap">
        <div className="dcx-empty">No heroes found.</div>
      </div>
    )
  }
  return (
    <div className="dcx-grid-wrap">
      <div className={view === 'grid' ? 'dcx-grid' : 'dcx-list'}>
        {heroes.map((hero) => {
          const used = taken.get(hero.id)
          const flash = lastLocked === hero.id
          return (
            <button
              key={hero.id}
              type="button"
              className={`dcx-hero${flash ? ' flash' : ''}${used ? ` used ${used.side} ${used.type}` : ''}`}
              disabled={!!used || disabled}
              aria-label={`${hero.name}, ${hero.role}`}
              onClick={() => onLock(hero.id)}
            >
              <span className="dcx-hero-art">
                <HeroImage hero={hero} className="dcx-fill" showNameFallback={false} lazy />
                {used && (
                  <span className="dcx-hero-mark">
                    <Icon name={used.type === 'bans' ? 'ban' : 'check'} />
                  </span>
                )}
              </span>
              <span className="dcx-hero-name">{hero.name}</span>
              {view === 'list' && (
                <span className="dcx-hero-meta">
                  {hero.role}
                  {used ? ` · ${used.type === 'bans' ? 'Banned' : 'Picked'} by ${used.side}` : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})

function SequenceSide({
  side,
  team,
  first,
  queue,
  target,
  onFocus,
}: {
  side: TeamSide
  team: TeamState
  first: TeamSide
  queue: PickTarget[]
  target: SlotTarget | null
  onFocus: (target: SlotTarget) => void
}) {
  const chips = [
    ...team.bans.map((heroId, i) => ({
      step: banStep(side, i, first) + 1,
      type: 'bans' as const,
      slot: i,
      heroId,
    })),
    ...queue
      .filter((q) => q.side === side)
      .map((q) => ({
        step: 11 + q.orderIndex,
        type: 'picks' as const,
        slot: q.slot,
        heroId: team.picks[q.slot],
      })),
  ]

  const badge = (
    <div className="dcx-seq-team">
      <span className="dcx-logo small">
        {team.logo ? <img src={team.logo} alt="" /> : teamTag(team, side).slice(0, 2)}
      </span>
      <span>
        <b>{teamTag(team, side)}</b>
        <small>{side} side</small>
      </span>
    </div>
  )

  return (
    <div className={`dcx-seq-side ${side}`}>
      {side === 'blue' && badge}
      <ol className="dcx-seq-chips">
        {chips.map((c) => {
          const current = target?.side === side && target.type === c.type && target.index === c.slot
          return (
            <li key={`${c.type}-${c.slot}`}>
              <button
                type="button"
                className={`dcx-seq-chip ${c.type === 'bans' ? 'ban' : 'pick'}${c.heroId ? ' done' : ''}${current ? ' current' : ''}`}
                title={`Step ${c.step}: ${c.type === 'bans' ? 'Ban' : 'Pick'} ${c.slot + 1}${c.heroId ? ` — ${getHero(c.heroId)?.name}` : ''}`}
                onClick={() => onFocus({ side, index: c.slot, type: c.type })}
              >
                <span className="dcx-seq-n">{c.step}</span>
                <span className="dcx-seq-icon">
                  {c.heroId ? (
                    <HeroImage
                      heroId={c.heroId}
                      variant={c.type === 'bans' ? 'ban' : 'portrait'}
                      className="dcx-fill"
                      showNameFallback={false}
                    />
                  ) : (
                    <Icon name={c.type === 'bans' ? 'ban' : 'check'} />
                  )}
                </span>
                <span className="dcx-seq-kind">{c.type === 'bans' ? 'Ban' : 'Pick'}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {side === 'red' && badge}
    </div>
  )
}

function MatchSettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const matchLabel = useDraftStore((s) => s.matchLabel)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  return (
    <Modal title="Match settings" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const label = String(data.get('match') ?? '').trim()
          if (!label) return
          const draft = useDraftStore.getState()
          draft.setMatchLabel(label)
          draft.setFirstPickSide(data.get('first') === 'red' ? 'red' : 'blue')
          onClose()
          onSaved()
        }}
      >
        <label className="form-field">
          <span>Match label</span>
          <input name="match" defaultValue={matchLabel} maxLength={42} required />
        </label>
        <label className="form-field">
          <span>First pick team</span>
          <select name="first" defaultValue={firstPickSide ?? 'blue'}>
            <option value="blue">{teamName(blue, 'blue')}</option>
            <option value="red">{teamName(red, 'red')}</option>
          </select>
        </label>
        <div className="dialog-actions">
          <button className="dcx-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="dcx-btn primary" type="submit">
            Save settings
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AdvanceTeam({
  tag,
  name,
  side,
  onWin,
}: {
  tag: string
  name: string
  side: TeamSide
  onWin: () => void
}) {
  return (
    <div className={`dcx-result-team ${side}`}>
      <h3>{tag}</h3>
      <p>{name}</p>
      <button className="dcx-btn" type="button" onClick={onWin}>
        <Icon name="trophy" />
        Advance {tag}
      </button>
    </div>
  )
}

function TeamDialog({
  side,
  onClose,
  onSaved,
}: {
  side: TeamSide
  onClose: () => void
  onSaved: () => void
}) {
  const team = useDraftStore((s) => s[side])
  const updateTeam = useDraftStore((s) => s.updateTeam)
  const updatePlayer = useDraftStore((s) => s.updatePlayer)
  return (
    <Modal title={`Edit ${teamName(team, side)}`} wide onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const name = String(data.get('teamName') ?? '').trim()
          const code = String(data.get('teamCode') ?? '').trim()
          if (!name || !code) return
          updateTeam(side, { name, tag: code.toUpperCase(), logo: String(data.get('teamLogo') ?? '').trim() })
          for (let i = 0; i < 5; i++) {
            updatePlayer(side, i, {
              name: String(data.get(`player${i}`) ?? '').trim() || `Player ${i + 1}`,
              photo: String(data.get(`photo${i}`) ?? '').trim(),
            })
          }
          onClose()
          onSaved()
        }}
      >
        <div className="form-grid">
          <label className="form-field">
            <span>Team name</span>
            <input name="teamName" defaultValue={team.name} required maxLength={28} />
          </label>
          <label className="form-field">
            <span>Short code</span>
            <input name="teamCode" defaultValue={team.tag} required maxLength={6} />
          </label>
        </div>
        <label className="form-field">
          <span>Team logo URL</span>
          <input name="teamLogo" type="url" defaultValue={team.logo} placeholder="https://…" />
        </label>
        <div className="roster-caption">
          <span>Players · in pick order</span>
          <span>Photo URLs are optional</span>
        </div>
        {team.players.map((player, i) => (
          <div className="roster-edit-row" key={i}>
            <span>0{i + 1}</span>
            <input
              name={`player${i}`}
              defaultValue={player.name}
              required
              maxLength={25}
              aria-label={`Player ${i + 1} name`}
            />
            <input
              name={`photo${i}`}
              type="url"
              defaultValue={player.photo ?? ''}
              placeholder="Player photo URL"
              aria-label={`Player ${i + 1} photo URL`}
            />
          </div>
        ))}
        <div className="dialog-actions">
          <button className="dcx-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="dcx-btn primary" type="submit">
            Save team
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dcx-dialog${wide ? ' wide' : ''}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          ref.current?.close()
        }
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="dcx-btn icon"
          type="button"
          aria-label="Close dialog"
          onClick={() => ref.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
