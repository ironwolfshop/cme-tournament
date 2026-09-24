/**
 * Durable app storage — IndexedDB primary, localStorage mirror when it fits.
 * Photos / full tournament payloads exceed localStorage (~5MB) and were silently dropped.
 */

const DB_NAME = 'cme-obs-storage'
const DB_VERSION = 1
const STORE = 'kv'

type KvRecord = { key: string; value: unknown; updatedAt: number }

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
    })
  }
  return dbPromise
}

async function idbGet<T>(key: string): Promise<{ value: T; updatedAt: number } | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const row = req.result as KvRecord | undefined
        if (!row) {
          resolve(null)
          return
        }
        resolve({ value: row.value as T, updatedAt: row.updatedAt || 0 })
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSet(key: string, value: unknown, updatedAt = Date.now()): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, value, updatedAt } satisfies KvRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, raw: string): boolean {
  try {
    localStorage.setItem(key, raw)
    return true
  } catch {
    // Quota or private mode — drop the mirror, IndexedDB still holds data.
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return false
  }
}

/** Sync read for store boot — localStorage first (fast), may be incomplete if quota failed. */
export function loadJsonSync<T>(key: string): T | null {
  const raw = lsGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Async durable read — prefers IndexedDB, falls back to localStorage. */
export async function loadJson<T>(key: string): Promise<T | null> {
  const fromIdb = await idbGet<T>(key)
  if (fromIdb) return fromIdb.value
  return loadJsonSync<T>(key)
}

/**
 * Persist JSON. Always writes IndexedDB; mirrors to localStorage when it fits.
 * Returns whether durable (IDB) write succeeded.
 */
export async function saveJson(key: string, value: unknown): Promise<{
  idb: boolean
  local: boolean
}> {
  const updatedAt = Date.now()
  const idb = await idbSet(key, value, updatedAt)
  let local = false
  try {
    local = lsSet(key, JSON.stringify(value))
  } catch {
    local = false
  }
  return { idb, local }
}

/** Fire-and-forget save used by Zustand actions (keeps call sites sync). */
export function saveJsonFire(key: string, value: unknown) {
  void saveJson(key, value)
}

/** Resize + JPEG-compress an image File/dataURL for durable storage. */
export async function compressImageFile(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const maxEdge = opts?.maxEdge ?? 720
  const quality = opts?.quality ?? 0.82
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return readFileAsDataUrl(file)
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export type BackupBundle = {
  version: 1
  exportedAt: number
  channels: Record<string, unknown>
}

const BACKUP_KEYS = [
  'mlbb-tournament-state-v2',
  'mlbb-bracket-state-v1',
  'mlbb-draft-state-v3',
  'mlbb-lineup-state-v4',
  'mlbb-gameplay-state-v3',
  'mlbb-team-cams-v2',
  'mlbb-casters-v2',
  'mlbb-ocr-regions-v8',
] as const

export async function exportAllData(): Promise<BackupBundle> {
  const channels: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    channels[key] = await loadJson(key)
  }
  return { version: 1, exportedAt: Date.now(), channels }
}

export async function importAllData(bundle: BackupBundle): Promise<number> {
  if (!bundle || bundle.version !== 1 || !bundle.channels) return 0
  let n = 0
  for (const [key, value] of Object.entries(bundle.channels)) {
    if (value == null) continue
    await saveJson(key, value)
    n += 1
  }
  return n
}

export function downloadBackup(bundle: BackupBundle, filename?: string) {
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download =
    filename ??
    `cme-obs-backup-${new Date(bundle.exportedAt).toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
