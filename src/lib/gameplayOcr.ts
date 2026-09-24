import { createWorker, OEM, type Worker } from 'tesseract.js'
// Bundle worker + WASM through Vite so OCR does not depend on flaky CDN loads.
import tesseractWorkerPath from 'tesseract.js/dist/worker.min.js?url'
import tesseractCorePath from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'

export type OcrScalarField =
  | 'clock'
  | 'blueKills'
  | 'redKills'
  | 'blueGold'
  | 'redGold'
  | 'blueTowers'
  | 'redTowers'
  | 'blueSeries'
  | 'redSeries'

export type OcrKdaField =
  | 'blueKda0'
  | 'blueKda1'
  | 'blueKda2'
  | 'blueKda3'
  | 'blueKda4'
  | 'redKda0'
  | 'redKda1'
  | 'redKda2'
  | 'redKda3'
  | 'redKda4'

export type OcrField = OcrScalarField | OcrKdaField

export type OcrKda = { kills: number; deaths: number; assists: number }

export type OcrRegion = {
  id: OcrField
  label: string
  /** Normalized 0–1 against capture frame */
  x: number
  y: number
  w: number
  h: number
  enabled: boolean
}

export type OcrReading = {
  field: OcrField
  raw: string
  value: number | null
  kda: OcrKda | null
  ok: boolean
  confidence: number
  /** Preprocess/PSM attempts that agreed on the chosen value. */
  votes?: number
  /** Attempts that produced any valid parse. */
  okAttempts?: number
  /** performance.now() when the frame was sampled. */
  at?: number
  /** Crop pixels unchanged since the last OCR — previous result reused. */
  cached?: boolean
}

export function isKdaField(field: OcrField): field is OcrKdaField {
  return field.startsWith('blueKda') || field.startsWith('redKda')
}

export function parseKdaField(
  field: OcrKdaField,
): { side: 'blue' | 'red'; index: number } {
  const side = field.startsWith('blue') ? 'blue' : 'red'
  const index = Number(field.replace(/^(blue|red)Kda/, ''))
  return { side, index }
}

function emptyRegion(
  id: OcrField,
  label: string,
): OcrRegion {
  return { id, label, x: 0, y: 0, w: 0, h: 0, enabled: false }
}

/** Core HUD only — side player K/D/A maps removed (no side roster on overlay). */
export function defaultOcrRegions(): OcrRegion[] {
  return [
    emptyRegion('clock', 'Game clock'),
    emptyRegion('blueKills', 'Blue kills'),
    emptyRegion('redKills', 'Red kills'),
    emptyRegion('blueTowers', 'Blue towers'),
    emptyRegion('redTowers', 'Red towers'),
    emptyRegion('blueSeries', 'Blue series'),
    emptyRegion('redSeries', 'Red series'),
  ]
}

export function isActiveOcrField(field: OcrField): boolean {
  return (
    field === 'clock' ||
    field === 'blueKills' ||
    field === 'redKills' ||
    field === 'blueTowers' ||
    field === 'redTowers' ||
    field === 'blueSeries' ||
    field === 'redSeries'
  )
}

let worker: Worker | null = null
let workerReady: Promise<Worker> | null = null
let workerPsm = '7'
let workerWhitelist = ''

function workerParams(psm: string, whitelist: string): Record<string, string> {
  return {
    tessedit_char_whitelist: whitelist,
    tessedit_pageseg_mode: psm,
    user_defined_dpi: '300',
    // Crops are always rendered dark-on-white; skip Tesseract's inverted retry
    tessedit_do_invert: '0',
    // Digit HUD — ignore English word guesses
    load_system_dawg: '0',
    load_freq_dawg: '0',
    load_punc_dawg: '0',
    load_number_dawg: '0',
    load_unambig_dawg: '0',
    load_bigram_dawg: '0',
    load_fixed_length_dawgs: '0',
  }
}

