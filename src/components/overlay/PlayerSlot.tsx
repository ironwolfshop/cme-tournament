import { useEffect, useState } from 'react'
import HeroImage from '../HeroImage'
import type { Player, TeamSide } from '../../store/draftStore'

type Props = {
  player: Player
  heroId: string | null
  side: TeamSide
  isActive?: boolean
  teamTag: string
  enterDelay?: number
}

export default function PlayerSlot({
  player,
  heroId,
  side,
  isActive = false,
  teamTag,
  enterDelay = 0,
}: Props) {
  const [lockKey, setLockKey] = useState(0)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!heroId) return
    setLockKey((k) => k + 1)
    setFlash(true)
    const t = window.setTimeout(() => setFlash(false), 550)
    return () => window.clearTimeout(t)
  }, [heroId])

  const nameplate =
    side === 'blue'
      ? 'bg-gradient-to-r from-[#0b3dcf] via-[#1e5cff] to-[#38bdf8]'
      : 'bg-gradient-to-r from-[#9f1239] via-[#e11d2e] to-[#fb7185]'

  const emptyBg =
    side === 'blue'
      ? 'bg-gradient-to-b from-[#1d4ed8]/80 via-[#0f172a] to-[#020617]'
      : 'bg-gradient-to-b from-[#be123c]/80 via-[#0f172a] to-[#020617]'

  return (
    <div
      className={`relative flex w-[124px] flex-col anim-fade-up ${
        isActive ? 'animate-pulse-turn z-10' : ''
      } ${flash ? 'animate-lock-ring' : ''}`}
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      <div
        className={`relative h-[178px] overflow-hidden border border-white/25 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
          heroId ? '' : emptyBg
        } ${isActive ? 'ring-2 ring-amber-300 slot-shimmer' : ''}`}
        style={{
          clipPath:
            'polygon(6% 0, 94% 0, 100% 5%, 100% 95%, 94% 100%, 6% 100%, 0 95%, 0 5%)',
        }}
      >
        {heroId ? (
          <div key={lockKey} className="relative h-full w-full animate-lock-in">
            <HeroImage
              heroId={heroId}
              variant="splash"
              className="h-full w-full"
              autoCrop
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
            {flash && (
              <div className="pointer-events-none absolute inset-0 bg-white animate-lock-flash" />
            )}
          </div>
        ) : player.photo ? (
          <img
            src={player.photo}
            alt={player.name}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-amber-300/50 bg-white/5 font-display text-lg font-extrabold tracking-wide text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.2)] backdrop-blur-sm">
              {teamTag.slice(0, 3)}
            </div>
            <div className="h-[2px] w-12 rounded bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
          </div>
        )}
      </div>

      <div
        className={`-mt-1 flex h-9 items-center justify-center px-1.5 ${nameplate}`}
        style={{
          clipPath: 'polygon(3% 0, 97% 0, 100% 100%, 0 100%)',
        }}
      >
        <span className="truncate font-display text-[12px] font-bold uppercase tracking-wide text-white drop-shadow">
          {player.name}
        </span>
      </div>
    </div>
  )
}
