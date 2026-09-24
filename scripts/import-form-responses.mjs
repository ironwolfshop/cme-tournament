/**
 * Import Google Form responses (live Google Sheet) → CME tournament backup + hub state.
 * Usage: node scripts/import-form-responses.mjs
 *
 * Sheet must be shared: Anyone with the link → Viewer
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const OUT = join(process.cwd(), 'scripts', '_import')
const MEDIA = join(process.cwd(), 'public', 'form-media')
const HUB = join(process.cwd(), 'node_modules', '.cache', 'obs-sync', 'hub-state.json')
const BACKUP = join(process.cwd(), 'public', 'cme-form-import.json')

/** Form responses spreadsheet (gid = Form Responses 1). */
const SHEET_ID = '1BrAK7b785kUmSDB8BwMuwYrfIjEsPyQT_WLJVEa4Fa8'
const SHEET_GID = '1767953180'
const FORCE_REDOWNLOAD = process.argv.includes('--fresh')

mkdirSync(OUT, { recursive: true })
mkdirSync(MEDIA, { recursive: true })
mkdirSync(join(process.cwd(), 'public'), { recursive: true })
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

function normalizeHeader(h) {
  return String(h || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function parseSheetTimestamp(raw) {
  const s = String(raw || '').trim()
  if (!s) return new Date(0).toISOString()
  // e.g. 9/23/2026 21:16:40
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
    throw new Error(
      `Could not download sheet (${lastErr || 'empty'}). Share it as Anyone with the link → Viewer.`,
    )
  }

  writeFileSync(join(OUT, 'sheet.csv'), csv, 'utf8')
  const table = parseCsv(csv)
  if (table.length < 2) throw new Error('Sheet CSV has no data rows')

  const headers = table[0]
  const iTs = colIndex(headers, 'TIMESTAMP')
  const iName = colIndex(headers, 'NAME')
  const iIgn = colIndex(headers, 'IN GAME NAME', 'IGN', 'IN-GAME NAME')
  const iPos = colIndex(headers, 'TEAM POSITION', 'POSITION')
  const iTeam = colIndex(headers, 'TEAM')
  const iRole = colIndex(headers, 'MLBB ROLE', 'ROLE')
  const iPhoto = colIndex(headers, 'PLAYERS PHOTO', 'PLAYER PHOTO', 'PHOTO')
  const iLogo = colIndex(headers, 'TEAM LOGO', 'LOGO')

  if (iName < 0 || iTeam < 0) {
    throw new Error(`Unexpected sheet headers: ${headers.join(' | ')}`)
  }

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
      position: String(cells[iPos] ?? 'MEMBER')
        .trim()
        .toUpperCase(),
      team,
      role: String(cells[iRole] ?? '')
        .trim()
        .toUpperCase(),
      photo: driveIdFromCell(cells[iPhoto]),
      logo: driveIdFromCell(cells[iLogo]),
    })
  }

  console.log(`Fetched ${rows.length} form rows from Google Sheet`)
  return rows
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

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normIgn(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
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

  // Pass 1: usercontent with confirm=t
  for (const url of driveUrls(id)) {
    const res = await fetch(url, { redirect: 'follow', headers })
    if (!res.ok) continue
    const ct = res.headers.get('content-type') || ''
    const ab = Buffer.from(await res.arrayBuffer())
    if (ct.includes('text/html') || ab.slice(0, 20).toString().includes('<!DOCTYPE') || ab.slice(0, 20).toString().includes('<html')) {
      // Try extract confirm link from virus-scan page
      const html = ab.toString('utf8')
      const token =
        html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1] ||
        html.match(/name="confirm"\s+value="([^"]+)"/)?.[1]
      if (token) {
        const retry = await fetch(
          `https://drive.google.com/uc?export=download&id=${id}&confirm=${token}`,
          { redirect: 'follow', headers },
        )
        if (retry.ok) {
          const body = Buffer.from(await retry.arrayBuffer())
          const rct = retry.headers.get('content-type') || ''
          if (
            !rct.includes('text/html') &&
            body.length > 800 &&
            !body.slice(0, 15).toString().includes('<!')
          ) {
            return body
          }
        }
      }
      continue
    }
    if (ab.length > 800) return ab
  }
  return null
}

