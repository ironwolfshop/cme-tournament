import { create } from 'zustand'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

export type TeamSide = 'blue' | 'red'

export type GamePlayer = {
  name: string
  heroId: string | null
  level: number
  kills: number
  deaths: number
  assists: number
  gold: number
  items: (string | null)[]
  photo?: string
}

export type FeaturedCam = {
  playerIndex: number
  bpm: number
  camLabel: string
}

export type GameEventType =
  | 'turtle'
  | 'lord'
  | 'first_blood'
  | 'triple'
  | 'maniac'
  | 'savage'
  | 'tower'

export type GameEvent = {
  id: string
  type: GameEventType
  title: string
  playerName: string
  teamTag: string
  side: TeamSide
  visible: boolean
}

export type GameplayState = {
  matchInfo: string
  gameTimeSeconds: number
  timerRunning: boolean
  blue: {
    name: string
    tag: string
    logo: string
    seriesScore: number
    kills: number
    towers: number
    gold: number
    players: GamePlayer[]
  }
  red: {
    name: string
    tag: string
    logo: string
    seriesScore: number
    kills: number
    towers: number
    gold: number
    players: GamePlayer[]
  }
  featuredBlue: FeaturedCam
  featuredRed: FeaturedCam
  event: GameEvent | null
  showCameras: boolean
  /** Large center shoutcaster window */
  showCaster: boolean
  /**
   * What fills the shoutcaster window:
   * - obs — transparent hole for an OBS source
   * - blue / red / caster — live WebRTC feed from /cam publisher
   */
  casterFeed: 'obs' | 'blue' | 'red' | 'caster'
  showScoreboard: boolean
  showMap: boolean
  mapLabel: string
  mapUrl: string
}

type Actions = {
  setMatchInfo: (v: string) => void
  setGameTime: (s: number) => void
  setTimerRunning: (v: boolean) => void
  tickTimer: () => void
  updateTeamMeta: (
    side: TeamSide,
    patch: Partial<{
      name: string
      tag: string
      logo: string
      seriesScore: number
      kills: number
      towers: number
      gold: number
    }>,
  ) => void
  updatePlayer: (
    side: TeamSide,
    index: number,
    patch: Partial<GamePlayer>,
  ) => void
  setPlayerItem: (
    side: TeamSide,
    playerIndex: number,
    itemIndex: number,
    itemId: string | null,
  ) => void
  setFeatured: (side: TeamSide, patch: Partial<FeaturedCam>) => void
  triggerEvent: (event: Omit<GameEvent, 'id' | 'visible'>) => void
  hideEvent: () => void
  recalculateTeamStats: () => void
  setDisplay: (
    patch: Partial<
      Pick<
        GameplayState,
        | 'showCameras'
        | 'showCaster'
        | 'casterFeed'
        | 'showScoreboard'
        | 'showMap'
        | 'mapLabel'
        | 'mapUrl'
      >
    >,
  ) => void
  resetGameplay: () => void
  /** Load rosters from Live Desk → Start fight. */
  loadTeamsFromMatch: (opts: {
    blue: {
      name: string
      tag: string
      logo: string
      players: { name: string; photo?: string }[]
    }
    red: {
      name: string
      tag: string
      logo: string
      players: { name: string; photo?: string }[]
    }
  }) => void
  /** Wipe teams until the next fight is started. */
  clearMatchTeams: () => void
  /** One overlay push for a full OCR pass (clock, team totals, KDA). */
  applyOcrHud: (patch: {
    gameTimeSeconds?: number
    timerRunning?: boolean
    blue?: Partial<{
      seriesScore: number
      kills: number
      towers: number
      gold: number
    }>
    red?: Partial<{
      seriesScore: number
      kills: number
      towers: number
      gold: number
    }>
    players?: {
      side: TeamSide
      index: number
      kills: number
      deaths: number
      assists: number
    }[]
  }) => void
  hydrate: (state: GameplayState) => void
}

export type GameplayStore = GameplayState & Actions

const CHANNEL = 'mlbb-gameplay-sync'
const STORAGE_KEY = 'mlbb-gameplay-state-v3'

function normalizeCasterFeed(
  v: unknown,
): GameplayState['casterFeed'] {
  if (v === 'obs' || v === 'blue' || v === 'red' || v === 'caster') return v
  return 'caster'
}

function emptyItems() {
  return Array.from({ length: 6 }, () => null as string | null)
}

function makePlayers(
  names: string[] = [],
  heroes: (string | null)[] = [],
): GamePlayer[] {
  return Array.from({ length: 5 }, (_, i) => ({
    name: names[i]?.trim() ?? '',
    heroId: heroes[i] ?? null,
    level: 1,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    items: emptyItems(),
  }))
}

function blankGameplayTeam(): GameplayState['blue'] {
  return {
    name: '',
    tag: '',
    logo: '',
    seriesScore: 0,
    kills: 0,
    towers: 0,
    gold: 0,
    players: makePlayers(),
  }
}

