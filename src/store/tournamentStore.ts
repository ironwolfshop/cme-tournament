import { create } from 'zustand'
import {
  nextPowerOfTwo,
  seedTeamsIntoBracket,
  getTeam,
  type BracketTeam,
} from '../lib/bracketEngine'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { useBracketStore } from './bracketStore'
import { useDraftStore } from './draftStore'
import { useGameplayStore } from './gameplayStore'
import { useLineupStore, type LineupPlayer, type LineupTeam } from './lineupStore'

export type PlayerRole = 'exp' | 'jungle' | 'mid' | 'gold' | 'roam'

export const PLAYER_ROLES: { id: PlayerRole; label: string }[] = [
  { id: 'exp', label: 'EXP' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'mid', label: 'Mid' },
  { id: 'gold', label: 'Gold' },
  { id: 'roam', label: 'Roam' },
]

export type TournamentPlayer = {
  id: string
  name: string
  photo: string
  role: PlayerRole
  order: number
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
  updatedAt: number
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
  createTournament: (name?: string) => string
  selectTournament: (id: string) => void
  deleteTournament: (id: string) => void
  setProjectName: (name: string) => void
  setMatchTitle: (title: string) => void
  setFormatSize: (size: 4 | 8 | 16) => void
  addTeam: () => void
  removeTeam: (id: string) => void
  updateTeam: (
    id: string,
    patch: Partial<Omit<TournamentTeam, 'id' | 'players'>>,
  ) => void
  updatePlayer: (
    teamId: string,
    playerId: string,
    patch: Partial<Omit<TournamentPlayer, 'id'>>,
  ) => void
  seedIntoBracket: () => void
  startFight: (matchId: string) => void
  /** Load bracket match into Draft + Lineup + Gameplay (names + players). */
  loadMatchScenes: (matchId: string) => boolean
  setPhase: (status: MatchPhase) => void
  clearActiveMatch: () => void
  getActive: () => TournamentProject
  getTeam: (id: string | null) => TournamentTeam | null
  hydrate: (state: Partial<TournamentState> | LegacyTournamentState) => void
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
    photo: '',
    role: r.id,
    order: i,
  }))
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
): TournamentProject {
  return {
    id: uid(),
    name,
    formatSize,
    teams: Array.from({ length: formatSize }, (_, i) => makeTeam(i + 1)),
    matchTitle: 'MATCH 1 · GAME 1',
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
  const role = PLAYER_ROLES.some((r) => r.id === raw?.role)
    ? (raw!.role as PlayerRole)
    : fallback.role
  return {
    id: typeof raw?.id === 'string' ? raw.id : fallback.id,
    name: String(raw?.name ?? fallback.name).slice(0, 28),
    photo: typeof raw?.photo === 'string' ? raw.photo : '',
    role,
    order: Number.isFinite(raw?.order) ? Number(raw!.order) : fallback.order,
  }
}

function normalizeTeam(
  raw: Partial<TournamentTeam> | undefined,
  fallback: TournamentTeam,
): TournamentTeam {
  const basePlayers = emptyRoster()
  const playersIn = Array.isArray(raw?.players) ? raw!.players : []
  return {
    id: typeof raw?.id === 'string' ? raw.id : fallback.id,
    name: String(raw?.name ?? fallback.name).slice(0, 40),
    tag: String(raw?.tag ?? fallback.tag).slice(0, 8),
    logo: typeof raw?.logo === 'string' ? raw.logo : '',
    seed: Number(raw?.seed ?? fallback.seed) || fallback.seed,
    players: basePlayers.map((slot, i) =>
      normalizePlayer(playersIn[i] as Partial<TournamentPlayer>, {
        ...slot,
        role: PLAYER_ROLES[i]?.id ?? slot.role,
        order: i,
      }),
    ),
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
  const teamCount = Math.max(
    2,
    Math.min(formatSize, teamsIn.length || formatSize),
  )
  const teams = Array.from({ length: teamCount }, (_, i) =>
    normalizeTeam(teamsIn[i] as Partial<TournamentTeam>, makeTeam(i + 1)),
  ).map((t, i) => ({ ...t, seed: i + 1 }))

  return {
    id: typeof raw?.id === 'string' ? raw.id : base.id,
    name: String(raw?.name ?? base.name).slice(0, 64),
    formatSize,
    teams,
    matchTitle: String(raw?.matchTitle ?? base.matchTitle).slice(0, 64),
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
  try {
    const v2 = localStorage.getItem(STORAGE_KEY)
    if (v2) {
      return normalizeState(JSON.parse(v2) as Partial<TournamentState>)
    }
    const v1 = localStorage.getItem(LEGACY_KEY)
    if (v1) {
      return normalizeState(JSON.parse(v1) as LegacyTournamentState)
    }
    return null
  } catch {
    return null
  }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
  pushSync('tournament', data)
}

function roleLabel(role: PlayerRole): string {
  return PLAYER_ROLES.find((r) => r.id === role)?.label ?? role.toUpperCase()
}

function toLineupTeam(team: TournamentTeam): LineupTeam {
  const sorted = [...team.players].sort((a, b) => a.order - b.order)
  const players: LineupPlayer[] = Array.from({ length: 5 }, (_, i) => {
    const p = sorted[i]
    return {
      name: p?.name ?? `Player ${i + 1}`,
      subtitle: p ? roleLabel(p.role) : '',
      photo: p?.photo ?? '',
      heroId: '',
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

  createTournament: (name) => {
    const project = makeProject(name ?? `Tournament ${get().tournaments.length + 1}`)
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

  setFormatSize: (formatSize) => {
    const active = get().getActive()
    let teams = [...active.teams]
    if (teams.length < formatSize) {
      while (teams.length < formatSize) {
        teams.push(makeTeam(teams.length + 1))
      }
    } else if (teams.length > formatSize) {
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
    if (active.teams.length <= 2) return
    const teams = active.teams
      .filter((t) => t.id !== id)
      .map((t, i) => ({ ...t, seed: i + 1 }))
    set((s) => patchActive(s, { teams }))
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

  seedIntoBracket: () => {
    const active = get().getActive()
    const bracketTeams = toBracketTeams(active.teams)
    const teamCount = bracketTeams.length
    const bracketSize = nextPowerOfTwo(Math.max(teamCount, active.formatSize))
    const matches = seedTeamsIntoBracket(bracketTeams, bracketSize)
    useBracketStore.setState({
      title: active.name,
      teamCount,
      bracketSize,
      teams: bracketTeams,
      matches,
      activeMatchId:
        matches.find((m) => m.status === 'pending' && m.teamAId && m.teamBId)
          ?.id ?? null,
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
    try {
      localStorage.setItem('mlbb-bracket-state-v1', JSON.stringify(bracketSnap))
    } catch {
      /* ignore */
    }
    set((s) => patchActive(s, {}))
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
      ;[...team.players]
        .sort((a, b) => a.order - b.order)
        .forEach((p, i) => {
          useDraftStore.getState().updatePlayer(side, i, {
            name: p.name,
            photo: p.photo || undefined,
          })
        })
    })

    useLineupStore.getState().loadFromTournamentTeams(blue, red, active.name)

    const rosterMeta = (team: TournamentTeam) => ({
      name: team.name,
      tag: team.tag,
      logo: team.logo,
      players: [...team.players]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({
          name: p.name,
          photo: p.photo || undefined,
        })),
    })
    useGameplayStore.getState().loadTeamsFromMatch({
      blue: rosterMeta(blue),
      red: rosterMeta(red),
    })
    useGameplayStore.getState().setMatchInfo(label)

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
}))

export function initTournamentSync() {
  subscribeSync('tournament', (payload) => {
    if (payload && typeof payload === 'object') {
      useTournamentStore
        .getState()
        .hydrate(payload as Partial<TournamentState> | LegacyTournamentState)
    }
  })
  const isControl =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/control')

  void fetchSync('tournament').then((payload) => {
    if (payload && typeof payload === 'object') {
      useTournamentStore
        .getState()
        .hydrate(payload as Partial<TournamentState> | LegacyTournamentState)
      return
    }
    if (isControl) {
      pushSync('tournament', snapshot(useTournamentStore.getState()))
    }
  })
}

/** Convenience selectors for UI. */
export function selectActiveProject(s: TournamentStore): TournamentProject {
  return (
    s.tournaments.find((t) => t.id === s.activeTournamentId) ??
    s.tournaments[0]!
  )
}

export { toLineupTeam, roleLabel }
