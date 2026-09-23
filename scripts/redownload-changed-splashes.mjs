/**
 * Re-download default-skin wallpapers whose splashMap entry changed
 * (or force specific hero ids).
 *
 * Run: node scripts/redownload-changed-splashes.mjs
 *      node scripts/redownload-changed-splashes.mjs alice obsidia
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
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
        file.on('finish', () => file.close(resolve))
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

const splashSrc = fs.readFileSync(path.join(root, 'src/data/splashMap.ts'), 'utf8')
const splashJson = splashSrc.match(
  /SPLASH_BY_HERO_NAME:\s*Record<string,\s*SplashRef>\s*=\s*(\{[\s\S]*?\n\})/,
)
if (!splashJson) throw new Error('Could not parse splashMap')
const splashMap = JSON.parse(splashJson[1])
const splashUrl = (folder, file) =>
  `https://raw.githubusercontent.com/Sparkies01/Splash/main/${encodeURIComponent(folder)}/${encodeURIComponent(file)}.png`

const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.ts'), 'utf8')
const heroes = []
const re =
  /\{\s*id:\s*'([^']+)',\s*name:\s*(?:"([^"]+)"|'([^']+)')\s*,\s*role:/g
let m
while ((m = re.exec(heroesSrc))) {
  heroes.push({ id: m[1], name: m[2] || m[3] })
}
const unique = [...new Map(heroes.map((h) => [h.id, h])).values()]

const force = new Set(process.argv.slice(2).map((s) => s.toLowerCase()))
const targets = force.size
  ? unique.filter((h) => force.has(h.id) || force.has(h.name.toLowerCase()))
  : unique

for (const hero of targets) {
  const ref = splashMap[hero.name]
  if (!ref) {
    console.warn(`skip ${hero.name} (no splash map)`)
    continue
  }
  if (hero.name === 'Hirara') {
    console.log(`= ${hero.name} (local only)`)
    continue
  }
  const fullPath = path.join(outDir, `${hero.id}.png`)
  const facePath = path.join(faceDir, `${hero.id}.png`)
  const url = splashUrl(ref.folder, ref.file)
  try {
    if (force.size || !fs.existsSync(fullPath)) {
      process.stdout.write(`↓ ${hero.name} ← ${ref.file}… `)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      await download(url, fullPath)
    } else {
      process.stdout.write(`= ${hero.name}… `)
    }
    fs.copyFileSync(fullPath, facePath)
    console.log('ok', fs.statSync(fullPath).size)
  } catch (e) {
    console.log('FAIL', e.message || e)
  }
}
