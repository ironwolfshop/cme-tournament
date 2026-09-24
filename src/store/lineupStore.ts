import { create } from 'zustand'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { useDraftStore, type TeamSide } from './draftStore'

export type RevealLayout = 'layered' | 'lineup'
export type RevealRow = 'back' | 'front'
/** Classic cutout stage vs SEA-Games style vertical card roster. */
export type RevealTemplate = 'stage' | 'cards'

export type LineupPlayer = {
  name: string
  /** MLBB in-game name — preferred on reveal cards / cast. */
  ign: string
  subtitle: string
  photo: string
  /** Original photo before background removal — used to restore / re-cut. */
  photoOriginal: string
  /** Spreadsheet Team Captain / Team Leader — shown centered on stage. */
  isLeader: boolean
  heroId: string
  row: RevealRow
  scale: number
  x: number
  y: number
  flip: boolean
}

export type LineupTeam = {
  teamName: string
  teamTag: string
  teamLogo: string
  headline: string
  /** Tournament team id this side was loaded from — used to persist cutouts. */
  sourceTeamId: string
  players: LineupPlayer[]
}

export type LineupState = {
  editSide: TeamSide
  autoRotate: boolean
  rotateSeconds: number
  soloSeconds: number
  includeSolo: boolean
  soloBlueIndex: number
  soloRedIndex: number
  introLabel: string
  subtitle: string
  sponsorRight: string
  footerSponsors: string
  /** Team Reveal — cursive season / event title */
  sceneTitle: string
  accent: string
  layout: RevealLayout
  /** Which Team Reveal visual template to render on OBS. */
  template: RevealTemplate
  /** How many members are currently revealed on the OBS scene */
  revealed: number
  playing: boolean
  blue: LineupTeam
  red: LineupTeam
}

type Actions = {
  setEditSide: (side: TeamSide) => void
  setAutoRotate: (on: boolean) => void
  setRotateSeconds: (seconds: number) => void
  setSoloSeconds: (seconds: number) => void
  setIncludeSolo: (on: boolean) => void
  setSoloIndex: (side: TeamSide, index: number) => void
  setShared: (
    patch: Partial<
      Pick<
        LineupState,
        | 'introLabel'
        | 'subtitle'
        | 'sponsorRight'
        | 'footerSponsors'
        | 'sceneTitle'
        | 'accent'
        | 'layout'
        | 'template'
      >
    >,
  ) => void
  updateTeam: (side: TeamSide, patch: Partial<Omit<LineupTeam, 'players'>>) => void
  updatePlayer: (
    side: TeamSide,
    index: number,
    patch: Partial<LineupPlayer>,
  ) => void
  /** Batch-update several players and persist once. */
  updatePlayers: (
    side: TeamSide,
    patches: { index: number; patch: Partial<LineupPlayer> }[],
  ) => void
  movePlayer: (side: TeamSide, index: number, direction: -1 | 1) => void
  autoArrange: (side?: TeamSide) => void
  setRevealed: (count: number, opts?: { keepPlaying?: boolean }) => void
  hideAll: () => void
  revealNext: () => void
  showAll: () => void
  setPlaying: (playing: boolean) => void
  /** Advance one reveal while optionally continuing autoplay. */
  advanceReveal: () => void
  loadFromDraft: (side: TeamSide) => void
  loadBothFromDraft: () => void
  loadFromTournamentTeams: (
    blue: {
      id?: string
      name: string
      tag: string
      logo: string
      players: {
        name: string
        ign?: string
        photo: string
        role: string
        order: number
        isLeader?: boolean
        photoOriginal?: string
      }[]
    },
    red: {
      id?: string
      name: string
      tag: string
      logo: string
      players: {
        name: string
        ign?: string
        photo: string
        role: string
        order: number
        isLeader?: boolean
        photoOriginal?: string
      }[]
    },
    projectName?: string,
  ) => void
  loadTournamentTeamToSide: (
    side: TeamSide,
    team: {
      id?: string
      name: string
      tag: string
      logo: string
      players: {
        name: string
        ign?: string
        photo: string
        role: string
        order: number
        isLeader?: boolean
        photoOriginal?: string
      }[]
    },
    projectName?: string,
  ) => void
  clearMatchTeams: () => void
  hydrate: (state: Partial<LineupState> & Record<string, unknown>) => void
}

export type LineupStore = LineupState & Actions

const STORAGE_KEY = 'mlbb-lineup-state-v5'
let applyingRemote = false

