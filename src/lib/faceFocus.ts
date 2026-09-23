export type FocusPoint = { x: number; y: number }

const memory = new Map<string, FocusPoint>()

/** Manual overrides when auto-detect misses a face (percentages). */
export const FOCUS_OVERRIDES: Record<string, FocusPoint> = {
  // id → focus
  fanny: { x: 48, y: 22 },
  gusion: { x: 52, y: 20 },
  lancelot: { x: 50, y: 18 },
  ling: { x: 55, y: 20 },
  wanwan: { x: 48, y: 24 },
  layla: { x: 50, y: 22 },
  miya: { x: 50, y: 24 },
  alucard: { x: 48, y: 20 },
  valentina: { x: 50, y: 22 },
  arlott: { x: 52, y: 20 },
  fredrinn: { x: 50, y: 22 },
  benedetta: { x: 48, y: 20 },
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

type FaceDetectorLike = {
  detect: (image: HTMLImageElement) => Promise<
    Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>
  >
}

function getFaceDetector(): FaceDetectorLike | null {
  const Ctor = (window as unknown as { FaceDetector?: new (opts?: object) => FaceDetectorLike })
    .FaceDetector
  if (!Ctor) return null
  try {
    return new Ctor({ fastMode: true, maxDetectedFaces: 3 })
  } catch {
    return null
  }
}

/** Prefer face in upper frame so portrait crops keep the head visible. */
function focusFromBox(
  box: { x: number; y: number; width: number; height: number },
  imgW: number,
  imgH: number,
): FocusPoint {
  const cx = ((box.x + box.width / 2) / imgW) * 100
  // Bias slightly above face center so chin isn't cut off by bottom of slot
  const cy = ((box.y + box.height * 0.3) / imgH) * 100
  return {
    x: clamp(cx, 12, 88),
    y: clamp(cy, 8, 48),
  }
}

/**
 * Warm / skin-tone density in the upper half — works OK on stylized splash art
 * when FaceDetector is unavailable.
 */
function warmToneFocus(img: HTMLImageElement): FocusPoint | null {
  try {
    const maxW = 96
    const scale = maxW / img.naturalWidth
    const w = maxW
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    let sumX = 0
    let sumY = 0
    let weight = 0
    const yMax = Math.floor(h * 0.58)

    for (let y = 0; y < yMax; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // Skin / warm highlight heuristic (anime-friendly)
        const warm =
          r > 80 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          r - b > 15 &&
          Math.abs(r - g) < 70
        if (!warm) continue
        // Prefer upper-center
        const wx = 1 - Math.abs(x / w - 0.5) * 0.6
        const wy = 1.4 - y / yMax
        const m = wx * wy
        sumX += x * m
        sumY += y * m
        weight += m
      }
    }

    if (weight < 40) return null
    return {
      x: clamp((sumX / weight / w) * 100, 18, 82),
      y: clamp((sumY / weight / h) * 100, 10, 42),
    }
  } catch {
    // Canvas tainted (CORS) or other failure
    return null
  }
}

const DEFAULT_FOCUS: FocusPoint = { x: 50, y: 24 }

/**
 * Detect a portrait focus point for splash art so object-position keeps the face in frame.
 */
export async function detectPortraitFocus(
  img: HTMLImageElement,
  cacheKey: string,
  heroId?: string | null,
): Promise<FocusPoint> {
  if (heroId && FOCUS_OVERRIDES[heroId]) {
    return FOCUS_OVERRIDES[heroId]
  }

  if (memory.has(cacheKey)) return memory.get(cacheKey)!

  try {
    const raw = sessionStorage.getItem(`mlbb-face-focus:${cacheKey}`)
    if (raw) {
      const parsed = JSON.parse(raw) as FocusPoint
      memory.set(cacheKey, parsed)
      return parsed
    }
  } catch {
    /* ignore */
  }

  let point: FocusPoint | null = null

  const detector = getFaceDetector()
  if (detector && img.naturalWidth > 0) {
    try {
      const faces = await detector.detect(img)
      if (faces.length > 0) {
        const best = faces.reduce((a, b) => {
          const aa = a.boundingBox.width * a.boundingBox.height
          const bb = b.boundingBox.width * b.boundingBox.height
          return aa >= bb ? a : b
        })
        point = focusFromBox(best.boundingBox, img.naturalWidth, img.naturalHeight)
      }
    } catch {
      /* unsupported image / API error */
    }
  }

  if (!point) {
    point = warmToneFocus(img)
  }

  if (!point) {
    point = DEFAULT_FOCUS
  }

  memory.set(cacheKey, point)
  try {
    sessionStorage.setItem(`mlbb-face-focus:${cacheKey}`, JSON.stringify(point))
  } catch {
    /* ignore quota */
  }

  return point
}
