import { create } from 'zustand'
import {
  nextPowerOfTwo,
  seedTeamsIntoBracket,
  getTeam,
  type BracketTeam,
} from '../lib/bracketEngine'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'
import { isControlDeskPath } from '../lib/controlPath'
import { useBracketStore } from './bracketStore'
import { useDraftStore } from './draftStore'
import { formatSeriesLabel, useGameplayStore } from './gameplayStore'
import { useLineupStore, type LineupPlayer, type LineupTeam } from './lineupStore'

export type PlayerRole = 'exp' | 'jungle' | 'mid' | 'gold' | 'roam' | 'spare'

export const PLAYER_ROLES: { id: PlayerRole; label: string }[] = [
  { id: 'exp', label: 'EXP' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'mid', label: 'Mid' },
  { id: 'gold', label: 'Gold' },
  { id: 'roam', label: 'Roam' },
]

/** Optional 6th man — not used in draft/lineup starters. */
export const SPARE_ROLE: { id: PlayerRole; label: string } = {
  id: 'spare',
  label: 'Spare',
}

export const STARTER_COUNT = 5
/** 5 starters + optional spares (form imports can bring several extras). */
export const MAX_ROSTER_SIZE = 8

export const ALL_PLAYER_ROLES: { id: PlayerRole; label: string }[] = [
  ...PLAYER_ROLES,
  SPARE_ROLE,
]

export type TournamentPlayer = {
  id: string
  name: string
  /** In-game name (MLBB IGN) shown on lineup / Match Day. */
  ign: string
  photo: string
  /** Full photo before background removal — kept so cutouts survive team switches. */
  photoOriginal?: string
  role: PlayerRole
  order: number
  /** From spreadsheet TEAM POSITION = Team Captain / Team Leader. */
  isLeader?: boolean
}

export type TournamentTeam = {
  id: string
  name: string
  tag: string
  logo: string
  seed: number
  players: TournamentPlayer[]
}

export type MatchPhase = 'idle' | 'lineup' | 'draft' | 'live'

/** One saved tournament in the portfolio. */
export type TournamentProject = {
  id: string
  name: string
  formatSize: 4 | 8 | 16
  teams: TournamentTeam[]
  /** Shown on match / logo preview (e.g. "SEMI FINAL · GAME 1"). */
  matchTitle: string
  /** Optional event logo (data URL or path). */
  logo: string
  updatedAt: number
}

export type CreateTournamentOptions = {
  name?: string
  formatSize?: 4 | 8 | 16
  matchTitle?: string
  logo?: string
  /** Start with no teams (operator adds them). Default true. */
  empty?: boolean
}

export type TournamentState = {
  tournaments: TournamentProject[]
  activeTournamentId: string
  activeMatchId: string | null
  blueTeamId: string | null
  redTeamId: string | null
  status: MatchPhase
}

type Actions = {
  createTournament: (opts?: string | CreateTournamentOptions) => string
  selectTournament: (id: string) => void
  deleteTournament: (id: string) => void
  setProjectName: (name: string) => void
  setMatchTitle: (title: string) => void
  setProjectLogo: (logo: string) => void
  setFormatSize: (size: 4 | 8 | 16) => void
  addTeam: () => void
  removeTeam: (id: string) => void
  moveTeam: (id: string, direction: -1 | 1) => void
  updateTeam: (
    id: string,
    patch: Partial<Omit<TournamentTeam, 'id' | 'players'>>,
  ) => void
  updatePlayer: (
    teamId: string,
    playerId: string,
    patch: Partial<Omit<TournamentPlayer, 'id'>>,
  ) => void
  /** Persist reveal cutouts onto the tournament roster so switching teams keeps them. */
  savePlayerCutouts: (
    teamId: string,
    slots: { order: number; photo: string; photoOriginal: string }[],
  ) => void
  /** Replace full roster (supports optional 6th spare). */
  setTeamRoster: (teamId: string, players: TournamentPlayer[]) => void
  seedIntoBracket: () => void
  startFight: (matchId: string) => void
  /** Load bracket match into Draft + Lineup + Gameplay (names + players). */
  loadMatchScenes: (matchId: string) => boolean
  setPhase: (status: MatchPhase) => void
  clearActiveMatch: () => void
  getActive: () => TournamentProject
  getTeam: (id: string | null) => TournamentTeam | null
  hydrate: (state: Partial<TournamentState> | LegacyTournamentState) => void
  /** Replace entire portfolio from a backup file. */
  commitImport: (state: Partial<TournamentState> | LegacyTournamentState) => void
  /**
   * Add-only form merge: existing teams/players stay as they are.
   * New form teams are appended; missing players are added onto matching teams.
   */
  mergeFormRosters: (
    state: Partial<TournamentState> | LegacyTournamentState,
  ) => { matched: number; added: number; players: number }
}

