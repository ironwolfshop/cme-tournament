type ProgressFn = (pct: number, stage?: string) => void

let cancelled = false
let modelReady: Promise<void> | null = null
let cachedPublicPath: string | null = null

const CDN_PUBLIC_PATH =
  'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/'

const BG_BASE = {
  model: 'isnet' as const,
  device: 'gpu' as const,
  output: {
    format: 'image/png' as const,
    quality: 1,
    type: 'foreground' as const,
  },
}

/**
 * IMG.LY resolves relative image URLs against `publicPath` (their CDN),
 * so `/form-media/foo.jpg` becomes a 404 HTML page → "Invalid format: text/html".
 * Always hand the library a Blob.
 */
async function toImageBlob(source: string | Blob | File): Promise<Blob> {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source

  const raw = String(source)
  if (raw.startsWith('data:') || raw.startsWith('blob:')) {
    const res = await fetch(raw)
    if (!res.ok) throw new Error(`Could not read image (${res.status})`)
    return res.blob()
  }

  const absolute = /^https?:\/\//i.test(raw)
    ? raw
    : new URL(
        raw,
        typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost:5173',
      ).href

  const res = await fetch(absolute, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Could not load photo (${res.status})`)
  const blob = await res.blob()
  if (!blob.type || blob.type.startsWith('text/')) {
    throw new Error(
      `Photo URL returned ${blob.type || 'unknown'} instead of an image.`,
    )
  }
  return blob
}

async function resolvePublicPath(): Promise<string> {
  try {
    const probe = await fetch('/bg-removal/resources.json', {
      method: 'GET',
      cache: 'no-store',
    })
    if (probe.ok) {
      const ct = (probe.headers.get('content-type') || '').toLowerCase()
      // Vite SPA fallback can return 200 HTML for missing static files —
      // that must NOT count as a local model pack.
      if (ct.includes('application/json') || ct.includes('text/json')) {
        return typeof window !== 'undefined'
          ? `${window.location.origin}/bg-removal/`
          : '/bg-removal/'
      }
      const head = (await probe.text()).slice(0, 32).trimStart()
      if (head.startsWith('{')) {
        return typeof window !== 'undefined'
          ? `${window.location.origin}/bg-removal/`
          : '/bg-removal/'
      }
    }
  } catch {
    /* CDN */
  }
  return CDN_PUBLIC_PATH
}

async function publicPath(): Promise<string> {
  if (!cachedPublicPath) cachedPublicPath = await resolvePublicPath()
  return cachedPublicPath
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read cutout'))
    reader.readAsDataURL(blob)
  })
}

async function loadBgLib() {
  const mod = await import('@imgly/background-removal')
  return {
    preload: mod.preload,
    removeBackground: mod.removeBackground,
  }
}

function throwIfCancelled() {
  if (cancelled) throw new Error('cancelled')
}

/** Abort in-flight preload / remove calls (best-effort). */
export function cancelBgRemover() {
  cancelled = true
  modelReady = null
}

/** Warm the ONNX model once (first call downloads assets, then cached). */
export function preloadBgRemover(onProgress?: ProgressFn): Promise<void> {
  cancelled = false
  if (!modelReady) {
    modelReady = (async () => {
      const { preload } = await loadBgLib()
      throwIfCancelled()
      onProgress?.(0, 'Downloading AI model…')
      await preload({
        ...BG_BASE,
        publicPath: await publicPath(),
        progress: (key, current, total) => {
          if (!total) return
          const pct = Math.round((current / total) * 100)
          onProgress?.(pct, `Downloading AI model… ${pct}%`)
          void key
        },
      })
      throwIfCancelled()
      onProgress?.(100, 'AI model ready')
    })().catch((err) => {
      modelReady = null
      throw err
    })
  }
  return modelReady
}

/**
 * Remove photo background in-browser. Returns a PNG data URL with alpha.
 * Source can be a File, Blob, or data/http URL (relative or absolute).
 */
export async function removePhotoBackground(
  source: string | Blob | File,
  onProgress?: ProgressFn,
): Promise<string> {
  cancelled = false
  const { removeBackground } = await loadBgLib()
  throwIfCancelled()
  onProgress?.(0, 'Loading photo…')
  const image = await toImageBlob(source)
  throwIfCancelled()

  const base = { ...BG_BASE, publicPath: await publicPath() }
  const run = (device: 'gpu' | 'cpu') =>
    removeBackground(image, {
      ...base,
      device,
      progress: (key, current, total) => {
        if (!total) return
        const pct = Math.round((current / total) * 100)
        const stage = String(key).includes('fetch')
          ? `Preparing AI model… ${pct}%`
          : `Removing background… ${pct}%`
        onProgress?.(pct, stage)
      },
    })

  onProgress?.(5, 'Removing background with high-quality model…')
  try {
    const blob = await run('gpu')
    throwIfCancelled()
    onProgress?.(100, 'Cutout ready')
    return blobToDataUrl(blob)
  } catch (gpuErr) {
    throwIfCancelled()
    if (gpuErr instanceof Error && /cancelled/i.test(gpuErr.message)) throw gpuErr
    onProgress?.(10, 'Retrying on CPU…')
    try {
      const blob = await run('cpu')
      throwIfCancelled()
      onProgress?.(100, 'Cutout ready')
      return blobToDataUrl(blob)
    } catch (cpuErr) {
      throwIfCancelled()
      const msg =
        cpuErr instanceof Error
          ? cpuErr.message
          : gpuErr instanceof Error
            ? gpuErr.message
            : 'Background removal failed'
      throw new Error(msg)
    }
  }
}
