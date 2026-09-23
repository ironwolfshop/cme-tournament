import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const api = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'mlbb-heroes.json'), 'utf8'),
).data

function slug(name) {
  return name
    .toLowerCase()
    .replace(/x\.borg/i, 'x-borg')
    .replace(/chang'e/i, 'chang-e')
    .replace(/yi sun-shin/i, 'yi-sun-shin')
    .replace(/popol and kupa/i, 'popol')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const ROLE_BY_NAME = {
  Miya: 'Marksman',
  Balmond: 'Fighter',
  Saber: 'Assassin',
  Alice: 'Mage',
  Nana: 'Mage',
  Tigreal: 'Tank',
  Alucard: 'Fighter',
  Karina: 'Assassin',
  Akai: 'Tank',
  Franco: 'Tank',
  Bane: 'Fighter',
  Bruno: 'Marksman',
  Clint: 'Marksman',
  Rafaela: 'Support',
  Eudora: 'Mage',
  Zilong: 'Fighter',
  Fanny: 'Assassin',
  Layla: 'Marksman',
  Minotaur: 'Tank',
  Lolita: 'Support',
  Hayabusa: 'Assassin',
  Freya: 'Fighter',
  Gord: 'Mage',
  Natalia: 'Assassin',
  Kagura: 'Mage',
  Chou: 'Fighter',
  Sun: 'Fighter',
  Alpha: 'Fighter',
  Ruby: 'Fighter',
  'Yi Sun-shin': 'Assassin',
  Moskov: 'Marksman',
  Johnson: 'Tank',
  Cyclops: 'Mage',
  Estes: 'Support',
  Hilda: 'Fighter',
  Aurora: 'Mage',
  'Lapu-Lapu': 'Fighter',
  Vexana: 'Mage',
  Roger: 'Fighter',
  Karrie: 'Marksman',
  Gatotkaca: 'Tank',
  Harley: 'Mage',
  Irithel: 'Marksman',
  Grock: 'Tank',
  Argus: 'Fighter',
  Odette: 'Mage',
  Lancelot: 'Assassin',
  Diggie: 'Support',
  Hylos: 'Tank',
  Zhask: 'Mage',
  Helcurt: 'Assassin',
  Pharsa: 'Mage',
  Lesley: 'Marksman',
  Jawhead: 'Fighter',
  Angela: 'Support',
  Gusion: 'Assassin',
  Valir: 'Mage',
  Martis: 'Fighter',
  Uranus: 'Tank',
  Hanabi: 'Marksman',
  "Chang'e": 'Mage',
  Kaja: 'Support',
  Selena: 'Assassin',
  Aldous: 'Fighter',
  Claude: 'Marksman',
  Vale: 'Mage',
  Leomord: 'Fighter',
  Lunox: 'Mage',
  Hanzo: 'Assassin',
  Belerick: 'Tank',
  Kimmy: 'Marksman',
  Thamuz: 'Fighter',
  Harith: 'Mage',
  Minsitthar: 'Fighter',
  Kadita: 'Mage',
  Faramis: 'Support',
  Badang: 'Fighter',
  Khufra: 'Tank',
  Granger: 'Marksman',
  Guinevere: 'Fighter',
  Esmeralda: 'Mage',
  Terizla: 'Fighter',
  'X.Borg': 'Fighter',
  Ling: 'Assassin',
  Dyrroth: 'Fighter',
  Lylia: 'Mage',
  Baxia: 'Tank',
  Masha: 'Fighter',
  Wanwan: 'Marksman',
  Silvanna: 'Fighter',
  Cecilion: 'Mage',
  Carmilla: 'Support',
  Atlas: 'Tank',
  'Popol and Kupa': 'Marksman',
  'Yu Zhong': 'Fighter',
  'Luo Yi': 'Mage',
  Benedetta: 'Assassin',
  Khaleed: 'Fighter',
  Barats: 'Tank',
  Brody: 'Marksman',
  Yve: 'Mage',
  Mathilda: 'Support',
  Paquito: 'Fighter',
  Gloo: 'Tank',
  Beatrix: 'Marksman',
  Phoveus: 'Fighter',
  Natan: 'Marksman',
  Aulus: 'Fighter',
  Aamon: 'Assassin',
  Valentina: 'Mage',
  Edith: 'Marksman',
  Floryn: 'Support',
  Yin: 'Fighter',
  Melissa: 'Marksman',
  Xavier: 'Mage',
  Julian: 'Fighter',
  Fredrinn: 'Fighter',
  Joy: 'Assassin',
  Novaria: 'Mage',
  Arlott: 'Fighter',
  Ixia: 'Marksman',
  Nolan: 'Assassin',
  Cici: 'Fighter',
  Chip: 'Support',
  Zhuxin: 'Mage',
  Suyou: 'Assassin',
  Lukas: 'Fighter',
  Kalea: 'Support',
  Zetian: 'Mage',
  Obsidia: 'Marksman',
  Sora: 'Fighter',
  Marcel: 'Support',
  Hirara: 'Assassin',
}

const EXTRA = [
  {
    name: 'Zhuxin',
    heroid: '125',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Zhuxin/Beacon%20of%20Spirits.png',
  },
  {
    name: 'Suyou',
    heroid: '126',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Suyou/Mask%20of%20the%20Immortal.png',
  },
  {
    name: 'Lukas',
    heroid: '127',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Lukas/Naruto%20Uzumaki.png',
  },
  {
    name: 'Kalea',
    heroid: '128',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Kalea/Sakura%20Haruno.png',
  },
  {
    name: 'Zetian',
    heroid: '129',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Zetian/Celestial%20Empress.png',
  },
  {
    name: 'Obsidia',
    heroid: '130',
    key: "https://raw.githubusercontent.com/Sparkies01/Splash/main/Obsidia/Sovereign%20of%20Dark's%20End.png",
  },
  {
    name: 'Sora',
    heroid: '131',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Sora/Shifting%20Cloud.png',
  },
  {
    name: 'Marcel',
    heroid: '132',
    key: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Marcel/Soul%20Photographer.png',
  },
  { name: 'Hirara', heroid: '133', key: '' },
]

const EXTRA_ICON_OVERRIDE = {
  aldous:
    'https://raw.githubusercontent.com/Sparkies01/Splash/main/Aldous/Contractor.png',
  kaja: 'https://raw.githubusercontent.com/Sparkies01/Splash/main/Kaja/Skyblocker.png',
}

const byId = new Map()
for (const h of api) byId.set(+h.heroid, h)
for (const h of EXTRA) byId.set(+h.heroid, h)

const heroes = [...byId.values()].sort((a, b) => +a.heroid - +b.heroid)

const missingRoles = heroes.filter((h) => !ROLE_BY_NAME[h.name]).map((h) => h.name)
if (missingRoles.length) {
  console.error('Missing roles:', missingRoles.join(', '))
  process.exit(1)
}

const icons = {}
for (const h of heroes) {
  const id = slug(h.name)
  let url = (h.key || '').trim()
  if (url.startsWith('//')) url = 'https:' + url
  if (EXTRA_ICON_OVERRIDE[id]) url = EXTRA_ICON_OVERRIDE[id]
  if (url) icons[id] = url
}

const heroesTs = `import { SPLASH_BY_HERO_NAME, splashUrl } from './splashMap'

export type Hero = {
  id: string
  name: string
  role: string
  /** Official MLBB numeric id used for CDN portraits */
  gameId: number
}

/** Bump when re-downloading portraits so grids pick up new files (cache bust). */
export const HERO_ASSET_VERSION = 'splashes-20260923'

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
${heroes
  .map((h) => {
    const id = slug(h.name)
    const role = ROLE_BY_NAME[h.name]
    const nameLit = h.name.includes("'")
      ? JSON.stringify(h.name)
      : `'${h.name}'`
    return `  { id: '${id}', name: ${nameLit}, role: '${role}', gameId: ${+h.heroid} },`
  })
  .join('\n')}
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

const iconsTs = `/** Official default-skin heads from mapi.mobilelegends.com/hero/list (+ Sparkies for newest). */
export const DEFAULT_SKIN_ICON: Record<string, string> = {
${Object.entries(icons)
  .map(([id, url]) => `  "${id}": ${JSON.stringify(url)},`)
  .join('\n')}
}
`

fs.writeFileSync(path.join(root, 'src/data/heroes.ts'), heroesTs)
fs.writeFileSync(path.join(root, 'src/data/defaultSkinIcons.ts'), iconsTs)
console.log('heroes', heroes.length)
console.log('icons', Object.keys(icons).length)
console.log(
  'newest',
  heroes
    .slice(-12)
    .map((h) => `${h.heroid}:${h.name}`)
    .join(', '),
)
