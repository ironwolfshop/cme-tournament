/**
 * Rebuild the full form roster (every unique player) and lock it
 * so empty control pages cannot unload named players.
 *
 * Usage: node scripts/restore-form-roster.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const SHEET_ID = '1BrAK7b785kUmSDB8BwMuwYrfIjEsPyQT_WLJVEa4Fa8'
const SHEET_GID = '1767953180'
const MEDIA = join(process.cwd(), 'public', 'form-media')
const HUB = join(process.cwd(), 'node_modules', '.cache', 'obs-sync', 'hub-state.json')
const LOCKED = join(
  process.cwd(),
  'node_modules',
  '.cache',
  'obs-sync',
  'tournament-locked.json',
)
const BACKUP = join(process.cwd(), 'public', 'cme-form-import.json')
const HUB_URLS = [
  'http://localhost:5175/api/sync/tournament',
  'http://localhost:5173/api/sync/tournament',
  'http://localhost:5199/api/sync/tournament',
  'http://localhost:5210/api/sync/tournament',
]

mkdirSync(MEDIA, { recursive: true })
mkdirSync(join(process.cwd(), 'node_modules', '.cache', 'obs-sync'), {
  recursive: true,
})

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (c === '"' && next === '"') {
        cell += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        cell += c
      }
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      if (c === '\r') i++
      row.push(cell)
      cell = ''
      if (row.some((v) => String(v).trim())) rows.push(row)
      row = []
    } else if (c !== '\r') cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    if (row.some((v) => String(v).trim())) rows.push(row)
  }
  return rows
}

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, ' ').trim().toUpperCase()
}

function colIndex(headers, ...aliases) {
  const normalized = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const want = normalizeHeader(alias)
    let i = normalized.findIndex((h) => h === want)
    if (i >= 0) return i
    i = normalized.findIndex((h) => h.startsWith(want + ' ') || h.startsWith(want))
    if (i >= 0) return i
  }
  return -1
}

function driveIdFromCell(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  const m =
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    s.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    s.match(/\/open\?id=([a-zA-Z0-9_-]+)/) ||
    s.match(/^([a-zA-Z0-9_-]{20,})$/)
  return m?.[1] || ''
}

function parseSheetTimestamp(raw) {
  const s = String(raw || '').trim()
  if (!s) return new Date(0).toISOString()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (m) {
    const [, mo, d, y, h, mi, se] = m
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? s : fallback.toISOString()
}

function compactPerson(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function isNamedPlayer(p) {
  const n = String(p?.name || '').trim()
  return Boolean(n) && !/^PLAYER\s*\d+$/i.test(n)
}

function peopleMatch(aName, aIgn, bName, bIgn) {
  const na = compactPerson(aName)
  const nb = compactPerson(bName)
  const ia = compactPerson(aIgn)
  const ib = compactPerson(bIgn)
  if (ia && ib && ia === ib) return true
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true
  return false
}

function teamMatchKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/BSMAR\s*E/g, 'BSME')
    .replace(/[^A-Z0-9]/g, '')
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const ROLE_MAP = {
  EXP: 'exp',
  GOLD: 'gold',
  MID: 'mid',
  ROAM: 'roam',
  CORE: 'jungle',
  JUNGLE: 'jungle',
  SPARE: 'spare',
}
const STARTER_ORDER = ['exp', 'jungle', 'mid', 'gold', 'roam']

function tagFromName(name) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase()
  return words.map((w) => w[0]).join('').slice(0, 6).toUpperCase() || 'TEAM'
}

async function fetchSheetRows() {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`,
  ]
  let csv = ''
  for (const url of urls) {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    const text = await res.text()
    if (!res.ok || text.includes('<!DOCTYPE') || text.includes('<html')) continue
    csv = text
    break
  }
  if (!csv) throw new Error('Could not download sheet')
  const table = parseCsv(csv)
  const headers = table[0]
  const iTs = colIndex(headers, 'TIMESTAMP')
  const iName = colIndex(headers, 'NAME')
  const iIgn = colIndex(headers, 'IN GAME NAME', 'IGN', 'IN-GAME NAME')
  const iPos = colIndex(headers, 'TEAM POSITION', 'POSITION')
  const iTeam = colIndex(headers, 'TEAM')
  const iRole = colIndex(headers, 'MLBB ROLE', 'ROLE')
  const iPhoto = colIndex(headers, 'PLAYERS PHOTO', 'PLAYER PHOTO', 'PHOTO')
  const iLogo = colIndex(headers, 'TEAM LOGO', 'LOGO')
  const rows = []
  for (const cells of table.slice(1)) {
    const name = String(cells[iName] ?? '').trim()
    const team = String(cells[iTeam] ?? '').trim()
    const ign = String(cells[iIgn] ?? '').trim()
    if ((!name && !ign) || !team) continue
    rows.push({
      ts: parseSheetTimestamp(cells[iTs]),
      name,
      ign: ign || name,
      position: String(cells[iPos] ?? 'MEMBER').trim().toUpperCase(),
      team,
      role: String(cells[iRole] ?? '').trim().toUpperCase(),
      photo: driveIdFromCell(cells[iPhoto]),
      logo: driveIdFromCell(cells[iLogo]),
    })
  }
  const byKey = new Map()
  for (const row of rows) {
    const key = `${row.team}::${compactPerson(row.ign) || compactPerson(row.name)}`
    const prev = byKey.get(key)
    if (!prev || prev.ts < row.ts) byKey.set(key, row)
  }
  return [...byKey.values()]
}

async function ensurePhoto(id, label) {
  if (!id) return ''
  const publicPath = join(MEDIA, `${id}.jpg`)
  const publicUrl = `/form-media/${id}.jpg`
  if (existsSync(publicPath) && readFileSync(publicPath).length > 800) {
    return publicUrl
  }
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }
  const urls = [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`,
    `https://lh3.googleusercontent.com/d/${id}=s720`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w720`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 800 || buf.slice(0, 15).toString().includes('<!')) continue
      const jpeg = await sharp(buf)
        .rotate()
        .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()
      writeFileSync(publicPath, jpeg)
      console.log(`  ✓ ${label}`)
      return publicUrl
    } catch {
      /* try next */
    }
  }
  console.warn(`  ✗ ${label}`)
  return existsSync(publicPath) ? publicUrl : ''
}

