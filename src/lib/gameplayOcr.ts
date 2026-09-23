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
      await w.setParameters({
        tessedit_char_whitelist: '0123456789:.',
        tessedit_pageseg_mode: '7',
        classify_bln_numeric_mode: '1',
        user_defined_dpi: '300',
        // Digit HUD — ignore English word guesses
        load_system_dawg: '0',
        load_freq_dawg: '0',
        load_punc_dawg: '0',
        load_number_dawg: '0',
        load_unambig_dawg: '0',
        load_bigram_dawg: '0',
        load_fixed_length_dawgs: '0',
      } as Record<string, string>)
      workerPsm = '7'
      workerWhitelist = '0123456789:.'
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
  const params = {
    tessedit_char_whitelist: whitelist,
    tessedit_pageseg_mode: psm,
    classify_bln_numeric_mode: '1',
    user_defined_dpi: '300',
    load_system_dawg: '0',
    load_freq_dawg: '0',
    load_punc_dawg: '0',
    load_number_dawg: '0',
    load_unambig_dawg: '0',
    load_bigram_dawg: '0',
    load_fixed_length_dawgs: '0',
  } as Record<string, string>
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

function sourceSize(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
): { sw: number; sh: number } {
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

type PrepMode = 'bright' | 'invert' | 'soft'

function padFactors(field: OcrField): { padX: number; padY: number } {
  // Keep crops tight to the drawn box — less HUD bleed, faster OCR
  if (field === 'blueKills') return { padX: -0.28, padY: -0.22 }
  if (field === 'redKills') return { padX: -0.26, padY: -0.2 }
  if (field === 'clock') return { padX: 0.02, padY: 0.06 }
  if (isKdaField(field)) return { padX: 0.02, padY: 0.05 }
  return { padX: 0.03, padY: 0.06 }
}

/** Simple 1px dilate to keep thin "1" strokes from vanishing. */
function thickenBright(bin: Uint8ClampedArray, w: number, h: number) {
  const src = new Uint8Array(w * h)
  for (let p = 0, i = 0; p < src.length; p++, i += 4) src[p] = bin[i]! > 127 ? 1 : 0
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
        bin[i] = bin[i + 1] = bin[i + 2] = 255
      }
    }
  }
}