export async function getOcrWorker(): Promise<Worker> {
  if (worker) return worker
  if (!workerReady) {
    workerReady = (async () => {
      const w = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: tesseractWorkerPath,
        corePath: tesseractCorePath,
        // Official traineddata (LSTM) — digits/clock need this, not the legacy engine
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: () => undefined,
        errorHandler: () => undefined,
      })
      await w.setParameters(workerParams('7', '0123456789:'))
      workerPsm = '7'
      workerWhitelist = '0123456789:'
      worker = w
      return w
    })().catch((err) => {
      worker = null
      workerReady = null
      throw err
    })
  }
  return workerReady
}

async function configureWorker(psm: string, whitelist: string) {
  const w = await getOcrWorker()
  if (workerPsm === psm && workerWhitelist === whitelist) return w
  const params = workerParams(psm, whitelist)
  try {
    await w.setParameters(params)
  } catch {
    await destroyOcrWorker()
    const fresh = await getOcrWorker()
    await fresh.setParameters(params)
    workerPsm = psm
    workerWhitelist = whitelist
    return fresh
  }
  workerPsm = psm
  workerWhitelist = whitelist
  return w
}

export async function destroyOcrWorker() {
  const pending = workerReady
  const current = worker
  worker = null
  workerReady = null
  workerPsm = '7'
  workerWhitelist = ''
  resetOcrCache()
  try {
    if (current) await current.terminate()
    else if (pending) {
      const w = await pending
      await w.terminate()
    }
  } catch {
    /* HMR / already dead */
  }
}

type OcrSource = HTMLCanvasElement | HTMLVideoElement | HTMLImageElement

function sourceSize(source: OcrSource): { sw: number; sh: number } {
  const sw =
    'videoWidth' in source
      ? source.videoWidth || source.clientWidth
      : 'naturalWidth' in source
        ? source.naturalWidth || source.width
        : source.width
  const sh =
    'videoHeight' in source
      ? source.videoHeight || source.clientHeight
      : 'naturalHeight' in source
        ? source.naturalHeight || source.height
        : source.height
  return { sw, sh }
}

export type PrepMode = 'otsu' | 'strict' | 'gray'

function isKillField(field: OcrField) {
  return field === 'blueKills' || field === 'redKills'
}

function focusKillRegion(region: OcrRegion): OcrRegion {
  // Loose boxes pull in gold. Kill badge is toward the clock:
  // blue gold | BLUE KILLS | clock | RED KILLS | red gold
  if (region.id === 'blueKills' && region.w > 0.018) {
    return { ...region, x: region.x + region.w * 0.42, w: region.w * 0.58 }
  }
  if (region.id === 'redKills' && region.w > 0.018) {
    return { ...region, w: region.w * 0.58 }
  }
  return region
}

function padFactors(field: OcrField): {
  padL: number
  padR: number
  padY: number
} {
  // Blue gold sits to the left; red gold sits to the right
  if (field === 'blueKills') return { padL: -0.2, padR: -0.02, padY: -0.06 }
  if (field === 'redKills') return { padL: -0.02, padR: -0.2, padY: -0.06 }
  if (field === 'clock') return { padL: 0.08, padR: 0.08, padY: 0.18 }
  if (isKdaField(field)) return { padL: 0.06, padR: 0.06, padY: 0.14 }
  return { padL: 0.12, padR: 0.12, padY: 0.2 }
}

