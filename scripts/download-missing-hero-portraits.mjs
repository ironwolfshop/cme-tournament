/**
 * Download splash + face crops for heroes missing from public/heroes/.
 * Run: node scripts/download-missing-hero-portraits.mjs
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
          try {
            fs.unlinkSync(dest)
          } catch {
            /* ignore */
          }
          download(res.headers.location, dest).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {
            /* ignore */
          }
          reject(new Error(`HTTP ${res.statusCode}`))
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

const splashSrc = fs.readFileSync(path.join(root, 'src/data/splashMap.ts'), 'utf8')
const splashJson = splashSrc.match(
  /SPLASH_BY_HERO_NAME:\s*Record<string,\s*SplashRef>\s*=\s*(\{[\s\S]*?\n\})/,
)
if (!splashJson) throw new Error('Could not parse splashMap')
const splashMap = JSON.parse(splashJson[1])

const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.ts'), 'utf8')
const heroes = []
const re =
  /\{\s*id:\s*'([^']+)',\s*name:\s*(?:"([^"]+)"|'([^']+)')/g
let m
while ((m = re.exec(heroesSrc))) heroes.push({ id: m[1], name: m[2] || m[3] })

const ONLY = process.argv.slice(2)
const targets = ONLY.length
  ? heroes.filter((h) => ONLY.includes(h.id) || ONLY.includes(h.name))
  : heroes.filter((h) => !fs.existsSync(path.join(faceDir, `${h.id}.png`)))

fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(faceDir, { recursive: true })

const splashUrl = (folder, file) =>
  `https://raw.githubusercontent.com/Sparkies01/Splash/main/${encodeURIComponent(folder)}/${encodeURIComponent(file)}.png`

let ok = 0
let miss = 0
for (const hero of targets) {
  const ref = splashMap[hero.name]
  const fullPath = path.join(outDir, `${hero.id}.png`)
  const facePath = path.join(faceDir, `${hero.id}.png`)
  try {
    if (!ref) {
      if (fs.existsSync(fullPath)) {
        process.stdout.write(`= ${hero.name} (local only)… `)
        const mode = await faceCrop(fullPath, facePath)
        console.log(mode)
        ok++
        continue
      }
      console.warn(`No splash for ${hero.name}`)
      miss++
      continue
    }
    if (!fs.existsSync(fullPath)) {
      process.stdout.write(`↓ ${hero.name}… `)
      await download(splashUrl(ref.folder, ref.file), fullPath)
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

console.log(`\nDone: ${ok} ok, ${miss} miss → ${faceDir}`)
