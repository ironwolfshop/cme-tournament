import { useEffect } from 'react'
import { DURATION_MS, initStingerSync, useStingerStore } from '../store/stingerStore'

export default function StingerOverlayPage() {
  const stinger = useStingerStore()

  useEffect(() => {
    initStingerSync()
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    if (!stinger.playing || !stinger.startedAt) return
    const elapsed = Date.now() - stinger.startedAt
    if (elapsed >= DURATION_MS) {
      useStingerStore.getState().clear()
      return
    }
    const t = window.setTimeout(() => useStingerStore.getState().clear(), DURATION_MS - elapsed)
    return () => window.clearTimeout(t)
  }, [stinger.playing, stinger.id, stinger.startedAt])

  return (
    <div className="overlay-root cme-bo output-mode">
      {stinger.playing && (
        <div key={stinger.id ?? 'stinger'} className={`stinger effect-${stinger.style}`}>
          <b>{stinger.label || 'CME TOURNAMENT'}</b>
          <span>MOBILE LEGENDS: BANG BANG</span>
        </div>
      )}
    </div>
  )
}
