/**
 * Refresh defaultSkinIcons from mapi.mobilelegends.com (through Chip #124).
 * Post-Chip heroes keep Splash / local face URLs — prefer scripts/sync-heroes-2026.mjs.
 *
 * Run: node scripts/fetch-default-icons.mjs
 */
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

/** Keep post-Chip / missing-mapi icons when regenerating. */
const KEEP = {
  zhuxin: '/heroes/face/zhuxin.png?v=sept2026-hirara',
  suyou: '/heroes/face/suyou.png?v=sept2026-hirara',
  lukas: '/heroes/face/lukas.png?v=sept2026-hirara',
  kalea: '/heroes/face/kalea.png?v=sept2026-hirara',
  zetian: '/heroes/face/zetian.png?v=sept2026-hirara',
  obsidia: '/heroes/face/obsidia.png?v=sept2026-hirara',
  sora: '/heroes/face/sora.png?v=sept2026-hirara',
  marcel: '/heroes/face/marcel.png?v=sept2026-hirara',
  hirara: '/heroes/face/hirara.png?v=sept2026-hirara',
}

const missing = []
const entries = []
for (const hero of heroes) {
  if (KEEP[hero.id]) {
    entries.push(`  ${JSON.stringify(hero.id)}: ${JSON.stringify(KEEP[hero.id])},`)
    continue
  }
  const hit = byName.get(hero.name.toLowerCase())
  if (!hit?.key) {
    missing.push(hero.name)
    continue
  }
  const url = String(hit.key).startsWith('//') ? `https:${hit.key}` : String(hit.key)
  entries.push(`  ${JSON.stringify(hero.id)}: ${JSON.stringify(url)},`)
}

const out = `/** Official default-skin heads from mapi.mobilelegends.com/hero/list (+ local faces for post-Chip). */
export const DEFAULT_SKIN_ICON: Record<string, string> = {
${entries.join('\n')}
}
`
fs.writeFileSync(path.join(root, 'src/data/defaultSkinIcons.ts'), out)
console.log(`wrote ${entries.length} icons, missing: ${missing.join(', ') || 'none'}`)