export type TournamentStore = TournamentState & Actions

/** Legacy single-project shape (v1). */
type LegacyTournamentState = {
  projectId?: string
  projectName?: string
  formatSize?: 4 | 8 | 16
  teams?: TournamentTeam[]
  activeMatchId?: string | null
  blueTeamId?: string | null
  redTeamId?: string | null
  status?: MatchPhase
  matchTitle?: string
}

const STORAGE_KEY = 'mlbb-tournament-state-v2'
const LEGACY_KEY = 'mlbb-tournament-state-v1'
let applyingRemote = false

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyRoster(): TournamentPlayer[] {
  return PLAYER_ROLES.map((r, i) => ({
    id: uid(),
    name: `Player ${i + 1}`,
    ign: '',
    photo: '',
    role: r.id,
    order: i,
  }))
}

function makeSparePlayer(order = STARTER_COUNT): TournamentPlayer {
  return {
    id: uid(),
    name: '',
    ign: '',
    photo: '',
    role: 'spare',
    order,
  }
}

/** Starting five for draft / lineup / gameplay — spare sits out. */
export function starterPlayers(players: TournamentPlayer[]): TournamentPlayer[] {
  const sorted = [...players].sort((a, b) => a.order - b.order)
  const core = sorted.filter((p) => p.role !== 'spare')
  const spare = sorted.filter((p) => p.role === 'spare')
  return [...core, ...spare].slice(0, STARTER_COUNT)
}

function normalizeRoster(rawPlayers: unknown): TournamentPlayer[] {
  const base = emptyRoster()
  const playersIn = Array.isArray(rawPlayers) ? rawPlayers : []
  const count = Math.min(
    MAX_ROSTER_SIZE,
    Math.max(STARTER_COUNT, playersIn.length || STARTER_COUNT),
  )
  return Array.from({ length: count }, (_, i) => {
    const fallback =
      i < STARTER_COUNT
        ? {
            ...base[i]!,
            role: PLAYER_ROLES[i]?.id ?? base[i]!.role,
            order: i,
          }
        : makeSparePlayer(i)
    const raw = playersIn[i] as Partial<TournamentPlayer> | undefined
    // Extra slots beyond submitted list stay empty spare placeholders only when
    // we padded up to STARTER_COUNT; don't invent fake starters past real data.
    if (!raw && i >= playersIn.length && i >= STARTER_COUNT) {
      return { ...fallback, name: '' }
    }
    return normalizePlayer(raw, fallback)
  })
}

function makeTeam(seed: number, name?: string, tag?: string): TournamentTeam {
  return {
    id: uid(),
    name: name ?? `Team ${seed}`,
    tag: tag ?? `T${seed}`,
    logo: '',
    seed,
    players: emptyRoster(),
  }
}

/** Bracket-only team (no portfolio roster) → empty players with same name/tag. */
function syntheticTournamentTeam(t: BracketTeam): TournamentTeam {
  return {
    id: t.id,
    name: t.name,
    tag: t.tag,
    logo: t.logo || '',
    seed: t.seed,
    players: emptyRoster().map((p) => ({ ...p, name: '' })),
  }
}

function makeProject(
  name = 'New Tournament',
  formatSize: 4 | 8 | 16 = 8,
  empty = false,
): TournamentProject {
  return {
    id: uid(),
    name,
    formatSize,
    teams: empty
      ? []
      : Array.from({ length: formatSize }, (_, i) => makeTeam(i + 1)),
    matchTitle: 'MATCH 1 · GAME 1',
    logo: '',
    updatedAt: Date.now(),
  }
}

function createInitialState(): TournamentState {
  const project = makeProject('CME ML Tournament', 8)
  return {
    tournaments: [project],
    activeTournamentId: project.id,
    activeMatchId: null,
    blueTeamId: null,
    redTeamId: null,
    status: 'idle',
  }
}

