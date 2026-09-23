import { create } from 'zustand'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { useDraftStore, type TeamSide } from './draftStore'

export type LineupPlayer = {
  name: string
  subtitle: string
  photo: string
  heroId: string
}

export type LineupTeam = {
  teamName: string
  teamTag: string
  teamLogo: string
  headline: string
  players: LineupPlayer[]
}

export type LineupState = {
  /** Which team is being edited in control (or pinned if autoRotate is off) */
  editSide: TeamSide
  autoRotate: boolean
  /** Hold time for full roster layers (default 20s) */
  rotateSeconds: number
  /** Hold time for solo portrait beats */
  soloSeconds: number
  /** Include solo spotlight after each team's roster */
  includeSolo: boolean
  /** Which player index (0–4) is featured in the solo portrait */
  soloBlueIndex: number
  soloRedIndex: number
  introLabel: string
  subtitle: string
  sponsorRight: string
  footerSponsors: string
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
        'introLabel' | 'subtitle' | 'sponsorRight' | 'footerSponsors'
      >
    >,
  ) => void
  updateTeam: (side: TeamSide, patch: Partial<Omit<LineupTeam, 'players'>>) => void
  updatePlayer: (
    side: TeamSide,
    index: number,
    patch: Partial<LineupPlayer>,
  ) => void
  loadFromDraft: (side: TeamSide) => void
  loadBothFromDraft: () => void
  loadFromTournamentTeams: (
    blue: {
      name: string
      tag: string
      logo: string
      players: { name: string; photo: string; role: string; order: number }[]
    },
    red: {
      name: string
      tag: string
      logo: string
      players: { name: string; photo: string; role: string; order: number }[]
    },
    projectName?: string,
  ) => void
  clearMatchTeams: () => void
  hydrate: (state: Partial<LineupState> & Record<string, unknown>) => void
}

export type LineupStore = LineupState & Actions

const STORAGE_KEY = 'mlbb-lineup-state-v4'
let applyingRemote = false

function emptyPlayers(): LineupPlayer[] {
  return Array.from({ length: 5 }, () => ({
    name: '',
    subtitle: '',
    photo: '',
    heroId: '',
  }))
}

function normalizePlayers(raw: unknown): LineupPlayer[] {
  const base = emptyPlayers()
  if (!Array.isArray(raw)) return base
  return base.map((slot, i) => {
    const p = raw[i] as Partial<LineupPlayer> | undefined
    if (!p || typeof p !== 'object') return slot
    return {
      name: String(p.name ?? slot.name).slice(0, 28),
      subtitle: String(p.subtitle ?? '').slice(0, 32),
      photo: typeof p.photo === 'string' ? p.photo : '',
      heroId: typeof p.heroId === 'string' ? p.heroId : '',
    }
  })
}

