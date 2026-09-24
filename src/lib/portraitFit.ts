/**
 * Measures where the head sits inside a player photo so every captain can be
 * rendered at the same head size / position regardless of how the photo was
 * cropped (bust shot, half body, full body, large or tiny source).
 *
 * All values are fractions of the natural image size.
 */
export type PortraitMetrics = {
  aspect: number
  /** True when the photo has a transparent background (bg-removed cutout). */
  cutout: boolean
  headTop: number
  headHeight: number
  centerX: number
  /** Lowest visible row of the subject. */
  bottom: number
}

const cache = new Map<string, PortraitMetrics>()
const pending = new Map<string, Promise<PortraitMetrics>>()

const SAMPLE = 256
const ALPHA_MIN = 48

type FaceDetectorLike = {
  detect: (image: HTMLImageElement) => Promise<
    Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>
  >
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) {
      img.crossOrigin = 'anonymous'
    }
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Photo failed to load'))
    img.src = src
  })
}

async function detectFace(img: HTMLImageElement) {
  const Ctor = (window as unknown as {
    FaceDetector?: new (opts?: object) => FaceDetectorLike
  }).FaceDetector
  if (!Ctor) return null
  try {
    const faces = await new Ctor({ fastMode: true, maxDetectedFaces: 3 }).detect(img)
    if (!faces.length) return null
    return faces.reduce((a, b) =>
      a.boundingBox.width * a.boundingBox.height >=
      b.boundingBox.width * b.boundingBox.height
        ? a
        : b,
    ).boundingBox
  } catch {
    return null
  }
}

function fallbackMetrics(aspect: number, cutout: boolean): PortraitMetrics {
  return { aspect, cutout, headTop: 0.08, headHeight: 0.3, centerX: 0.5, bottom: 1 }
}

/**
 * Walks the alpha silhouette top-down: the head is the narrow block above the
 * row where the silhouette suddenly widens into the shoulders.
 */
function measureSilhouette(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { cutout: boolean; top: number; bottom: number; headH: number; cx: number } | null {
  const count = new Float32Array(h)
  const mid = new Float32Array(h)
  let opaque = 0
  for (let y = 0; y < h; y++) {
    let c = 0
    let sumX = 0
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_MIN) {
        c++
        sumX += x
      }
    }
    count[y] = c
    mid[y] = c ? sumX / c : w / 2
    opaque += c
  }
  if (opaque / (w * h) > 0.96) {
    return { cutout: false, top: 0, bottom: h, headH: 0, cx: 0 }
  }

  const minRow = Math.max(2, w * 0.02)
  let top = -1
  let bottom = -1
  for (let y = 0; y < h; y++) {
    if (count[y] >= minRow) {
      if (top < 0) top = y
      bottom = y
    }
  }
  if (top < 0 || bottom - top < 8) return null

  const smooth = (y: number) => {
    let s = 0
    let n = 0
    for (let k = -2; k <= 2; k++) {
      const yy = y + k
      if (yy >= top && yy <= bottom) {
        s += count[yy]
        n++
      }
    }
    return n ? s / n : 0
  }

  // Only rows from the crown down to roughly eye level set the head width, so
  // hands at the chin, collars and lanyards can't inflate it.
  const subjectH = bottom - top
  let headW = 0
  for (let y = top; y <= bottom; y++) {
    const depth = y - top
    if (depth > 4 && depth > headW * 0.65) break
    headW = Math.max(headW, smooth(y))
  }

  let headH = headW * 1.3
  headH = clamp(headH, subjectH * 0.06, subjectH * 0.75)

  let cxSum = 0
  let cxN = 0
  const headEnd = Math.min(bottom, top + Math.round(headH))
  for (let y = top; y <= headEnd; y++) {
    if (count[y] >= minRow) {
      cxSum += mid[y]
      cxN++
    }
  }
  const cx = cxN ? cxSum / cxN : w / 2

  return { cutout: true, top, bottom: bottom + 1, headH, cx }
}

async function analyze(src: string): Promise<PortraitMetrics> {
  const img = await loadImage(src)
  const nw = img.naturalWidth || 1
  const nh = img.naturalHeight || 1
  const aspect = nw / nh

  let silhouette: ReturnType<typeof measureSilhouette> = null
  try {
    const scale = SAMPLE / Math.max(nw, nh)
    const w = Math.max(1, Math.round(nw * scale))
    const h = Math.max(1, Math.round(nh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h)
      silhouette = measureSilhouette(ctx.getImageData(0, 0, w, h).data, w, h)
      if (silhouette?.cutout) {
        return {
          aspect,
          cutout: true,
          headTop: silhouette.top / h,
          headHeight: silhouette.headH / h,
          centerX: silhouette.cx / w,
          bottom: silhouette.bottom / h,
        }
      }
    }
  } catch {
    /* tainted canvas — fall through to face detection */
  }

  const cutout = Boolean(silhouette?.cutout)
  const face = await detectFace(img)
  if (face) {
    // Face box covers brows→chin; extend up for hair.
    const headTop = (face.y - face.height * 0.35) / nh
    return {
      aspect,
      cutout,
      headTop: clamp(headTop, 0, 0.9),
      headHeight: clamp((face.height * 1.4) / nh, 0.05, 0.9),
      centerX: clamp((face.x + face.width / 2) / nw, 0.1, 0.9),
      bottom: 1,
    }
  }
  return fallbackMetrics(aspect, cutout)
}

export function getCachedPortraitMetrics(src: string) {
  return cache.get(src) ?? null
}

export function measurePortrait(src: string): Promise<PortraitMetrics> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  const inflight = pending.get(src)
  if (inflight) return inflight
  const job = analyze(src)
    .catch(() => fallbackMetrics(0.75, false))
    .then((m) => {
      cache.set(src, m)
      pending.delete(src)
      return m
    })
  pending.set(src, job)
  return job
}

export type PortraitFrame = {
  /** Frame size in px the photo is placed into. */
  width: number
  height: number
  /** Where the top of the head should land (px from frame top). */
  headTop: number
  /** Rendered head height in px (hair → chin). */
  headHeight: number
  /** Horizontal head center as a fraction of frame width. */
  centerX?: number
  /** Max downward slide (fraction of frame height) for crops that end above the frame bottom. */
  maxShift?: number
}

/** Absolute placement (px) for an <img> so its head matches the frame targets. */
export function fitPortrait(m: PortraitMetrics, frame: PortraitFrame) {
  let height = frame.headHeight / Math.max(m.headHeight, 0.04)
  // Tight bust crops end above the frame bottom: grow them a little (max 25%),
  // then slide them down so the torso meets the banner instead of floating.
  const bodySpan = Math.max(m.bottom - m.headTop, 0.1)
  const needed = (frame.height - frame.headTop) / bodySpan
  if (height < needed) height = Math.min(needed, height * 1.25)
  let top = frame.headTop - m.headTop * height
  const gap = frame.height - (top + m.bottom * height)
  if (gap > 0) top += Math.min(gap, frame.height * (frame.maxShift ?? 0.3))
  const width = height * m.aspect
  const left = frame.width * (frame.centerX ?? 0.5) - m.centerX * width
  return { width, height, top, left }
}
