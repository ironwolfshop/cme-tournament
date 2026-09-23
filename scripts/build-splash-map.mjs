import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'mlbb-obs-splash-map' } }, (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location).then(resolve, reject)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`))
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

/** Official / classic default skins only — no collabs or fancy alts. */
const DEFAULT_SKIN = {
  Miya: 'Moonlight Archer',
  Alucard: 'Demon Hunter',
  Fanny: 'Blade Dancer',
  Layla: 'Classic Malefic Gunner',
  "Chang'e": 'Moon Palace Immortal',
  Gusion: 'Holy Blade',
  Lancelot: 'Holy Blade',
  Chou: 'Kung Fu Boy',
  Hayabusa: 'Shadow of the Night',
  Natalia: 'Phantom Dancer',
  Kagura: 'Flower of the Night',
  Franco: 'No Fear',
  Tigreal: 'Warrior of Dawn',
  Balmond: 'Savage Bloodaxe',
  Bruno: 'Protector',
  Clint: 'West Rock',
  Nana: 'Sweet Schoolgirl',
  Alice: 'Lady of Blood',
  Karina: 'Blade of the Night',
  Akai: 'Panda Warrior',
  Granger: 'Deathly Violinist',
  Ling: 'Cyan Finch',
  Wanwan: 'Agile Tiger',
  Beatrix: 'Dawnbreak',
  Paquito: 'The Immortal',
  YuZhong: 'Black Tortoise',
  'Yu Zhong': 'Black Tortoise',
  Benedetta: 'Deathblade',
  Aamon: 'Duke of Shards',
  Julian: 'Scarlet Raven',
  Fredrinn: 'The Treasure Hunter',
  Yin: 'Impetus',
  Arlott: 'Lancer of Destined Fate',
  Novaria: 'Starstruck Girl',
  Ixia: 'Arclight Shatter',
  Cici: 'Buoyant Ascent',
  Nolan: 'Cosmic Wayfinder',
  Chip: 'Life Conductor',
  Kalea: 'Ripple Edge',
  Valentina: 'Prophetess of the Night',
  Xavier: 'Defier of Light',
  Joy: 'Flash of Spirits',
  Melissa: 'Night Owl',
  Edith: 'Death Rose',
  Phoveus: 'Demonic Catastrophe',
  Aulus: 'Warrior of Avarice',
  Gloo: 'Sticky Note',
  Floryn: 'Floral Spirit',
  Brody: 'The Lone Star',
  Barats: 'Detona',
  Carmilla: 'Shadow of Abyss',
  Cecilion: 'Shadow of Abyss',
  'Luo Yi': 'Yin-Yang Weaver',
  Mathilda: 'Swift Owl',
  Atlas: 'Abysmal Aggression',
  Khaleed: 'Desert Scimitar',
  Silvanna: 'Imperial Rose',
  XBorg: 'Incinerator',
  'X.Borg': 'Incinerator',
  Dyrroth: 'Prince of the Abyss',
  Terizla: 'Executioner',
  Baxia: 'Mystic Tortoise',
  Vale: 'Wind Whisperer',
  Thamuz: 'Lord of the Abyss',
  Minsitthar: 'Spear of Glory',
  Badang: 'Tribal Warrior',
  Hanzo: 'Akuma Ninja',
  Claude: 'Master Thief',
  Khufra: 'Desert Tyrant',
  Hanabi: 'Scarlet Lotus',
  Faramis: 'Soul Binder',
  Harith: 'Code Genius',
  Selena: 'Abyssal Witch',
  Leomord: 'Barbarian Blade',
  Pharsa: 'Wings of Sin',
  Belerick: 'Guardian',
  Martis: 'Ashura King',
  Uranus: 'Radiant',
  Jawhead: 'Armor Bear',
  Angela: 'Angel Doll',
  Lesley: 'Deadly Sniper',
  Zhask: 'Swarm King',
  Odette: 'Swan Princess',
  Hylos: 'Grand Priest',
  Irithel: 'Jungle Huntress',
  Helcurt: 'Shadow Oversexer',
  Argus: 'Dark Angel',
  Diggie: 'Timekeeper',
  Grock: 'Fortress Giant',
  Harley: 'Magician Apprentice',
  Aurora: 'Herald of Spring',
  Moskov: 'Spear of Quiver',
  Roger: 'White Wolf',
  Ruby: 'Little Red Hood',
  'Lapu-Lapu': 'Brave Blade',
  Alpha: 'Beta Prototype',
  Gord: 'Professor of Magic',
  Freya: 'Valkyrie',
  Sun: 'Monkey King',
  Estes: 'Moon Elf King',
  Lolita: 'Rubber Band Girl',
  Rafaela: 'Angelic Beauty',
  Zilong: 'Eastern Warrior',
  Eudora: 'Thunderclap',
  Minotaur: 'Labyrinth Guardian',
  Bane: 'Captain of the Deep',
  Saber: 'Fatal Sword',
  Johnson: 'Mecha Rider',
  Cyclops: 'Starscream',
  Hilda: 'Power of Fenrir',
  Guinevere: 'Ms. Fortune',
  Kimmy: 'Explosive Fury',
  Aldous: 'Contractor',
  Esmeralda: 'Astro Guardian',
  Kadita: 'Ocean Goddess',
  Lunox: 'Twilight Goddess',
  Masha: 'Wild Child',
  Popol: 'Horned Thief',
  'Popol and Kupa': 'Horned Thief',
  Yve: 'Astrowarden',
  Lylia: 'Little Witch',
  Baxia: 'Mystic Tortoise',
}

const FANCY =
  /christmas|echo|mikasa|namikaze|iori|shiryu|saber\.|s\.t\.u\.n|p\.ace|lightborn|venom|k'\.|summer|carnival|atomic|honor|collab|starwars|sanrio|hello kitty/i

function pickDefault(hero, files) {
  const preferred = DEFAULT_SKIN[hero]
  if (preferred) {
    const hit = files.find((f) => f.file === preferred)
    if (hit) return hit
  }
  const classic = files.find((f) => /classic/i.test(f.file))
  if (classic) return classic

  const plain = files
    .filter((f) => !FANCY.test(f.file))
    .sort((a, b) => a.file.localeCompare(b.file))
  if (plain.length) return plain[0]

  return [...files].sort((a, b) => a.file.localeCompare(b.file))[0]
}

async function main() {
  const tree = await get(
    'https://api.github.com/repos/Sparkies01/Splash/git/trees/main?recursive=1',
  )
  const byHero = {}
  for (const item of tree.tree || []) {
    if (item.type !== 'blob' || !item.path.endsWith('.png')) continue
    const parts = item.path.split('/')
    if (parts.length !== 2) continue
    const [hero, file] = parts
    ;(byHero[hero] ||= []).push({
      file: file.replace(/\.png$/i, ''),
      size: item.size || 0,
    })
  }

  /** @type {Record<string, { folder: string, file: string }>} */
  const map = {}
  for (const [hero, files] of Object.entries(byHero)) {
    const pick = pickDefault(hero, files)
    if (!pick) continue
    map[hero] = { folder: hero, file: pick.file }
  }

  const outPath = path.join(__dirname, '..', 'src', 'data', 'splashMap.ts')
  const body = `/** Auto-generated — default/classic skins only. Run: node scripts/build-splash-map.mjs */
export type SplashRef = { folder: string; file: string }

export const SPLASH_BASE =
  'https://raw.githubusercontent.com/Sparkies01/Splash/main'

export const SPLASH_BY_HERO_NAME: Record<string, SplashRef> = ${JSON.stringify(map, null, 2)}

export function splashUrl(folder: string, file: string): string {
  const enc = (s: string) => encodeURIComponent(s)
  return \`\${SPLASH_BASE}/\${enc(folder)}/\${enc(file)}.png\`
}
`
  fs.writeFileSync(outPath, body, 'utf8')
  console.log(`Wrote ${Object.keys(map).length} default skins → ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
