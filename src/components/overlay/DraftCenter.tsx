import { useMemo } from 'react'
import {
  buildPickQueue,
  PICK_BLOCKS,
  type PickTarget,
} from '../../data/pickOrder'
import type { DraftPhase, TeamSide } from '../../store/draftStore'

type Props = {
  matchLabel: string
  phase: DraftPhase
  timerSeconds: number
  timerDuration?: number
  activeSide: TeamSide
  activeSlot: number
  firstPickSide: TeamSide
  blueTag: string
  redTag: string
  blueName?: string
  redName?: string
  pickLabel?: string
  lockedCount: number
}

export default function DraftCenter({
  matchLabel,
  phase,
  timerSeconds,
  timerDuration = 30,
  activeSide,
  activeSlot,
  firstPickSide,
  blueTag,
  redTag,
  pickLabel,
  lockedCount,
}: Props) {
  const queue = useMemo(
    () => buildPickQueue(firstPickSide),
    [firstPickSide],
  )

  const hasTurn = phase !== 'done'
  const turnText = hasTurn
    ? pickLabel ??
      `${activeSide === 'blue' ? blueTag : redTag} ${phase === 'ban' ? 'BAN' : 'PICK'}`
    : phase === 'ban'
      ? 'BANS COMPLETE'
      : 'DRAFT COMPLETE'

  const turnColor = hasTurn
    ? activeSide === 'blue'
      ? 'var(--bo-blue)'
      : 'var(--bo-red)'
    : 'var(--bo-gold)'

  const urgent = timerSeconds <= 10 && phase !== 'done'
  const expired = timerSeconds === 0 && phase !== 'done'
  const completed = phase === 'done'
  const fillPct = completed
    ? 100
    : Math.max(0, Math.min(100, (timerSeconds / timerDuration) * 100))

  const clockCaption = completed
    ? 'BOTH TEAMS READY'
    : phase === 'ban' && lockedCount >= 10
      ? 'READY FOR PICKS'
      : 'SECONDS REMAINING'

  const clockDigits = completed
    ? '✓'
    : String(timerSeconds).padStart(2, '0')

  const groups = useMemo(() => {
    const result: { count: number; side: TeamSide; indices: number[] }[] = []
    let cursor = 0
    PICK_BLOCKS.forEach((block) => {
      const indices = Array.from({ length: block.count }, (_, i) => cursor + i)
      const side =
        block.who === 'first' ? firstPickSide : firstPickSide === 'blue' ? 'red' : 'blue'
      result.push({ count: block.count, side, indices })
      cursor += block.count
    })
    return result
  }, [firstPickSide])

  function stepState(indices: number[]) {
    if (phase !== 'pick') {
      const done = indices.every((i) => {
        const t = queue[i]
        return t && lockedPick(t)
      })
      return { current: false, done }
    }
    const current = indices.some((i) => {
      const t = queue[i]
      return t && t.side === activeSide && t.slot === activeSlot
    })
    // For sequence "done" we need picks filled — parent passes lockedCount for bans/picks
    // Sequence done is computed via a callback from parent; approximate with queue index
    return { current, done: false }
  }

  // Done state per group: all pick slots in that block have been passed
  const pickOrderIndex = useMemo(() => {
    if (phase !== 'pick') return -1
    return queue.findIndex((t) => t.side === activeSide && t.slot === activeSlot)
  }, [phase, queue, activeSide, activeSlot])

  return (
    <div className="center-column anim-center-pop">
      <div className="tournament-label">CME ML TOURNAMENT</div>

      <div className="center-panel">
        <div className="match-line">{matchLabel}</div>

        <div className="current-turn" style={{ color: turnColor }}>
          {hasTurn && <span className="turn-arrow" />}
          {turnText}
        </div>

        <div className="timer-row">
          <div className="center-team">
            <span className="center-badge">{blueTag.slice(0, 3)}</span>
            <span className="center-code">{blueTag}</span>
            <span className="series-label">BLUE SIDE</span>
          </div>

          <div
            className={`clock ${urgent && !expired ? 'expiring' : ''} ${expired ? 'expired' : ''}`}
          >
            <div className="clock-digits">{clockDigits}</div>
            <small>{clockCaption}</small>
          </div>

          <div className="center-team red">
            <span className="center-badge">{redTag.slice(0, 3)}</span>
            <span className="center-code">{redTag}</span>
            <span className="series-label">RED SIDE</span>
          </div>
        </div>

        <div className="countdown-track">
          <div className="countdown for-css" style={{ display: 'none' }} />
          <div
            className="countdown-fill"
            style={{ width: `${fillPct}%` }}
          />
        </div>

        <div className="pick-count">
          <span>
            {phase === 'ban' ? 'BANS' : 'PICKS'} LOCKED{' '}
            <strong>{String(lockedCount).padStart(2, '0')} / 10</strong>
          </span>
          <span>
            {hasTurn
              ? `SLOT ${String(activeSlot + 1).padStart(2, '0')}`
              : 'READY'}
          </span>
        </div>
      </div>

      <div className="sequence" aria-label="Pick order">
        {groups.map((g, gi) => {
          const current =
            phase === 'pick' &&
            g.indices.some((i) => i === pickOrderIndex)
          const done =
            phase === 'pick'
              ? g.indices.every((i) => i < pickOrderIndex)
              : phase === 'done'
          return (
            <span
              key={gi}
              className={`sequence-step ${g.side === 'red' ? 'red' : ''} ${current ? 'current' : ''} ${done ? 'done' : ''}`}
              title={`${g.side === 'blue' ? blueTag : redTag} × ${g.count}`}
            >
              {g.count}
            </span>
          )
        })}
      </div>
      <div className="sequence-label">PICK SEQUENCE</div>
    </div>
  )
}

function lockedPick(_t: PickTarget) {
  return false
}

// silence unused helper warning path — stepState kept for clarity but unused
void stepState
function stepState(
  _indices: number[],
): { current: boolean; done: boolean } {
  return { current: false, done: false }
}
