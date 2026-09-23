import { create } from 'zustand'
import {
  defaultOcrRegions,
  isActiveOcrField,
  isKdaField,
  parseKdaField,
  type OcrField,
  type OcrKda,
  type OcrReading,
  type OcrRegion,
} from '../lib/gameplayOcr'
import { useGameplayStore } from './gameplayStore'

export type OcrUiState = {
  regions: OcrRegion[]
  intervalMs: number
  running: boolean
  lastReadings: OcrReading[]
  lastError: string
  selectedField: OcrField
  status: string
  /** Pending candidates that must repeat before apply (anti-flicker). */
  pending: Partial<
    Record<
      OcrField,
      { key: string; hits: number; reading: OcrReading }
    >
  >
}

type Actions = {
  setIntervalMs: (ms: number) => void
  setRunning: (v: boolean) => void
  setSelectedField: (f: OcrField) => void
  setStatus: (s: string) => void
  setLastError: (s: string) => void
  setLastReadings: (r: OcrReading[]) => void
  updateRegion: (id: OcrField, patch: Partial<OcrRegion>) => void
  /** Clear one field’s map (unmapped) and persist. */
  clearRegion: (id: OcrField) => void
  /** Finish a drag map and persist once. */
  commitRegion: (
    id: OcrField,
    box: { x: number; y: number; w: number; h: number },
  ) => void
  resetRegions: () => void
  applyReadings: (readings: OcrReading[]) => void
}

const STORAGE_KEY = 'mlbb-ocr-regions-v8'
const INTERVAL_KEY = 'mlbb-ocr-interval-v1'

function loadRegions(): OcrRegion[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('mlbb-ocr-regions-v7') ??
      localStorage.getItem('mlbb-ocr-regions-v6') ??
      localStorage.getItem('mlbb-ocr-regions-v5')
    if (!raw) return defaultOcrRegions()
    const parsed = JSON.parse(raw) as OcrRegion[]
    if (!Array.isArray(parsed) || !parsed.length) return defaultOcrRegions()
    const defaults = defaultOcrRegions()
    return defaults.map((d) => {
      const found = parsed.find((p) => p.id === d.id && isActiveOcrField(p.id))
      if (!found) return d
      return {
        ...d,
        x: Number(found.x) || 0,
        y: Number(found.y) || 0,
        w: Number(found.w) || 0,
        h: Number(found.h) || 0,
        enabled: Boolean(found.enabled),
        id: d.id,
        label: d.label,
      }
    })
  } catch {
    return defaultOcrRegions()
  }
}

function saveRegions(regions: OcrRegion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(regions))
  } catch {
    /* ignore */
  }
}

function loadIntervalMs() {
  try {
    const n = Number(localStorage.getItem(INTERVAL_KEY))
    if (Number.isFinite(n) && n >= 800 && n <= 15000) return n
  } catch {
    /* ignore */
  }
  return 1200
}

function saveIntervalMs(ms: number) {
  try {
    localStorage.setItem(INTERVAL_KEY, String(ms))
  } catch {
    /* ignore */
  }
}

function readingKey(r: OcrReading): string {
  if (r.kda) return `kda:${r.kda.kills}/${r.kda.deaths}/${r.kda.assists}`
  return `v:${r.value}`
}

function kdaEqual(a: OcrKda, b: OcrKda) {
  return a.kills === b.kills && a.deaths === b.deaths && a.assists === b.assists
}

/** Fields that have already been written from OCR. Placeholders are not locked. */
const lockedFields = new Set<OcrField>()