function createInitialState(): GameplayState {
  return {
    matchInfo: '',
    gameTimeSeconds: 0,
    timerRunning: false,
    blue: blankGameplayTeam(),
    red: blankGameplayTeam(),
    featuredBlue: { playerIndex: 0, bpm: 0, camLabel: 'PLAYER CAM' },
    featuredRed: { playerIndex: 0, bpm: 0, camLabel: 'PLAYER CAM' },
    event: null,
    showCameras: true,
    showCaster: false,
    casterFeed: 'caster',
    showScoreboard: true,
    showMap: false,
    mapLabel: 'MAP',
    mapUrl: '',
  }
}

function snapshot(state: GameplayState): GameplayState {
  return structuredClone({
    matchInfo: state.matchInfo,
    gameTimeSeconds: state.gameTimeSeconds,
    timerRunning: state.timerRunning,
    blue: state.blue,
    red: state.red,
    featuredBlue: state.featuredBlue,
    featuredRed: state.featuredRed,
    event: state.event,
    showCameras: state.showCameras !== false,
    showCaster: false,
    casterFeed: normalizeCasterFeed(state.casterFeed),
    showScoreboard: state.showScoreboard !== false,
    showMap: state.showMap === true,
    mapLabel: state.mapLabel || 'MAP',
    mapUrl: state.mapUrl || '',
  })
}

function loadStored(): GameplayState | null {
  try {
    // Do not migrate v1/v2 — those baked in demo ONIC / AP Bren rosters.
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GameplayState
  } catch {
    return null
  }
}

let channel: BroadcastChannel | null = null
let applyingRemote = false

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL)
  return channel
}

let localRevision = 0
let pushTimer: number | null = null
let pendingPush: GameplayState | null = null

function flushPush() {
  if (pushTimer != null) {
    window.clearTimeout(pushTimer)
    pushTimer = null
  }
  if (!pendingPush) return
  const data = pendingPush
  pendingPush = null
  pushSync('gameplay', data)
}

function schedulePush(data: GameplayState, immediate = false) {
  pendingPush = data
  if (immediate) {
    flushPush()
    return
  }
  if (pushTimer != null) return
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    flushPush()
  }, 800)
}

function persistAndBroadcast(
  state: GameplayState,
  immediate = false,
  opts?: { skipStorage?: boolean },
) {
  if (applyingRemote) return
  localRevision += 1
  const data = snapshot(state)
  if (!opts?.skipStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }
  getChannel()?.postMessage({ type: 'gameplay', payload: data })
  // Debounce OBS websocket pushes — a 1Hz clock tick was freezing the hub.
  schedulePush(data, immediate)
}

const initial = loadStored() ?? createInitialState()