const ROLE_LABEL: Record<string, string> = {
  exp: 'EXP',
  jungle: 'Jungle',
  mid: 'Mid',
  gold: 'Gold',
  roam: 'Roam',
  spare: 'Substitute',
}

export function roleToRevealLabel(role: string): string {
  const key = role.toLowerCase()
  if (ROLE_LABEL[key]) return ROLE_LABEL[key]
  const upper = role.trim()
  if (!upper) return 'Substitute'
  return upper.charAt(0).toUpperCase() + upper.slice(1)
}

function emptyPlayer(index = 0): LineupPlayer {
  return {
    name: '',
    ign: '',
    subtitle: '',
    photo: '',
    photoOriginal: '',
    isLeader: false,
    heroId: '',
    row: index < 3 ? 'back' : 'front',
    scale: 1,
    x: 0,
    y: 0,
    flip: false,
  }
}

function clampNum(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizePlayer(
  raw: Partial<LineupPlayer> | undefined,
  fallback: LineupPlayer,
): LineupPlayer {
  if (!raw || typeof raw !== 'object') return fallback
  return {
    name: String(raw.name ?? fallback.name).slice(0, 48),
    ign: String(raw.ign ?? fallback.ign ?? '').slice(0, 20),
    subtitle: String(raw.subtitle ?? fallback.subtitle).slice(0, 32),
    photo: typeof raw.photo === 'string' ? raw.photo : '',
    photoOriginal:
      typeof raw.photoOriginal === 'string'
        ? raw.photoOriginal
        : typeof raw.photo === 'string'
          ? ''
          : '',
    isLeader: raw.isLeader === true,
    heroId: typeof raw.heroId === 'string' ? raw.heroId : '',
    row: raw.row === 'back' ? 'back' : 'front',
    scale: clampNum(raw.scale, fallback.scale, 0.65, 1.8),
    x: clampNum(raw.x, fallback.x, -18, 18),
    y: clampNum(raw.y, fallback.y, -15, 15),
    flip: raw.flip === true,
  }
}

/** Always keep at least 5 slots for draft/gameplay compatibility. */
function normalizePlayersFixed(raw: unknown, size = 5): LineupPlayer[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: size }, (_, i) =>
    normalizePlayer(list[i] as Partial<LineupPlayer> | undefined, emptyPlayer(i)),
  )
}

function defaultTeam(name: string, tag: string, players: string[]): LineupTeam {
  return {
    teamName: name,
    teamTag: tag,
    teamLogo: '',
    headline: name.toUpperCase(),
    sourceTeamId: '',
    players: normalizePlayersFixed(
      players.map((n, i) => ({ ...emptyPlayer(i), name: n })),
    ),
  }
}

function normalizeTeam(raw: unknown, fallback: LineupTeam): LineupTeam {
  if (!raw || typeof raw !== 'object') return fallback
  const t = raw as Partial<LineupTeam>
  return {
    teamName: String(t.teamName ?? fallback.teamName).slice(0, 40),
    teamTag: String(t.teamTag ?? fallback.teamTag).slice(0, 8),
    teamLogo: typeof t.teamLogo === 'string' ? t.teamLogo : '',
    headline: String(t.headline ?? fallback.headline).slice(0, 48),
    sourceTeamId:
      typeof t.sourceTeamId === 'string'
        ? t.sourceTeamId
        : fallback.sourceTeamId || '',
    players: normalizePlayersFixed(t.players ?? fallback.players, 5),
  }
}

function defaults(): LineupState {
  return {
    editSide: 'blue',
    autoRotate: true,
    rotateSeconds: 10,
    soloSeconds: 5,
    includeSolo: false,
    soloBlueIndex: 0,
    soloRedIndex: 0,
    introLabel: 'CME ML TOURNAMENT',
    subtitle: 'OFFICIAL ROSTER',
    sponsorRight: "MEN'S DIVISION",
    footerSponsors: '',
    sceneTitle: 'Season 8',
    accent: '#ef591f',
    layout: 'layered',
    template: 'stage',
    revealed: 5,
    playing: false,
    blue: defaultTeam('', '', ['', '', '', '', '']),
    red: defaultTeam('', '', ['', '', '', '', '']),
  }
}

function clampSoloIndex(n: unknown, fallback = 2) {
  const v = typeof n === 'number' ? n : fallback
  return Math.max(0, Math.min(4, Math.round(v)))
}