async function downloadDrive(id, label) {
  if (!id) return ''
  const publicPath = join(MEDIA, `${id}.jpg`)
  const publicUrl = `/form-media/${id}.jpg`

  if (
    !FORCE_REDOWNLOAD &&
    existsSync(publicPath) &&
    readFileSync(publicPath).length > 800
  ) {
    console.log(`  · ${label} (cached file)`)
    return publicUrl
  }

  let buf
  try {
    buf = await fetchDriveBuffer(id)
    if (!buf) {
      console.warn(`  ✗ ${label} failed: blocked or missing`)
      return existsSync(publicPath) ? publicUrl : ''
    }
    // Video (mp4) uploads — fall back to Drive thumbnail still
    const isMp4 =
      buf.slice(4, 8).toString() === 'ftyp' ||
      buf.slice(0, 12).toString('hex').includes('66747970')
    if (isMp4 || buf.slice(4, 12).toString().includes('ftyp')) {
      console.log(`  … ${label} is video — downloading Drive thumbnail`)
      const thumb = await fetch(
        `https://drive.google.com/thumbnail?id=${id}&sz=w720`,
        {
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        },
      )
      if (thumb.ok) {
        const tbuf = Buffer.from(await thumb.arrayBuffer())
        if (tbuf.length > 800 && !tbuf.slice(0, 10).toString().includes('<!')) {
          buf = tbuf
        } else {
          console.warn(`  ✗ ${label} video has no usable thumbnail`)
          return existsSync(publicPath) ? publicUrl : ''
        }
      } else {
        console.warn(`  ✗ ${label} video thumbnail failed`)
        return existsSync(publicPath) ? publicUrl : ''
      }
    }
    console.log(`  ↓ ${label} downloaded (${(buf.length / 1024).toFixed(0)} KB)`)
  } catch (e) {
    console.warn(`  ✗ ${label} failed:`, e.message)
    return existsSync(publicPath) ? publicUrl : ''
  }

  try {
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
    writeFileSync(publicPath, jpeg)
    writeFileSync(join(OUT, `${id}.jpg`), jpeg)
    console.log(`  ✓ ${label} saved → ${publicUrl}`)
    return publicUrl
  } catch (e) {
    console.warn(`  ✗ compress ${label}:`, e.message)
    return ''
  }
}

function tagFromName(name) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase()
  const initials = words.map((w) => w[0]).join('').slice(0, 6).toUpperCase()
  return initials || 'TEAM'
}