/** Copy the padded region at native capture resolution (no full-frame copy). */
function cropNative(source: OcrSource, region: OcrRegion): HTMLCanvasElement | null {
  const { sw, sh } = sourceSize(source)
  if (!sw || !sh) return null
  const focused = isKillField(region.id) ? focusKillRegion(region) : region
  const { padL, padR, padY: pyF } = padFactors(focused.id)

  const padLeft = focused.w * padL
  const padRight = focused.w * padR
  const padY = focused.h * pyF
  let x0 = Math.max(0, focused.x - padLeft)
  let y0 = Math.max(0, focused.y - padY)
  let x1 = Math.min(1, focused.x + focused.w + padRight)
  let y1 = Math.min(1, focused.y + focused.h + padY)
  // Negative pad (kill inset) can collapse a tiny box — fall back to focused box
  if (x1 - x0 < focused.w * 0.35) {
    x0 = focused.x
    x1 = focused.x + focused.w
  }
  if (y1 - y0 < focused.h * 0.35) {
    y0 = focused.y
    y1 = focused.y + focused.h
  }

  const sx = Math.floor(x0 * sw)
  const sy = Math.floor(y0 * sh)
  const rw = Math.max(2, Math.min(sw - sx, Math.ceil((x1 - x0) * sw)))
  const rh = Math.max(2, Math.min(sh - sy, Math.ceil((y1 - y0) * sh)))

  const c = document.createElement('canvas')
  c.width = rw
  c.height = rh
  const ctx = c.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!ctx) return null
  ctx.drawImage(source, sx, sy, rw, rh, 0, 0, rw, rh)
  return c
}

const SIG_W = 24
const SIG_H = 12

/** Coarse grayscale grid used to skip OCR when the crop has not changed. */
function signatureOf(crop: HTMLCanvasElement): Float32Array {
  const ctx = crop.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, crop.width, crop.height)
  const sig = new Float32Array(SIG_W * SIG_H)
  const counts = new Uint16Array(SIG_W * SIG_H)
  for (let y = 0; y < crop.height; y++) {
    const cy = Math.min(SIG_H - 1, Math.floor((y * SIG_H) / crop.height))
    for (let x = 0; x < crop.width; x++) {
      const cx = Math.min(SIG_W - 1, Math.floor((x * SIG_W) / crop.width))
      const i = (y * crop.width + x) * 4
      const cell = cy * SIG_W + cx
      sig[cell] += (data[i]! + data[i + 1]! + data[i + 2]!) / 3
      counts[cell]!++
    }
  }
  for (let i = 0; i < sig.length; i++) sig[i] = counts[i] ? sig[i]! / counts[i]! : 0
  return sig
}

function signatureChanged(a: Float32Array, b: Float32Array, sensitive = false): boolean {
  if (a.length !== b.length) return true
  let sum = 0
  let max = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!)
    sum += d
    if (d > max) max = d
  }
  const maxCut = sensitive ? 16 : 30
  const avgCut = sensitive ? 1.6 : 3
  return max > maxCut || sum / a.length > avgCut
}

type CropAnalysis = {
  /** Foreground-bright gray (0–255) for the upscaled content area. */
  gray: Uint8ClampedArray
  cw: number
  ch: number
  margin: number
  otsu: number
  fgMean: number
  lo: number
  hi: number
}

function otsuOf(hist: Uint32Array, total: number) {
  let sumAll = 0
  let sqAll = 0
  for (let i = 0; i < 256; i++) {
    sumAll += i * hist[i]!
    sqAll += i * i * hist[i]!
  }
  const mean = sumAll / total
  const variance = sqAll / total - mean * mean
  let best = -1
  let bestT = 127
  let sumB = 0
  let wB = 0
  for (let t = 0; t < 255; t++) {
    wB += hist[t]!
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]!
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      bestT = t
    }
  }
  // Separability 0–1: how cleanly the crop splits into text vs background
  const eta = variance > 0 ? best / (total * total) / variance : 0
  return { t: bestT, eta }
}

const TARGET_CONTENT_H = 64
const KILL_CONTENT_H = 80

/**
 * Upscale the native crop, then pick the gray projection (max channel, min
 * channel, or luma) that best separates digits from the HUD panel. Handles
 * white, gold, and team-tinted digits without per-field tuning.
 */
