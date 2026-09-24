import { create } from 'zustand'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'
import { isControlDeskPath } from '../lib/controlPath'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

export type TeamSide = 'blue' | 'red'

export type GamePlayer = {
  name: string
  /** MLBB in-game name */
  ign: string
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

export type SeriesGameResult = {
  game: number
  winner: TeamSide
  mvpSide: TeamSide | null
  mvpIndex: number | null
  mvpName: string
  mvpIgn: string
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
  /** Best-of series length (default Bo3). */
  bestOf: 1 | 3 | 5
  /** Current map being played (1-based). */
  currentGame: number
  /** Completed maps in this series — bracket is NOT updated from these. */
  gameLog: SeriesGameResult[]
  /** Winner of the current map only (for Victory scene). */
  winnerSide: TeamSide | null
  /** MVP of the current map. */
  mvpSide: TeamSide | null
  mvpIndex: number | null
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
      players: { name: string; ign?: string; photo?: string }[]
    }
    red: {
      name: string
      tag: string
      logo: string
      players: { name: string; ign?: string; photo?: string }[]
    }
  }) => void
  /** Wipe teams until the next fight is started. */
  clearMatchTeams: () => void
  /**
   * Record who won the CURRENT map only.
   * Updates series score from the game log — never touches the bracket.
   */
  declareGameWinner: (side: TeamSide) => void
  /** Pick MVP for the current map (after a game winner is set). */
  setMvp: (side: TeamSide, index: number) => void
  /** Clear current-map winner/MVP only (series history stays). */
  clearMatchResult: () => void
  /** After a map is decided, move to the next game in the Bo3 (if series open). */
  startNextGame: () => boolean
  setBestOf: (n: 1 | 3 | 5) => void
  /** Wins needed to take the series. */
  winsNeeded: () => number
  seriesLeader: () => TeamSide | null
  /** True when one side has enough map wins. */
  isSeriesComplete: () => boolean
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
  igns: string[] = [],
): GamePlayer[] {
  return Array.from({ length: 5 }, (_, i) => ({
    name: names[i]?.trim() ?? '',
    ign: igns[i]?.trim() ?? '',
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
    bestOf: 3,
    currentGame: 1,
    gameLog: [],
    winnerSide: null,
    mvpSide: null,
    mvpIndex: null,
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
    bestOf: state.bestOf === 1 || state.bestOf === 5 ? state.bestOf : 3,
    currentGame: Math.max(1, Math.min(5, Number(state.currentGame) || 1)),
    gameLog: Array.isArray(state.gameLog)
      ? state.gameLog
          .filter(
            (g) =>
              g &&
              (g.winner === 'blue' || g.winner === 'red') &&
              typeof g.game === 'number',
          )
          .map((g) => ({
            game: g.game,
            winner: g.winner as TeamSide,
            mvpSide:
              g.mvpSide === 'blue' || g.mvpSide === 'red' ? g.mvpSide : null,
            mvpIndex:
              typeof g.mvpIndex === 'number' && g.mvpIndex >= 0 && g.mvpIndex < 5
                ? g.mvpIndex
                : null,
            mvpName: String(g.mvpName ?? ''),
            mvpIgn: String(g.mvpIgn ?? ''),
          }))
      : [],
    winnerSide: state.winnerSide === 'blue' || state.winnerSide === 'red' ? state.winnerSide : null,
    mvpSide: state.mvpSide === 'blue' || state.mvpSide === 'red' ? state.mvpSide : null,
    mvpIndex:
      typeof state.mvpIndex === 'number' && state.mvpIndex >= 0 && state.mvpIndex < 5
        ? state.mvpIndex
        : null,
  })
}

function loadStored(): GameplayState | null {
  // Do not migrate v1/v2 — those baked in demo ONIC / AP Bren rosters.
  return loadJsonSync<GameplayState>(STORAGE_KEY)
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
    saveJsonFire(STORAGE_KEY, data)
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
      _side: 'blue' | 'red',
      src: {
        name: string
        tag: string
        logo: string
        players: { name: string; ign?: string; photo?: string }[]
      },
    ) => ({
      name: src.name,
      tag: src.tag,
      logo: src.logo || '',
      seriesScore: 0,
      kills: 0,
      towers: 0,
      gold: 0,
      players: makePlayers(
        src.players.map((p) => p.name),
        [],
        src.players.map((p) => p.ign ?? ''),
      ).map((p, i) => ({
        ...p,
        name: src.players[i]?.name?.trim() || p.name,
        ign: src.players[i]?.ign?.trim() || '',
        photo: src.players[i]?.photo || undefined,
      })),
    })
    set({
      ...keep,
      blue: paint('blue', opts.blue),
      red: paint('red', opts.red),
      gameTimeSeconds: 0,
      timerRunning: false,
      event: null,
      bestOf: 3,
      currentGame: 1,
      gameLog: [],
      winnerSide: null,
      mvpSide: null,
      mvpIndex: null,
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
  declareGameWinner: (side) => {
    set((s) => {
      const game = s.currentGame
      const without = s.gameLog.filter((g) => g.game !== game)
      const nextLog: SeriesGameResult[] = [
        ...without,
        {
          game,
          winner: side,
          mvpSide: null,
          mvpIndex: null,
          mvpName: '',
          mvpIgn: '',
        },
      ].sort((a, b) => a.game - b.game)
      const scores = tallySeries(nextLog)
      return {
        winnerSide: side,
        mvpSide: null,
        mvpIndex: null,
        gameLog: nextLog,
        blue: { ...s.blue, seriesScore: scores.blue },
        red: { ...s.red, seriesScore: scores.red },
        timerRunning: false,
      }
    })
    persistAndBroadcast(get())
  },
  setMvp: (side, index) => {
    const i = Math.max(0, Math.min(4, Math.round(index)))
    set((s) => {
      const team = s[side]
      const player = team.players[i]
      const mvpName = player?.name?.trim() || ''
      const mvpIgn = player?.ign?.trim() || ''
      const gameLog = s.gameLog.map((g) =>
        g.game === s.currentGame
          ? {
              ...g,
              mvpSide: side,
              mvpIndex: i,
              mvpName,
              mvpIgn,
            }
          : g,
      )
      return { mvpSide: side, mvpIndex: i, gameLog }
    })
    persistAndBroadcast(get())
  },
  clearMatchResult: () => {
    set((s) => {
      const gameLog = s.gameLog.filter((g) => g.game !== s.currentGame)
      const scores = tallySeries(gameLog)
      return {
        winnerSide: null,
        mvpSide: null,
        mvpIndex: null,
        gameLog,
        blue: { ...s.blue, seriesScore: scores.blue },
        red: { ...s.red, seriesScore: scores.red },
      }
    })
    persistAndBroadcast(get())
  },
  startNextGame: () => {
    const s = get()
    const needed = winsNeededFor(s.bestOf)
    const scores = tallySeries(s.gameLog)
    if (scores.blue >= needed || scores.red >= needed) return false
    const currentRecorded = s.gameLog.some((g) => g.game === s.currentGame)
    if (!currentRecorded) return false
    const next = Math.min(s.bestOf, s.currentGame + 1)
    if (next === s.currentGame) return false
    set({
      currentGame: next,
      winnerSide: null,
      mvpSide: null,
      mvpIndex: null,
      gameTimeSeconds: 0,
      timerRunning: false,
      event: null,
    })
    persistAndBroadcast(get(), true)
    return true
  },
  setBestOf: (n) => {
    set({ bestOf: n })
    persistAndBroadcast(get())
  },
  winsNeeded: () => winsNeededFor(get().bestOf),
  seriesLeader: () => {
    const s = get()
    const needed = winsNeededFor(s.bestOf)
    if (s.blue.seriesScore >= needed) return 'blue'
    if (s.red.seriesScore >= needed) return 'red'
    return null
  },
  isSeriesComplete: () => get().seriesLeader() != null,
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
    const base = createInitialState()
    const patchTeam = (side: TeamSide) => {
      const src = incoming[side] ?? base[side]
      return {
        ...base[side],
        ...src,
        players: Array.from({ length: 5 }, (_, i) => {
          const p = src.players?.[i]
          const fallback = base[side].players[i]!
          return {
            ...fallback,
            ...p,
            name: String(p?.name ?? fallback.name),
            ign: String(p?.ign ?? fallback.ign ?? ''),
            items: Array.isArray(p?.items) ? p!.items : fallback.items,
          }
        }),
      }
    }
    set({
      ...base,
      ...incoming,
      blue: patchTeam('blue'),
      red: patchTeam('red'),
      showCameras: incoming.showCameras ?? true,
      showCaster: false,
      casterFeed: normalizeCasterFeed(incoming.casterFeed),
      showScoreboard: incoming.showScoreboard ?? true,
      showMap: incoming.showMap ?? false,
      mapLabel: incoming.mapLabel || 'MAP',
      mapUrl: incoming.mapUrl ?? '',
      bestOf: incoming.bestOf === 1 || incoming.bestOf === 5 ? incoming.bestOf : 3,
      currentGame: Math.max(1, Math.min(5, Number(incoming.currentGame) || 1)),
      gameLog: Array.isArray(incoming.gameLog)
        ? (incoming.gameLog as SeriesGameResult[])
        : [],
      winnerSide:
        incoming.winnerSide === 'blue' || incoming.winnerSide === 'red'
          ? incoming.winnerSide
          : null,
      mvpSide:
        incoming.mvpSide === 'blue' || incoming.mvpSide === 'red'
          ? incoming.mvpSide
          : null,
      mvpIndex:
        typeof incoming.mvpIndex === 'number' &&
        incoming.mvpIndex >= 0 &&
        incoming.mvpIndex < 5
          ? incoming.mvpIndex
          : null,
    })
    applyingRemote = false
  },
}))