function isClean(reading: OcrReading): boolean {
  const raw = reading.raw.replace(/\s+/g, '')
  if (!reading.ok || !raw) return false
  if (reading.field === 'clock') {
    // Yellow MLBB clock often OCR's with noise — trust a successful parse
    return (
      reading.value != null &&
      reading.value >= 0 &&
      reading.value <= 80 * 60
    )
  }
  // Drop letter garbage like "unknown" / HUD labels leaking into the box
  if (/[a-hj-ln-zA-HJ-LN-Z]/.test(raw)) return false
  if (reading.field === 'blueKills' || reading.field === 'redKills') {
    return (
      reading.value != null &&
      reading.value >= 0 &&
      reading.value <= 99
    )
  }
  if (reading.field === 'blueGold' || reading.field === 'redGold') {
    return /^\$?\d{2,6}$/.test(raw) || /^\d{1,3}(\.\d)?[kKmM]$/.test(raw)
  }
  if (isKdaField(reading.field)) return /^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(raw)
  return /^\d{1,2}$/.test(raw)
}

function clockClose(next: number, current: number) {
  const delta = next - current
  return delta >= -4 && delta <= 25
}

/** Team kills almost only climb; allow tiny OCR rewind, block wild jumps. */
function killClose(next: number, current: number) {
  if (current <= 0) return next <= 30
  if (next < current - 1) return false
  if (next > current + 6) return false
  return true
}

function goldClose(next: number, current: number) {
  if (current < 400) return next <= 20000
  return next >= current * 0.55 && next <= current * 1.85
}