function analyzeCrop(native: HTMLCanvasElement, field?: OcrField): CropAnalysis {
  const targetH = field && isKillField(field) ? KILL_CONTENT_H : TARGET_CONTENT_H
  const scale = Math.max(1, Math.min(6, Math.ceil(targetH / native.height)))
  const cw = native.width * scale
  const ch = native.height * scale
  const margin = Math.round(ch * 0.3) + 8

  const up = document.createElement('canvas')
  up.width = cw
  up.height = ch
  const uctx = up.getContext('2d', { willReadFrequently: true, alpha: false })!
  uctx.imageSmoothingEnabled = true
  uctx.imageSmoothingQuality = 'high'
  uctx.drawImage(native, 0, 0, cw, ch)
  const { data } = uctx.getImageData(0, 0, cw, ch)

  const n = cw * ch
  const maxCh = (r: number, g: number, b: number) => Math.max(r, g, b * 0.85)
  const minCh = (r: number, g: number, b: number) => Math.min(r, g, b)
  const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
  // Kills: min-channel only (gold stays dark). Clock/other: try all three.
  const projections =
    field && isKillField(field) ? [minCh] : [maxCh, minCh, luma]

  let bestGray: Uint8ClampedArray | null = null
  let bestHist: Uint32Array | null = null
  let bestEta = -1
  let bestT = 127
  for (const project of projections) {
    const gray = new Uint8ClampedArray(n)
    const hist = new Uint32Array(256)
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const g = Math.round(project(data[i]!, data[i + 1]!, data[i + 2]!))
      gray[p] = g
      hist[g]!++
    }
    const { t, eta } = otsuOf(hist, n)
    if (eta > bestEta) {
      bestEta = eta
      bestGray = gray
      bestHist = hist
      bestT = t
    }
  }

  const gray = bestGray!
  let hist = bestHist!
  let otsu = bestT

  // Text is the minority class — flip if the bright side dominates
  let above = 0
  for (let t = otsu + 1; t < 256; t++) above += hist[t]!
  if (above > n * 0.5) {
    const flipped = new Uint32Array(256)
    for (let p = 0; p < n; p++) gray[p] = 255 - gray[p]!
    for (let t = 0; t < 256; t++) flipped[255 - t] = hist[t]!
    hist = flipped
    otsu = 254 - otsu
  }

  let fgSum = 0
  let fgCount = 0
  for (let t = otsu + 1; t < 256; t++) {
    fgSum += t * hist[t]!
    fgCount += hist[t]!
  }
  const fgMean = fgCount ? fgSum / fgCount : Math.min(255, otsu + 40)

  let lo = 0
  let hi = 255
  {
    let acc = 0
    const loCut = n * 0.02
    const hiCut = n * 0.98
    let loSet = false
    for (let t = 0; t < 256; t++) {
      acc += hist[t]!
      if (!loSet && acc >= loCut) {
        lo = t
        loSet = true
      }
      if (acc >= hiCut) {
        hi = t
        break
      }
    }
  }

  return { gray, cw, ch, margin, otsu, fgMean, lo, hi: Math.max(hi, lo + 16) }
}

/** Drop specks and panel edge lines that Tesseract would read as 1s or dots. */
function despeckle(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  const pixels: number[] = []
  const minArea = Math.max(6, Math.round(h * h * 0.004))
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    let top = 0
    stack[top++] = start
    seen[start] = 1
    pixels.length = 0
    let minX = w
    let maxX = 0
    let minY = h
    let maxY = 0
    while (top) {
      const p = stack[--top]!
      pixels.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1 }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1 }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w }
    }
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const tiny = pixels.length < minArea
    const hLine = bh <= h * 0.12 && bw >= w * 0.45
    if (tiny || hLine) {
      for (const p of pixels) mask[p] = 0
    }
  }
}

/** Dilate black glyphs so a thin HUD "1" still has enough stroke for LSTM. */
function thickenDark(d: Uint8ClampedArray, w: number, h: number) {
  const src = new Uint8Array(w * h)
  for (let p = 0, i = 0; p < src.length; p++, i += 4) src[p] = d[i]! < 127 ? 1 : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (src[p]) continue
      let hit = false
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          if (src[ny * w + nx]) {
            hit = true
            break
          }
        }
      }
      if (hit) {
        const i = p * 4
        d[i] = d[i + 1] = d[i + 2] = 0
      }
    }
  }
}