async function buildTeams(ROWS) {
  // Dedupe by team + normalized IGN — keep latest timestamp
  const byKey = new Map()
  for (const row of ROWS) {
    const key = `${row.team}::${normIgn(row.ign)}`
    const prev = byKey.get(key)
    if (!prev || prev.ts < row.ts) byKey.set(key, row)
  }
  const unique = [...byKey.values()].sort((a, b) => a.ts.localeCompare(b.ts))

  const teamsMap = new Map()
  for (const row of unique) {
    if (!teamsMap.has(row.team)) {
      teamsMap.set(row.team, {
        name: row.team,
        tag: tagFromName(row.team),
        logoId: '',
        captainLogoId: '',
        players: [],
      })
    }
    const t = teamsMap.get(row.team)
    if (row.position === 'TEAM CAPTAIN' && row.logo) t.captainLogoId = row.logo
    if (row.logo && !t.logoId) t.logoId = row.logo
    t.players.push(row)
  }

  // Prefer captain logo
  for (const t of teamsMap.values()) {
    if (t.captainLogoId) t.logoId = t.captainLogoId
  }

  const teams = []
  let seed = 1
  for (const t of teamsMap.values()) {
    console.log(`\nTeam: ${t.name} (${t.players.length} players)`)
    const logo = await downloadDrive(t.logoId, `${t.name} logo`)

    // Slot starters by role; keep EVERY leftover as spare (no drops)
    const used = new Set()
    const roster = []
    for (const role of STARTER_ORDER) {
      const match = t.players.find(
        (p) => ROLE_MAP[p.role] === role && !used.has(normIgn(p.ign)),
      )
      if (match) {
        used.add(normIgn(match.ign))
        roster.push({ row: match, role })
      }
    }
    // Remaining players fill empty starter slots first
    const leftovers = t.players.filter((p) => !used.has(normIgn(p.ign)))
    for (const role of STARTER_ORDER) {
      if (roster.some((r) => r.role === role)) continue
      const next = leftovers.shift()
      if (!next) break
      used.add(normIgn(next.ign))
      roster.push({ row: next, role })
    }
    // All remaining players stay as spares — never drop anyone
    while (leftovers.length) {
      const spare = leftovers.shift()
      roster.push({ row: spare, role: 'spare' })
    }

    // Ensure 5 starter slots exist (empty fillers for incomplete teams)
    for (const role of STARTER_ORDER) {
      if (!roster.some((r) => r.role === role)) {
        roster.push({
          row: { ign: '', photo: '', name: '' },
          role,
          empty: true,
        })
      }
    }
    roster.sort((a, b) => {
      const ao = a.role === 'spare' ? 100 + roster.indexOf(a) : STARTER_ORDER.indexOf(a.role)
      const bo = b.role === 'spare' ? 100 + roster.indexOf(b) : STARTER_ORDER.indexOf(b.role)
      return ao - bo
    })

    const players = []
    for (let i = 0; i < roster.length; i++) {
      const slot = roster[i]
      let photo = ''
      if (!slot.empty && slot.row.photo) {
        photo = await downloadDrive(slot.row.photo, `${slot.row.ign || slot.role} photo`)
      }
      // Real NAME from the form — not in-game name
      const displayName = slot.empty
        ? ''
        : String(slot.row.name || slot.row.ign || '')
            .trim()
            .slice(0, 28)
      players.push({
        id: uid(),
        name: displayName,
        photo,
        role: slot.role,
        order: i,
        isLeader:
          !slot.empty &&
          /CAPTAIN|LEADER/.test(String(slot.row.position || '')),
      })
    }

    teams.push({
      id: uid(),
      name: t.name,
      tag: t.tag.slice(0, 8),
      logo,
      seed: seed++,
      players,
    })
  }

  return teams
}

const ROWS = await fetchSheetRows()
const teams = await buildTeams(ROWS)

const formTeams = teams

// Merge into existing hub tournament — keep other teams already there
let hub = {
  draft: null,
  gameplay: null,
  stinger: null,
  bracket: null,
  cams: null,
  lineup: null,
  tournament: null,
  casters: null,
}
if (existsSync(HUB)) {
  try {
    hub = { ...hub, ...JSON.parse(readFileSync(HUB, 'utf8')) }
  } catch {
    /* ignore */
  }
}

function teamMatchKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/BSMAR\s*E/g, 'BSME')
    .replace(/[^A-Z0-9]/g, '')
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
  return false
}

function appendMissingPlayers(existing, incoming) {
  const next = (existing.players || []).map((p) => ({ ...p }))
  let added = 0
  for (const ip of incoming.players || []) {
    if (!isNamedPlayer(ip)) continue
    const already = next.some(
      (p) => isNamedPlayer(p) && peopleMatch(p.name, p.ign, ip.name, ip.ign),
    )
    if (already) continue
    const roleSlot = next.findIndex(
      (p) => !isNamedPlayer(p) && p.role === ip.role,
    )
    const anyEmpty = next.findIndex((p) => !isNamedPlayer(p))
    const slot = roleSlot >= 0 ? roleSlot : anyEmpty
    if (slot >= 0) {
      const cur = next[slot]
      next[slot] = {
        ...cur,
        name: ip.name,
        ign: ip.ign || cur.ign || '',
        photo: ip.photo || cur.photo,
        photoOriginal: ip.photoOriginal || cur.photoOriginal,
        role: ip.role || cur.role,
        isLeader: ip.isLeader === true,
      }
      added += 1
      continue
    }
    if (next.length >= 8) continue
    next.push({
      ...ip,
      id: uid(),
      role: 'spare',
      order: next.length,
    })
    added += 1
  }
  return { players: next.map((p, i) => ({ ...p, order: i })), added }
}