function winsNeededFor(bestOf: 1 | 3 | 5) {
  return Math.ceil(bestOf / 2)
}

function tallySeries(log: SeriesGameResult[]) {
  let blue = 0
  let red = 0
  for (const g of log) {
    if (g.winner === 'blue') blue += 1
    if (g.winner === 'red') red += 1
  }
  return { blue, red }
}

/** Build draft/tournament label for the active BoX game — does not touch bracket. */
export function formatSeriesLabel(state: {
  blue: { tag: string; seriesScore: number }
  red: { tag: string; seriesScore: number }
  currentGame: number
  bestOf: number
  matchInfo?: string
}) {
  const blueTag = state.blue.tag || 'BLUE'
  const redTag = state.red.tag || 'RED'
  const series = `${blueTag} ${state.blue.seriesScore}–${state.red.seriesScore} ${redTag}`
  return `Bo${state.bestOf} · GAME ${state.currentGame} · ${series}`.slice(0, 64)
}

function applyRemote(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('blue' in payload)) return
  useGameplayStore.getState().hydrate(payload as GameplayState)
}

export function initGameplaySync() {
  void loadJson<GameplayState>(STORAGE_KEY).then((payload) => {
    if (payload && typeof payload === 'object') {
      applyRemote(payload)
    }
  })

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
  void fetchSync('gameplay').then((payload) => {
    // A newer local edit (OCR, clock tick) must not be replaced by a late GET.
    if (localRevision !== revisionAtFetch) return
    applyRemote(payload)
  })

  if (typeof window !== 'undefined' && isControlDeskPath()) {
    window.setTimeout(() => {
      pushSync('gameplay', snapshot(useGameplayStore.getState()))
    }, 50)
  }
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