/** Render a Tesseract-friendly crop: black digits on white with a quiet margin. */
function renderCrop(a: CropAnalysis, mode: PrepMode, thicken = false): HTMLCanvasElement {
  const { cw, ch, margin, gray } = a
  const out = document.createElement('canvas')
  out.width = cw + margin * 2
  out.height = ch + margin * 2
  const ctx = out.getContext('2d', { willReadFrequently: true, alpha: false })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)

  const img = ctx.createImageData(cw, ch)
  const d = img.data
  const n = cw * ch

  if (mode === 'gray') {
    const span = a.hi - a.lo
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const g = Math.max(0, Math.min(255, ((gray[p]! - a.lo) / span) * 255))
      const v = 255 - g
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
  } else {
    const t = mode === 'strict' ? a.otsu + (a.fgMean - a.otsu) * 0.35 : a.otsu
    const mask = new Uint8Array(n)
    for (let p = 0; p < n; p++) mask[p] = gray[p]! > t ? 1 : 0
    despeckle(mask, cw, ch)
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const v = mask[p] ? 0 : 255
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
    if (thicken) thickenDark(d, cw, ch)
  }

  ctx.putImageData(img, margin, margin)
  return out
}

/** Upscale + binarize one region for OCR (black text on white). */
export function preprocessCrop(
  source: OcrSource,
  region: OcrRegion,
  mode: PrepMode = 'otsu',
): HTMLCanvasElement {
  const native = cropNative(source, region)
  if (!native) {
    const blank = document.createElement('canvas')
    blank.width = 48
    blank.height = 24
    return blank
  }
  return renderCrop(analyzeCrop(native, region.id), mode, isKillField(region.id))
}

function fixOcrDigits(raw: string): string {
  return raw
    .replace(/[OoDd]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[Gg]/g, '6')
    .replace(/[Qq]/g, '0')
}

export function parseClockToSeconds(raw: string): number | null {
  // Colon often OCR'd as ., ;, |, /
  const cleaned = fixOcrDigits(raw)
    .replace(/[.;|/\\-]/g, ':')
    .replace(/[^\d:]/g, '')

  // HH:MM:SS (rare) or MM:SS (MLBB HUD)
  const hms = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (hms) {
    const h = Number(hms[1])
    const m = Number(hms[2])
    const s = Number(hms[3])
    if (m > 59 || s > 59 || h > 24) return null
    return h * 3600 + m * 60 + s
  }

  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) {
    // Only a dropped colon in MM:SS is recoverable; "135" could be 1:35 or 11:35
    if (cleaned.includes(':')) return null
    const digits = cleaned
    if (digits.length === 4) {
      const min = Number(digits.slice(0, 2))
      const sec = Number(digits.slice(2))
      if (sec <= 59 && min <= 99) return min * 60 + sec
      return null
    }
    return null
  }
  const min = Number(m[1])
  const sec = Number(m[2])
  if (sec > 59 || min > 99) return null
  return min * 60 + sec
}

/** Team kills: keep a lone 1–2 digit token. Drop gold bleed; never guess from junk. */
export function parseKillStat(raw: string, field?: OcrField): number | null {
  const groups = fixOcrDigits(raw).match(/\d+/g) ?? []
  if (!groups.length) return null
  const candidates = groups
    .filter((g) => g.length <= 2)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 99)
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]!
  if (candidates.every((n) => n === candidates[0])) return candidates[0]!
  // Blue gold is left of the badge; red gold is right — keep the kill-side token
  if (field === 'blueKills') return candidates[candidates.length - 1]!
  if (field === 'redKills') return candidates[0]!
  return null
}

export function parseIntStat(raw: string): number | null {
  const groups = fixOcrDigits(raw).match(/\d+/g) ?? []
  if (groups.length !== 1) return null
  const n = Number(groups[0])
  if (!Number.isFinite(n)) return null
  return Math.min(999, n)
}