function clampSeconds(n: unknown, fallback: number, min = 2, max = 60) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function migrateLegacy(parsed: Record<string, unknown>): Partial<LineupState> {
  const base = defaults()
  const accent =
    typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent)
      ? parsed.accent
      : base.accent
  const layout = parsed.layout === 'lineup' ? 'lineup' : 'layered'
  const template: RevealTemplate =
    parsed.template === 'cards' ? 'cards' : 'stage'
  const sceneTitle = String(parsed.sceneTitle ?? base.sceneTitle).slice(0, 36)

  if (parsed.blue && parsed.red) {
    const blue = normalizeTeam(parsed.blue, base.blue)
    const red = normalizeTeam(parsed.red, base.red)
    const editSide = parsed.editSide === 'red' ? 'red' : 'blue'
    const team = editSide === 'red' ? red : blue
    return {
      editSide,
      autoRotate: parsed.autoRotate === true,
      rotateSeconds: clampSeconds(parsed.rotateSeconds, 20),
      soloSeconds: clampSeconds(parsed.soloSeconds, 5),
      includeSolo: parsed.includeSolo === true,
      soloBlueIndex: clampSoloIndex(parsed.soloBlueIndex, 2),
      soloRedIndex: clampSoloIndex(parsed.soloRedIndex, 2),
      introLabel: String(parsed.introLabel ?? base.introLabel),
      subtitle: String(parsed.subtitle ?? base.subtitle),
      sponsorRight: String(parsed.sponsorRight ?? base.sponsorRight),
      footerSponsors: String(parsed.footerSponsors ?? base.footerSponsors),
      sceneTitle,
      accent,
      layout,
      template,
      revealed: Math.round(
        clampNum(parsed.revealed, team.players.length, 0, team.players.length),
      ),
      playing: parsed.playing === true,
      blue,
      red,
    }
  }

  const side = parsed.side === 'red' ? 'red' : 'blue'
  const legacyTeam: LineupTeam = {
    teamName: String(parsed.teamName ?? base[side].teamName),
    teamTag: String(parsed.teamTag ?? base[side].teamTag),
    teamLogo: typeof parsed.teamLogo === 'string' ? parsed.teamLogo : '',
    headline: String(parsed.headline ?? base[side].headline),
    sourceTeamId: '',
    players: normalizePlayersFixed(parsed.players),
  }
  return {
    ...base,
    editSide: side,
    sceneTitle,
    accent,
    layout,
    template,
    revealed: legacyTeam.players.length,
    blue: side === 'blue' ? legacyTeam : base.blue,
    red: side === 'red' ? legacyTeam : base.red,
    introLabel: String(parsed.introLabel ?? base.introLabel),
    subtitle: String(parsed.subtitle ?? base.subtitle),
    sponsorRight: String(parsed.sponsorRight ?? base.sponsorRight),
    footerSponsors: String(parsed.footerSponsors ?? base.footerSponsors),
  }
}

function loadStored(): LineupState | null {
  const raw =
    loadJsonSync<Record<string, unknown>>(STORAGE_KEY) ??
    loadJsonSync<Record<string, unknown>>('mlbb-lineup-state-v4') ??
    loadJsonSync<Record<string, unknown>>('mlbb-lineup-state-v2') ??
    loadJsonSync<Record<string, unknown>>('mlbb-lineup-state-v1')
  if (!raw) return null
  return { ...defaults(), ...migrateLegacy(raw) }
}

function snapshot(s: LineupState): LineupState {
  return {
    editSide: s.editSide,
    autoRotate: s.autoRotate,
    rotateSeconds: s.rotateSeconds,
    soloSeconds: s.soloSeconds,
    includeSolo: s.includeSolo,
    soloBlueIndex: s.soloBlueIndex,
    soloRedIndex: s.soloRedIndex,
    introLabel: s.introLabel,
    subtitle: s.subtitle,
    sponsorRight: s.sponsorRight,
    footerSponsors: s.footerSponsors,
    sceneTitle: s.sceneTitle,
    accent: s.accent,
    layout: s.layout,
    template: s.template,
    revealed: s.revealed,
    playing: s.playing,
    blue: {
      ...s.blue,
      players: s.blue.players.map((p) => ({ ...p })),
    },
    red: {
      ...s.red,
      players: s.red.players.map((p) => ({ ...p })),
    },
  }
}

function push(state: LineupState) {
  if (applyingRemote) return
  saveJsonFire(STORAGE_KEY, state)
  pushSync('lineup', state)
}