function normalizePlayer(
  raw: Partial<TournamentPlayer> | undefined,
  fallback: TournamentPlayer,
): TournamentPlayer {
  const role = ALL_PLAYER_ROLES.some((r) => r.id === raw?.role)
    ? (raw!.role as PlayerRole)
    : fallback.role
  return {
    id: typeof raw?.id === 'string' ? raw.id : fallback.id,
    name: String(raw?.name ?? fallback.name).slice(0, 28),
    ign: String(raw?.ign ?? fallback.ign ?? '').slice(0, 20),
    photo: typeof raw?.photo === 'string' ? raw.photo : '',
    photoOriginal:
      typeof raw?.photoOriginal === 'string' ? raw.photoOriginal : '',
    role,
    order: Number.isFinite(raw?.order) ? Number(raw!.order) : fallback.order,
    isLeader: raw?.isLeader === true,
  }
}

function normalizeTeam(
  raw: Partial<TournamentTeam> | undefined,
  fallback: TournamentTeam,
): TournamentTeam {
  return {
    id: typeof raw?.id === 'string' ? raw.id : fallback.id,
    name: String(raw?.name ?? fallback.name).slice(0, 40),
    tag: String(raw?.tag ?? fallback.tag).slice(0, 8),
    logo: typeof raw?.logo === 'string' ? raw.logo : '',
    seed: Number(raw?.seed ?? fallback.seed) || fallback.seed,
    players: normalizeRoster(raw?.players ?? fallback.players),
  }
}

function normalizeProject(
  raw: Partial<TournamentProject> | undefined,
  fallback?: TournamentProject,
): TournamentProject {
  const base = fallback ?? makeProject()
  const formatSize =
    raw?.formatSize === 4 || raw?.formatSize === 8 || raw?.formatSize === 16
      ? raw.formatSize
      : base.formatSize
  const teamsIn = Array.isArray(raw?.teams) ? raw!.teams : []
  const hasExplicitTeams = Array.isArray(raw?.teams)
  const teamCount = hasExplicitTeams
    ? Math.min(formatSize, Math.max(0, teamsIn.length))
    : formatSize
  const teams = Array.from({ length: teamCount }, (_, i) =>
    normalizeTeam(teamsIn[i] as Partial<TournamentTeam>, makeTeam(i + 1)),
  ).map((t, i) => ({ ...t, seed: i + 1 }))

  return {
    id: typeof raw?.id === 'string' ? raw.id : base.id,
    name: String(raw?.name ?? base.name).slice(0, 64),
    formatSize,
    teams,
    matchTitle: String(raw?.matchTitle ?? base.matchTitle).slice(0, 64),
    logo: typeof raw?.logo === 'string' ? raw.logo : base.logo || '',
    updatedAt:
      typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function isPortfolioPayload(
  raw: unknown,
): raw is Partial<TournamentState> & { tournaments: unknown[] } {
  return (
    !!raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { tournaments?: unknown }).tournaments)
  )
}

function normalizeState(
  raw: Partial<TournamentState> | LegacyTournamentState | null | undefined,
): TournamentState {
  const base = createInitialState()
  if (!raw || typeof raw !== 'object') return base

  // v2 portfolio
  if (isPortfolioPayload(raw)) {
    const list = (raw.tournaments as Partial<TournamentProject>[])
      .map((t) => normalizeProject(t))
      .filter(Boolean)
    const tournaments = list.length ? list : base.tournaments
    const activeTournamentId =
      typeof raw.activeTournamentId === 'string' &&
      tournaments.some((t) => t.id === raw.activeTournamentId)
        ? raw.activeTournamentId
        : tournaments[0]!.id
    return {
      tournaments,
      activeTournamentId,
      activeMatchId:
        typeof raw.activeMatchId === 'string' ? raw.activeMatchId : null,
      blueTeamId: typeof raw.blueTeamId === 'string' ? raw.blueTeamId : null,
      redTeamId: typeof raw.redTeamId === 'string' ? raw.redTeamId : null,
      status:
        raw.status === 'lineup' ||
        raw.status === 'draft' ||
        raw.status === 'live' ||
        raw.status === 'idle'
          ? raw.status
          : 'idle',
    }
  }

  // v1 single project → wrap
  const legacy = raw as LegacyTournamentState
  const project = normalizeProject({
    id: legacy.projectId,
    name: legacy.projectName,
    formatSize: legacy.formatSize,
    teams: legacy.teams,
    matchTitle: legacy.matchTitle ?? 'MATCH 1 · GAME 1',
  })
  return {
    tournaments: [project],
    activeTournamentId: project.id,
    activeMatchId:
      typeof legacy.activeMatchId === 'string' ? legacy.activeMatchId : null,
    blueTeamId: typeof legacy.blueTeamId === 'string' ? legacy.blueTeamId : null,
    redTeamId: typeof legacy.redTeamId === 'string' ? legacy.redTeamId : null,
    status:
      legacy.status === 'lineup' ||
      legacy.status === 'draft' ||
      legacy.status === 'live' ||
      legacy.status === 'idle'
        ? legacy.status
        : 'idle',
  }
}

