import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.ts'), 'utf8')
const heroes = []
const re = /\{\s*id:\s*'([^']+)',\s*name:\s*(?:"([^"]+)"|'([^']+)')/g
let m
while ((m = re.exec(heroesSrc))) heroes.push({ id: m[1], name: m[2] || m[3] })

const res = await fetch('https://mapi.mobilelegends.com/hero/list', {
  headers: { 'User-Agent': 'mlbb-obs' },
})
if (!res.ok) throw new Error(`hero list HTTP ${res.status}`)
const json = await res.json()
const api = json.data ?? []
const byName = new Map(api.map((h) => [String(h.name).toLowerCase(), h]))

const aliases = {
  minotaur: 'hylos',
}

const missing = []
const entries = []
for (const hero of heroes) {
  const key = hero.name.toLowerCase()
  const hit = byName.get(key) ?? byName.get(aliases[hero.id] ?? '')
  if (!hit?.key) {
    missing.push(hero.name)
    continue
  }
  const url = String(hit.key).startsWith('//') ? `https:${hit.key}` : String(hit.key)
  entries.push(`  ${JSON.stringify(hero.id)}: ${JSON.stringify(url)},`)
}

const out = `/** Official default-skin heads from mapi.mobilelegends.com/hero/list. Special skins are not included. */
export const DEFAULT_SKIN_ICON: Record<string, string> = {
${entries.join('\n')}
}
`
fs.writeFileSync(path.join(root, 'src/data/defaultSkinIcons.ts'), out)
console.log(`wrote ${entries.length} icons, missing: ${missing.join(', ') || 'none'}`)