function ensureTeamLeader(players: LineupPlayer[]): LineupPlayer[] {
  if (players.some((p) => p.isLeader && p.name.trim())) return players
  const mid = players.findIndex(
    (p) => p.name.trim() && /mid/i.test(p.subtitle || ''),
  )
  if (mid >= 0) {
    return players.map((p, i) => ({ ...p, isLeader: i === mid }))
  }
  const named = players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.name.trim())
  if (!named.length) return players
  const pick = named[Math.floor(named.length / 2)]!.i
  return players.map((p, i) => ({ ...p, isLeader: i === pick }))
}

function arrangePlayers(
  players: LineupPlayer[],
  layout: RevealLayout,
): LineupPlayer[] {
  const withLeader = ensureTeamLeader(players)
  if (layout === 'lineup') {
    return withLeader.map((p) => ({
      ...p,
      row: 'front' as const,
      x: 0,
      y: 0,
      scale: 1,
    }))
  }
  // Layered: team leader always stands in the front row (centered by positionMember).
  const backSlots = Math.floor(withLeader.length / 2)
  let backFilled = 0
  return withLeader.map((p) => {
    let row: RevealRow
    if (p.isLeader) {
      row = 'front'
    } else if (backFilled < backSlots) {
      row = 'back'
      backFilled += 1
    } else {
      row = 'front'
    }
    return { ...p, row, x: 0, y: 0, scale: 1 }
  })
}

function mapTournamentPlayers(
  players: {
    name: string
    ign?: string
    photo: string
    role: string
    order: number
    isLeader?: boolean
    photoOriginal?: string
  }[],
): LineupPlayer[] {
  const sorted = [...players].sort((a, b) => a.order - b.order)
  return ensureTeamLeader(
    normalizePlayersFixed(
      Array.from({ length: 5 }, (_, i) => {
        const p = sorted[i]
        const photo = p?.photo ?? ''
        const original = p?.photoOriginal || photo
        return {
          ...emptyPlayer(i),
          name: p?.name?.trim() ?? '',
          ign: p?.ign?.trim() ?? '',
          subtitle: p ? roleToRevealLabel(String(p.role)) : '',
          photo,
          photoOriginal: original,
          isLeader: p?.isLeader === true,
        }
      }),
    ),
  )
}

/** Build a LineupTeam from a tournament roster (for overlay rotation / previews). */
export function lineupTeamFromTournament(
  teamSrc: {
    id?: string
    name: string
    tag: string
    logo: string
    players: {
      name: string
      ign?: string
      photo: string
      role: string
      order: number
      isLeader?: boolean
      photoOriginal?: string
    }[]
  },
  layout: RevealLayout = 'layered',
): LineupTeam {
  return {
    teamName: teamSrc.name,
    teamTag: teamSrc.tag,
    teamLogo: teamSrc.logo,
    headline: teamSrc.name.toUpperCase(),
    sourceTeamId: teamSrc.id ?? '',
    players: arrangePlayers(mapTournamentPlayers(teamSrc.players), layout),
  }
}

function teamFromDraft(side: TeamSide, layout: RevealLayout = 'layered'): LineupTeam {
  const draft = useDraftStore.getState()
  const team = draft[side]
  return {
    teamName: team.name,
    teamTag: team.tag,
    teamLogo: team.logo,
    headline: team.name.toUpperCase(),
    sourceTeamId: '',
    players: arrangePlayers(
      normalizePlayersFixed(
        team.players.map((p, i) => ({
          ...emptyPlayer(i),
          name: p.name,
          photo: p.photo ?? '',
          photoOriginal: p.photo ?? '',
          heroId: team.picks[i] ?? '',
        })),
      ),
      layout,
    ),
  }
}

