import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Brand, Icon } from '../components/cme/Icon'
import ControlNav from '../components/ControlNav'
import HeroImage from '../components/HeroImage'
import { buildPickQueue, PICK_BLOCKS } from '../data/pickOrder'
import { getHero, searchHeroes, type Hero } from '../data/heroes'
import { getTeam } from '../lib/bracketEngine'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import {
  initDraftSync,
  useDraftStore,
  type TeamSide,
} from '../store/draftStore'
import { initStingerSync, useStingerStore } from '../store/stingerStore'

const ROLES = ['All heroes', 'Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support']

type SlotTarget = { side: TeamSide; index: number; type: 'picks' | 'bans' }
type Dialog =
  | null
  | { kind: 'match' }
  | { kind: 'team'; side: TeamSide }
  | { kind: 'reset' }
  | { kind: 'broadcast' }
  | { kind: 'advance' }

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function draftActions() {
  return useDraftStore.getState()
}

/** Timer UI only — keeps the hero grid from re-rendering every second. */
function TimerControls({
  phaseDone,
  onOpenSettings,
}: {
  phaseDone: boolean
  onOpenSettings: () => void
}) {
  const timerSeconds = useDraftStore((s) => s.timerSeconds)
  const timerRunning = useDraftStore((s) => s.timerRunning)
  return (
    <div className="control-group timer-group">
      <div>
        <div className="control-label">TURN TIMER</div>
        <div className={`timer-readout${timerSeconds === 0 ? ' timer-expired' : ''}`}>
          {pad(Math.floor(timerSeconds / 60))}:{pad(timerSeconds % 60)}
          <span>s</span>
        </div>
      </div>
      <div className="timer-buttons">
        <button
          className="btn primary"
          type="button"
          disabled={phaseDone}
          onClick={() => draftActions().setTimerRunning(!timerRunning)}
        >
          <Icon name={timerRunning ? 'pause' : 'play'} />
          {timerRunning ? 'Pause' : 'Start'}
        </button>
        <button
          className="btn square"
          type="button"
          aria-label="Reset timer"
          onClick={() => {
            const d = draftActions()
            d.setTimerRunning(false)
            d.setTimerSeconds(30)
          }}
        >
          <Icon name="rotate" />
        </button>
        <button
          className="btn ghost square"
          type="button"
          aria-label="Match settings"
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
        </button>
      </div>
    </div>
  )
}

const HeroCard = memo(function HeroCard({
  hero,
  used,
  isSelected,
  disabled,
  onLock,
}: {
  hero: Hero
  used: { side: TeamSide; type: 'picks' | 'bans' } | undefined
  isSelected: boolean
  disabled: boolean
  onLock: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`hero-card${isSelected ? ' selected' : ''}${used ? ' unavailable' : ''}`}
      disabled={disabled}
      aria-pressed={isSelected}
      onClick={() => onLock(hero.id)}
    >
      <span className="hero-art">
        <HeroImage hero={hero} className="cme-fill" showNameFallback={false} lazy />
        {isSelected && (
          <span className="selected-check">
            <Icon name="check" />
          </span>
        )}
      </span>
      {used && (
        <span
          className="hero-check"
          style={{ background: used.side === 'blue' ? '#385c8a' : '#7c3f52' }}
        >
          <Icon name={used.type === 'bans' ? 'ban' : 'check'} />
        </span>
      )}
      <span className="hero-caption">{hero.name}</span>
    </button>
  )
})