/** Accepts $1500, $ 1500, 6800, 6.8k, 6,8k */
export function parseGoldStat(raw: string): number | null {
  const t = fixOcrDigits(raw)
    .replace(/[$\s]/g, '')
    .replace(',', '.')
    .trim()
    .toLowerCase()
  if (!t) return null
  const k = t.match(/^(\d+(?:\.\d+)?)k$/)
  if (k) return Math.round(Number(k[1]) * 1000)
  const m = t.match(/^(\d+(?:\.\d+)?)m$/)
  if (m) return Math.round(Number(m[1]) * 1_000_000)
  // OCR often drops `k` but keeps one decimal: 6.8 → treat as thousands if < 100
  const dec = t.match(/^(\d+)\.(\d)$/)
  if (dec) {
    const whole = Number(dec[1])
    if (whole < 100) return Math.round(whole * 1000 + Number(dec[2]) * 100)
  }
  const digits = t.replace(/[^\d]/g, '')
  if (!digits) return null
  return Math.min(999999, Number(digits))
}

/** Accepts 0/0/0, 1 / 2 / 3, 12-0-5, OCR clutter */
export function parseKdaStat(raw: string): OcrKda | null {
  const cleaned = fixOcrDigits(raw)
    .replace(/[|_·•.,;:\\-]/g, '/')
    .replace(/\s+/g, '/')
    .replace(/\/+/g, '/')
  const m = cleaned.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) {
    const only = cleaned.replace(/\D/g, '')
    if (only.length === 3) {
      return {
        kills: Number(only[0]),
        deaths: Number(only[1]),
        assists: Number(only[2]),
      }
    }
    return null
  }
  const kills = Number(m[1])
  const deaths = Number(m[2])
  const assists = Number(m[3])
  if ([kills, deaths, assists].some((n) => !Number.isFinite(n) || n > 99)) {
    return null
  }
  return { kills, deaths, assists }
}

