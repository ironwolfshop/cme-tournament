import { useRef, useState } from 'react'
import { Icon } from '../cme/Icon'
import { INSTITUTION_LOGOS } from '../cme/InstitutionLogos'
import {
  getTeam,
  roundLabel,
  type BracketMatch,
  type BracketSlotRef,
  type BracketState,
} from '../../lib/bracketEngine'

const EIGHT_CLASS: Record<string, string> = {
  '0-0': 'qf1',
  '0-1': 'qf2',
  '0-2': 'qf3',
  '0-3': 'qf4',
  '1-0': 'sf1',
  '1-1': 'sf2',
  '2-0': 'gf',
}

const DRAG_MIME = 'application/x-cme-bracket-slot'

type Props = {
  state: BracketState
  selectedId?: string | null
  onSelect?: (match: BracketMatch) => void
  onSwapSlots?: (from: BracketSlotRef, to: BracketSlotRef) => boolean
}

export default function BracketBoard({
  state,
  selectedId,
  onSelect,
  onSwapSlots,
}: Props) {
  const eight = state.bracketSize === 8
  const done = state.matches.filter((m) => m.winnerId).length
  const total = state.matches.length
  const final = state.matches.find((m) => m.round === Math.log2(state.bracketSize) - 1)
  return (
    <>
      <div className="board-scene" aria-hidden>
        <div className="board-scene-photo" />
        <div className="board-scene-fog board-scene-fog-a" />
        <div className="board-scene-fog board-scene-fog-b" />
        <div className="board-scene-sweep" />
        <div className="board-scene-glow" />
        <div className="board-scene-veil" />
      </div>
      <div className="board-rail board-rail-top" aria-hidden />
      <div className="board-rail board-rail-bottom" aria-hidden />
      <div className="board-grid" />
      <div className="board-border" />
      {eight ? (
        <>
          <div className="board-side-label left">MLBB</div>
          <div className="board-side-label right">
            MORE THAN
            <br />
            A GAME
          </div>
        </>
      ) : null}
      <header className="board-header">
        <div className="board-brand">
          <BoardSeals tone="header" />
          <div>
            <div className="board-eyebrow">CME · Mobile Legends: Bang Bang</div>
            <div className="board-title">{state.title}</div>
            <div className="board-tagline">Battle today · Greater tomorrow</div>
          </div>
        </div>
        <div className="format-badge">
          <span>SINGLE ELIMINATION</span>
          <strong>{state.teamCount} TEAMS</strong>
          <em>Legends rise together</em>
        </div>
      </header>
      {eight ? (
        <>
          <div className="round-heading qf-left">
            <span>Quarterfinals</span>
            <small>Drag teams to rearrange</small>
          </div>
          <div className="round-heading sf-left">
            <span>Semifinal</span>
            <small>From quarterfinal winners</small>
          </div>
          <div className="round-heading sf-right">
            <span>Semifinal</span>
            <small>From quarterfinal winners</small>
          </div>
          <div className="round-heading qf-right">
            <span>Quarterfinals</span>
            <small>Drag teams to rearrange</small>
          </div>
          <svg className="bracket-lines" viewBox="0 0 1920 1080" aria-hidden="true">
            <path className={lineClass('line-sf1', feederReady(state, 'r1-m0'))} id="line-sf1" d="M358 353H396V749H358M396 551H434" />
            <path className={lineClass('line-sf2', feederReady(state, 'r1-m1'))} id="line-sf2" d="M1562 353H1524V749H1562M1524 551H1486" />
            <path className={lineClass('line-left-final', !!matchById(state, 'r1-m0')?.winnerId)} d="M722 551H764V713H806" />
            <path className={lineClass('line-right-final', !!matchById(state, 'r1-m1')?.winnerId)} d="M1198 551H1156V713H1114" />
            <path className={`connector final-connector${final?.winnerId ? ' resolved' : ''}`} d="M960 626V507" />
            <circle className="junction" cx="396" cy="551" r="3" />
            <circle className="junction" cx="1524" cy="551" r="3" />
          </svg>
          <div className="final-caption">GRAND FINAL</div>
          {state.matches.map((match) => (
            <MatchCard
              key={match.id}
              state={state}
              match={match}
              selected={selectedId === match.id}
              className={EIGHT_CLASS[`${match.round}-${match.index}`] ?? ''}
              onSelect={onSelect}
              onSwapSlots={onSwapSlots}
            />
          ))}
          <Champion state={state} />
        </>
      ) : (
        <div className="flex-board">
          {rounds(state).map((group) => (
            <div className="round-col" key={group[0]?.round ?? 0}>
              <h3>{group[0] ? roundLabel(group[0].round, state.bracketSize) : 'Round'}</h3>
              {group.map((match) => (
                <MatchCard
                  key={match.id}
                  state={state}
                  match={match}
                  selected={selectedId === match.id}
                  onSelect={onSelect}
                  onSwapSlots={onSwapSlots}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="board-podium-mark">
        <BoardSeals tone="podium" />
      </div>
      <footer className="board-footer">
        <div className="board-footer-left">
          <span className="footer-line" />
          <span>
            {state.teamCount} TEAMS · {Math.max(1, Math.round(Math.log2(state.bracketSize)))} ROUNDS · 1 CHAMPION
          </span>
        </div>
        <div className="board-footer-mid">SKILLS · UNITY · HIGHER GROUNDS</div>
        <span className="board-footer-right">
          {done} OF {total} RESULTS CONFIRMED
        </span>
      </footer>
    </>
  )
}

export function MatchList({
  state,
  selectedId,
  onSelect,
  onSwapSlots,
}: {
  state: BracketState
  selectedId?: string | null
  onSelect?: (match: BracketMatch) => void
  onSwapSlots?: (from: BracketSlotRef, to: BracketSlotRef) => boolean
}) {
  return (
    <div className="match-list" id="match-list">
      {rounds(state).map((group) => {
        const label = group[0] ? roundLabel(group[0].round, state.bracketSize) : 'Round'
        const count = group.filter((m) => m.winnerId).length
        const wide = group.length <= 2
        return (
          <section className="list-round" key={label + (group[0]?.round ?? 0)}>
            <div className="list-round-heading">
              <h2>{label}</h2>
              <span>
                {count} / {group.length} complete
              </span>
            </div>
            <div className={`list-round-grid${wide ? ' two' : ''}${group.length === 1 ? ' final-list' : ''}`}>
              {group.map((match) => (
                <MatchCard
                  key={match.id}
                  state={state}
                  match={match}
                  selected={selectedId === match.id}
                  onSelect={onSelect}
                  onSwapSlots={onSwapSlots}
                />
              ))}
              {group.length === 1 && <Champion state={state} />}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function MatchCard({
  state,
  match,
  selected,
  className = '',
  onSelect,
  onSwapSlots,
}: {
  state: BracketState
  match: BracketMatch
  selected?: boolean
  className?: string
  onSelect?: (match: BracketMatch) => void
  onSwapSlots?: (from: BracketSlotRef, to: BracketSlotRef) => boolean
}) {
  const ready = !!(match.teamAId && match.teamBId)
  const status = match.winnerId ? 'complete' : ready ? 'ready' : 'waiting'
  const short = shortLabel(match, state.bracketSize)
  const canPlace = match.round === 0 && !match.winnerId && !!onSwapSlots

  return (
    <div
      className={`match-card ${className} ${status}${selected ? ' selected' : ''}${canPlace ? ' placeable' : ''}`}
      role="group"
    >
      <button
        type="button"
        className="match-card-hit"
        onClick={() => onSelect?.(match)}
      >
        <span className="match-topline">
          <span className="match-number">{short}</span>
          <span className={`match-status ${status}`}>
            {status === 'complete' ? (
              <>
                <Icon name="check" />
                Final
              </>
            ) : status === 'ready' ? (
              'Ready to play'
            ) : (
              'Waiting'
            )}
          </span>
        </span>
      </button>
      <TeamRow
        state={state}
        match={match}
        slot="A"
        canDrag={canPlace}
        onSwapSlots={onSwapSlots}
        onOpen={() => onSelect?.(match)}
      />
      <TeamRow
        state={state}
        match={match}
        slot="B"
        canDrag={canPlace}
        onSwapSlots={onSwapSlots}
        onOpen={() => onSelect?.(match)}
      />
      <button
        type="button"
        className="match-footer match-card-hit"
        onClick={() => onSelect?.(match)}
      >
        {match.winnerId ? (
          <>
            <Icon name="check" />
            <span className="match-footer-text">
              {getTeam(state, match.winnerId)?.name}
              {match.nextMatchId ? ` → ${nextName(state, match)}` : ' wins'}
            </span>
          </>
        ) : ready ? (
          <>
            {canPlace ? <span className="match-footer-hint" aria-hidden>⋮⋮</span> : null}
            <span className="match-footer-text">
              {canPlace
                ? `Rearrange · opens ${nextName(state, match)}`
                : `Opens ${nextName(state, match)}`}
            </span>
          </>
        ) : match.round === 0 ? (
          <>
            <Icon name="clock" />
            <span className="match-footer-text">Waiting on teams</span>
          </>
        ) : (
          <>
            <Icon name="clock" />
            <span className="match-footer-text">Awaiting winners</span>
          </>
        )}
      </button>
    </div>
  )
}

function TeamRow({
  state,
  match,
  slot,
  canDrag,
  onSwapSlots,
  onOpen,
}: {
  state: BracketState
  match: BracketMatch
  slot: 'A' | 'B'
  canDrag?: boolean
  onSwapSlots?: (from: BracketSlotRef, to: BracketSlotRef) => boolean
  onOpen?: () => void
}) {
  const teamId = slot === 'A' ? match.teamAId : match.teamBId
  const team = getTeam(state, teamId)
  const score = slot === 'A' ? match.scoreA : match.scoreB
  const won = !!match.winnerId && match.winnerId === teamId
  const lost = !!match.winnerId && !!teamId && match.winnerId !== teamId
  const [over, setOver] = useState(false)
  const dragRef = useRef(false)

  const ref: BracketSlotRef = { matchId: match.id, slot }

  return (
    <span
      className={`match-team${won ? ' winner' : ''}${lost ? ' loser' : ''}${canDrag ? ' draggable' : ''}${over ? ' drop-target' : ''}`}
      draggable={!!canDrag}
      onDragStart={(e) => {
        if (!canDrag) return
        dragRef.current = true
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ref))
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('dragging')
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging')
        window.setTimeout(() => {
          dragRef.current = false
        }, 0)
      }}
      onDragOver={(e) => {
        if (!canDrag) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canDrag || !onSwapSlots) return
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        try {
          const raw = e.dataTransfer.getData(DRAG_MIME)
          if (!raw) return
          const from = JSON.parse(raw) as BracketSlotRef
          onSwapSlots(from, ref)
        } catch {
          /* ignore */
        }
      }}
      onClick={() => {
        if (dragRef.current) return
        onOpen?.()
      }}
      title={canDrag ? 'Drag onto another opening team to swap' : undefined}
    >
      {canDrag ? <span className="team-grip" aria-hidden>⋮⋮</span> : null}
      {team ? (
        <span className="team-badge">{team.logo ? <img src={team.logo} alt="" /> : team.tag}</span>
      ) : (
        <span className="team-badge is-pending">
          <Icon name="shield" />
        </span>
      )}
      <span className={`team-name${team ? '' : ' pending-team'}`}>
        {team
          ? team.name
          : match.round === 0
            ? (slot === 'A' ? match.teamBId : match.teamAId)
              ? 'BYE'
              : 'Empty'
            : 'TBD'}
      </span>
      {team && <span className="seed-tag">#{team.seed}</span>}
      <span className={`match-score${match.winnerId ? '' : ' unset'}`}>
        {match.winnerId ? score : '—'}
      </span>
    </span>
  )
}

function Champion({ state }: { state: BracketState }) {
  const final = [...state.matches].sort((a, b) => b.round - a.round)[0]
  const team = final?.winnerId ? getTeam(state, final.winnerId) : null
  return (
    <div className={`champion-card${team ? ' crowned' : ''}`}>
      <div className="champion-label">TOURNAMENT CHAMPION</div>
      <div className="champion-emblem">
        {team?.logo ? <img src={team.logo} alt="" /> : <TrophyMark />}
      </div>
      <div className="champion-name">{team ? team.name : 'Awaiting champion'}</div>
      <div className="champion-sub">
        {team && final ? `GRAND FINAL · ${final.scoreA} – ${final.scoreB}` : 'WINNER OF THE GRAND FINAL'}
      </div>
    </div>
  )
}

function rounds(state: BracketState) {
  const max = Math.max(0, ...state.matches.map((m) => m.round))
  return Array.from({ length: max + 1 }, (_, round) =>
    state.matches.filter((m) => m.round === round).sort((a, b) => a.index - b.index),
  )
}

function shortLabel(match: BracketMatch, size: number) {
  if (size === 8) {
    if (match.round === 2) return 'FINAL'
    if (match.round === 1) return `SF 0${match.index + 1}`
    return `QF 0${match.index + 1}`
  }
  return roundLabel(match.round, size)
}

function matchById(state: BracketState, id: string) {
  return state.matches.find((m) => m.id === id)
}

function feederReady(state: BracketState, matchId: string) {
  const m = matchById(state, matchId)
  return !!(m?.teamAId && m?.teamBId)
}

function lineClass(id: string, active: boolean) {
  return `connector ${id}${active ? ' resolved' : ''}`
}

function BoardSeals({ tone }: { tone: 'header' | 'podium' }) {
  return (
    <div className={`board-seals board-seals-${tone}`} aria-label="Institution logos">
      {INSTITUTION_LOGOS.map((logo, i) => (
        <span
          key={logo.id}
          className={`board-seal board-seal-${logo.slot}`}
          style={{ animationDelay: `${i * -1.4}s` }}
          title={logo.alt}
        >
          <span className="board-seal-ring" />
          <span className="board-seal-face">
            <img src={logo.src} alt={logo.alt} draggable={false} />
            <span className="board-seal-glint" />
          </span>
        </span>
      ))}
    </div>
  )
}

function TrophyMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 10h28v14c0 9-6 15-14 15s-14-6-14-15V10Z" />
      <path d="M18 16H10c0 8 4 12 10 13M46 16h8c0 8-4 12-10 13" />
      <path d="M32 39v8M22 54h20M24 47h16" />
    </svg>
  )
}

function nextName(state: BracketState, match: BracketMatch) {
  if (!match.nextMatchId) return 'Champion'
  const next = matchById(state, match.nextMatchId)
  if (!next) return 'next round'
  return shortLabel(next, state.bracketSize)
}

function feederName(state: BracketState, match: BracketMatch, slot: 'A' | 'B') {
  const feeders = state.matches.filter(
    (m) => m.nextMatchId === match.id && m.nextSlot === slot,
  )
  if (!feeders.length) return 'TBD'
  return feeders.map((m) => shortLabel(m, state.bracketSize)).join(' / ')
}