const HeroPool = memo(function HeroPool({
  heroes,
  taken,
  selected,
  canLock,
  onLock,
  onClearFilters,
}: {
  heroes: Hero[]
  taken: Map<string, { side: TeamSide; type: 'picks' | 'bans' }>
  selected: string | null
  canLock: boolean
  onLock: (id: string) => void
  onClearFilters: () => void
}) {
  if (heroes.length === 0) {
    return (
      <div className="hero-grid-wrap">
        <div className="hero-grid">
          <div className="empty-search">
            No heroes found.
            <br />
            <button className="btn ghost small" type="button" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="hero-grid-wrap">
      <div className="hero-grid">
        {heroes.map((hero) => (
          <HeroCard
            key={hero.id}
            hero={hero}
            used={taken.get(hero.id)}
            isSelected={selected === hero.id}
            disabled={!!taken.get(hero.id) || !canLock}
            onLock={onLock}
          />
        ))}
      </div>
    </div>
  )
})

export default function ControlPage() {
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  const phase = useDraftStore((s) => s.phase)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const matchLabel = useDraftStore((s) => s.matchLabel)
  const historyLen = useDraftStore((s) => s.history.length)
  const timerRunning = useDraftStore((s) => s.timerRunning)
  const bracket = useBracketStore()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('All heroes')
  const [selected, setSelected] = useState<string | null>(null)
  const [manual, setManual] = useState<SlotTarget | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initDraftSync()
    initStingerSync()
    initBracketSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
  }, [])

  useEffect(() => {
    if (!timerRunning) return
    const id = window.setInterval(() => useDraftStore.getState().tickTimer(), 1000)
    return () => window.clearInterval(id)
  }, [timerRunning])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  const heroes = useMemo(
    () => searchHeroes(query).filter((h) => role === 'All heroes' || h.role === role),
    [query, role],
  )

  const taken = useMemo(() => {
    const map = new Map<string, { side: TeamSide; type: 'picks' | 'bans' }>()
    blue.bans.forEach((id) => id && map.set(id, { side: 'blue', type: 'bans' }))
    blue.picks.forEach((id) => id && map.set(id, { side: 'blue', type: 'picks' }))
    red.bans.forEach((id) => id && map.set(id, { side: 'red', type: 'bans' }))
    red.picks.forEach((id) => id && map.set(id, { side: 'red', type: 'picks' }))
    return map
  }, [blue, red])

  const queue = useMemo(
    () => buildPickQueue(firstPickSide ?? 'blue'),
    [firstPickSide],
  )

  const target = useMemo<SlotTarget | null>(() => {
    if (phase === 'done') return null
    if (manual && phase === (manual.type === 'bans' ? 'ban' : 'pick')) return manual
    if (phase === 'ban') {
      const order: TeamSide[] = [
        firstPickSide ?? 'blue',
        firstPickSide === 'red' ? 'blue' : 'red',
      ]
      for (let i = 0; i < 5; i++) {
        for (const side of order) {
          const team = side === 'blue' ? blue : red
          if (!team.bans[i]) return { side, index: i, type: 'bans' }
        }
      }
      return null
    }
    const next = queue.find((step) => !(step.side === 'blue' ? blue : red).picks[step.slot])
    if (!next) return null
    return { side: next.side, index: next.slot, type: 'picks' }
  }, [manual, queue, phase, firstPickSide, blue, red])

  const available = useMemo(
    () => searchHeroes('').filter((h) => !taken.has(h.id)).length,
    [taken],
  )

  function focusSlot(next: SlotTarget) {
    const d = draftActions()
    const nextPhase = next.type === 'bans' ? 'ban' : 'pick'
    if (phase !== nextPhase) d.setPhase(nextPhase)
    d.setActiveSide(next.side)
    d.setActiveSlot(next.index)
    setManual(next)
    setSelected(null)
  }

  function lockHero(heroId?: string | null) {
    const id = heroId ?? selected
    if (!id || !target || taken.has(id)) return
    const team = target.side === 'blue' ? blue : red
    setSelected(id)
    setManual(null)
    const d = draftActions()
    if (target.type === 'bans') {
      d.setBan(target.side, target.index, id)
      setToast(`${getHero(id)?.name ?? 'Hero'} banned · ${team.tag}`)
      return
    }
    const step = queue.find((s) => s.side === target.side && s.slot === target.index)
    d.setPick(target.side, target.index, id)
    if (step && step.blockSize > 1 && step.indexInBlock < step.blockSize - 1) {
      setToast(
        `${getHero(id)?.name ?? 'Hero'} selected · ${step.indexInBlock + 1}/${step.blockSize} — pick one more to lock`,
      )
      return
    }
    setToast(`${getHero(id)?.name ?? 'Hero'} locked · ${team.tag}`)
  }

  function setPhase(next: 'ban' | 'pick' | 'done') {
    if (next === 'done') {
      const ready = [...blue.picks, ...red.picks].every(Boolean)
      if (!ready) {
        setToast('Fill all 10 pick slots before finishing the draft.')
        return
      }
    }
    draftActions().setPhase(next)
    setManual(null)
    setSelected(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (dialog) return
      if (e.key === '/' && !editing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing) {
        e.preventDefault()
        draftActions().undo()
      }
      if (e.key === 'Enter' && !editing && selected) {
        e.preventDefault()
        lockHero(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const lockedCount = (phase === 'ban' ? [...blue.bans, ...red.bans] : [...blue.picks, ...red.picks]).filter(
    Boolean,
  ).length

  const activeMatch = bracket.matches.find((m) => m.id === bracket.activeMatchId)
  const targetTeam = target ? (target.side === 'blue' ? blue : red) : null

  return (
    <div className="cme-draft">
      <header className="topbar">
        <Brand />
        <ControlNav />
        <div className="operator">
          <Link className="preview-tag" to="/control/live">
            Live desk
          </Link>
          <span className="operator-badge" title="Tournament operator">
            OP
          </span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">Tournament workspace</div>
            <h1>
              Draft control<span style={{ color: 'var(--gold)' }}>.</span>
            </h1>
          </div>
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              disabled={!historyLen}
              onClick={() => draftActions().undo()}
            >
              <Icon name="undo" />
              <span className="button-label">Undo</span>
            </button>
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'reset' })}>
              <Icon name="rotate" />
              <span className="button-label">Reset draft</span>
            </button>
            <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'broadcast' })}>
              <Icon name="monitor" />
              <span className="button-label">Preview overlay</span>
            </button>
          </div>
        </div>

        <section className="controls" aria-label="Match controls">
          <div className="control-group">
            <button className="match-edit" type="button" onClick={() => setDialog({ kind: 'match' })}>
              <div className="control-label">CURRENT MATCH</div>
              <div className="match-label">
                <span>{matchLabel}</span>
                <Icon name="chevron" />
              </div>
            </button>
            <span className="match-pair">
              <span className="blue-text">{blue.tag}</span>
              <span className="small-muted">vs</span>
              <span className="red-text">{red.tag}</span>
            </span>
          </div>
          <div className="control-group">
            <div>
              <div className="control-label">DRAFT PHASE</div>
              <div className="segmented" role="group" aria-label="Draft phase">
                {(['ban', 'pick', 'done'] as const).map((item, i) => (
                  <button
                    key={item}
                    type="button"
                    data-phase={item}
                    className={phase === item ? 'active' : ''}
                    aria-pressed={phase === item}
                    onClick={() => setPhase(item)}
                  >
                    <span className="phase-number">0{i + 1}</span>
                    {item === 'ban' ? 'Ban' : item === 'pick' ? 'Pick' : 'Done'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <TimerControls phaseDone={phase === 'done'} onOpenSettings={() => setDialog({ kind: 'match' })} />
        </section>

        <div className="workspace">
          <TeamColumn
            side="blue"
            target={target}
            onFocus={focusSlot}
            onClear={(type, index) => {
              draftActions().clearSlot(type === 'bans' ? 'ban' : 'pick', 'blue', index)
              setManual({ side: 'blue', index, type })
            }}
            onEdit={() => setDialog({ kind: 'team', side: 'blue' })}
          />
          <section className="hero-panel" id="hero-picker" aria-labelledby="hero-picker-title">
            <div
              className={`turn-banner${target?.side === 'red' ? ' red-turn' : ''}${phase === 'ban' ? ' ban-turn' : ''}${!target ? ' turn-complete' : ''}`}
              role="status"
            >
              <div>
                <div className="turn-label">
                  <span className="turn-dot" />
                  {!target ? 'All set' : phase === 'ban' ? 'Ban phase' : 'On the clock'}
                </div>
                <div className="turn-title">
                  {target && targetTeam
                    ? `${targetTeam.name} ${phase === 'ban' ? 'is banning' : 'is picking'} / Slot ${target.index + 1}`
                    : phase === 'ban'
                      ? 'Bans complete. Move to picks.'
                      : 'Draft complete'}
                </div>
              </div>
              <div className="turn-progress">
                {phase === 'ban' ? 'Bans' : 'Picks'} locked
                <br />
                <b>{lockedCount}</b> / 10
              </div>
            </div>
            <div className="picker-tools">
              <div className="picker-heading">
                <h2 id="hero-picker-title">Hero pool</h2>
                <span className="available-count">{available} available</span>
              </div>
              <div className="search-box">
                <Icon name="search" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="Search heroes…"
                  aria-label="Search heroes"
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="key-hint" aria-hidden="true">
                  /
                </span>
              </div>
              <div className="role-tabs" aria-label="Filter heroes by role">
                {ROLES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={item === role ? 'active' : ''}
                    aria-pressed={item === role}
                    onClick={() => setRole(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <HeroPool
              heroes={heroes}
              taken={taken}
              selected={selected}
              canLock={phase !== 'done' && !!target}
              onLock={lockHero}
              onClearFilters={() => {
                setQuery('')
                setRole('All heroes')
              }}
            />
            <div className="lockbar">
              <div className="selection-meta">
                {selected && (
                  <span className="portrait">
                    <HeroImage heroId={selected} className="cme-fill" showNameFallback={false} />
                  </span>
                )}
                <div>
                  <div className="selection-title">
                    {selected
                      ? getHero(selected)?.name
                      : target
                        ? 'Click a hero to lock'
                        : 'No selection needed'}
                  </div>
                  <div className="selection-sub">
                    {target
                      ? `${phase === 'ban' ? 'Ban' : 'Pick'} locks instantly on click · Slot ${target.index + 1}`
                      : 'Both teams are ready.'}
                  </div>
                </div>
              </div>
              <div className="btn lock-button" aria-hidden style={{ pointerEvents: 'none', opacity: target ? 1 : 0.45 }}>
                <Icon name={phase === 'ban' ? 'ban' : 'lock'} />
                {phase === 'ban' ? 'Instant ban' : 'Instant lock'}
              </div>
            </div>
          </section>
          <TeamColumn
            side="red"
            target={target}
            onFocus={focusSlot}
            onClear={(type, index) => {
              draftActions().clearSlot(type === 'bans' ? 'ban' : 'pick', 'red', index)
              setManual({ side: 'red', index, type })
            }}
            onEdit={() => setDialog({ kind: 'team', side: 'red' })}
          />
        </div>

        <div className="below-workspace">
          <section className="draft-order" aria-label="Pick order">
            <div className="order-label">
              <strong>Pick sequence</strong>
              <span>1 – 2 – 2 – 2 – 2 – 1</span>
            </div>
            <div className="order-track">
              <PickSequence />
            </div>
          </section>
          <div className="match-options">
            <label className="first-label" htmlFor="first-team">
              First pick
            </label>
            <select
              id="first-team"
              className="first-select"
              value={firstPickSide ?? 'blue'}
              onChange={(e) => draftActions().setFirstPickSide(e.target.value as TeamSide)}
            >
              <option value="blue">{blue.tag}</option>
              <option value="red">{red.tag}</option>
            </select>
          </div>
        </div>

        <footer className="page-footer">
          <div className="shortcuts">
            <span>
              <kbd>/</kbd>Search heroes
            </span>
            <span>
              <kbd>Enter</kbd>Lock selection
            </span>
            <span>
              <kbd>Ctrl Z</kbd>Undo
            </span>
          </div>
          <div className="footer-tools">
            <span>Changes sync to the broadcast overlay</span>
            <button className="btn ghost small" type="button" onClick={() => setDialog({ kind: 'advance' })}>
              <Icon name="trophy" />
              Series result
            </button>
          </div>
        </footer>
      </main>

      {dialog?.kind === 'match' && (
        <Modal title="Match settings" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              const label = String(data.get('match') ?? '').trim()
              const seconds = Number(data.get('duration'))
              if (!label || !Number.isInteger(seconds) || seconds < 5 || seconds > 300) return
              const d = draftActions()
              d.setMatchLabel(label)
              d.setFirstPickSide(data.get('first') === 'red' ? 'red' : 'blue')
              d.setTimerRunning(false)
              d.setTimerSeconds(seconds)
              setDialog(null)
              setToast('Match settings updated.')
            }}
          >
            <label className="form-field">
              <span>Match label</span>
              <input name="match" defaultValue={matchLabel} maxLength={42} required />
            </label>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="form-field">
                <span>First pick team</span>
                <select name="first" defaultValue={firstPickSide ?? 'blue'}>
                  <option value="blue">{blue.name}</option>
                  <option value="red">{red.name}</option>
                </select>
              </label>
              <label className="form-field">
                <span>Turn timer (seconds)</span>
                <MatchTimerDefaultInput />
              </label>
            </div>
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Save settings
              </button>
            </div>
          </form>
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
            <button className="btn" type="button" onClick={() => setDialog(null)}>
              Keep draft
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                const d = draftActions()
                for (const side of ['blue', 'red'] as const) {
                  for (let i = 0; i < 5; i++) {
                    d.clearSlot('ban', side, i)
                    d.clearSlot('pick', side, i)
                  }
                }
                d.setPhase('ban')
                setSelected(null)
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
          <p className="dialog-note">Teams, picks, bans and the timer appear on the broadcast overlay.</p>
          <div className="broadcast-tools">
            <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('wipe')}>
              Stinger · Wipe
            </button>
            <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('slam')}>
              Slam
            </button>
            <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('split')}>
              Split
            </button>
          </div>
          <div className="go-live-note">Open the overlay in OBS as a browser source at /overlay.</div>
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={() => setDialog(null)}>
              Close
            </button>
            <a className="btn primary" href="/overlay" target="_blank" rel="noreferrer">
              Open full overlay
            </a>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'advance' && (
        <Modal title="Series result" onClose={() => setDialog(null)}>
          <p className="dialog-note">
            {activeMatch
              ? 'Advance the winner of the active bracket match.'
              : 'Pick a ready match on the bracket page to record a series winner from here.'}
          </p>
          {activeMatch?.teamAId && activeMatch.teamBId && (
            <div className="match-result">
              <AdvanceTeam
                tag={getTeam(bracket, activeMatch.teamAId)?.tag ?? 'BLUE'}
                name={getTeam(bracket, activeMatch.teamAId)?.name ?? 'Blue'}
                side="blue"
                onWin={() => {
                  bracket.reportDraftWinner('blue')
                  setDialog(null)
                  setToast('Blue side advances.')
                }}
              />
              <span className="small-muted">vs</span>
              <AdvanceTeam
                tag={getTeam(bracket, activeMatch.teamBId)?.tag ?? 'RED'}
                name={getTeam(bracket, activeMatch.teamBId)?.name ?? 'Red'}
                side="red"
                onWin={() => {
                  bracket.reportDraftWinner('red')
                  setDialog(null)
                  setToast('Red side advances.')
                }}
              />
            </div>
          )}
          <div className="dialog-actions">
            <Link className="btn" to="/control/bracket" onClick={() => setDialog(null)}>
              Open bracket
            </Link>
            <button className="btn primary" type="button" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
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
    <div className={`result-team ${side}`}>
      <h3>{tag}</h3>
      <p>{name}</p>
      <button className="btn" type="button" onClick={onWin}>
        <Icon name="trophy" />
        Advance {tag}
      </button>
    </div>
  )
}

function TeamColumn({
  side,
  target,
  onFocus,
  onClear,
  onEdit,
}: {
  side: TeamSide
  target: SlotTarget | null
  onFocus: (target: SlotTarget) => void
  onClear: (type: 'picks' | 'bans', index: number) => void
  onEdit: () => void
}) {
  const team = useDraftStore((s) => s[side])
  const first = useDraftStore((s) => s.firstPickSide)
  const phase = useDraftStore((s) => s.phase)
  const locked = team.picks.filter(Boolean).length

  return (
    <section className={`team-panel ${side}`} aria-label={`${side} team`}>
      <div className="team-top">
        <div className="team-heading">
          <span className="team-side">
            <span className="side-dot" />
            {side} side
          </span>
          {first === side && <span className="first-badge">First pick</span>}
        </div>
        <div className="team-identity">
          <div className="team-emblem">
            {team.logo ? <img src={team.logo} alt="" /> : team.tag.slice(0, 2)}
          </div>
          <div>
            <h2 className="team-title">{team.name}</h2>
            <div className="team-code">{team.tag}</div>
          </div>
          <button className="edit-team" type="button" aria-label={`Edit ${team.name}`} onClick={onEdit}>
            <Icon name="edit" />
          </button>
        </div>
      </div>
      <div className="team-picks">
        {team.players.map((player, i) => {
          const heroId = team.picks[i]
          const active = target?.side === side && target.index === i && target.type === 'picks'
          return (
            <div key={player.name + i} className={`player${heroId ? '' : ' empty'}${active ? ' is-target' : ''}`}>
              <button
                className="player-select"
                type="button"
                disabled={phase === 'done'}
                onClick={() => onFocus({ side, index: i, type: 'picks' })}
              >
                <span className="portrait">
                  {heroId ? (
                    <HeroImage heroId={heroId} className="cme-fill" showNameFallback={false} />
                  ) : (
                    <Icon name={active ? 'swords' : 'plus'} />
                  )}
                </span>
                <span className="player-copy">
                  <span className="player-name" style={{ display: 'block' }}>
                    {player.name}
                  </span>
                  <span className="hero-name" style={{ display: 'block' }}>
                    {heroId ? getHero(heroId)?.name : active ? 'Selecting hero…' : 'Awaiting pick'}
                  </span>
                </span>
              </button>
              <span className="slot-tag">0{i + 1}</span>
              {heroId && phase !== 'done' && (
                <button
                  className="remove-pick"
                  type="button"
                  aria-label={`Remove ${getHero(heroId)?.name ?? 'hero'}`}
                  onClick={() => onClear('picks', i)}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="bans">
        <div className="section-label">
          <span>Banned heroes</span>
          <span>{team.bans.filter(Boolean).length} / 5</span>
        </div>
        <div className="ban-list">
          {team.bans.map((heroId, i) => {
            const active = target?.side === side && target.index === i && target.type === 'bans'
            return (
              <button
                key={i}
                type="button"
                className={`ban-slot${heroId ? ' filled' : ''}${active ? ' active' : ''}`}
                disabled={phase === 'done'}
                onClick={() => onFocus({ side, index: i, type: 'bans' })}
              >
                {heroId ? (
                  <HeroImage heroId={heroId} variant="ban" className="cme-fill" showNameFallback={false} />
                ) : (
                  <Icon name="ban" />
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="team-footer">
        <span>
          <strong>{locked}</strong> of 5 heroes locked
        </span>
        <span>{phase === 'done' ? 'Draft complete' : 'Roster ready'}</span>
      </div>
    </section>
  )
}

function PickSequence() {
  const first = useDraftStore((s) => s.firstPickSide ?? 'blue')
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  const phase = useDraftStore((s) => s.phase)
  const index = useDraftStore((s) => s.pickOrderIndex ?? 0)
  const queue = useMemo(() => buildPickQueue(first), [first])
  let cursor = 0
  return (
    <>
      {PICK_BLOCKS.map((block, bi) => {
        const slice = queue.slice(cursor, cursor + block.count)
        cursor += block.count
        const side = slice[0]?.side ?? 'blue'
        const current = phase === 'pick' && slice.some((step) => step.orderIndex === index)
        const done = slice.every((step) => {
          const team = step.side === 'blue' ? blue : red
          return !!team.picks[step.slot]
        })
        return (
          <div
            key={bi}
            className={`order-group${side === 'red' ? ' red' : ''}${done ? ' completed' : ''}${current ? ' current' : ''}`}
          >
            <span>{side === 'blue' ? blue.tag : red.tag}</span>
            <b>×{block.count}</b>
            {done && <Icon name="check" />}
          </div>
        )
      })}
    </>
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
    <Modal title={`Edit ${team.name}`} wide onClose={onClose}>
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
          <span>PLAYERS · IN PICK ORDER</span>
          <span>Photo URLs are optional</span>
        </div>
        {team.players.map((player, i) => (
          <div className="roster-edit-row" key={i}>
            <span>0{i + 1}</span>
            <input name={`player${i}`} defaultValue={player.name} required maxLength={25} aria-label={`Player ${i + 1} name`} />
            <input
              className="photo"
              name={`photo${i}`}
              type="url"
              defaultValue={player.photo ?? ''}
              placeholder="Player photo URL"
              aria-label={`Player ${i + 1} photo URL`}
            />
          </div>
        ))}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit">
            Save team
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MatchTimerDefaultInput() {
  const timerSeconds = useDraftStore((s) => s.timerSeconds)
  return (
    <input
      name="duration"
      type="number"
      min={5}
      max={300}
      defaultValue={timerSeconds || 30}
      required
    />
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
      style={wide ? { width: 'min(700px, calc(100vw - 28px))' } : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          ref.current?.close()
        }
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="btn ghost square" type="button" aria-label="Close dialog" onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