function collectPhotoIndex(state) {
  const map = new Map()
  for (const proj of state?.tournaments || []) {
    for (const team of proj.teams || []) {
      if (team.logo) map.set(`logo:${teamMatchKey(team.name)}`, team.logo)
      for (const p of team.players || []) {
        if (!isNamedPlayer(p) || !p.photo) continue
        map.set(`name:${compactPerson(p.name)}`, p.photo)
        if (p.ign) map.set(`ign:${compactPerson(p.ign)}`, p.photo)
      }
    }
  }
  return map
}

function findExistingPhoto(row, index) {
  return (
    index.get(`name:${compactPerson(row.name)}`) ||
    index.get(`ign:${compactPerson(row.ign)}`) ||
    ''
  )
}

async function loadAnyState() {
  const found = []
  for (const url of HUB_URLS) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const n = (json?.tournaments || []).reduce(
        (a, p) =>
          a +
          (p.teams || []).reduce(
            (b, t) => b + (t.players || []).filter(isNamedPlayer).length,
            0,
          ),
        0,
      )
      found.push({ url, json, n })
      console.log(`hub ${url} named=${n}`)
    } catch {
      console.log(`hub ${url} down`)
    }
  }
  if (existsSync(HUB)) {
    try {
      const hub = JSON.parse(readFileSync(HUB, 'utf8'))
      const json = hub.tournament
      const n = (json?.tournaments || []).reduce(
        (a, p) =>
          a +
          (p.teams || []).reduce(
            (b, t) => b + (t.players || []).filter(isNamedPlayer).length,
            0,
          ),
        0,
      )
      found.push({ url: 'disk', json, n })
      console.log(`hub disk named=${n}`)
    } catch {
      /* ignore */
    }
  }
  found.sort((a, b) => b.n - a.n)
  return found[0]?.json || null
}

const rows = await fetchSheetRows()
console.log(`Form unique players: ${rows.length}`)

const existing = await loadAnyState()
const photoIndex = collectPhotoIndex(existing)

const teamsMap = new Map()
for (const row of rows) {
  if (!teamsMap.has(row.team)) {
    teamsMap.set(row.team, {
      name: row.team,
      tag: tagFromName(row.team).slice(0, 8),
      logoId: '',
      captainLogoId: '',
      players: [],
    })
  }
  const t = teamsMap.get(row.team)
  if (row.position.includes('CAPTAIN') && row.logo) t.captainLogoId = row.logo
  if (row.logo && !t.logoId) t.logoId = row.logo
  t.players.push(row)
}
for (const t of teamsMap.values()) {
  if (t.captainLogoId) t.logoId = t.captainLogoId
}

const existingTeams = []
for (const proj of existing?.tournaments || []) {
  for (const team of proj.teams || []) existingTeams.push(team)
}