function loadStored(): TournamentState | null {
  const v2 = loadJsonSync<Partial<TournamentState>>(STORAGE_KEY)
  if (v2) return normalizeState(v2)
  try {
    const v1 = localStorage.getItem(LEGACY_KEY)
    if (v1) return normalizeState(JSON.parse(v1) as LegacyTournamentState)
  } catch {
    /* ignore */
  }
  return null
}

function snapshot(s: TournamentState): TournamentState {
  return structuredClone({
    tournaments: s.tournaments,
    activeTournamentId: s.activeTournamentId,
    activeMatchId: s.activeMatchId,
    blueTeamId: s.blueTeamId,
    redTeamId: s.redTeamId,
    status: s.status,
  })
}

function push(state: TournamentState) {
  if (applyingRemote) return
  const data = snapshot(state)
  saveJsonFire(STORAGE_KEY, data)
  pushSync('tournament', data)
}

function roleLabel(role: PlayerRole): string {
  return ALL_PLAYER_ROLES.find((r) => r.id === role)?.label ?? role.toUpperCase()
}

function toLineupTeam(team: TournamentTeam): LineupTeam {
  const sorted = starterPlayers(team.players)
  const players: LineupPlayer[] = Array.from({ length: STARTER_COUNT }, (_, i) => {
    const p = sorted[i]
    return {
      name: p?.name ?? `Player ${i + 1}`,
      ign: p?.ign ?? '',
      subtitle: p ? roleLabel(p.role) : '',
      photo: p?.photo ?? '',
      photoOriginal: p?.photoOriginal || p?.photo || '',
      isLeader: p?.isLeader === true,
      heroId: '',
      row: i < 3 ? 'back' : 'front',
      scale: 1,
      x: 0,
      y: 0,
      flip: false,
    }
  })
  return {
    teamName: team.name,
    teamTag: team.tag,
    teamLogo: team.logo,
    headline: team.name.toUpperCase(),
    players,
  }
}

function toBracketTeams(teams: TournamentTeam[]): BracketTeam[] {
  return teams.map((t, i) => ({
    id: t.id,
    name: t.name,
    tag: t.tag,
    logo: t.logo,
    seed: i + 1,
  }))
}

function patchActive(
  s: TournamentState,
  patch: Partial<TournamentProject>,
): TournamentState {
  const tournaments = s.tournaments.map((t) =>
    t.id === s.activeTournamentId
      ? { ...t, ...patch, updatedAt: Date.now() }
      : t,
  )
  return { ...s, tournaments }
}