/** Upscale + pad + contrast for tiny MLBB HUD digits (BlueStacks-friendly). */
export function preprocessCrop(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  region: OcrRegion,
  mode: PrepMode = 'bright',
  scale = 4,
): HTMLCanvasElement {
  const { sw, sh } = sourceSize(source)
  const { padX: pxF, padY: pyF } = padFactors(region.id)

  const padX = region.w * pxF
  const padY = region.h * pyF
  let x0 = Math.max(0, region.x - padX)
  let y0 = Math.max(0, region.y - padY)
  let x1 = Math.min(1, region.x + region.w + padX)
  let y1 = Math.min(1, region.y + region.h + padY)
  // Negative pad (kill inset) can collapse a tiny box — fall back to raw region
  if (x1 - x0 < region.w * 0.35) {
    x0 = region.x
    x1 = region.x + region.w
  }
  if (y1 - y0 < region.h * 0.35) {
    y0 = region.y
    y1 = region.y + region.h
  }

  const sx = Math.floor(x0 * sw)
  const sy = Math.floor(y0 * sh)
  const rw = Math.max(2, Math.floor((x1 - x0) * sw))
  const rh = Math.max(2, Math.floor((y1 - y0) * sh))

  // Target a readable glyph height (~28–40px) for team kills / clock
  const targetH = isKdaField(region.id) ? 36 : 40
  const autoScale = Math.max(scale, Math.ceil(targetH / Math.max(1, rh)))
  const useScale = Math.min(8, autoScale)

  const out = document.createElement('canvas')
  out.width = Math.max(48, rw * useScale)
  out.height = Math.max(24, rh * useScale)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = mode === 'invert' ? '#fff' : '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, sx, sy, rw, rh, 0, 0, out.width, out.height)

  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  const gray = new Float32Array(out.width * out.height)
  let sum = 0
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    // White and gold HUD digits both stay bright. Blue weight was washing gold out.
    const g = Math.max(d[i]!, d[i + 1]!, d[i + 2]! * 0.85)
    gray[p] = g
    sum += g
  }
  const mean = sum / gray.length

  // Percentile stretch for thin white HUD text on dark panels
  const sorted = Float32Array.from(gray).sort()
  const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? 0
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 255
  const span = Math.max(14, p95 - p5)

  // Otsu-ish threshold from mid histogram for bright mode
  let otsu = 120
  {
    const hist = new Array(256).fill(0) as number[]
    for (let p = 0; p < gray.length; p++) {
      const g = Math.max(0, Math.min(255, Math.round(((gray[p]! - p5) / span) * 255)))
      hist[g]!++
    }
    let best = 0
    let bestT = 120
    const total = gray.length
    let sumB = 0
    let wB = 0
    let sumAll = 0
    for (let i = 0; i < 256; i++) sumAll += i * hist[i]!
    for (let t = 1; t < 255; t++) {
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
    otsu = bestT
  }

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let g = ((gray[p]! - p5) / span) * 255
    g = Math.max(0, Math.min(255, g))

    if (mode === 'invert') {
      g = 255 - g
    }

    let v: number
    if (mode === 'soft') {
      v = g < mean * 0.55 ? 0 : g > mean * 1.15 ? 255 : g
    } else if (mode === 'invert') {
      v = g < 145 ? 0 : 255
    } else {
      // Bright digits on black — Otsu + soft floor so thin "1" survives
      const hi = Math.max(95, otsu - 8)
      v = g >= hi ? 255 : g < hi - 35 ? 0 : g >= hi - 18 ? 255 : 0
    }

    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }

  if (mode === 'bright') {
    thickenBright(d, out.width, out.height)
  }

  ctx.putImageData(img, 0, 0)
  return out
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

  let m = cleaned.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) {
    const digits = cleaned.replace(/:/g, '')
    if (digits.length === 3) {
      const min = Number(digits[0])
      const sec = Number(digits.slice(1))
      if (sec <= 59) return min * 60 + sec
      return null
    }
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

/** Team kills: one or two digits. Prefer the smallest sane token (HUD is 0–99). */
export function parseKillStat(raw: string): number | null {
  const cleaned = fixOcrDigits(raw).replace(/[^\d\s]/g, ' ').trim()
  const groups = cleaned.match(/\d+/g) ?? []
  if (!groups.length) return null

  // Prefer a lone 1–2 digit group over longer junk from gold bleed
  const candidates = groups
    .map((g) => {
      if (g.length === 1) return Number(g)
      if (g.length === 2) {
        // "2" read as "22"
        if (g[0] === g[1]) return Number(g[0])
        return Number(g)
      }
      // "9441" gold bleed — take only the last digit (kill badge is 0–9 early, teens late)
      if (g.length >= 3) {
        return Number(g.slice(-1))
      }
      return null
    })
    .filter((n): n is number => n != null && Number.isFinite(n) && n >= 0 && n <= 99)

  if (!candidates.length) return null
  // Shortest plausible: prefer single digit when present and ≤ 9
  const singles = candidates.filter((n) => n <= 9)
  if (singles.length === 1) return singles[0]!
  if (singles.length > 1) {
    // majority among singles
    const tallies = new Map<number, number>()
    for (const n of singles) tallies.set(n, (tallies.get(n) ?? 0) + 1)
    let best = singles[0]!
    let hits = 0
    for (const [n, h] of tallies) {
      if (h > hits) {
        best = n
        hits = h
      }
    }
    return best
  }
  return candidates[0]!
}

export function parseIntStat(raw: string): number | null {
  const digits = fixOcrDigits(raw).replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return Math.min(999, n)
}

/** Accepts $1500, $ 1500, 6800, 6.8k, 6,8k */
export function parseGoldStat(raw: string): number | null {
  let t = fixOcrDigits(raw)
    .replace(/[$,\s]/g, '')
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
    // 4 digits: 10/2/3 → 1023
    if (only.length === 4) {
      return {
        kills: Number(only.slice(0, 2)),
        deaths: Number(only[2]),
        assists: Number(only[3]),
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
    return { value, kda: null, ok: value != null }
  }
  if (field === 'blueGold' || field === 'redGold') {
    const value = parseGoldStat(raw)
    return { value, kda: null, ok: value != null }
  }
  if (field === 'blueTowers' || field === 'redTowers') {
    const value = parseIntStat(raw)
    if (value == null || value > 8) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  if (field === 'blueSeries' || field === 'redSeries') {
    const value = parseIntStat(raw)
    if (value == null || value > 5) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  if (field === 'blueKills' || field === 'redKills') {
    const value = parseKillStat(raw)
    if (value == null || value > 99) return { value: null, kda: null, ok: false }
    return { value, kda: null, ok: true }
  }
  const value = parseIntStat(raw)
  return { value, kda: null, ok: value != null }
}

function whitelistFor(field: OcrField): string {
  if (field === 'clock') return '0123456789:.'
  if (field === 'blueGold' || field === 'redGold') return '0123456789.$kKmM'
  if (isKdaField(field)) return '0123456789/ '
  return '0123456789'
}

function modesFor(field: OcrField): PrepMode[] {
  // Prefer one fast pass; fall back only when needed
  if (field === 'clock' || isKillField(field)) return ['bright', 'invert']
  if (field === 'blueGold' || field === 'redGold') return ['bright']
  if (isKdaField(field)) return ['bright', 'invert']
  return ['bright']
}

function looksClean(a: Attempt, field: OcrField): boolean {
  const raw = a.raw.replace(/\s+/g, '')
  if (!a.ok || !raw) return false
  if (field === 'clock') {
    // Accept any raw that parses to a valid match clock (yellow HUD OCR is noisy)
    return a.value != null && a.value >= 0 && a.value <= 80 * 60
  }
  if (/[a-hj-ln-zA-HJ-LN-Z]/.test(raw)) return false
  if (isKillField(field)) {
    if (a.value == null) return false
    return a.value >= 0 && a.value <= 99
  }
  if (field === 'blueGold' || field === 'redGold') {
    return /^\$?\d{2,6}$/.test(raw) || /^\d{1,3}(\.\d)?[kKmM]$/.test(raw)
  }
  if (isKdaField(field)) return /^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(raw)
  return /^\d{1,2}$/.test(raw)
}

function isKillField(field: OcrField) {
  return field === 'blueKills' || field === 'redKills'
}

type Attempt = {
  raw: string
  confidence: number
  value: number | null
  kda: OcrKda | null
  ok: boolean
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
    return {
      raw,
      confidence,
      value: parsed.value,
      kda: parsed.kda,
      ok: parsed.ok,
    }
  } catch {
    // Worker dies on HMR / tab freeze — rebuild once and skip this attempt
    await destroyOcrWorker()
    return {
      raw: '',
      confidence: 0,
      value: null,
      kda: null,
      ok: false,
    }
  }
}

function scoreAttempt(a: Attempt, field: OcrField): number {
  if (!a.ok) return a.confidence * 0.15
  let score = 40 + a.confidence + (a.raw.length > 0 ? 5 : 0)
  if (isKillField(field) && a.value != null) {
    const raw = a.raw.replace(/\s+/g, '')
    // Prefer real HUD digits — penalize doubles ("22") and long bleed ("9441")
    if (/^(\d)\1$/.test(raw)) score -= 40
    if (raw.replace(/\D/g, '').length > 2) score -= 25
    if (a.value <= 9) score += 28
    else if (a.value <= 99) score += 14
  }
  if (field === 'clock' && a.value != null) score += 15
  if (isKdaField(field) && a.kda) score += 20
  return score
}

function strongEnough(a: Attempt, field: OcrField): boolean {
  if (!a.ok) return false
  // Same bar as clock: a clean parse is enough to stop hunting
  if (looksClean(a, field)) return true
  return a.confidence >= 62
}

export async function readRegion(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  region: OcrRegion,
): Promise<OcrReading> {
  const attempts: Attempt[] = []
  const modes = modesFor(region.id)
  const psms =
    region.id === 'clock' || isKillField(region.id)
      ? ['7']
      : isKdaField(region.id)
        ? ['7']
        : ['7']
  const scale =
    region.id === 'clock' || isKillField(region.id) ? 4 : 3

  for (const mode of modes) {
    const crop = preprocessCrop(source, region, mode, scale)
    for (const psm of psms) {
      try {
        attempts.push(await recognizeOnce(crop, region.id, psm))
      } catch {
        /* try next */
      }
    }
    const bestSoFar = attempts.reduce(
      (b, a) =>
        scoreAttempt(a, region.id) > scoreAttempt(b, region.id) ? a : b,
      attempts[0]!,
    )
    if (bestSoFar && strongEnough(bestSoFar, region.id)) break
  }

  if (!attempts.length) {
    return {
      field: region.id,
      raw: '',
      value: null,
      kda: null,
      ok: false,
      confidence: 0,
    }
  }

  const best = attempts.reduce((b, a) =>
    scoreAttempt(a, region.id) > scoreAttempt(b, region.id) ? a : b,
  )

  // Majority vote among ok kill parses — beat a one-off "7"
  let chosen = best
  if (isKillField(region.id)) {
    const okVals = attempts.filter(
      (a) => a.ok && a.value != null && a.value <= 99,
    )
    if (okVals.length >= 2) {
      const tallies = new Map<number, { hits: number; conf: number; a: Attempt }>()
      for (const a of okVals) {
        const v = a.value!
        const cur = tallies.get(v)
        if (!cur) tallies.set(v, { hits: 1, conf: a.confidence, a })
        else {
          cur.hits++
          cur.conf += a.confidence
          if (a.confidence > cur.a.confidence) cur.a = a
        }
      }
      let winner: { hits: number; conf: number; a: Attempt } | null = null
      for (const t of tallies.values()) {
        if (
          !winner ||
          t.hits > winner.hits ||
          (t.hits === winner.hits && t.conf > winner.conf)
        ) {
          winner = t
        }
      }
      if (winner && (winner.hits >= 2 || scoreAttempt(winner.a, region.id) >= scoreAttempt(best, region.id))) {
        chosen = winner.a
      }
    }
  }

  const ok =
    chosen.ok &&
    (looksClean(chosen, region.id) ||
      (region.id === 'clock' && chosen.value != null) ||
      chosen.confidence >= 70)
  let confidence = chosen.confidence
  if (ok && looksClean(chosen, region.id)) {
    confidence = Math.max(confidence, 78)
  }

  return {
    field: region.id,
    raw: chosen.raw,
    value: ok ? chosen.value : null,
    kda: ok ? chosen.kda : null,
    ok,
    confidence,
  }
}

export async function readAllRegions(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  regions: OcrRegion[],
): Promise<OcrReading[]> {
  const enabled = regions.filter((r) => r.enabled && r.w >= 0.008 && r.h >= 0.008)
  // Top bar first (fewer, more important), then KDA
  const ordered = [
    ...enabled.filter((r) => !isKdaField(r.id)),
    ...enabled.filter((r) => isKdaField(r.id)),
  ]
  const out: OcrReading[] = []
  for (const region of ordered) {
    try {
      out.push(await readRegion(source, region))
    } catch {
      out.push({
        field: region.id,
        raw: '',
        value: null,
        kda: null,
        ok: false,
        confidence: 0,
      })
    }
  }
  return out
}

export function grabVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  // Keep HUD digits sharp — 720p was making "13" read as "7"
  const maxW = 1920
  const scale = w > maxW ? maxW / w : 1
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  const ctx = c.getContext('2d', { alpha: false })!
  ctx.imageSmoothingEnabled = scale < 1
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, 0, 0, c.width, c.height)
  return c
}

/** Debug: return the preprocessed crop canvas for the selected region. */
export function previewRegionCrop(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  region: OcrRegion,
  mode: PrepMode = 'bright',
): HTMLCanvasElement {
  return preprocessCrop(source, region, mode, 4)
}
