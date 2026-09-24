import { memo, useEffect, useMemo, useState } from 'react'
import { DEFAULT_SKIN_ICON } from '../data/defaultSkinIcons'
import { getHero, type Hero } from '../data/heroes'
import { detectPortraitFocus, type FocusPoint } from '../lib/faceFocus'

type Props = {
  heroId?: string | null
  hero?: Hero | null
  /** portrait = small icon, splash/loading = full splash art, ban = grayscale icon */
  variant?: 'portrait' | 'loading' | 'splash' | 'ban'
  className?: string
  imgClassName?: string
  showNameFallback?: boolean
  /** Auto-detect face (splash/loading only). Off for grid portraits. */
  autoCrop?: boolean
  /** Native lazy load — use for large grids. */
  lazy?: boolean
}

function HeroImage({
  heroId,
  hero: heroProp,
  variant = 'portrait',
  className = '',
  imgClassName = '',
  showNameFallback = true,
  autoCrop,
  lazy = false,
}: Props) {
  const hero = heroProp ?? getHero(heroId)
  const [srcIndex, setSrcIndex] = useState(0)
  const [focus, setFocus] = useState<FocusPoint | null>(null)

  // Never auto-crop tiny grid portraits — face crops are already pre-cut
  const shouldAutoCrop =
    autoCrop ?? (variant === 'splash' || variant === 'loading')

  const sources = useMemo(() => {
    if (!hero) return [] as string[]
    const icon = DEFAULT_SKIN_ICON[hero.id]
    return icon ? [icon] : []
  }, [hero])

  useEffect(() => {
    setSrcIndex(0)
    setFocus(null)
  }, [hero?.id, variant])

  if (!hero) {
    return <div className={`bg-black/40 ${className}`} />
  }

  const src = sources[srcIndex]
  const failed = !src

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white font-display font-bold ${className}`}
        title={hero.name}
      >
        {showNameFallback ? (
          <span className="px-1 text-center text-[10px] leading-tight uppercase tracking-wide">
            {hero.name}
          </span>
        ) : (
          <span className="text-lg">{hero.name.slice(0, 2)}</span>
        )}
      </div>
    )
  }

  const objectPosition = shouldAutoCrop
    ? focus
      ? `${focus.x}% ${focus.y}%`
      : '50% 22%'
    : undefined

  return (
    <div className={`overflow-hidden ${className}`}>
      <img
        key={src}
        src={src}
        alt={hero.name}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        crossOrigin={shouldAutoCrop ? 'anonymous' : undefined}
        className={`h-full w-full object-cover ${
          variant === 'ban' ? 'grayscale brightness-75' : ''
        } ${imgClassName}`}
        style={
          shouldAutoCrop
            ? {
                objectPosition,
                transform:
                  variant === 'splash' || variant === 'loading'
                    ? 'scale(1.18)'
                    : 'scale(1.08)',
                transformOrigin: objectPosition,
              }
            : undefined
        }
        onLoad={(e) => {
          if (!shouldAutoCrop) return
          const img = e.currentTarget
          const key = `${hero.id}:${src}`
          void detectPortraitFocus(img, key, hero.id).then(setFocus)
        }}
        onError={() => setSrcIndex((i) => i + 1)}
        draggable={false}
      />
    </div>
  )
}

export default memo(HeroImage)