const built = []
let seed = 1
for (const t of teamsMap.values()) {
  console.log(`\n${t.name} (${t.players.length})`)
  let logo = ''
  if (t.captainLogoId) logo = await ensurePhoto(t.captainLogoId, `${t.name} logo`)
  if (!logo) logo = photoIndex.get(`logo:${teamMatchKey(t.name)}`) || ''
  if (!logo && t.logoId) logo = await ensurePhoto(t.logoId, `${t.name} logo`)

  const used = new Set()
  const roster = []
  for (const role of STARTER_ORDER) {
    const match = t.players.find(
      (p) => ROLE_MAP[p.role] === role && !used.has(compactPerson(p.ign) || compactPerson(p.name)),
    )
    if (match) {
      used.add(compactPerson(match.ign) || compactPerson(match.name))
      roster.push({ row: match, role })
    }
  }
  const leftovers = t.players.filter(
    (p) => !used.has(compactPerson(p.ign) || compactPerson(p.name)),
  )
  for (const role of STARTER_ORDER) {
    if (roster.some((r) => r.role === role)) continue
    const next = leftovers.shift()
    if (!next) break
    used.add(compactPerson(next.ign) || compactPerson(next.name))
    roster.push({ row: next, role })
  }
  while (leftovers.length) {
    roster.push({ row: leftovers.shift(), role: 'spare' })
  }
  for (const role of STARTER_ORDER) {
    if (!roster.some((r) => r.role === role)) {
      roster.push({ row: { name: '', ign: '', photo: '' }, role, empty: true })
    }
  }
  roster.sort((a, b) => {
    const ao = a.role === 'spare' ? 100 : STARTER_ORDER.indexOf(a.role)
    const bo = b.role === 'spare' ? 100 : STARTER_ORDER.indexOf(b.role)
    return ao - bo
  })

  const prev = existingTeams.find((x) => teamMatchKey(x.name) === teamMatchKey(t.name))
  const players = []
  for (let i = 0; i < roster.length; i++) {
    const slot = roster[i]
    if (slot.empty) {
      const keep = prev?.players?.[i]
      players.push({
        id: keep?.id || uid(),
        name: '',
        ign: '',
        photo: '',
        role: slot.role,
        order: i,
        isLeader: false,
      })
      continue
    }
    const prevHit = (prev?.players || []).find(
      (p) => isNamedPlayer(p) && peopleMatch(p.name, p.ign, slot.row.name, slot.row.ign),
    )
    let photo = prevHit?.photo || findExistingPhoto(slot.row, photoIndex)
    if (!photo && slot.row.photo) {
      photo = await ensurePhoto(slot.row.photo, `${slot.row.ign || slot.row.name} photo`)
    } else if (photo) {
      console.log(`  · ${slot.row.name} photo kept`)
    }
    players.push({
      id: prevHit?.id || uid(),
      name: String(slot.row.name || slot.row.ign).slice(0, 28),
      ign: String(slot.row.ign || '').slice(0, 20),
      photo,
      photoOriginal: prevHit?.photoOriginal || photo,
      role: slot.role,
      order: i,
      isLeader: /CAPTAIN|LEADER/.test(slot.row.position),
    })
  }

  built.push({
    id: prev?.id || uid(),
    name: t.name,
    tag: (prev?.tag && !/^T\d+$/i.test(prev.tag) ? prev.tag : t.tag).slice(0, 8),
    logo: logo || prev?.logo || '',
    seed: seed++,
    players,
  })
}

const named = built.reduce((n, t) => n + t.players.filter(isNamedPlayer).length, 0)
console.log(`\nBuilt ${built.length} teams / ${named} named players`)

const projectId = existing?.activeTournamentId || existing?.tournaments?.[0]?.id || uid()
const projectName = existing?.tournaments?.[0]?.name || 'CME ML Tournament'
const tournamentState = {
  tournaments: [
    {
      id: projectId,
      name: projectName,
      formatSize: built.length <= 4 ? 4 : built.length <= 8 ? 8 : 16,
      teams: built,
      matchTitle: existing?.tournaments?.[0]?.matchTitle || 'MATCH 1 · GAME 1',
      logo: existing?.tournaments?.[0]?.logo || '',
      updatedAt: Date.now(),
    },
  ],
  activeTournamentId: projectId,
  activeMatchId: existing?.activeMatchId ?? null,
  blueTeamId: existing?.blueTeamId ?? null,
  redTeamId: existing?.redTeamId ?? null,
  status: existing?.status || 'idle',
}

writeFileSync(LOCKED, JSON.stringify(tournamentState), 'utf8')
writeFileSync(
  BACKUP,
  JSON.stringify(
    { version: 1, exportedAt: Date.now(), channels: { 'mlbb-tournament-state-v2': tournamentState } },
    null,
    0,
  ),
  'utf8',
)
if (existsSync(HUB)) {
  try {
    const hub = JSON.parse(readFileSync(HUB, 'utf8'))
    hub.tournament = tournamentState
    writeFileSync(HUB, JSON.stringify(hub), 'utf8')
    console.log('Updated hub-state.json')
  } catch (err) {
    console.warn('hub-state.json write failed', err.message)
  }
} else {
  writeFileSync(HUB, JSON.stringify({ tournament: tournamentState }), 'utf8')
}
console.log(`Locked ${named} players → ${LOCKED}`)

for (const url of HUB_URLS) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tournamentState),
    })
    console.log(`POST ${url} → ${res.status}`)
  } catch {
    console.log(`POST ${url} skipped`)
  }
}

for (const t of built) {
  console.log(
    `  ${t.tag} ${t.name} — ${t.players.filter(isNamedPlayer).map((p) => `${p.name} (${p.ign || 'no ign'})`).join(', ')}`,
  )
}