export function parseField(
  field: OcrField,
  raw: string,
): { value: number | null; kda: OcrKda | null; ok: boolean } {
  if (isKdaField(field)) {
    const kda = parseKdaStat(raw)
    return { value: null, kda, ok: kda != null }
  }
  if (field === 'clock') {
    const value = parseClockToSeconds(raw)
    return { value, kda: null, ok: value != null && value <= 80 * 60 }
  }
  if (field === 'blueGold' || field === 'redGold') {
    const value = parseGoldStat(raw)
    return { value, kda: null, ok: value != null }
  }
  if (field === 'blueTowers' || field === 'redTowers') {
    const value = parseIntStat(raw)
    if (value == null || value > 11) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  if (field === 'blueSeries' || field === 'redSeries') {
    const value = parseIntStat(raw)
    if (value == null || value > 5) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  if (field === 'blueKills' || field === 'redKills') {
    const value = parseKillStat(raw, field)
    if (value == null || value > 99) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  const value = parseIntStat(raw)
  return { value, kda: null, ok: value != null }
}

function whitelistFor(field: OcrField): string {
  if (field === 'clock') return '0123456789:'
  if (field === 'blueGold' || field === 'redGold') return '0123456789.$kKmM'
  if (isKdaField(field)) return '0123456789/ '
  return '0123456789'
}

/**
 * Attempt plan, cheapest-first. Same PSM grouped together to avoid
 * reconfiguring the worker between attempts.
 */
const ATTEMPT_PLAN: ReadonlyArray<readonly [PrepMode, string]> = [
  ['otsu', '7'],
  ['strict', '7'],
  ['gray', '7'],
  ['otsu', '13'],
  ['strict', '13'],
]

type Attempt = {
  raw: string
  confidence: number
  value: number | null
  kda: OcrKda | null
  ok: boolean
}

function attemptKey(a: Attempt): string {
  if (a.kda) return `${a.kda.kills}/${a.kda.deaths}/${a.kda.assists}`
  return String(a.value)
}

async function recognizeOnce(
  canvas: HTMLCanvasElement,
  field: OcrField,
  psm: string,
): Promise<Attempt> {
  try {
    const w = await configureWorker(psm, whitelistFor(field))
    const { data } = await w.recognize(canvas)
    const raw = (data.text || '').replace(/\s+/g, ' ').trim()
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0
    const parsed = parseField(field, raw)
    return { raw, confidence, ...parsed }
  } catch {
    // Worker dies on HMR / tab freeze — rebuild on next call
    await destroyOcrWorker()
    return { raw: '', confidence: 0, value: null, kda: null, ok: false }
  }
}

type Tally = { key: string; votes: number; conf: number; best: Attempt }

function tallyAttempts(attempts: Attempt[]): Tally[] {
  const map = new Map<string, Tally>()
  for (const a of attempts) {
    if (!a.ok) continue
    const key = attemptKey(a)
    const t = map.get(key)
    if (!t) map.set(key, { key, votes: 1, conf: a.confidence, best: a })
    else {
      t.votes++
      t.conf += a.confidence
      if (a.confidence > t.best.confidence) t.best = a
    }
  }
  return [...map.values()].sort((x, y) => y.votes - x.votes || y.conf - x.conf)
}

function settled(tallies: Tally[]): boolean {
  const top = tallies[0]
  if (!top) return false
  const second = tallies[1]?.votes ?? 0
  if (top.votes >= 2 && second === 0) return true
  return top.votes >= 3 && top.votes >= second + 2
}

function emptyReading(field: OcrField, at: number): OcrReading {
  return {
    field,
    raw: '',
    value: null,
    kda: null,
    ok: false,
    confidence: 0,
    votes: 0,
    okAttempts: 0,
    at,
  }
}

function readingFromTallies(
  field: OcrField,
  at: number,
  attempts: Attempt[],
  loneOkConf: number,
): OcrReading {
  const tallies = tallyAttempts(attempts)
  const top = tallies[0]
  if (!top) {
    const loudest = attempts.reduce((b, a) => (a.confidence > b.confidence ? a : b))
    return { ...emptyReading(field, at), raw: loudest.raw }
  }
  const second = tallies[1]?.votes ?? 0
  const okAttempts = tallies.reduce((s, t) => s + t.votes, 0)
  const avgConf = top.conf / top.votes
  const ok =
    (top.votes >= 2 && top.votes > second) ||
    (top.votes === 1 && okAttempts === 1 && avgConf >= loneOkConf)
  return {
    field,
    raw: top.best.raw,
    value: ok ? top.best.value : null,
    kda: ok ? top.best.kda : null,
    ok,
    confidence: Math.round(avgConf * (top.votes / Math.max(1, okAttempts))),
    votes: top.votes,
    okAttempts,
    at,
  }
}

const KILL_ATTEMPT_PLAN: ReadonlyArray<readonly [PrepMode, string]> = [
  ['otsu', '7'],
  ['strict', '7'],
]

async function recognizeKillCrop(
  native: HTMLCanvasElement,
  field: OcrField,
  at: number,
): Promise<OcrReading> {
  const analysis = analyzeCrop(native, field)
  const rendered = new Map<PrepMode, HTMLCanvasElement>()
  const attempts: Attempt[] = []

  for (const [mode, psm] of KILL_ATTEMPT_PLAN) {
    let canvas = rendered.get(mode)
    if (!canvas) {
      canvas = renderCrop(analysis, mode, true)
      rendered.set(mode, canvas)
    }
    const attempt = await recognizeOnce(canvas, field, psm)
    attempts.push(attempt)
    // Same bar as the clock: a clean 1–2 digit parse is enough to stop
    if (attempt.ok && attempt.value != null && attempt.confidence >= 58) {
      return {
        field,
        raw: attempt.raw,
        value: attempt.value,
        kda: null,
        ok: true,
        confidence: attempt.confidence,
        votes: 1,
        okAttempts: 1,
        at,
      }
    }
  }

  return readingFromTallies(field, at, attempts, 70)
}

/**
 * Multi-variant consensus: render the crop several ways, OCR each, and only
 * report a value that independent variants agree on.
 */
async function recognizeCrop(
  native: HTMLCanvasElement,
  field: OcrField,
  at: number,
): Promise<OcrReading> {
  if (isKillField(field)) return recognizeKillCrop(native, field, at)

  const analysis = analyzeCrop(native, field)
  const rendered = new Map<PrepMode, HTMLCanvasElement>()
  const attempts: Attempt[] = []

  for (const [mode, psm] of ATTEMPT_PLAN) {
    let canvas = rendered.get(mode)
    if (!canvas) {
      canvas = renderCrop(analysis, mode)
      rendered.set(mode, canvas)
    }
    const attempt = await recognizeOnce(canvas, field, psm)
    attempts.push(attempt)
    if (field === 'clock' && attempt.ok && attempt.value != null && attempt.confidence >= 55) {
      return {
        field,
        raw: attempt.raw,
        value: attempt.value,
        kda: null,
        ok: true,
        confidence: attempt.confidence,
        votes: 1,
        okAttempts: 1,
        at,
      }
    }
    if (attempts.length >= 2 && settled(tallyAttempts(attempts))) break
  }

  return readingFromTallies(field, at, attempts, 90)
}

export type RegionSnapshot = {
  region: OcrRegion
  crop: HTMLCanvasElement | null
  signature: Float32Array | null
  at: number
}

/**
 * Sample every region from the same video frame in one synchronous pass.
 * Only the small region crops are copied, never the whole 1080p frame.
 */
export function snapshotRegions(source: OcrSource, regions: OcrRegion[]): RegionSnapshot[] {
  const at = performance.now()
  return regions.map((region) => {
    const crop = cropNative(source, region)
    return { region, crop, signature: crop ? signatureOf(crop) : null, at }
  })
}

const FORCE_REFRESH_MS = 6000

const readCache = new Map<
  OcrField,
  { box: string; signature: Float32Array; reading: OcrReading; at: number }
>()

export function resetOcrCache(field?: OcrField) {
  if (field) readCache.delete(field)
  else readCache.clear()
}

function boxKey(r: OcrRegion) {
  return `${r.x.toFixed(5)},${r.y.toFixed(5)},${r.w.toFixed(5)},${r.h.toFixed(5)}`
}

export async function readSnapshot(snap: RegionSnapshot): Promise<OcrReading> {
  const { region, crop, signature, at } = snap
  if (!crop || !signature) return emptyReading(region.id, at)

  const box = boxKey(region)
  const prev = readCache.get(region.id)
  if (
    prev &&
    prev.box === box &&
    prev.reading.ok &&
    at - prev.at < FORCE_REFRESH_MS &&
    !signatureChanged(prev.signature, signature, isKillField(region.id))
  ) {
    return { ...prev.reading, at, cached: true }
  }

  const reading = await recognizeCrop(crop, region.id, at)
  readCache.set(region.id, { box, signature, reading, at })
  return reading
}

export async function readSnapshots(snaps: RegionSnapshot[]): Promise<OcrReading[]> {
  const out: OcrReading[] = []
  for (const snap of snaps) {
    try {
      out.push(await readSnapshot(snap))
    } catch {
      out.push(emptyReading(snap.region.id, snap.at))
    }
  }
  return out
}

export async function readRegion(source: OcrSource, region: OcrRegion): Promise<OcrReading> {
  const [snap] = snapshotRegions(source, [region])
  return readSnapshot(snap!)
}

export async function readAllRegions(
  source: OcrSource,
  regions: OcrRegion[],
): Promise<OcrReading[]> {
  const enabled = regions.filter((r) => r.enabled && r.w >= 0.008 && r.h >= 0.008)
  const ordered = [
    ...enabled.filter((r) => !isKdaField(r.id)),
    ...enabled.filter((r) => isKdaField(r.id)),
  ]
  return readSnapshots(snapshotRegions(source, ordered))
}

export function grabVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { alpha: false })!
  ctx.drawImage(video, 0, 0, w, h)
  return c
}

/** Debug: return the preprocessed crop canvas for the selected region. */
export function previewRegionCrop(
  source: OcrSource,
  region: OcrRegion,
  mode: PrepMode = 'otsu',
): HTMLCanvasElement {
  return preprocessCrop(source, region, mode)
}