export const useOcrStore = create<OcrUiState & Actions>((set, get) => ({
  regions: loadRegions(),
  intervalMs: loadIntervalMs(),
  running: false,
  lastReadings: [],
  lastError: '',
  selectedField: 'clock',
  status: 'Idle',
  pending: {},

  setIntervalMs: (intervalMs) => {
    const ms = Math.max(800, Math.min(15000, intervalMs))
    saveIntervalMs(ms)
    set({ intervalMs: ms })
  },
  setRunning: (running) => set({ running }),
  setSelectedField: (selectedField) => set({ selectedField }),
  setStatus: (status) => set({ status }),
  setLastError: (lastError) => set({ lastError }),
  setLastReadings: (lastReadings) => set({ lastReadings }),

  updateRegion: (id, patch) => {
    const regions = get().regions.map((r) =>
      r.id === id ? { ...r, ...patch, id } : r,
    )
    saveRegions(regions)
    set({ regions })
  },

  /** Commit a finished drag map and persist (avoids save-on-every-mousemove). */
  commitRegion: (id, box) => {
    const regions = get().regions.map((r) =>
      r.id === id
        ? {
            ...r,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            enabled: true,
            id,
          }
        : r,
    )
    saveRegions(regions)
    set({ regions, status: 'Region saved' })
  },

  clearRegion: (id) => {
    const regions = get().regions.map((r) =>
      r.id === id
        ? { ...r, x: 0, y: 0, w: 0, h: 0, enabled: false }
        : r,
    )
    const pending = { ...get().pending }
    delete pending[id]
    lockedFields.delete(id)
    saveRegions(regions)
    set({
      regions,
      pending,
      lastReadings: get().lastReadings.filter((x) => x.field !== id),
      status: 'Region map removed',
    })
  },

  resetRegions: () => {
    const regions = defaultOcrRegions()
    saveRegions(regions)
    lockedFields.clear()
    set({ regions, pending: {}, lastReadings: [], status: 'All maps cleared' })
  },

  applyReadings: (readings) => {
    const gp = useGameplayStore.getState()
    let pending = { ...get().pending }
    let applied = 0
    const blue: { kills?: number; gold?: number; towers?: number; seriesScore?: number } = {}
    const red: { kills?: number; gold?: number; towers?: number; seriesScore?: number } = {}
    const players: {
      side: 'blue' | 'red'
      index: number
      kills: number
      deaths: number
      assists: number
    }[] = []
    let gameTimeSeconds: number | undefined
    let timerRunning: boolean | undefined

    const remember = (field: OcrField, reading: OcrReading) => {
      const key = readingKey(reading)
      const prev = pending[field]
      if (prev && prev.key === key) {
        pending = { ...pending, [field]: { key, hits: prev.hits + 1, reading } }
        return prev.hits + 1
      }
      pending = { ...pending, [field]: { key, hits: 1, reading } }
      return 1
    }

    const acceptField = (field: OcrField) => {
      const next = { ...pending }
      delete next[field]
      pending = next
      lockedFields.add(field)
      applied++
    }

    for (const r of readings) {
      if (!r.ok) continue
      // Never push letter garbage / HUD labels onto the overlay
      if (!isClean(r) && r.confidence < 82) {
        remember(r.field, r)
        continue
      }
      const hits = remember(r.field, r)
      const repeated = hits >= 2
      const clean = isClean(r)

      if (isKdaField(r.field) && r.kda) {
        if (!clean && !repeated) continue
        const { side, index } = parseKdaField(r.field)
        const cur = gp[side].players[index]
        acceptField(r.field)
        if (!cur || !kdaEqual(cur, r.kda)) {
          players.push({ side, index, ...r.kda })
        }
        continue
      }

      if (r.value == null) continue

      if (r.field === 'clock') {
        if (r.value < 0 || r.value > 80 * 60) continue
        const locked = lockedFields.has('clock')
        if (locked && !clockClose(r.value, gp.gameTimeSeconds) && hits < 2) {
          continue
        }
        acceptField('clock')
        gameTimeSeconds = r.value
        timerRunning = true
        continue
      }

      // Team kill counters — same sticky apply style as the clock
      if (r.field === 'blueKills' || r.field === 'redKills') {
        if (r.value < 0 || r.value > 99) continue
        const side = r.field === 'blueKills' ? 'blue' : 'red'
        const locked = lockedFields.has(r.field)
        if (locked && !killClose(r.value, gp[side].kills) && hits < 2) {
          continue
        }
        // First lock: need a clean parse or a repeated identical read
        if (!locked && !clean && !repeated) continue
        acceptField(r.field)
        ;(side === 'blue' ? blue : red).kills = r.value
        continue
      }

      if (r.field === 'blueGold' || r.field === 'redGold') {
        if (r.value < 0 || r.value > 150000) continue
        if (!clean && !repeated) continue
        const side = r.field === 'blueGold' ? 'blue' : 'red'
        const locked = lockedFields.has(r.field)
        if (locked && !goldClose(r.value, gp[side].gold) && !repeated) continue
        if (!locked && r.value < 100 && !repeated) continue
        acceptField(r.field)
        ;(side === 'blue' ? blue : red).gold = r.value
        continue
      }

      if (!clean && !repeated) continue

      switch (r.field) {
        case 'blueTowers':
          acceptField(r.field)
          blue.towers = Math.min(8, r.value)
          break
        case 'redTowers':
          acceptField(r.field)
          red.towers = Math.min(8, r.value)
          break
        case 'blueSeries':
          acceptField(r.field)
          blue.seriesScore = r.value
          break
        case 'redSeries':
          acceptField(r.field)
          red.seriesScore = r.value
          break
        default:
          break
      }
    }

    const hasTeam = Object.keys(blue).length + Object.keys(red).length > 0
    const hasPatch =
      gameTimeSeconds != null || timerRunning != null || hasTeam || players.length > 0
    if (hasPatch) {
      useGameplayStore.getState().applyOcrHud({
        gameTimeSeconds,
        timerRunning,
        blue: hasTeam ? blue : undefined,
        red: hasTeam ? red : undefined,
        players: players.length ? players : undefined,
      })
    }

    const merged = new Map(get().lastReadings.map((x) => [x.field, x]))
    for (const r of readings) merged.set(r.field, r)
    const good = readings.filter((x) => x.ok && isClean(x)).length
    set({
      lastReadings: [...merged.values()],
      pending,
      status: hasPatch
        ? `Overlay updated · ${applied} stats`
        : good
          ? 'Reading… waiting for a stable number'
          : 'No clear digits in the mapped boxes',
    })
  },
}))
