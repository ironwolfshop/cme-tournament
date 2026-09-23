/**
 * Download default-skin splash art for every hero and write face-cropped
 * portraits into public/heroes/.
 *
 * Run: node scripts/download-hero-portraits.mjs
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'heroes')
const faceDir = path.join(outDir, 'face')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, { headers: { 'User-Agent': 'mlbb-obs-hero-dl' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlinkSync(dest)
          download(res.headers.location, dest).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlinkSync(dest)
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
      })
      .on('error', (err) => {
        try {
          fs.unlinkSync(dest)
        } catch {
          /* ignore */
        }
        reject(err)
      })
  })
}

/** Upper-frame face crop → square PNG via sharp when available. */
async function faceCrop(srcPath, destPath) {
  let sharp
  try {
    const require = createRequire(import.meta.url)
    sharp = require('sharp')
  } catch {
    fs.copyFileSync(srcPath, destPath)
    return 'copy'
  }

  const img = sharp(srcPath)
  const meta = await img.metadata()
  const w = meta.width || 1
  const h = meta.height || 1
  // Focus on upper torso / face region of loading splash
  const cropW = Math.min(w, Math.round(h * 0.72))
  const cropH = Math.min(h, Math.round(w * 0.85))
  const left = Math.max(0, Math.round((w - cropW) / 2))
  const top = Math.max(0, Math.round(h * 0.06))
  const height = Math.min(cropH, h - top)
  const width = Math.min(cropW, w - left)

  await sharp(srcPath)
    .extract({ left, top, width, height })
    .resize(512, 512, { fit: 'cover', position: 'top' })
    .png()
    .toFile(destPath)
  return 'crop'
}

async function main() {
  const heroesMod = await import(
    pathToFileURL(path.join(root, 'src', 'data', 'heroes.ts')).href
  ).catch(() => null)

  // Prefer compiled-free: read splash map + heroes list via dynamic import of .ts may fail.
  // Use splashMap + a simple regex parse of heroes.ts instead.
  const splashPath = path.join(root, 'src', 'data', 'splashMap.ts')
  const heroesPath = path.join(root, 'src', 'data', 'heroes.ts')
  const splashSrc = fs.readFileSync(splashPath, 'utf8')
  const heroesSrc = fs.readFileSync(heroesPath, 'utf8')

  const splashJson = splashSrc.match(
    /SPLASH_BY_HERO_NAME:\s*Record<string,\s*SplashRef>\s*=\s*(\{[\s\S]*?\n\})/,
  )
  if (!splashJson) throw new Error('Could not parse splashMap')
  const splashMap = JSON.parse(splashJson[1])

  const splashUrl = (folder, file) =>
    `https://raw.githubusercontent.com/Sparkies01/Splash/main/${encodeURIComponent(folder)}/${encodeURIComponent(file)}.png`

  /** @type {{ id: string, name: string }[]} */
  const heroes = []
  const re =
    /\{\s*id:\s*'([^']+)',\s*name:\s*"([^"]+)"\s*,\s*role:|\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'\s*,\s*role:/g
  let m
  while ((m = re.exec(heroesSrc))) {
    const id = m[1] || m[3]
    const name = m[2] || m[4]
    if (id && name) heroes.push({ id, name })
  }
  // Deduplicate by id
  const unique = [...new Map(heroes.map((h) => [h.id, h])).values()]

  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(faceDir, { recursive: true })

  let ok = 0
  let miss = 0
  for (const hero of unique) {
    const ref = splashMap[hero.name]
    if (!ref) {
      console.warn(`No splash for ${hero.name}`)
      miss++
      continue
    }
    const fullPath = path.join(outDir, `${hero.id}.png`)
    const facePath = path.join(faceDir, `${hero.id}.png`)
    const url = splashUrl(ref.folder, ref.file)
    try {
      if (!fs.existsSync(fullPath)) {
        process.stdout.write(`↓ ${hero.name}… `)
        await download(url, fullPath)
      } else {
        process.stdout.write(`= ${hero.name}… `)
      }
      const mode = await faceCrop(fullPath, facePath)
      console.log(mode)
      ok++
    } catch (e) {
      console.log(`FAIL ${e.message || e}`)
      miss++
    }
  }

  console.log(`\nDone: ${ok} heroes, ${miss} missing → ${outDir}`)
  void heroesMod
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
