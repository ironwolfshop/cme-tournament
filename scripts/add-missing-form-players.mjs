/**
 * Add-only: compare the live Google Form to the running tournament
 * and insert players that are not already on a roster.
 * Existing named players / team metadata are never overwritten.
 *
 * Usage: node scripts/add-missing-form-players.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const SHEET_ID = '1BrAK7b785kUmSDB8BwMuwYrfIjEsPyQT_WLJVEa4Fa8'
const SHEET_GID = '1767953180'
const HUB = join(process.cwd(), 'node_modules', '.cache', 'obs-sync', 'hub-state.json')
const MEDIA = join(process.cwd(), 'public', 'form-media')
const HUB_URLS = [
  'http://localhost:5173/api/sync/tournament',
  'http://localhost:5210/api/sync/tournament',
]

mkdirSync(MEDIA, { recursive: true })

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
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      if (c === '\r') i++
      row.push(cell)
      cell = ''
      if (row.some((v) => String(v).trim())) rows.push(row)
      row = []
    } else if (c !== '\r') {
      cell += c
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    if (row.some((v) => String(v).trim())) rows.push(row)
  }
  return rows
}

function normalizeHeader(h) {
  return String(h || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
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
    const dt = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se),
    )
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? s : fallback.toISOString()
}

function compactPerson(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function isNamedPlayer(p) {
  const n = String(p?.name || '').trim()
  if (!n) return false
  return !/^PLAYER\s*\d+$/i.test(n)
}

function editDistance(a, b) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 3) return 99
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = new Int16Array(rows * cols)
  for (let i = 0; i < rows; i++) dp[i * cols] = i
  for (let j = 0; j < cols; j++) dp[j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const idx = i * cols + j
      dp[idx] = Math.min(
        dp[(i - 1) * cols + j] + 1,
        dp[i * cols + (j - 1)] + 1,
        dp[(i - 1) * cols + (j - 1)] + cost,
      )
    }
  }
  return dp[(rows - 1) * cols + (cols - 1)]
}

function peopleMatch(aName, aIgn, bName, bIgn) {
  const na = compactPerson(aName)
  const nb = compactPerson(bName)
  const ia = compactPerson(aIgn)
  const ib = compactPerson(bIgn)
  if (ia && ib && ia === ib) return true
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return true
  }
  return Math.max(na.length, nb.length) >= 14 && editDistance(na, nb) <= 2
}

function teamMatchKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/BSMAR\s*E/g, 'BSME')
    .replace(/[^A-Z0-9]/g, '')
}

function findTeam(name, teams) {
  const key = teamMatchKey(name)
  for (const t of teams) {
    if (teamMatchKey(t.name) === key) return t
  }
  for (const t of teams) {
    const ek = teamMatchKey(t.name)
    if (!ek || !key) continue
    if (ek.includes(key) || key.includes(ek)) return t
  }
  return null
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

async function fetchSheetRows() {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`,
  ]
  let csv = ''
  let lastErr = ''
  for (const url of urls) {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    const text = await res.text()
    if (!res.ok || text.includes('<!DOCTYPE') || text.includes('<html')) {
      lastErr = `HTTP ${res.status}`
      continue
    }
    csv = text
    break
  }
  if (!csv) {
    throw new Error(`Could not download sheet (${lastErr || 'empty'})`)
  }
  const table = parseCsv(csv)
  const headers = table[0]
  const iTs = colIndex(headers, 'TIMESTAMP')
  const iName = colIndex(headers, 'NAME')
  const iIgn = colIndex(headers, 'IN GAME NAME', 'IGN', 'IN-GAME NAME')
  const iPos = colIndex(headers, 'TEAM POSITION', 'POSITION')
  const iTeam = colIndex(headers, 'TEAM')
  const iRole = colIndex(headers, 'MLBB ROLE', 'ROLE')
  const iPhoto = colIndex(headers, 'PLAYERS PHOTO', 'PLAYER PHOTO', 'PHOTO')
  const rows = []
  for (const cells of table.slice(1)) {
    const name = String(cells[iName] ?? '').trim()
    const team = String(cells[iTeam] ?? '').trim()
    const ign = String(cells[iIgn] ?? '').trim()
    if (!name && !ign) continue
    if (!team) continue
    rows.push({
      ts: parseSheetTimestamp(cells[iTs]),
      name,
      ign: ign || name,
      position: String(cells[iPos] ?? 'MEMBER').trim().toUpperCase(),
      team,
      role: String(cells[iRole] ?? '').trim().toUpperCase(),
      photo: driveIdFromCell(cells[iPhoto]),
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

function driveUrls(id) {
  return [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`,
    `https://lh3.googleusercontent.com/d/${id}=s720`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w720`,
  ]
}

async function fetchDriveBuffer(id) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }
  for (const url of driveUrls(id)) {
    const res = await fetch(url, { redirect: 'follow', headers })
    if (!res.ok) continue
    const ct = res.headers.get('content-type') || ''
    const ab = Buffer.from(await res.arrayBuffer())
    if (
      ct.includes('text/html') ||
      ab.slice(0, 20).toString().includes('<!DOCTYPE') ||
      ab.slice(0, 20).toString().includes('<html')
    ) {
      continue
    }
    if (ab.length > 800) return ab
  }
  return null
}

async function photoDataUrl(id, label) {
  if (!id) return ''
  const publicPath = join(MEDIA, `${id}.jpg`)
  let jpeg
  if (existsSync(publicPath) && readFileSync(publicPath).length > 800) {
    jpeg = readFileSync(publicPath)
    console.log(`  · ${label} (cached file)`)
  } else {
    const buf = await fetchDriveBuffer(id)
    if (!buf) {
      console.warn(`  ✗ ${label} failed: blocked or missing`)
      return ''
    }
    jpeg = await sharp(buf)
      .rotate()
      .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
    writeFileSync(publicPath, jpeg)
    console.log(`  ✓ ${label} saved (${(jpeg.length / 1024).toFixed(0)} KB)`)
  }
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

function namedCount(state) {
  const active =
    state?.tournaments?.find((t) => t.id === state.activeTournamentId) ||
    state?.tournaments?.[0]
  if (!active) return 0
  return (active.teams || []).reduce(
    (n, team) => n + (team.players || []).filter((p) => isNamedPlayer(p)).length,
    0,
  )
}

async function loadLiveTournament() {
  let best = null
  let bestUrl = ''
  for (const url of HUB_URLS) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      if (!json?.tournaments) continue
      const weight = namedCount(json)
      console.log(`hub ${url} namedPlayers=${weight}`)
      if (!best || weight > namedCount(best)) {
        best = json
        bestUrl = url
      }
    } catch {
      console.log(`hub ${url} unreachable`)
    }
  }
  if (!best && existsSync(HUB)) {
    const disk = JSON.parse(readFileSync(HUB, 'utf8'))
    best = disk.tournament
    bestUrl = 'disk'
    console.log(`hub disk namedPlayers=${namedCount(best)}`)
  }
  if (!best) throw new Error('No tournament state found')
  return { state: best, url: bestUrl }
}

function applyMissing(state, missing) {
  const added = []
  const activeId = state.activeTournamentId || state.tournaments[0]?.id
  const tournaments = state.tournaments.map((proj) => {
    if (proj.id !== activeId) return proj
    const teams = proj.teams.map((t) => ({
      ...t,
      players: t.players.map((p) => ({ ...p })),
    }))
    for (const row of missing) {
      const team = findTeam(row.team, teams)
      if (!team) {
        console.warn(`  ! no team for ${row.name} (${row.team}) — skipped`)
        continue
      }
      const role = ROLE_MAP[row.role] || 'spare'
      const roleSlot = team.players.findIndex(
        (p) => !isNamedPlayer(p) && p.role === role,
      )
      const anyEmpty = team.players.findIndex((p) => !isNamedPlayer(p))
      const slot = roleSlot >= 0 ? roleSlot : anyEmpty
      const player = {
        name: String(row.name || row.ign).slice(0, 28),
        ign: String(row.ign || '').slice(0, 20),
        photo: row.photoData || '',
        photoOriginal: row.photoData || '',
        role,
        isLeader: /CAPTAIN|LEADER/.test(row.position),
      }
      if (slot >= 0) {
        const cur = team.players[slot]
        team.players[slot] = {
          ...cur,
          ...player,
          role: player.role || cur.role,
        }
      } else if (team.players.length < 8) {
        team.players.push({
          id: uid(),
          ...player,
          order: team.players.length,
        })
      } else {
        console.warn(`  ! ${team.name} roster full — skipped ${row.name}`)
        continue
      }
      team.players = team.players.map((p, i) => ({ ...p, order: i }))
      added.push(`${player.name} → ${team.name} (${role})`)
    }
    return { ...proj, teams, updatedAt: Date.now() }
  })
  return { state: { ...state, tournaments }, added }
}

const rows = await fetchSheetRows()
console.log(`Form unique players: ${rows.length}`)

const { state, url } = await loadLiveTournament()
const active =
  state.tournaments.find((t) => t.id === state.activeTournamentId) ||
  state.tournaments[0]
const teams = active?.teams || []

console.log(`\nLive system: ${active.name} via ${url}`)
for (const t of teams) {
  const named = t.players.filter((p) => isNamedPlayer(p))
  console.log(
    `  ${t.tag} ${t.name} — ${named.length} named: ${named.map((p) => p.name).join(', ') || '(none)'}`,
  )
}

const already = []
const missing = []
for (const row of rows) {
  const team = findTeam(row.team, teams)
  if (!team) {
    missing.push(row)
    continue
  }
  const hit = team.players.some(
    (p) => isNamedPlayer(p) && peopleMatch(p.name, p.ign, row.name, row.ign),
  )
  if (hit) already.push(row)
  else missing.push(row)
}

console.log(`\nAlready in system (left alone): ${already.length}`)
for (const r of already) console.log(`  · ${r.name} / ${r.ign} — ${r.team}`)
console.log(`\nNot yet added: ${missing.length}`)
for (const r of missing) console.log(`  + ${r.name} / ${r.ign} — ${r.team} ${r.role}`)

if (!missing.length) {
  console.log('\nNothing to add.')
  process.exit(0)
}

for (const row of missing) {
  row.photoData = await photoDataUrl(row.photo, `${row.ign || row.name} photo`)
}

const result = applyMissing(state, missing)
console.log(`\nAdded ${result.added.length}:`)
for (const line of result.added) console.log(`  ✓ ${line}`)

const postUrl = url.startsWith('http') ? url : 'http://localhost:5173/api/sync/tournament'
try {
  const res = await fetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.state),
  })
  console.log(`\nHub POST ${postUrl}: ${res.status}`)
} catch (err) {
  console.warn(`\nHub POST failed: ${err.message}`)
}

if (existsSync(HUB)) {
  try {
    const hub = JSON.parse(readFileSync(HUB, 'utf8'))
    hub.tournament = result.state
    writeFileSync(HUB, JSON.stringify(hub), 'utf8')
    console.log('Updated hub-state.json')
  } catch (err) {
    console.warn('Could not write hub-state.json:', err.message)
  }
}