const initial = loadStored() ?? createInitialState()

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  ...initial,

  getActive: () => {
    const s = get()
    return (
      s.tournaments.find((t) => t.id === s.activeTournamentId) ??
      s.tournaments[0]!
    )
  },

  createTournament: (opts) => {
    const options: CreateTournamentOptions =
      typeof opts === 'string' ? { name: opts } : opts ?? {}
    const formatSize = options.formatSize ?? 8
    const project = makeProject(
      options.name ?? `Tournament ${get().tournaments.length + 1}`,
      formatSize,
      options.empty !== false,
    )
    if (options.matchTitle) project.matchTitle = options.matchTitle.slice(0, 64)
    if (options.logo) project.logo = options.logo
    set((s) => ({
      tournaments: [project, ...s.tournaments],
      activeTournamentId: project.id,
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    }))
    push(snapshot(get()))
    return project.id
  },

  selectTournament: (id) => {
    const s = get()
    if (!s.tournaments.some((t) => t.id === id)) return
    set({
      activeTournamentId: id,
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    })
    push(snapshot(get()))
  },

  deleteTournament: (id) => {
    const s = get()
    if (s.tournaments.length <= 1) return
    const tournaments = s.tournaments.filter((t) => t.id !== id)
    const activeTournamentId =
      s.activeTournamentId === id
        ? tournaments[0]!.id
        : s.activeTournamentId
    set({
      tournaments,
      activeTournamentId,
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    })
    push(snapshot(get()))
  },

  setProjectName: (name) => {
    set((s) => patchActive(s, { name: name.slice(0, 64) }))
    push(snapshot(get()))
  },

  setMatchTitle: (title) => {
    set((s) => patchActive(s, { matchTitle: title.slice(0, 64) }))
    push(snapshot(get()))
  },

  setProjectLogo: (logo) => {
    set((s) => patchActive(s, { logo }))
    push(snapshot(get()))
  },

  setFormatSize: (formatSize) => {
    const active = get().getActive()
    let teams = [...active.teams]
    if (teams.length > formatSize) {
      teams = teams.slice(0, formatSize)
    }
    teams = teams.map((t, i) => ({ ...t, seed: i + 1 }))
    set((s) => patchActive(s, { formatSize, teams }))
    push(snapshot(get()))
  },

  addTeam: () => {
    const active = get().getActive()
    if (active.teams.length >= active.formatSize) return
    const teams = [
      ...active.teams,
      makeTeam(active.teams.length + 1),
    ].map((t, i) => ({ ...t, seed: i + 1 }))
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  removeTeam: (id) => {
    const active = get().getActive()
    if (!active.teams.some((t) => t.id === id)) return
    const teams = active.teams
      .filter((t) => t.id !== id)
      .map((t, i) => ({ ...t, seed: i + 1 }))
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  moveTeam: (id, direction) => {
    const active = get().getActive()
    const i = active.teams.findIndex((t) => t.id === id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= active.teams.length) return
    const teams = [...active.teams]
    ;[teams[i], teams[j]] = [teams[j]!, teams[i]!]
    set((s) =>
      patchActive(s, {
        teams: teams.map((t, idx) => ({ ...t, seed: idx + 1 })),
      }),
    )
    push(snapshot(get()))
  },

  updateTeam: (id, patch) => {
    const active = get().getActive()
    const teams = active.teams.map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    )
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  updatePlayer: (teamId, playerId, patch) => {
    const active = get().getActive()
    const teams = active.teams.map((t) => {
      if (t.id !== teamId) return t
      return {
        ...t,
        players: t.players.map((p) =>
          p.id === playerId ? { ...p, ...patch } : p,
        ),
      }
    })
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  /** Write reveal cutouts back onto the saved tournament roster (permanent). */
  savePlayerCutouts: (
    teamId: string,
    slots: { order: number; photo: string; photoOriginal: string }[],
  ) => {
    const active = get().getActive()
    const team = active.teams.find((t) => t.id === teamId)
    if (!team) return
    const starters = starterPlayers(team.players)
    const byOrder = new Map(slots.map((s) => [s.order, s]))
    const players = team.players.map((p) => {
      const starterIdx = starters.findIndex((s) => s.id === p.id)
      if (starterIdx < 0) return p
      const slot = byOrder.get(starterIdx)
      if (!slot) return p
      return {
        ...p,
        photo: slot.photo,
        photoOriginal: slot.photoOriginal || p.photoOriginal || slot.photo,
      }
    })
    const teams = active.teams.map((t) =>
      t.id === teamId ? { ...t, players } : t,
    )
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  setTeamRoster: (teamId, players) => {
    const normalized = normalizeRoster(players).map((p, i) => ({
      ...p,
      order: i,
    }))
    const active = get().getActive()
    const teams = active.teams.map((t) =>
      t.id === teamId ? { ...t, players: normalized } : t,
    )
    set((s) => patchActive(s, { teams }))
    push(snapshot(get()))
  },

  seedIntoBracket: () => {
    const active = get().getActive()
    const bracketTeams = toBracketTeams(active.teams)
    const teamCount = bracketTeams.length
    if (teamCount < 2) return

    // Fit the board to how many teams you have (never larger than format).
    // 8 teams → Round 1 / Semis / Final — NOT a half-empty Quarters board.
    const bracketSize = Math.min(
      active.formatSize,
      nextPowerOfTwo(Math.max(teamCount, 2)),
    )
    const matches = seedTeamsIntoBracket(bracketTeams, bracketSize)
    const firstReady =
      matches.find((m) => !m.winnerId && m.teamAId && m.teamBId)?.id ?? null

    useBracketStore.setState({
      title: active.name,
      teamCount,
      bracketSize,
      teams: bracketTeams,
      matches,
      activeMatchId: firstReady,
    })
    const bracket = useBracketStore.getState()
    const bracketSnap = {
      title: bracket.title,
      teamCount: bracket.teamCount,
      bracketSize: bracket.bracketSize,
      teams: bracket.teams,
      matches: bracket.matches,
      activeMatchId: bracket.activeMatchId,
    }
    pushSync('bracket', bracketSnap)
    saveJsonFire('mlbb-bracket-state-v1', bracketSnap)
    // Fresh bracket only — do not mark anything live/won or preload a fight.
    useDraftStore.getState().clearMatchup()
    useGameplayStore.getState().clearMatchTeams()
    useLineupStore.getState().clearMatchTeams()
    set((s) => ({
      ...patchActive(s, {}),
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    }))
    push(snapshot(get()))
  },

  startFight: (matchId) => {
    if (!get().loadMatchScenes(matchId)) return
  },

  loadMatchScenes: (matchId) => {
    const s = get()
    const active = s.getActive()
    const bracket = useBracketStore.getState()
    const match = bracket.matches.find((m) => m.id === matchId)
    if (!match?.teamAId || !match.teamBId) return false

    const bracketA = getTeam(bracket, match.teamAId)
    const bracketB = getTeam(bracket, match.teamBId)
    if (!bracketA || !bracketB) return false

    // Prefer portfolio roster (players) when IDs match; else bracket names only.
    const blue =
      active.teams.find((t) => t.id === match.teamAId) ??
      syntheticTournamentTeam(bracketA)
    const red =
      active.teams.find((t) => t.id === match.teamBId) ??
      syntheticTournamentTeam(bracketB)

    useBracketStore.getState().setMatchLive(matchId)

    const label = `${active.name} · ${active.matchTitle || `${blue.tag} vs ${red.tag}`}`
    useDraftStore.getState().loadMatchup({
      matchLabel: label,
      blue: { name: blue.name, tag: blue.tag, logo: blue.logo },
      red: { name: red.name, tag: red.tag, logo: red.logo },
      firstPickSide: 'blue',
    })

    ;[blue, red].forEach((team, sideIdx) => {
      const side = sideIdx === 0 ? 'blue' : 'red'
      starterPlayers(team.players).forEach((p, i) => {
        useDraftStore.getState().updatePlayer(side, i, {
          name: p.name,
          photo: p.photo || undefined,
        })
      })
    })

    useLineupStore.getState().loadFromTournamentTeams(
      {
        name: blue.name,
        tag: blue.tag,
        logo: blue.logo,
        players: starterPlayers(blue.players).map((p) => ({
          name: p.name,
          ign: p.ign,
          photo: p.photo,
          role: p.role,
          order: p.order,
          isLeader: p.isLeader,
          photoOriginal: p.photoOriginal,
        })),
      },
      {
        name: red.name,
        tag: red.tag,
        logo: red.logo,
        players: starterPlayers(red.players).map((p) => ({
          name: p.name,
          ign: p.ign,
          photo: p.photo,
          role: p.role,
          order: p.order,
          isLeader: p.isLeader,
          photoOriginal: p.photoOriginal,
        })),
      },
      active.name,
    )

    const rosterMeta = (team: TournamentTeam) => ({
      name: team.name,
      tag: team.tag,
      logo: team.logo,
      players: starterPlayers(team.players).map((p) => ({
        name: p.name,
        ign: p.ign,
        photo: p.photo || undefined,
      })),
    })
    useGameplayStore.getState().loadTeamsFromMatch({
      blue: rosterMeta(blue),
      red: rosterMeta(red),
    })
    const seriesLabel = formatSeriesLabel(useGameplayStore.getState())
    useGameplayStore.getState().setMatchInfo(seriesLabel)
    useDraftStore.getState().setMatchLabel(seriesLabel)

    set({
      activeMatchId: matchId,
      blueTeamId: blue.id,
      redTeamId: red.id,
      status: 'lineup',
    })
    push(snapshot(get()))
    return true
  },

  setPhase: (status) => {
    set({ status })
    push(snapshot(get()))
  },

  clearActiveMatch: () => {
    useDraftStore.getState().clearMatchup()
    useGameplayStore.getState().clearMatchTeams()
    useLineupStore.getState().clearMatchTeams()
    set({
      activeMatchId: null,
      blueTeamId: null,
      redTeamId: null,
      status: 'idle',
    })
    push(snapshot(get()))
  },

  getTeam: (id) => {
    if (!id) return null
    return get().getActive().teams.find((t) => t.id === id) ?? null
  },

  hydrate: (state) => {
    applyingRemote = true
    set(normalizeState(state))
    applyingRemote = false
  },

  /** Replace entire portfolio from a backup file. */
  commitImport: (state) => {
    const next = normalizeState(state)
    set(next)
    push(snapshot(get()))
  },

  /**
   * Add-only form merge: existing teams and named players stay as they are.
   * Missing form players are filled into empty slots; new teams are appended.
   */
  mergeFormRosters: (state) => {
    const incomingTeams = collectImportTeams(state)
    const s = get()
    const active = s.getActive()
    let matched = 0
    let added = 0
    let players = 0
    const nextTeams = [...active.teams]
    const used = new Set<string>()

    for (const incoming of incomingTeams) {
      const hit = findBestTeamMatch(incoming, nextTeams, used)
      if (hit) {
        used.add(hit.id)
        matched += 1
        const merged = appendMissingPlayers(hit, incoming)
        players += merged.added
        const idx = nextTeams.findIndex((t) => t.id === hit.id)
        if (idx >= 0) nextTeams[idx] = { ...hit, players: merged.players }
        continue
      }
      added += 1
      players += incoming.players.filter((p) => isNamedPlayer(p)).length
      const team = {
        ...incoming,
        id: uid(),
        seed: nextTeams.length + 1,
      }
      used.add(team.id)
      nextTeams.push(team)
    }

    // Preserve existing seeds; only renumber trailing new teams.
    const seeded = nextTeams.map((t, i) =>
      i < active.teams.length ? t : { ...t, seed: i + 1 },
    )
    const formatSize =
      seeded.length <= 4 ? 4 : seeded.length <= 8 ? 8 : 16
    set((cur) =>
      patchActive(cur, {
        teams: seeded,
        formatSize: Math.max(active.formatSize, formatSize) as 4 | 8 | 16,
      }),
    )
    push(snapshot(get()))
    return { matched, added, players }
  },
}))

function teamMatchKey(name: string) {
  return String(name || '')
    .toUpperCase()
    .replace(/BSMAR\s*E/g, 'BSME')
    .replace(/[^A-Z0-9]/g, '')
}

function collectImportTeams(
  raw: Partial<TournamentState> | LegacyTournamentState,
): TournamentTeam[] {
  const normalized = normalizeState(raw)
  const out: TournamentTeam[] = []
  for (const proj of normalized.tournaments) {
    for (const t of proj.teams) out.push(t)
  }
  return out
}

function compactPerson(s: string) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function isNamedPlayer(p: { name?: string } | null | undefined) {
  const n = String(p?.name || '').trim()
  if (!n) return false
  return !/^PLAYER\s*\d+$/i.test(n)
}

function editDistance(a: string, b: string) {
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

function peopleMatch(
  aName: string,
  aIgn: string,
  bName: string,
  bIgn: string,
) {
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

function appendMissingPlayers(
  existing: TournamentTeam,
  incoming: TournamentTeam,
): { players: TournamentPlayer[]; added: number } {
  const next = existing.players.map((p) => ({ ...p }))
  let added = 0
  for (const ip of incoming.players) {
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
      const cur = next[slot]!
      next[slot] = {
        ...cur,
        name: ip.name,
        ign: ip.ign || cur.ign,
        photo: ip.photo || cur.photo,
        photoOriginal: ip.photoOriginal || cur.photoOriginal,
        role: ip.role || cur.role,
        isLeader: ip.isLeader === true,
      }
      added += 1
      continue
    }
    if (next.length >= MAX_ROSTER_SIZE) continue
    next.push({
      id: uid(),
      name: ip.name,
      ign: ip.ign || '',
      photo: ip.photo || '',
      photoOriginal: ip.photoOriginal || '',
      role: 'spare',
      order: next.length,
      isLeader: ip.isLeader === true,
    })
    added += 1
  }
  return { players: next.map((p, i) => ({ ...p, order: i })), added }
}

function findBestTeamMatch(
  incoming: TournamentTeam,
  existing: TournamentTeam[],
  used: Set<string>,
): TournamentTeam | null {
  const key = teamMatchKey(incoming.name)
  for (const t of existing) {
    if (used.has(t.id)) continue
    if (teamMatchKey(t.name) === key) return t
  }
  for (const t of existing) {
    if (used.has(t.id)) continue
    const ek = teamMatchKey(t.name)
    if (!ek || !key) continue
    if (ek.includes(key) || key.includes(ek)) return t
  }
  return null
}

function realNamedCount(
  raw: Partial<TournamentState> | LegacyTournamentState | null | undefined,
): number {
  const s = normalizeState(raw)
  return s.tournaments.reduce(
    (n, t) =>
      n +
      t.teams.reduce(
        (m, team) => m + team.players.filter((p) => isNamedPlayer(p)).length,
        0,
      ),
    0,
  )
}

function portfolioWeight(
  raw: Partial<TournamentState> | LegacyTournamentState | null | undefined,
): number {
  return realNamedCount(raw) * 100
}

function shouldAcceptRemote(
  current: TournamentState,
  incoming: Partial<TournamentState> | LegacyTournamentState,
): boolean {
  const next = normalizeState(incoming)
  const curN = realNamedCount(current)
  const nextN = realNamedCount(next)
  // Overlays are read-only mirrors of the hub; their local copy can be stale.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/overlay')) {
    return nextN > 0 || curN === 0
  }
  // Never let an empty / thin hub payload wipe a richer named roster.
  if (curN > 0 && nextN < curN) return false
  return true
}

export function initTournamentSync() {
  let started = (initTournamentSync as unknown as { _started?: boolean })._started
  if (started) return
  ;(initTournamentSync as unknown as { _started?: boolean })._started = true

  void (async () => {
    // Wait for durable storage before talking to the hub — otherwise a 50ms
    // push of boot/empty state overwrites form imports and IndexedDB data.
    const payload = await loadJson<TournamentState>(STORAGE_KEY)
    if (payload && typeof payload === 'object') {
      useTournamentStore.getState().hydrate(payload)
    }

    subscribeSync('tournament', (remote) => {
      if (!remote || typeof remote !== 'object') return
      const cur = snapshot(useTournamentStore.getState())
      if (
        !shouldAcceptRemote(
          cur,
          remote as Partial<TournamentState> | LegacyTournamentState,
        )
      ) {
        return
      }
      useTournamentStore
        .getState()
        .hydrate(remote as Partial<TournamentState> | LegacyTournamentState)
    })

    const remote = await fetchSync('tournament')
    if (remote && typeof remote === 'object') {
      const cur = snapshot(useTournamentStore.getState())
      if (
        shouldAcceptRemote(
          cur,
          remote as Partial<TournamentState> | LegacyTournamentState,
        )
      ) {
        useTournamentStore
          .getState()
          .hydrate(remote as Partial<TournamentState> | LegacyTournamentState)
      }
    }

    if (typeof window !== 'undefined' && isControlDeskPath()) {
      const local = snapshot(useTournamentStore.getState())
      const hubNamed = realNamedCount(
        remote as Partial<TournamentState> | LegacyTournamentState | null,
      )
      if (realNamedCount(local) >= hubNamed) {
        pushSync('tournament', local)
      }
    }
  })()
}

/** Convenience selectors for UI. */
export function selectActiveProject(s: TournamentStore): TournamentProject {
  return (
    s.tournaments.find((t) => t.id === s.activeTournamentId) ??
    s.tournaments[0]!
  )
}

export { toLineupTeam, roleLabel, makeSparePlayer, normalizeRoster }
