import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/data/heroes.ts'), 'utf8')
const heroes = []
const re =
  /\{\s*id:\s*'([^']+)',\s*name:\s*(?:"([^"]+)"|'([^']+)'),\s*role:\s*'([^']+)',\s*gameId:\s*(\d+)/g
let m
while ((m = re.exec(src))) {
  heroes.push({
    id: m[1],
    name: m[2] || m[3],
    role: m[4],
    gameId: Number(m[5]),
  })
}
const out = path.join(root, 'draft_hero_ocr/assets/heroes_index.json')
fs.writeFileSync(out, JSON.stringify(heroes, null, 2))
console.log(`Wrote ${heroes.length} heroes → ${out}`)