function findExistingTeam(incoming, teams) {
  const key = teamMatchKey(incoming.name)
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

function mergeTournament(existing, incomingTeams) {
  const base =
    existing && typeof existing === 'object' && Array.isArray(existing.tournaments)
      ? existing
      : null

  if (!base || !base.tournaments?.length) {
    const project = {
      id: uid(),
      name: 'CME ML Tournament',
      formatSize: 8,
      teams: incomingTeams,
      matchTitle: 'MATCH 1 · GAME 1',
      logo: '',
      updatedAt: Date.now(),
    }
    return {
      tournaments: [project],
      activeTournamentId: project.id,
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    }
  }

  const activeId = base.activeTournamentId || base.tournaments[0]?.id
  const tournaments = base.tournaments.map((proj) => {
    if (proj.id !== activeId) return proj
    const nextTeams = [...(proj.teams || [])]
    for (const incoming of incomingTeams) {
      const prev = findExistingTeam(incoming, nextTeams)
      if (prev) {
        const merged = appendMissingPlayers(prev, incoming)
        const idx = nextTeams.findIndex((t) => t.id === prev.id)
        if (idx >= 0) {
          nextTeams[idx] = {
            ...prev,
            players: merged.players,
          }
        }
        continue
      }
      nextTeams.push({ ...incoming, seed: nextTeams.length + 1 })
    }
    const formatSize =
      nextTeams.length <= 4 ? 4 : nextTeams.length <= 8 ? 8 : 16
    return {
      ...proj,
      formatSize: Math.max(proj.formatSize || 8, formatSize),
      teams: nextTeams.map((t, i) =>
        i < (proj.teams || []).length ? t : { ...t, seed: i + 1 },
      ),
      updatedAt: Date.now(),
    }
  })

  return {
    ...base,
    tournaments,
    activeTournamentId: activeId,
  }
}

const tournamentState = mergeTournament(hub.tournament, formTeams)

const backup = {
  version: 1,
  exportedAt: Date.now(),
  channels: {
    'mlbb-tournament-state-v2': tournamentState,
  },
}

writeFileSync(BACKUP, JSON.stringify(backup), 'utf8')
writeFileSync(join(OUT, 'tournament.json'), JSON.stringify(tournamentState), 'utf8')

hub.tournament = tournamentState
writeFileSync(HUB, JSON.stringify(hub), 'utf8')

// Also POST to running sync hub if available
try {
  const res = await fetch('http://localhost:5173/api/sync/tournament', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tournamentState),
  })
  console.log(`\nHub POST: ${res.status}`)
} catch {
  console.log('\nHub POST skipped (dev server not running)')
}

const active =
  tournamentState.tournaments.find(
    (t) => t.id === tournamentState.activeTournamentId,
  ) || tournamentState.tournaments[0]
console.log(`\nDone. Active tournament has ${active?.teams?.length ?? 0} teams (merged)`)
for (const t of active?.teams ?? []) {
  const named = t.players.filter((p) => p.name).length
  const photos = t.players.filter((p) => p.photo).length
  console.log(
    `  ${t.tag} ${t.name} — ${named} named, ${photos} photos, ${t.players.length} slots, logo=${t.logo ? 'yes' : 'no'}`,
  )
}
console.log(`\nBackup: ${BACKUP}`)
console.log('Open /control/tournament?import=form   or Settings → Load form teams')
