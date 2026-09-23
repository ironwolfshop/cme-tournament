import { useEffect, useState } from 'react'
import HeroImage from '../HeroImage'
import type { TeamSide } from '../../store/draftStore'

type Props = {
  bans: (string | null)[]
  side: TeamSide
  activeIndex?: number | null
}

export default function BanRow({ bans, side, activeIndex = null }: Props) {
  return (
    <div
      className={`flex items-center gap-2 ${
        side === 'red' ? 'justify-end' : 'justify-start'
      }`}
    >
      <span
        className={`font-display text-[9px] font-extrabold tracking-[0.2em] ${
          side === 'blue' ? 'text-sky-300/80' : 'text-rose-300/80'
        }`}
      >
        BANS
      </span>
      <div className="flex gap-1.5 rounded-full border border-white/10 bg-black/35 px-2 py-1.5 backdrop-blur-sm">
        {bans.map((heroId, i) => (
          <BanIcon
            key={i}
            heroId={heroId}
            isActive={activeIndex === i}
            delay={i * 60}
          />
        ))}
      </div>
    </div>
  )
}

function BanIcon({
  heroId,
  isActive,
  delay,
}: {
  heroId: string | null
  isActive: boolean
  delay: number
}) {
  const [slamKey, setSlamKey] = useState(0)

  useEffect(() => {
    if (heroId) setSlamKey((k) => k + 1)
  }, [heroId])

  return (
    <div
      className={`relative h-10 w-10 overflow-hidden rounded-full border-2 bg-black/70 anim-fade-up ${
        isActive
          ? 'border-amber-300 animate-pulse-turn'
          : 'border-white/20'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {heroId ? (
        <div key={slamKey} className="relative h-full w-full animate-ban-slam">
          <HeroImage
            heroId={heroId}
            variant="ban"
            className="h-full w-full"
            showNameFallback={false}
          />
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] origin-center bg-rose-500 animate-ban-slash shadow-[0_0_6px_#f43f5e]" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/25">
          ·
        </div>
      )}
    </div>
  )
}
