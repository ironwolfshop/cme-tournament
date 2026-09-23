/**
 * Download Lara3924 / wiki hero portraits into public/heroes + face + draft OCR assets.
 * Run: node scripts/download-lara-portraits.mjs
 */
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'heroes')
const faceDir = path.join(outDir, 'face')
const ocrDir = path.join(root, 'draft_hero_ocr', 'assets', 'heroes')
const listPath = path.join(root, 'scripts', 'lara-portraits.json')

/** Name aliases → heroes.ts name */
const ALIASES = {
  Dyroth: 'Dyrroth',
  Xborg: 'X.Borg',
  'X Borg': 'X.Borg',
  LuoYi: 'Luo Yi',
  'Popol And Kupa': 'Popol and Kupa',
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http://') ? http : https
    const file = fs.createWriteStream(dest)
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; mlbb-obs-hero-dl/1.0)',
          Accept: 'image/*,*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {
            /* ignore */
          }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href
          download(next, dest).then(resolve, reject)
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
      },
    )
    req.on('error', (err) => {
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

function parseHeroesTs() {
  const src = fs.readFileSync(path.join(root, 'src', 'data', 'heroes.ts'), 'utf8')
  const byName = new Map()
  const re =
    /\{\s*id:\s*'([^']+)',\s*name:\s*(?:"([^"]+)"|'([^']+)')\s*,\s*role:/g
  let m
  while ((m = re.exec(src))) {
    const id = m[1]
    const name = m[2] || m[3]
    byName.set(name.toLowerCase(), { id, name })
  }
  return byName
}

function toRawGithub(url) {
  // github.com/user/repo/raw/main/file → raw.githubusercontent.com/user/repo/main/file
  return url
    .replace(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\//,
      'https://raw.githubusercontent.com/$1/$2/$3/',
    )
    .replace(/\s/g, '%20')
}

async function main() {
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'))
  const byName = parseHeroesTs()

  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(faceDir, { recursive: true })
  fs.mkdirSync(ocrDir, { recursive: true })

  let ok = 0
  let skip = 0
  let fail = 0
  const missing = []

  for (const entry of list) {
    const rawName = String(entry.name_of_hero || '').trim()
    const name = ALIASES[rawName] || rawName
    const hero = byName.get(name.toLowerCase())
    if (!hero) {
      console.warn(`? unknown hero name: ${rawName}`)
      missName(missing, rawName, 'not in heroes.ts')
      skip++
      continue
    }

    let url =
      entry.portrait_of_hero &&
      entry.portrait_of_hero !== 'null' &&
      String(entry.portrait_of_hero).toLowerCase() !== 'null'
        ? String(entry.portrait_of_hero)
        : null
    if (!url && entry.icon_of_hero && entry.icon_of_hero !== 'null') {
      url = String(entry.icon_of_hero)
    }
    if (!url) {
      console.warn(`✗ no URL: ${name}`)
      missName(missing, name, 'no portrait/icon url')
      skip++
      continue
    }

    url = toRawGithub(url)
    const fullPath = path.join(outDir, `${hero.id}.png`)
    const facePath = path.join(faceDir, `${hero.id}.png`)
    const ocrPath = path.join(ocrDir, `${hero.id}.png`)
    const tmp = fullPath + '.tmp'

    try {
      process.stdout.write(`↓ ${hero.name}… `)
      await download(url, tmp)
      // normalize to png via sharp if available, else rename
      let sharp
      try {
        const require = createRequire(import.meta.url)
        sharp = require('sharp')
      } catch {
        sharp = null
      }
      if (sharp) {
        await sharp(tmp).png().toFile(fullPath)
        fs.unlinkSync(tmp)
      } else {
        fs.renameSync(tmp, fullPath)
      }
      const mode = await faceCrop(fullPath, facePath)
      fs.copyFileSync(facePath, ocrPath)
      console.log(`${mode} → ${hero.id}.png`)
      ok++
    } catch (e) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      console.log(`FAIL ${e.message || e}`)
      missName(missing, name, String(e.message || e))
      fail++
    }
  }

  fs.writeFileSync(
    path.join(root, 'scripts', 'lara-portraits-missing.json'),
    JSON.stringify(missing, null, 2),
  )
  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed`)
  console.log(`Splash: ${outDir}`)
  console.log(`Face:   ${faceDir}`)
  console.log(`OCR:    ${ocrDir}`)
}

function missName(arr, name, reason) {
  arr.push({ name, reason })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
