/**
 * Sync heroes.ts + defaultSkinIcons.ts to Sept 2026 roster (133 heroes).
 * Moonton mapi only returns through Chip (#124); newer heroes use Splash / local.
 *
 * Run: node scripts/sync-heroes-2026.mjs
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Primary role only (draft filter). */
const WIKI = [
  ['Miya', 1, 'Marksman'],
  ['Balmond', 2, 'Fighter'],
  ['Saber', 3, 'Assassin'],
  ['Alice', 4, 'Mage'],
  ['Nana', 5, 'Mage'],
  ['Tigreal', 6, 'Tank'],
  ['Alucard', 7, 'Fighter'],
  ['Karina', 8, 'Assassin'],
  ['Akai', 9, 'Tank'],
  ['Franco', 10, 'Tank'],
  ['Bane', 11, 'Fighter'],
  ['Bruno', 12, 'Marksman'],
  ['Clint', 13, 'Marksman'],
  ['Rafaela', 14, 'Support'],
  ['Eudora', 15, 'Mage'],
  ['Zilong', 16, 'Fighter'],
  ['Fanny', 17, 'Assassin'],
  ['Layla', 18, 'Marksman'],
  ['Minotaur', 19, 'Tank'],
  ['Lolita', 20, 'Support'],
  ['Hayabusa', 21, 'Assassin'],
  ['Freya', 22, 'Fighter'],
  ['Gord', 23, 'Mage'],
  ['Natalia', 24, 'Assassin'],
  ['Kagura', 25, 'Mage'],
  ['Chou', 26, 'Fighter'],
  ['Sun', 27, 'Fighter'],
  ['Alpha', 28, 'Fighter'],
  ['Ruby', 29, 'Fighter'],
  ['Yi Sun-shin', 30, 'Assassin'],
  ['Moskov', 31, 'Marksman'],
  ['Johnson', 32, 'Tank'],
  ['Cyclops', 33, 'Mage'],
  ['Estes', 34, 'Support'],
  ['Hilda', 35, 'Fighter'],
  ['Aurora', 36, 'Mage'],
  ['Lapu-Lapu', 37, 'Fighter'],
  ['Vexana', 38, 'Mage'],
  ['Roger', 39, 'Fighter'],
  ['Karrie', 40, 'Marksman'],
  ['Gatotkaca', 41, 'Tank'],
  ['Harley', 42, 'Assassin'],
  ['Irithel', 43, 'Marksman'],
  ['Grock', 44, 'Tank'],
  ['Argus', 45, 'Fighter'],
  ['Odette', 46, 'Mage'],
  ['Lancelot', 47, 'Assassin'],
  ['Diggie', 48, 'Support'],
  ['Hylos', 49, 'Tank'],
  ['Zhask', 50, 'Mage'],
  ['Helcurt', 51, 'Assassin'],
  ['Pharsa', 52, 'Mage'],
  ['Lesley', 53, 'Marksman'],
  ['Jawhead', 54, 'Fighter'],
  ['Angela', 55, 'Support'],
  ['Gusion', 56, 'Assassin'],
  ['Valir', 57, 'Mage'],
  ['Martis', 58, 'Fighter'],
  ['Uranus', 59, 'Tank'],
  ['Hanabi', 60, 'Marksman'],
  ["Chang'e", 61, 'Mage'],
  ['Kaja', 62, 'Support'],
  ['Selena', 63, 'Assassin'],
  ['Aldous', 64, 'Fighter'],
  ['Claude', 65, 'Marksman'],
  ['Vale', 66, 'Mage'],
  ['Leomord', 67, 'Fighter'],
  ['Lunox', 68, 'Mage'],
  ['Hanzo', 69, 'Assassin'],
  ['Belerick', 70, 'Tank'],
  ['Kimmy', 71, 'Marksman'],
  ['Thamuz', 72, 'Fighter'],
  ['Harith', 73, 'Mage'],
  ['Minsitthar', 74, 'Fighter'],
  ['Kadita', 75, 'Mage'],
  ['Faramis', 76, 'Support'],
  ['Badang', 77, 'Fighter'],
  ['Khufra', 78, 'Tank'],
  ['Granger', 79, 'Marksman'],
  ['Guinevere', 80, 'Fighter'],
  ['Esmeralda', 81, 'Tank'],
  ['Terizla', 82, 'Fighter'],
  ['X.Borg', 83, 'Fighter'],
  ['Ling', 84, 'Assassin'],
  ['Dyrroth', 85, 'Fighter'],
  ['Lylia', 86, 'Mage'],
  ['Baxia', 87, 'Tank'],
  ['Masha', 88, 'Fighter'],
  ['Wanwan', 89, 'Marksman'],
  ['Silvanna', 90, 'Fighter'],
  ['Cecilion', 91, 'Mage'],
  ['Carmilla', 92, 'Support'],
  ['Atlas', 93, 'Tank'],
  ['Popol and Kupa', 94, 'Marksman'],
  ['Yu Zhong', 95, 'Fighter'],
  ['Luo Yi', 96, 'Mage'],
  ['Benedetta', 97, 'Assassin'],
  ['Khaleed', 98, 'Fighter'],
  ['Barats', 99, 'Tank'],
  ['Brody', 100, 'Marksman'],
  ['Yve', 101, 'Mage'],
  ['Mathilda', 102, 'Support'],
  ['Paquito', 103, 'Fighter'],
  ['Gloo', 104, 'Tank'],
  ['Beatrix', 105, 'Marksman'],
  ['Phoveus', 106, 'Fighter'],
  ['Natan', 107, 'Marksman'],
  ['Aulus', 108, 'Fighter'],
  ['Aamon', 109, 'Assassin'],
  ['Valentina', 110, 'Mage'],
  ['Edith', 111, 'Marksman'],
  ['Floryn', 112, 'Support'],
  ['Yin', 113, 'Fighter'],
  ['Melissa', 114, 'Marksman'],
  ['Xavier', 115, 'Mage'],
  ['Julian', 116, 'Fighter'],
  ['Fredrinn', 117, 'Fighter'],
  ['Joy', 118, 'Assassin'],
  ['Novaria', 119, 'Mage'],
  ['Arlott', 120, 'Fighter'],
  ['Ixia', 121, 'Marksman'],
  ['Nolan', 122, 'Assassin'],
  ['Cici', 123, 'Fighter'],
  ['Chip', 124, 'Support'],
  ['Zhuxin', 125, 'Mage'],
  ['Suyou', 126, 'Assassin'],
  ['Lukas', 127, 'Fighter'],
  ['Kalea', 128, 'Support'],
  ['Zetian', 129, 'Mage'],
  ['Obsidia', 130, 'Marksman'],
  ['Sora', 131, 'Fighter'],
  ['Marcel', 132, 'Support'],
  ['Hirara', 133, 'Assassin'],
]

