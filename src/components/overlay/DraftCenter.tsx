import { useMemo } from 'react'
import { buildPickQueue, PICK_BLOCKS } from '../../data/pickOrder'
import type { DraftPhase, TeamSide } from '../../store/draftStore'

type Props = {
  matchLabel: string
  phase: DraftPhase
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

  const completed = phase === 'done'

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

        <div className="timer-row no-clock">
          <div className="center-team">
            <span className="center-badge">{blueTag.slice(0, 3)}</span>
            <span className="center-code">{blueTag}</span>
            <span className="series-label">BLUE SIDE</span>
          </div>

          <div className="status-center">
            <div className="status-digits">
              {completed ? '✓' : phase === 'ban' ? 'BAN' : 'PICK'}
            </div>
            <small>
              {completed
                ? 'BOTH TEAMS READY'
                : hasTurn
                  ? `SLOT ${String(activeSlot + 1).padStart(2, '0')}`
                  : 'STANDBY'}
            </small>
          </div>

          <div className="center-team red">
            <span className="center-badge">{redTag.slice(0, 3)}</span>
            <span className="center-code">{redTag}</span>
            <span className="series-label">RED SIDE</span>
          </div>
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
            phase === 'pick' && g.indices.some((i) => i === pickOrderIndex)
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