export const useGameplayStore = create<GameplayStore>((set, get) => ({
  ...initial,

  setMatchInfo: (v) => {
    set({ matchInfo: v })
    persistAndBroadcast(get())
  },
  setGameTime: (s) => {
    set({ gameTimeSeconds: Math.max(0, s) })
    persistAndBroadcast(get(), true)
  },
  setTimerRunning: (v) => {
    set({ timerRunning: v })
    persistAndBroadcast(get(), true)
  },
  tickTimer: () => {
    const { timerRunning, gameTimeSeconds } = get()
    if (!timerRunning) return
    set({ gameTimeSeconds: gameTimeSeconds + 1 })
    // Clock ticks: skip localStorage (heavy) + debounce WS — prevents UI freeze
    persistAndBroadcast(get(), false, { skipStorage: true })
  },
  updateTeamMeta: (side, patch) => {
    set((s) => ({ [side]: { ...s[side], ...patch } }))
    persistAndBroadcast(get())
  },
  updatePlayer: (side, index, patch) => {
    set((s) => {
      const players = s[side].players.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      )
      return { [side]: { ...s[side], players } }
    })
    persistAndBroadcast(get())
  },
  setPlayerItem: (side, playerIndex, itemIndex, itemId) => {
    set((s) => {
      const players = s[side].players.map((p, i) => {
        if (i !== playerIndex) return p
        const items = [...p.items]
        items[itemIndex] = itemId
        return { ...p, items }
      })
      return { [side]: { ...s[side], players } }
    })
    persistAndBroadcast(get())
  },
  setFeatured: (side, patch) => {
    const key = side === 'blue' ? 'featuredBlue' : 'featuredRed'
    set((s) => ({ [key]: { ...s[key], ...patch } }))
    persistAndBroadcast(get())
  },
  triggerEvent: (event) => {
    set({
      event: {
        ...event,
        id: `${Date.now()}`,
        visible: true,
      },
    })
    persistAndBroadcast(get())
  },
  hideEvent: () => {
    set((s) => ({
      event: s.event ? { ...s.event, visible: false } : null,
    }))
    persistAndBroadcast(get())
  },
  setDisplay: (patch) => {
    set(patch)
    persistAndBroadcast(get())
  },
  recalculateTeamStats: () => {
    set((s) => {
      const sum = (side: TeamSide) => {
        const kills = s[side].players.reduce((a, p) => a + p.kills, 0)
        const gold = s[side].players.reduce((a, p) => a + p.gold, 0)
        return { ...s[side], kills, gold }
      }
      return { blue: sum('blue'), red: sum('red') }
    })
    persistAndBroadcast(get())
  },
  resetGameplay: () => {
    set(createInitialState())
    persistAndBroadcast(get())
  },
  loadTeamsFromMatch: (opts) => {
    const keep = get()
    const paint = (
      side: 'blue' | 'red',
      src: {
        name: string
        tag: string
        logo: string
        players: { name: string; photo?: string }[]
      },
    ) => ({
      name: src.name,
      tag: src.tag,
      logo: src.logo || '',
      seriesScore: 0,
      kills: 0,
      towers: 0,
      gold: 0,
      players: makePlayers(src.players.map((p) => p.name)).map((p, i) => ({
        ...p,
        // photo not on GamePlayer — names only for now
        name: src.players[i]?.name?.trim() || p.name,
      })),
    })
    set({
      ...keep,
      blue: paint('blue', opts.blue),
      red: paint('red', opts.red),
      gameTimeSeconds: 0,
      timerRunning: false,
      event: null,
      featuredBlue: { ...keep.featuredBlue, playerIndex: 0 },
      featuredRed: { ...keep.featuredRed, playerIndex: 0 },
    })
    persistAndBroadcast(get(), true)
  },
  clearMatchTeams: () => {
    const keep = get()
    const blank = createInitialState()
    set({
      ...blank,
      showCameras: keep.showCameras,
      showCaster: keep.showCaster,
      casterFeed: keep.casterFeed,
      showScoreboard: keep.showScoreboard,
      showMap: keep.showMap,
      mapLabel: keep.mapLabel,
      mapUrl: keep.mapUrl,
    })
    persistAndBroadcast(get(), true)
  },
  applyOcrHud: (patch) => {
    set((s) => {
      const paint = (side: TeamSide) => {
        const meta = patch[side]
        let team = s[side]
        if (meta) team = { ...team, ...meta }
        const rows = patch.players?.filter((p) => p.side === side) ?? []
        if (!rows.length) return team
        return {
          ...team,
          players: team.players.map((p, i) => {
            const hit = rows.find((row) => row.index === i)
            if (!hit) return p
            return {
              ...p,
              kills: hit.kills,
              deaths: hit.deaths,
              assists: hit.assists,
            }
          }),
        }
      }
      return {
        blue: paint('blue'),
        red: paint('red'),
        gameTimeSeconds: patch.gameTimeSeconds ?? s.gameTimeSeconds,
        timerRunning: patch.timerRunning ?? s.timerRunning,
      }
    })
    persistAndBroadcast(get(), true)
  },
  hydrate: (state) => {
    applyingRemote = true
    const incoming = state as Partial<GameplayState>
    set({
      ...state,
      showCameras: incoming.showCameras ?? true,
      showCaster: false,
      casterFeed: normalizeCasterFeed(incoming.casterFeed),
      showScoreboard: incoming.showScoreboard ?? true,
      showMap: incoming.showMap ?? false,
      mapLabel: incoming.mapLabel || 'MAP',
      mapUrl: incoming.mapUrl ?? '',
    })
    applyingRemote = false
  },
}))

function applyRemote(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('blue' in payload)) return
  useGameplayStore.getState().hydrate(payload as GameplayState)
}

export function initGameplaySync() {
  getChannel()?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (data?.type === 'gameplay' && data.payload) {
      applyRemote(data.payload)
    }
  })

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      applyRemote(JSON.parse(e.newValue))
    } catch {
      /* ignore */
    }
  })

  subscribeSync('gameplay', applyRemote)
  const revisionAtFetch = localRevision
  const isControl =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/control')

  void fetchSync('gameplay').then((payload) => {
    // A newer local edit (OCR, clock tick) must not be replaced by a late GET.
    if (localRevision !== revisionAtFetch) return
    if (payload && typeof payload === 'object' && 'blue' in payload) {
      applyRemote(payload)
      return
    }
    if (isControl) {
      pushSync('gameplay', snapshot(useGameplayStore.getState()))
    }
  })
}

export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  // Always HH:MM:SS — 24-hour style digital match clock
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Parse operator/OCR clock text as match elapsed seconds. Accepts MM:SS or HH:MM:SS. */
export function parseClockInput(value: string): number | null {
  const cleaned = value.trim().replace(/[.;|/\\-]/g, ':')
  const hms = cleaned.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/)
  if (hms) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  }
  const ms = cleaned.match(/^(\d{1,4}):([0-5]\d)$/)
  if (ms) {
    return Number(ms[1]) * 60 + Number(ms[2])
  }
  return null
}

export function formatGold(gold: number): string {
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`
  return String(gold)
}

export { createInitialState }