function defaultTeam(
  name: string,
  tag: string,
  players: string[],
): LineupTeam {
  return {
    teamName: name,
    teamTag: tag,
    teamLogo: '',
    headline: name.toUpperCase(),
    players: normalizePlayers(
      players.map((n) => ({ name: n, subtitle: '', photo: '', heroId: '' })),
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
    players: normalizePlayers(t.players ?? fallback.players),
  }
}

function defaults(): LineupState {
  return {
    editSide: 'blue',
    autoRotate: true,
    rotateSeconds: 20,
    soloSeconds: 5,
    includeSolo: true,
    soloBlueIndex: 0,
    soloRedIndex: 0,
    introLabel: 'INTRODUCING / CME ML TOURNAMENT ROSTER',
    subtitle: '5 V 5',
    sponsorRight: 'CME ML',
    footerSponsors: 'CME · MOBILE LEGENDS · BANG BANG',
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

/** Migrate v1 single-team payloads into blue/red shape */
function migrateLegacy(parsed: Record<string, unknown>): Partial<LineupState> {
  const base = defaults()
  if (parsed.blue && parsed.red) {
    return {
      editSide: parsed.editSide === 'red' ? 'red' : 'blue',
      autoRotate: parsed.autoRotate !== false,
      rotateSeconds: clampSeconds(parsed.rotateSeconds, 20),
      soloSeconds: clampSeconds(
        parsed.soloSeconds === 12 || parsed.soloSeconds == null
          ? 5
          : parsed.soloSeconds,
        5,
      ),
      includeSolo: parsed.includeSolo !== false,
      soloBlueIndex: clampSoloIndex(parsed.soloBlueIndex, 2),
      soloRedIndex: clampSoloIndex(parsed.soloRedIndex, 2),
      introLabel: String(parsed.introLabel ?? base.introLabel),
      subtitle: String(parsed.subtitle ?? base.subtitle),
      sponsorRight: String(parsed.sponsorRight ?? base.sponsorRight),
      footerSponsors: String(parsed.footerSponsors ?? base.footerSponsors),
      blue: normalizeTeam(parsed.blue, base.blue),
      red: normalizeTeam(parsed.red, base.red),
    }
  }

  // v1: flat team fields + side
  const side = parsed.side === 'red' ? 'red' : 'blue'
  const legacyTeam: LineupTeam = {
    teamName: String(parsed.teamName ?? base[side].teamName),
    teamTag: String(parsed.teamTag ?? base[side].teamTag),
    teamLogo: typeof parsed.teamLogo === 'string' ? parsed.teamLogo : '',
    headline: String(parsed.headline ?? base[side].headline),
    players: normalizePlayers(parsed.players),
  }
  return {
    editSide: side,
    autoRotate: true,
    rotateSeconds: 20,
    soloSeconds: 5,
    includeSolo: true,
    soloBlueIndex: 2,
    soloRedIndex: 2,
    introLabel: String(parsed.introLabel ?? base.introLabel),
    subtitle: String(parsed.subtitle ?? base.subtitle),
    sponsorRight: String(parsed.sponsorRight ?? base.sponsorRight),
    footerSponsors: String(parsed.footerSponsors ?? base.footerSponsors),
    blue: side === 'blue' ? legacyTeam : base.blue,
    red: side === 'red' ? legacyTeam : base.red,
  }
}

function loadStored(): LineupState | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('mlbb-lineup-state-v2') ??
      localStorage.getItem('mlbb-lineup-state-v1')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return { ...defaults(), ...migrateLegacy(parsed) }
  } catch {
    return null
  }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  pushSync('lineup', state)
}

function teamFromDraft(side: TeamSide): LineupTeam {
  const draft = useDraftStore.getState()
  const team = draft[side]
  return {
    teamName: team.name,
    teamTag: team.tag,
    teamLogo: team.logo,
    headline: team.name.toUpperCase(),
    players: normalizePlayers(
      team.players.map((p, i) => ({
        name: p.name,
        subtitle: '',
        photo: p.photo ?? '',
        heroId: team.picks[i] ?? '',
      })),
    ),
  }
}

const initial = loadStored() ?? defaults()

export const useLineupStore = create<LineupStore>((set, get) => ({
  ...initial,

  setEditSide: (editSide) => {
    set({ editSide })
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
    const players = team.players.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    )
    set({ [side]: { ...team, players } })
    push(snapshot(get()))
  },

  loadFromDraft: (side) => {
    set({ [side]: teamFromDraft(side), editSide: side })
    push(snapshot(get()))
  },

  loadBothFromDraft: () => {
    set({ blue: teamFromDraft('blue'), red: teamFromDraft('red') })
    push(snapshot(get()))
  },

  loadFromTournamentTeams: (blueSrc, redSrc, projectName) => {
    const mapSide = (src: typeof blueSrc): LineupTeam => {
      const sorted = [...src.players].sort((a, b) => a.order - b.order)
      return {
        teamName: src.name,
        teamTag: src.tag,
        teamLogo: src.logo,
        headline: src.name.toUpperCase(),
        players: normalizePlayers(
          Array.from({ length: 5 }, (_, i) => {
            const p = sorted[i]
            const role = p?.role ? String(p.role) : ''
            const label =
              role === 'exp'
                ? 'EXP'
                : role === 'jungle'
                  ? 'Jungle'
                  : role === 'mid'
                    ? 'Mid'
                    : role === 'gold'
                      ? 'Gold'
                      : role === 'roam'
                        ? 'Roam'
                        : role.toUpperCase()
            return {
              name: p?.name?.trim() ?? '',
              subtitle: label,
              photo: p?.photo ?? '',
              heroId: '',
            }
          }),
        ),
      }
    }
    set({
      blue: mapSide(blueSrc),
      red: mapSide(redSrc),
      introLabel: projectName
        ? `INTRODUCING / ${projectName.toUpperCase()} ROSTER`
        : get().introLabel,
      autoRotate: true,
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
  subscribeSync('lineup', (payload) => {
    if (payload && typeof payload === 'object') {
      useLineupStore.getState().hydrate(payload as LineupState)
    }
  })
  const isControl =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/control')

  void fetchSync('lineup').then((payload) => {
    if (payload && typeof payload === 'object') {
      useLineupStore.getState().hydrate(payload as LineupState)
      return
    }
    if (isControl) {
      pushSync('lineup', snapshot(useLineupStore.getState()))
    }
  })
}
