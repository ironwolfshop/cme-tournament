import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPickQueue, PICK_BLOCKS } from '../data/pickOrder'
import { getHero } from '../data/heroes'
import HeroImage from '../components/HeroImage'
import { Icon } from '../components/cme/Icon'
import { InstitutionLogos } from '../components/cme/InstitutionLogos'
import DraftRevealOverlay from '../components/overlay/DraftRevealOverlay'
import { initDraftSync, useDraftStore, type TeamSide } from '../store/draftStore'
import { initStingerSync, useStingerStore } from '../store/stingerStore'

/** Flash lock-in animation once when a slot gains a hero. */
function useJustLocked(heroId: string | null | undefined) {
  const [pulse, setPulse] = useState(false)
  const prev = useRef(heroId)
  useEffect(() => {
    if (heroId && heroId !== prev.current) {
      setPulse(true)
      const t = window.setTimeout(() => setPulse(false), 780)
      prev.current = heroId
      return () => window.clearTimeout(t)
    }
    prev.current = heroId
  }, [heroId])
  return pulse
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

export default function OverlayPage() {
  const phase = useDraftStore((s) => s.phase)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const pickOrderIndex = useDraftStore((s) => s.pickOrderIndex)
  const activeSide = useDraftStore((s) => s.activeSide)
  const activeSlot = useDraftStore((s) => s.activeSlot)
  const bluePicks = useDraftStore((s) => s.blue.picks)
  const redPicks = useDraftStore((s) => s.red.picks)
  const blueBans = useDraftStore((s) => s.blue.bans)
  const redBans = useDraftStore((s) => s.red.bans)
  const stingerPlaying = useStingerStore((s) => s.playing)
  const stingerStyle = useStingerStore((s) => s.style)
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initDraftSync()
    initStingerSync()
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const box = shell.getBoundingClientRect()
      const stage = shell.querySelector('.stage') as HTMLElement | null
      if (!stage || !box.width || !box.height) return
      stage.style.setProperty('--scale', String(Math.min(box.width / 1920, box.height / 1080)))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const queue = useMemo(
    () => buildPickQueue(firstPickSide ?? 'blue'),
    [firstPickSide],
  )

  const active = useMemo(() => {
    if (phase === 'done') return null
    if (phase === 'ban') {
      return { side: activeSide, index: activeSlot, type: 'bans' as const }
    }
    const next = queue[pickOrderIndex ?? 0]
    const picksOf = (side: TeamSide) => (side === 'blue' ? bluePicks : redPicks)
    if (!next || picksOf(next.side)[next.slot]) {
      const found = queue.find((step) => !picksOf(step.side)[step.slot])
      if (!found) return null
      return { side: found.side, index: found.slot, type: 'picks' as const }
    }
    return { side: next.side, index: next.slot, type: 'picks' as const }
  }, [queue, phase, pickOrderIndex, activeSide, activeSlot, bluePicks, redPicks])

  const count = useMemo(() => {
    const slots = phase === 'ban' ? [...blueBans, ...redBans] : [...bluePicks, ...redPicks]
    return slots.filter(Boolean).length
  }, [phase, blueBans, redBans, bluePicks, redPicks])

  const done = !active

  return (
    <div className="overlay-root cme-bo output-mode">
      <div className="workspace">
        <div className="stage-shell" ref={shellRef}>
          <div className="stage">
            <div className="broadcast-dock">
              <Lineup side="blue" active={active} />
              <Center active={active} count={count} done={done} />
              <Lineup side="red" active={active} />
            </div>
            <div className="dock-rail">
              <div className="blue-rail" />
              <div className="center-rail" />
              <div className="red-rail" />
            </div>
            {stingerPlaying && (
              <div className={`stinger effect-${stingerStyle}`}>
                <b>CME TOURNAMENT</b>
                <span>MOBILE LEGENDS: BANG BANG</span>
              </div>
            )}
            <DraftRevealOverlay />
          </div>
        </div>
      </div>
    </div>
  )
}

function Lineup({
  side,
  active,
}: {
  side: TeamSide
  active: { side: TeamSide; index: number; type: 'picks' | 'bans' } | null
}) {
  const name = useDraftStore((s) => s[side].name)
  const tag = useDraftStore((s) => s[side].tag)
  const logo = useDraftStore((s) => s[side].logo)
  const players = useDraftStore((s) => s[side].players)
  const bans = useDraftStore((s) => s[side].bans)
  const picks = useDraftStore((s) => s[side].picks)
  const first = useDraftStore((s) => s.firstPickSide)
  return (
    <section className={`lineup-side${side === 'red' ? ' red' : ''}`} aria-label={`${side} team lineup`}>
      <div className="ban-row">
        <div className="ban-block">
          <span className="ban-caption">
            <Icon name="ban" />
            BANS
          </span>
          <div className="ban-slots">
            {bans.map((heroId, i) => (
              <BanSlot
                key={i}
                heroId={heroId}
                onClock={active?.side === side && active.index === i && active.type === 'bans'}
              />
            ))}
          </div>
        </div>
        <span className="team-position">{side.toUpperCase()} SIDE</span>
      </div>
      <div className="team-box">
        <header className="team-header">
          <span className="team-logo">
            {logo ? <img src={logo} alt="" /> : tag.slice(0, 2)}
          </span>
          <span className="team-name">{name}</span>
          {first === side && <span className="first-pick-label">FIRST PICK</span>}
        </header>
        <div className="lineup">
          {players.map((player, i) => (
            <PickCard
              key={i}
              index={i}
              tag={tag}
              playerName={player.name}
              heroId={picks[i]}
              onClock={active?.side === side && active.index === i && active.type === 'picks'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function BanSlot({
  heroId,
  onClock,
}: {
  heroId: string | null
  onClock: boolean
}) {
  const justLocked = useJustLocked(heroId)
  return (
    <div
      className={`ban-slot${heroId ? ' occupied' : ''}${onClock ? ' target' : ''}${
        justLocked ? ' just-locked' : ''
      }`}
    >
      {heroId ? (
        <>
          <div className={justLocked ? 'animate-ban-slam' : undefined}>
            <HeroImage heroId={heroId} variant="ban" className="cme-fill" showNameFallback={false} />
          </div>
          {justLocked && <span className="slot-lock-flash ban" />}
        </>
      ) : (
        <Icon name="ban" />
      )}
    </div>
  )
}

function PickCard({
  index,
  tag,
  playerName,
  heroId,
  onClock,
}: {
  index: number
  tag: string
  playerName: string
  heroId: string | null
  onClock: boolean
}) {
  const justLocked = useJustLocked(heroId)
  const hero = getHero(heroId)
  return (
    <article
      className={`player-card${heroId ? '' : ' empty'}${onClock ? ' active' : ''}${
        justLocked ? ' just-locked' : ''
      }`}
    >
      <div className={`hero-frame${justLocked ? ' animate-lock-ring' : ''}`}>
        {heroId ? (
          <div key={heroId} className={justLocked ? 'animate-lock-in cme-fill' : 'cme-fill'}>
            <HeroImage
              heroId={heroId}
              variant="loading"
              className="cme-fill"
              autoCrop={false}
              showNameFallback={false}
            />
          </div>
        ) : (
          <div className="card-placeholder">
            <span className="placeholder-code">{tag}</span>
            <span className="placeholder-rule" />
          </div>
        )}
        {justLocked && <span className="slot-lock-flash pick" />}
        {onClock ? (
          <div className="turn-label-card">ON THE CLOCK</div>
        ) : (
          <span className="pick-ordinal">0{index + 1}</span>
        )}
        {heroId && (
          <span className={`pick-check${justLocked ? ' pop' : ''}`}>
            <Icon name="check" />
          </span>
        )}
        <div className="hero-display-name">
          {hero ? hero.name : onClock ? 'SELECTING…' : 'AWAITING PICK'}
        </div>
      </div>
      <div className="player-nameplate">
        <span className="player-name">{playerName}</span>
        <span className="player-tag">{tag}</span>
      </div>
    </article>
  )
}

function Center({
  active,
  count,
  done,
}: {
  active: { side: TeamSide; index: number; type: 'picks' | 'bans' } | null
  count: number
  done: boolean
}) {
  const seconds = useDraftStore((s) => s.timerSeconds)
  const matchLabel = useDraftStore((s) => s.matchLabel)
  const phase = useDraftStore((s) => s.phase)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const blueTag = useDraftStore((s) => s.blue.tag)
  const redTag = useDraftStore((s) => s.red.tag)
  const bluePicks = useDraftStore((s) => s.blue.picks)
  const redPicks = useDraftStore((s) => s.red.picks)
  const expiring = !done && seconds <= 10

  const groups = useMemo(() => {
    const queue = buildPickQueue(firstPickSide ?? 'blue')
    let cursor = 0
    return PICK_BLOCKS.map((block) => {
      const slice = queue.slice(cursor, cursor + block.count)
      cursor += block.count
      return slice
    })
  }, [firstPickSide])

  const activeTag = active ? (active.side === 'blue' ? blueTag : redTag) : ''

  return (
    <section className="center-column" aria-label="Match timer">
      <InstitutionLogos size="md" className="broadcast-institutions" />
      <div className="tournament-label">CME ML TOURNAMENT</div>
      <div className="center-panel">
        <div className="match-line">{matchLabel}</div>
        <div
          className="current-turn"
          style={{
            color: active
              ? active.side === 'blue'
                ? 'var(--blue)'
                : 'var(--red)'
              : 'var(--gold)',
          }}
        >
          <span className="turn-arrow" />
          {active
            ? `${activeTag} ${phase === 'ban' ? 'BAN' : 'PICK'}`
            : phase === 'ban'
              ? 'BANS COMPLETE'
              : 'DRAFT COMPLETE'}
        </div>
        <div className="timer-row">
          <SideBadge side="blue" />
          <div className={`clock${expiring ? ' expiring' : ''}${!done && seconds === 0 ? ' expired' : ''}`}>
            <div className="clock-digits">{done ? '✓' : pad(seconds)}</div>
            <small>{done ? (phase === 'ban' ? 'READY FOR PICKS' : 'BOTH TEAMS READY') : 'SECONDS REMAINING'}</small>
          </div>
          <SideBadge side="red" />
        </div>
        <div className="countdown-track">
          <div
            className="countdown-fill"
            style={{ width: done ? '100%' : `${Math.max(0, Math.min(100, (seconds / 30) * 100))}%` }}
          />
        </div>
        <div className="pick-count">
          <span>
            {phase === 'ban' ? 'BANS' : 'PICKS'} LOCKED <strong>{pad(count)} / 10</strong>
          </span>
          <span>{active ? `SLOT ${pad(active.index + 1)}` : 'READY'}</span>
        </div>
      </div>
      <div className="sequence" aria-label="Pick order">
        {groups.map((slice, i) => {
          const side = slice[0]?.side ?? 'blue'
          const finished = slice.every((step) =>
            !!(step.side === 'blue' ? bluePicks : redPicks)[step.slot],
          )
          const current =
            phase === 'pick' &&
            slice.some(
              (step) =>
                step.side === active?.side &&
                step.slot === active?.index &&
                active?.type === 'picks',
            )
          return (
            <span
              key={i}
              className={`sequence-step${side === 'red' ? ' red' : ''}${current ? ' current' : ''}${finished ? ' done' : ''}`}
            >
              {slice.length}
            </span>
          )
        })}
      </div>
      <div className="sequence-label">PICK SEQUENCE</div>
    </section>
  )
}

function SideBadge({ side }: { side: TeamSide }) {
  const tag = useDraftStore((s) => s[side].tag)
  return (
    <div className={`center-team${side === 'red' ? ' red' : ''}`}>
      <span className="center-badge">{tag.slice(0, 3)}</span>
      <span className="center-code">{tag}</span>
      <span className="series-label">{side.toUpperCase()} SIDE</span>
    </div>
  )
}
