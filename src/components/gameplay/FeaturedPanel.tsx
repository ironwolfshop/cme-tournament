import HeroImage from '../HeroImage'
import { getItem } from '../../data/items'
import type { FeaturedCam, GamePlayer, TeamSide } from '../../store/gameplayStore'
import TeamCamFeed from './TeamCamFeed'

type Props = {
  side: TeamSide
  player: GamePlayer
  featured: FeaturedCam
  teamTag?: string
}

export default function FeaturedPanel({ side, player, featured }: Props) {
  const isBlue = side === 'blue'

  return (
    <div
      className={`pointer-events-none absolute bottom-4 z-30 flex items-end gap-2 ${
        isBlue ? 'left-4 anim-slide-left' : 'right-4 flex-row-reverse anim-slide-right'
      }`}
      style={{ animationDelay: '250ms' }}
    >
      {/* Live team WebRTC feed (phones publish on /cam) */}
      <div
        className={`relative h-[168px] w-[168px] overflow-hidden border-2 bg-black/50 ${
          isBlue ? 'border-[#1e5cff]' : 'border-[#e11d2e]'
        }`}
        style={{
          clipPath: isBlue
            ? 'polygon(0 0, 100% 0, 100% 100%, 8% 100%)'
            : 'polygon(0 0, 100% 0, 92% 100%, 0 100%)',
        }}
      >
        <TeamCamFeed side={side} />
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 px-2 py-1 text-[9px] font-semibold tracking-wide text-white/90 ${
            isBlue ? 'bg-[#1e5cff]/90' : 'bg-[#e11d2e]/90'
          }`}
        >
          {featured.camLabel}
        </div>
      </div>

      {/* Stats / items */}
      <div className="w-[168px] rounded-md border border-white/10 bg-[rgba(8,16,40,0.88)] p-2 backdrop-blur-md">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative h-12 w-12 overflow-hidden rounded border border-white/20">
            {player.heroId ? (
              <HeroImage
                heroId={player.heroId}
                className="h-full w-full"
                showNameFallback={false}
              />
            ) : (
              <div className="h-full w-full bg-slate-800" />
            )}
            <span className="absolute bottom-0 right-0 bg-black/80 px-1 font-display text-[9px] font-bold text-amber-300">
              {player.level}
            </span>
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-xs font-bold text-white">
              {player.name}
            </div>
            <div className="flex items-center gap-1 text-rose-400">
              <span className="animate-heartbeat">♥</span>
              <span className="font-display text-sm font-extrabold tabular-nums text-white">
                {featured.bpm} BPM
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {player.items.map((itemId, i) => (
            <ItemSlot key={i} itemId={itemId} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemSlot({ itemId }: { itemId: string | null }) {
  const item = getItem(itemId)
  return (
    <div
      className="flex h-9 w-full items-center justify-center rounded-sm border border-white/15 bg-black/40"
      title={item?.name}
      style={item ? { background: `${item.color}55` } : undefined}
    >
      {item ? (
        <span className="px-0.5 text-center font-display text-[8px] font-bold leading-tight text-white drop-shadow">
          {item.name.split(' ').map((w) => w[0]).join('').slice(0, 3)}
        </span>
      ) : (
        <span className="text-[10px] text-white/20">·</span>
      )}
    </div>
  )
}