/** Classic Team Reveal placement — team leader is pinned to stage center. */
export function positionMember(
  layout: RevealLayout,
  members: LineupPlayer[],
  index: number,
): { left: number; bottom: number; width: number; height: number; z: number } {
  const m = members[index]!
  const row = layout === 'lineup' ? 'front' : m.row
  const groupIdxs = members
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (layout === 'lineup' ? 'front' : p.row) === row)
    .map(({ i }) => i)

  const leaderInRow = groupIdxs.find((i) => members[i]!.isLeader)
  let order = [...groupIdxs]
  if (leaderInRow !== undefined) {
    const rest = order.filter((i) => i !== leaderInRow)
    const left = rest.slice(0, Math.floor(rest.length / 2))
    const right = rest.slice(Math.floor(rest.length / 2))
    order = [...left, leaderInRow, ...right]
  }

  const slot = Math.max(0, order.indexOf(index))
  const n = order.length
  const width = Math.min(n === 1 ? 46 : 40, 112 / Math.max(3, n))
  const height = row === 'back' ? 64 : 60
  const bottom = (row === 'back' ? 19 : 7.5) + m.y
  const z = m.isLeader ? 40 : row === 'back' ? 10 + slot : 30 + slot

  // Pin leader to exact stage center; space the rest symmetrically around them.
  if (leaderInRow !== undefined && n > 1) {
    const leaderSlot = order.indexOf(leaderInRow)
    const spacing =
      n === 2 ? 22 : n === 3 ? (row === 'back' ? 20 : 22) : Math.min(18, 72 / (n - 1))
    if (index === leaderInRow) {
      return { left: 50 + m.x, bottom, width, height, z }
    }
    const offset = slot - leaderSlot
    return {
      left: 50 + offset * spacing + m.x,
      bottom,
      width,
      height,
      z,
    }
  }

  const span =
    n === 1
      ? 0
      : n === 2
        ? 37
        : n === 3
          ? row === 'back'
            ? 48
            : 56
          : Math.min(78, 58 + (n - 3) * 7)
  const base = 50 - span / 2 + (n === 1 ? 0 : (span * slot) / (n - 1))
  return {
    left: base + m.x,
    bottom,
    width,
    height,
    z,
  }
}

const initial = loadStored() ?? defaults()

