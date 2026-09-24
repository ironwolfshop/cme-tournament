import { useEffect, useState } from 'react'
import {
  getCachedPortraitMetrics,
  measurePortrait,
  type PortraitMetrics,
} from './portraitFit'

/** Head placement for a photo; null until the image has been measured. */
export function usePortraitMetrics(src: string): PortraitMetrics | null {
  const [state, setState] = useState<{ src: string; m: PortraitMetrics | null }>(
    () => ({ src, m: src ? getCachedPortraitMetrics(src) : null }),
  )
  useEffect(() => {
    if (!src) return
    let alive = true
    void measurePortrait(src).then((m) => {
      if (alive) setState({ src, m })
    })
    return () => {
      alive = false
    }
  }, [src])
  if (state.src === src) return state.m
  return src ? getCachedPortraitMetrics(src) : null
}