/** Splash art fallbacks when mapi has no head icon (post-Chip + gaps). */
const SPLASH_ICON = {
  zhuxin: 'Zhuxin/Beacon of Spirits',
  suyou: 'Suyou/Mask of the Immortal',
  lukas: 'Lukas/Naruto Uzumaki', // Splash repo has no default yet
  kalea: 'Kalea/Sakura Haruno', // Splash repo has no default yet
  zetian: 'Zetian/Celestial Empress',
  obsidia: "Obsidia/Sovereign of Dark's End",
  sora: 'Sora/Shifting Cloud',
  marcel: 'Marcel/Soul Photographer',
}

const LOCAL_ICON_OVERRIDE = {
  hirara: '/heroes/face/hirara.png',
}

function toId(name) {
  return name
    .toLowerCase()
    .replace(/'/g, '-')
    .replace(/\./g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function splashRaw(rel) {
  const [folder, file] = rel.split('/')
  return `https://raw.githubusercontent.com/Sparkies01/Splash/main/${encodeURIComponent(folder)}/${encodeURIComponent(file)}.png`
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'mlbb-obs-sync' } }, (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            getJson(res.headers.location).then(resolve, reject)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} ${url}`))
            return
          }
          try {
            resolve(JSON.parse(d))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, { headers: { 'User-Agent': 'mlbb-obs-sync' } }, (res) => {
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

const heroes = WIKI.map(([name, gameId, role]) => ({
  id: toId(name),
  name,
  role,
  gameId,
}))

const heroesBody = heroes
  .map((h) => {
    const nameLit = h.name.includes("'") ? `"${h.name}"` : `'${h.name}'`
    return `  { id: '${h.id}', name: ${nameLit}, role: '${h.role}', gameId: ${h.gameId} },`
  })
  .join('\n')

const heroesTs = `import { SPLASH_BY_HERO_NAME, splashUrl } from './splashMap'

export type Hero = {
  id: string
  name: string
  role: string
  /** Official MLBB numeric id used for CDN portraits */
  gameId: number
}

/** Bump when re-downloading portraits so grids pick up new files (cache bust). */
export const HERO_ASSET_VERSION = 'sept2026-hirara'

/** Local default-skin splash (downloaded via scripts/download-*-portraits.mjs). */
export function heroLocalSplashUrl(heroId: string): string {
  return \`/heroes/\${heroId}.png?v=\${HERO_ASSET_VERSION}\`
}

/** Local face-cropped portrait used in the hero selection pool. */
export function heroLocalFaceUrl(heroId: string): string {
  return \`/heroes/face/\${heroId}.png?v=\${HERO_ASSET_VERSION}\`
}

/** Small icon portraits from Moonton CDN (may 403 in some regions). */
export function heroPortraitUrl(gameId: number): string {
  return \`https://akmweb.youngjoygame.com/web/svnres/img/mlbb/homepage/100x100/\${gameId}.jpg\`
}

export function heroLoadingUrl(gameId: number): string {
  return \`https://akmweb.youngjoygame.com/web/svnres/img/mlbb/hero_loading/\${gameId}.jpg\`
}

/** Full default-skin splash art from local cache or Sparkies Splash. */
export function heroSplashUrl(heroName: string): string | null {
  const ref = SPLASH_BY_HERO_NAME[heroName]
  if (!ref) return null
  return splashUrl(ref.folder, ref.file)
}

export const HEROES: Hero[] = [
${heroesBody}
]

export const UNIQUE_HEROES = HEROES

export function getHero(id: string | null | undefined): Hero | undefined {
  if (!id) return undefined
  return HEROES.find((h) => h.id === id)
}

export function searchHeroes(query: string): Hero[] {
  const q = query.trim().toLowerCase()
  if (!q) return HEROES
  return HEROES.filter(
    (h) =>
      h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q),
  )
}
`

fs.writeFileSync(path.join(root, 'src/data/heroes.ts'), heroesTs)
console.log(`wrote heroes.ts (${heroes.length} heroes)`)

const api = await getJson('https://mapi.mobilelegends.com/hero/list')
const byName = new Map((api.data ?? []).map((h) => [String(h.name).toLowerCase(), h]))

const iconEntries = []
const missing = []
for (const hero of heroes) {
  const local = LOCAL_ICON_OVERRIDE[hero.id]
  if (local) {
    iconEntries.push(
      `  ${JSON.stringify(hero.id)}: ${JSON.stringify(`${local}?v=sept2026-hirara`)},`,
    )
    continue
  }
  const hit = byName.get(hero.name.toLowerCase())
  if (hit?.key) {
    const url = String(hit.key).startsWith('//') ? `https:${hit.key}` : String(hit.key)
    iconEntries.push(`  ${JSON.stringify(hero.id)}: ${JSON.stringify(url)},`)
    continue
  }
  const splash = SPLASH_ICON[hero.id]
  if (splash) {
    iconEntries.push(`  ${JSON.stringify(hero.id)}: ${JSON.stringify(splashRaw(splash))},`)
    continue
  }
  missing.push(hero.name)
}

const iconsTs = `/** Official default-skin heads from mapi.mobilelegends.com/hero/list (+ Splash fallbacks for post-Chip heroes). */
export const DEFAULT_SKIN_ICON: Record<string, string> = {
${iconEntries.join('\n')}
}
`
fs.writeFileSync(path.join(root, 'src/data/defaultSkinIcons.ts'), iconsTs)
console.log(`wrote defaultSkinIcons.ts (${iconEntries.length} icons)`)
if (missing.length) console.warn('still missing icons:', missing.join(', '))

// Ensure Hirara local portrait exists (Splash repo has no Hirara folder yet).
const faceDir = path.join(root, 'public', 'heroes', 'face')
const splashDir = path.join(root, 'public', 'heroes')
fs.mkdirSync(faceDir, { recursive: true })
const hiraraSplash = path.join(splashDir, 'hirara.png')
const hiraraFace = path.join(faceDir, 'hirara.png')
const hiraraUrl = 'https://i.redd.it/b0p4xa5v9w3h1.jpeg'
if (!fs.existsSync(hiraraFace)) {
  console.log('↓ Hirara splash…')
  try {
    await download(hiraraUrl, hiraraSplash)
    fs.copyFileSync(hiraraSplash, hiraraFace)
    console.log('Hirara saved → public/heroes/')
  } catch (e) {
    console.warn('Hirara download failed:', e.message || e)
  }
}

console.log('done')
