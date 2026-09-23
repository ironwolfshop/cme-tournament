import HeroImage from '../HeroImage'
import { getHero } from '../../data/heroes'
import {
  formatGold,
  type GamePlayer,
  type TeamSide,
} from '../../store/gameplayStore'

type Props = {
  players: GamePlayer[]
  side: TeamSide
  teamTag: string
  focusedIndex: number
}

export default function PlayerSidebar({
  players,
  side,
  teamTag,
  focusedIndex,
}: Props) {
  return (
    <section
      className={`roster ${side === 'red' ? 'red' : ''}`}
      aria-label={`${side} player statistics`}
    >
      <div className="roster-heading">
        <span>{teamTag} LINEUP</span>
        <span>K / D / A</span>
      </div>
      {players.map((player, i) => (
        <article
          key={`${side}-${i}`}
          className={`roster-card ${focusedIndex === i ? 'focused' : ''}`}
        >
          <Portrait
            heroId={player.heroId}
            level={player.level}
            fallback={teamTag}
            side={side}
          />
          <span className="roster-copy">
            <span className="roster-name">{player.name}</span>
            <span className="player-kda">
              <span>{player.kills}</span>
              <span className="slash">/</span>
              <span>{player.deaths}</span>
              <span className="slash">/</span>
              <span>{player.assists}</span>
            </span>
            <span className="player-economy">{formatGold(player.gold)}</span>
          </span>
          {focusedIndex === i && (
            <span className="focus-marker" aria-hidden>
              ▸
            </span>
          )}
        </article>
      ))}
    </section>
  )
}

export function Portrait({
  heroId,
  level,
  fallback,
  side,
  compact,
}: {
  heroId: string | null
  level: number
  fallback: string
  side: TeamSide
  compact?: boolean
}) {
  return (
    <span className="portrait" style={compact ? { width: 37, height: 37 } : undefined}>
      {heroId ? (
        <HeroImage
          heroId={heroId}
          className="h-full w-full"
          showNameFallback={false}
        />
      ) : (
        <span className="initials">{fallback.slice(0, 2)}</span>
      )}
      <span className="level" title={`Level ${level}`}>
        {level}
      </span>
      {/* silence unused side lint when only used for CSS parent .red */}
      <span className="sr-only">{side}</span>
    </span>
  )
}

export function heroLabel(heroId: string | null) {
  if (!heroId) return 'Awaiting pick'
  return getHero(heroId)?.name ?? heroId
}