export const useLineupStore = create<LineupStore>((set, get) => ({
  ...initial,

  setEditSide: (editSide) => {
    const team = get()[editSide]
    set({
      editSide,
      revealed: team.players.length,
      playing: false,
    })
    push(snapshot(get()))
  },

  setAutoRotate: (autoRotate) => {
    set({ autoRotate })
    push(snapshot(get()))
  },

  setRotateSeconds: (seconds) => {
    set({ rotateSeconds: clampSeconds(seconds, 20) })
    push(snapshot(get()))
  },

  setSoloSeconds: (seconds) => {
    set({ soloSeconds: clampSeconds(seconds, 5) })
    push(snapshot(get()))
  },

  setIncludeSolo: (includeSolo) => {
    set({ includeSolo })
    push(snapshot(get()))
  },

  setSoloIndex: (side, index) => {
    const i = clampSoloIndex(index, 2)
    if (side === 'blue') set({ soloBlueIndex: i })
    else set({ soloRedIndex: i })
    push(snapshot(get()))
  },

  setShared: (patch) => {
    set(patch)
    push(snapshot(get()))
  },

  updateTeam: (side, patch) => {
    set({ [side]: { ...get()[side], ...patch } })
    push(snapshot(get()))
  },

  updatePlayer: (side, index, patch) => {
    const team = get()[side]
    let players = team.players.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    )
    if (patch.isLeader === true) {
      players = arrangePlayers(
        players.map((p, i) => ({ ...p, isLeader: i === index })),
        get().layout,
      )
    }
    set({ [side]: { ...team, players } })
    push(snapshot(get()))
  },

  updatePlayers: (side, patches) => {
    if (!patches.length) return
    const team = get()[side]
    const map = new Map(patches.map((p) => [p.index, p.patch]))
    const players = team.players.map((p, i) => {
      const patch = map.get(i)
      return patch ? { ...p, ...patch } : p
    })
    set({ [side]: { ...team, players } })
    push(snapshot(get()))
  },

  movePlayer: (side, index, direction) => {
    const team = get()[side]
    const next = index + direction
    if (next < 0 || next >= team.players.length) return
    const players = [...team.players]
    ;[players[index], players[next]] = [players[next]!, players[index]!]
    set({ [side]: { ...team, players }, playing: false })
    push(snapshot(get()))
  },

  autoArrange: (side) => {
    const target = side ?? get().editSide
    const layout = get().layout
    const team = get()[target]
    set({
      [target]: { ...team, players: arrangePlayers(team.players, layout) },
    })
    push(snapshot(get()))
  },

  setRevealed: (count, opts) => {
    const team = get()[get().editSide]
    const revealed = Math.max(0, Math.min(count, team.players.length))
    const keep = opts?.keepPlaying === true
    set({
      revealed,
      playing: keep ? revealed < team.players.length && get().playing : false,
    })
    push(snapshot(get()))
  },

  hideAll: () => {
    set({ revealed: 0, playing: false })
    push(snapshot(get()))
  },

  revealNext: () => {
    const team = get()[get().editSide]
    const revealed = Math.min(get().revealed + 1, team.players.length)
    set({ revealed, playing: false })
    push(snapshot(get()))
  },

  showAll: () => {
    const team = get()[get().editSide]
    set({ revealed: team.players.length, playing: false })
    push(snapshot(get()))
  },

  setPlaying: (playing) => {
    set({ playing })
    push(snapshot(get()))
  },

  advanceReveal: () => {
    const team = get()[get().editSide]
    const revealed = Math.min(get().revealed + 1, team.players.length)
    set({
      revealed,
      playing: get().playing && revealed < team.players.length,
    })
    push(snapshot(get()))
  },

  loadFromDraft: (side) => {
    const team = teamFromDraft(side, get().layout)
    set({
      [side]: team,
      editSide: side,
      revealed: team.players.length,
      playing: false,
    })
    push(snapshot(get()))
  },

  loadBothFromDraft: () => {
    const layout = get().layout
    set({
      blue: teamFromDraft('blue', layout),
      red: teamFromDraft('red', layout),
      revealed: 5,
      playing: false,
    })
    push(snapshot(get()))
  },

  loadFromTournamentTeams: (blueSrc, redSrc, projectName) => {
    const layout = get().layout
    const blue: LineupTeam = {
      teamName: blueSrc.name,
      teamTag: blueSrc.tag,
      teamLogo: blueSrc.logo,
      headline: blueSrc.name.toUpperCase(),
      sourceTeamId: blueSrc.id ?? '',
      players: arrangePlayers(mapTournamentPlayers(blueSrc.players), layout),
    }
    const red: LineupTeam = {
      teamName: redSrc.name,
      teamTag: redSrc.tag,
      teamLogo: redSrc.logo,
      headline: redSrc.name.toUpperCase(),
      sourceTeamId: redSrc.id ?? '',
      players: arrangePlayers(mapTournamentPlayers(redSrc.players), layout),
    }
    set({
      blue,
      red,
      introLabel: projectName ? projectName.toUpperCase() : get().introLabel,
      revealed: blue.players.length,
      playing: false,
      autoRotate: false,
    })
    push(snapshot(get()))
  },

  loadTournamentTeamToSide: (side, teamSrc, projectName) => {
    const mapped: LineupTeam = {
      teamName: teamSrc.name,
      teamTag: teamSrc.tag,
      teamLogo: teamSrc.logo,
      headline: teamSrc.name.toUpperCase(),
      sourceTeamId: teamSrc.id ?? '',
      players: arrangePlayers(
        mapTournamentPlayers(teamSrc.players),
        get().layout,
      ),
    }
    set({
      [side]: mapped,
      editSide: side,
      introLabel: projectName ? projectName.toUpperCase() : get().introLabel,
      revealed: mapped.players.length,
      playing: false,
    })
    push(snapshot(get()))
  },

  clearMatchTeams: () => {
    const blank = defaults()
    set({
      blue: blank.blue,
      red: blank.red,
      soloBlueIndex: 0,
      soloRedIndex: 0,
      revealed: 0,
      playing: false,
    })
    push(snapshot(get()))
  },

  hydrate: (state) => {
    applyingRemote = true
    set({ ...defaults(), ...migrateLegacy(state as Record<string, unknown>) })
    applyingRemote = false
  },
}))

export function initLineupSync() {
  let started = (initLineupSync as unknown as { _started?: boolean })._started
  if (started) return
  ;(initLineupSync as unknown as { _started?: boolean })._started = true

  void (async () => {
    const payload = await loadJson<LineupState>(STORAGE_KEY)
    if (payload && typeof payload === 'object') {
      useLineupStore.getState().hydrate(payload)
    }
    subscribeSync('lineup', (remote) => {
      if (remote && typeof remote === 'object') {
        useLineupStore.getState().hydrate(remote as LineupState)
      }
    })
    const remote = await fetchSync('lineup')
    if (remote && typeof remote === 'object') {
      useLineupStore.getState().hydrate(remote as LineupState)
    }
    if (
      typeof window !== 'undefined' &&
      window.location.pathname.includes('/control')
    ) {
      pushSync('lineup', snapshot(useLineupStore.getState()))
    }
  })()
}
