import { create } from 'zustand'
import { UNIQUE_HEROES } from '../data/heroes'
import { buildPickQueue, isPickBlockComplete } from '../data/pickOrder'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'

export type TeamSide = 'blue' | 'red'
export type DraftPhase = 'ban' | 'pick' | 'done'

export type Player = {
  name: string
  photo?: string
}

export type TeamState = {
  name: string
  tag: string
  logo: string
  players: Player[]
  bans: (string | null)[]
  picks: (string | null)[]
}

export type BpmState = {
  name: string
  bpm: number
}

export type PredictorEntry = {
  heroId: string
  percent: number
}

export type DraftReveal = {
  id: string
  kind: 'pick' | 'ban'
  side: TeamSide
  slot: number
  heroId: string
  playerName: string
  playerPhoto?: string
  teamTag: string
  teamName: string
  startedAt: number
}

export type DraftState = {
  matchLabel: string
  phase: DraftPhase
  /** Team that opens with the single first pick */
  firstPickSide: TeamSide
  /** Index into the 10-step pick queue */
  pickOrderIndex: number
  activeSide: TeamSide
  activeSlot: number
  timerSeconds: number
  timerRunning: boolean
  blue: TeamState
  red: TeamState
  bpmBlue: BpmState
  bpmRed: BpmState
  predictorLabel: string
  predictor: PredictorEntry[]
  history: string[]
  reveal: DraftReveal | null
  /** Wall-clock ms of the last local edit — decides which copy wins on reconnect. */
  updatedAt?: number
}

type DraftActions = {
  setMatchLabel: (label: string) => void
  setPhase: (phase: DraftPhase) => void
  setFirstPickSide: (side: TeamSide) => void
  setActiveSide: (side: TeamSide) => void
  setActiveSlot: (slot: number) => void
  /** Ban/pick focus in one sync push (avoids triple-broadcast lag). */
  selectSlot: (side: TeamSide, slot: number, phase?: DraftPhase) => void
  setTimerSeconds: (seconds: number) => void
  setTimerRunning: (running: boolean) => void
  tickTimer: () => void
  updateTeam: (
    side: TeamSide,
    patch: Partial<Omit<TeamState, 'players' | 'bans' | 'picks'>>,
  ) => void
  updatePlayer: (side: TeamSide, index: number, patch: Partial<Player>) => void
  setBan: (side: TeamSide, index: number, heroId: string | null) => void
  setPick: (side: TeamSide, index: number, heroId: string | null) => void
  assignHero: (heroId: string) => void
  clearSlot: (kind: 'ban' | 'pick', side: TeamSide, index: number) => void
  setBpm: (side: TeamSide, patch: Partial<BpmState>) => void
  setPredictorLabel: (label: string) => void
  setPredictor: (entries: PredictorEntry[]) => void
  clearReveal: () => void
  syncPickTurn: () => void
  undo: () => void
  resetDraft: () => void
  /** Load blue/red from a tournament fight (Live Desk → Start fight). */
  loadMatchup: (opts: {
    matchLabel: string
    blue: { name: string; tag: string; logo: string }
    red: { name: string; tag: string; logo: string }
    firstPickSide?: TeamSide
  }) => void
  /** Wipe teams/players until the next fight is started. */
  clearMatchup: () => void
  hydrate: (state: DraftState) => void
}

export type DraftStore = DraftState & DraftActions

const CHANNEL = 'mlbb-draft-sync'
const STORAGE_KEY = 'mlbb-draft-state-v3'
const HISTORY_CAP = 40

const emptySlots = (n: number) =>
  Array.from({ length: n }, () => null as string | null)

function defaultPlayers(names?: string[]): Player[] {
  return Array.from({ length: 5 }, (_, i) => ({
    name: names?.[i]?.trim() ?? '',
  }))
}

function blankTeam(): TeamState {
  return {
    name: '',
    tag: '',
    logo: '',
    players: defaultPlayers(),
    bans: emptySlots(5),
    picks: emptySlots(5),
  }
}

function createInitialState(): DraftState {
  const predictorDefaults = UNIQUE_HEROES.slice(0, 10).map((h, i) => ({
    heroId: h.id,
    percent: Number((28 - i * 2.4 + (i % 3) * 0.37).toFixed(2)),
  }))
  const firstPickSide: TeamSide = 'blue'
  const first = buildPickQueue(firstPickSide)[0]

  return {
    matchLabel: '',
    phase: 'pick',
    firstPickSide,
    pickOrderIndex: 0,
    activeSide: first.side,
    activeSlot: first.slot,
    timerSeconds: 30,
    timerRunning: false,
    blue: blankTeam(),
    red: blankTeam(),
    bpmBlue: { name: '', bpm: 0 },
    bpmRed: { name: '', bpm: 0 },
    predictorLabel: '',
    predictor: predictorDefaults,
    history: [],
    reveal: null,
  }
}

function snapshot(state: DraftState): DraftState {
  return structuredClone({
    matchLabel: state.matchLabel,
    phase: state.phase,
    firstPickSide: state.firstPickSide ?? 'blue',
    pickOrderIndex: state.pickOrderIndex ?? 0,
    activeSide: state.activeSide,
    activeSlot: state.activeSlot,
    timerSeconds: state.timerSeconds,
    timerRunning: state.timerRunning,
    blue: state.blue,
    red: state.red,
    bpmBlue: state.bpmBlue,
    bpmRed: state.bpmRed,
    predictorLabel: state.predictorLabel,
    predictor: state.predictor,
    history: state.history,
    reveal: state.reveal,
    updatedAt: state.updatedAt ?? 0,
  })
}

/** Undo entry must NEVER embed prior history — that nests exponentially and freezes the tab. */
function historyEntry(state: DraftState): string {
  return JSON.stringify({ ...snapshot(state), history: [] })
}

function sanitizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue
    // Drop corrupted nested-history blobs from older builds (multi-MB entries).
    if (entry.length > 250_000) continue
    try {
      const parsed = JSON.parse(entry) as Partial<DraftState>
      out.push(JSON.stringify({ ...parsed, history: [] }))
    } catch {
      /* skip bad entry */
    }
    if (out.length >= HISTORY_CAP) break
  }
  return out
}

/** Next empty pick in official 1-2-2-2-2-1 order. */
function nextPickTurn(state: DraftState): {
  pickOrderIndex: number
  activeSide: TeamSide
  activeSlot: number
  phase: DraftPhase
} {
  const firstPickSide = state.firstPickSide ?? 'blue'
  const queue = buildPickQueue(firstPickSide)
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]
    if (!state[t.side].picks[t.slot]) {
      return {
        pickOrderIndex: i,
        activeSide: t.side,
        activeSlot: t.slot,
        phase: 'pick',
      }
    }
  }
  return {
    pickOrderIndex: queue.length,
    activeSide: state.activeSide,
    activeSlot: state.activeSlot,
    phase: 'done',
  }
}

function normalizeHydrated(state: DraftState): DraftState {
  const firstPickSide = state.firstPickSide ?? 'blue'
  const base = {
    ...state,
    firstPickSide,
    pickOrderIndex: state.pickOrderIndex ?? 0,
    reveal: state.reveal ?? null,
    history: sanitizeHistory(state.history),
  }
  if (base.phase === 'pick' || base.phase === 'done') {
    const turn = nextPickTurn(base)
    return { ...base, ...turn }
  }
  return base
}

function loadStored(): DraftState | null {
  const raw = loadJsonSync<DraftState>(STORAGE_KEY)
  if (!raw) return null
  // Older builds nested full undo stacks inside each entry — wipe before hydrate.
  if (Array.isArray(raw.history)) {
    const total = raw.history.reduce(
      (n, e) => n + (typeof e === 'string' ? e.length : 0),
      0,
    )
    if (total > 1_500_000) raw.history = []
  }
  return normalizeHydrated(raw)
}

let channel: BroadcastChannel | null = null
let applyingRemote = false
let localRevision = 0
let pushTimer: number | null = null
let pendingPush: DraftState | null = null
let syncStarted = false

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL)
  return channel
}

function flushPush() {
  if (pushTimer != null) {
    window.clearTimeout(pushTimer)
    pushTimer = null
  }
  if (!pendingPush) return
  const data = pendingPush
  pendingPush = null
  pushSync('draft', data)
}

function schedulePush(data: DraftState, immediate = false) {
  pendingPush = data
  if (immediate) {
    flushPush()
    return
  }
  if (pushTimer != null) return
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    flushPush()
  }, 120)
}

function persistAndBroadcast(
  state: DraftState,
  immediate = true,
  opts?: { skipStorage?: boolean },
) {
  if (applyingRemote) return
  localRevision += 1
  const updatedAt = Date.now()
  useDraftStore.setState({ updatedAt })
  const data = snapshot({ ...state, updatedAt })
  data.history = sanitizeHistory(data.history)
  if (!opts?.skipStorage) {
    saveJsonFire(STORAGE_KEY, data)
  }
  getChannel()?.postMessage({ type: 'draft', payload: data })
  schedulePush(data, immediate)
}

function withHistory(prev: DraftState, next: Partial<DraftState>): Partial<DraftState> {
  const entry = historyEntry(prev)
  const history = [...prev.history, entry]
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP)
  return { ...next, history }
}

function isDraftPayload(payload: unknown): payload is DraftState {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Partial<DraftState>
  return !!p.blue && !!p.red && Array.isArray(p.blue.picks) && Array.isArray(p.red.picks)
}

function stampOf(payload: unknown): number {
  return isDraftPayload(payload) ? payload.updatedAt ?? 0 : -1
}

function applyRemote(payload: unknown) {
  if (!isDraftPayload(payload)) return
  applyingRemote = true
  useDraftStore.getState().hydrate(payload as DraftState)
  applyingRemote = false
}

const initial = loadStored() ?? createInitialState()

export const useDraftStore = create<DraftStore>((set, get) => ({
  ...initial,

  setMatchLabel: (label) => {
    set({ matchLabel: label })
    persistAndBroadcast(get())
  },
  setPhase: (phase) => {
    if (phase === 'pick') {
      const turn = nextPickTurn(get())
      set({ ...turn, phase: turn.phase === 'done' ? 'done' : 'pick' })
    } else {
      set({ phase })
    }
    persistAndBroadcast(get())
  },
  setFirstPickSide: (side) => {
    const s = get()
    const hasPicks = [...s.blue.picks, ...s.red.picks].some(Boolean)
    if (hasPicks) {
      set({ firstPickSide: side })
      const turn = nextPickTurn({ ...get(), firstPickSide: side })
      set(turn)
    } else {
      const first = buildPickQueue(side)[0]
      set({
        firstPickSide: side,
        pickOrderIndex: 0,
        activeSide: first.side,
        activeSlot: first.slot,
        phase: 'pick',
      })
    }
    persistAndBroadcast(get())
  },
  setActiveSide: (side) => {
    set({ activeSide: side })
    persistAndBroadcast(get())
  },
  setActiveSlot: (slot) => {
    set({ activeSlot: Math.max(0, Math.min(4, slot)) })
    persistAndBroadcast(get())
  },
  selectSlot: (side, slot, phase) => {
    const patch: Partial<DraftState> = {
      activeSide: side,
      activeSlot: Math.max(0, Math.min(4, slot)),
    }
    if (phase && phase !== 'done') patch.phase = phase
    set(patch)
    persistAndBroadcast(get(), true)
  },
  setTimerSeconds: (seconds) => {
    set({ timerSeconds: Math.max(0, seconds) })
    persistAndBroadcast(get())
  },
  setTimerRunning: (running) => {
    set({ timerRunning: running })
    persistAndBroadcast(get())
  },
  tickTimer: () => {
    const { timerRunning, timerSeconds } = get()
    if (!timerRunning || timerSeconds <= 0) return
    set({ timerSeconds: timerSeconds - 1 })
    // Clock ticks: skip localStorage + coalesce WS — keeps hero grid snappy
    persistAndBroadcast(get(), false, { skipStorage: true })
  },
  updateTeam: (side, patch) => {
    set((s) => ({
      [side]: { ...s[side], ...patch },
    }))
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
  setBan: (side, index, heroId) => {
    set((s) => {
      const bans = [...s[side].bans]
      bans[index] = heroId
      const team = s[side]
      const banner = team.players[index]
      const reveal: DraftReveal | null = heroId
        ? {
            id: `${Date.now()}-ban-${side}-${index}`,
            kind: 'ban',
            side,
            slot: index,
            heroId,
            playerName: banner?.name || `PLAYER ${index + 1}`,
            playerPhoto: banner?.photo || undefined,
            teamTag: team.tag,
            teamName: team.name,
            startedAt: Date.now(),
          }
        : s.reveal?.kind === 'ban' &&
            s.reveal.side === side &&
            s.reveal.slot === index
          ? null
          : s.reveal
      return withHistory(s, {
        [side]: { ...s[side], bans },
        reveal,
      })
    })
    persistAndBroadcast(get(), true)
  },
  setPick: (side, index, heroId) => {
    set((s) => {
      const picks = [...s[side].picks]
      picks[index] = heroId
      const team = s[side]
      const player = team.players[index]
      const nextTeam = { ...s[side], picks }
      const provisional = { ...s, [side]: nextTeam } as DraftState
      const turn = nextPickTurn(provisional)

      let reveal: DraftReveal | null = s.reveal
      if (!heroId) {
        reveal =
          s.reveal?.kind === 'pick' &&
          s.reveal.side === side &&
          s.reveal.slot === index
            ? null
            : s.reveal
      } else {
        const queue = buildPickQueue(provisional.firstPickSide ?? 'blue')
        const target = queue.find((t) => t.side === side && t.slot === index)
        const picksBySide = {
          blue: provisional.blue.picks,
          red: provisional.red.picks,
        }
        // ×2 (and larger) blocks stay secret until every hero in the block is locked
        const canReveal =
          !target ||
          target.blockSize <= 1 ||
          isPickBlockComplete(queue, picksBySide, target.blockIndex)

        reveal = canReveal
          ? {
              id: `${Date.now()}-pick-${side}-${index}`,
              kind: 'pick',
              side,
              slot: index,
              heroId,
              playerName: player?.name ?? team.tag,
              playerPhoto: player?.photo,
              teamTag: team.tag,
              teamName: team.name,
              startedAt: Date.now(),
            }
          : null
      }

      return withHistory(s, {
        [side]: nextTeam,
        reveal,
        ...turn,
      })
    })
    persistAndBroadcast(get(), true)
  },
  assignHero: (heroId) => {
    const s = get()
    if (s.phase === 'done') return
    if (s.phase === 'ban') {
      get().setBan(s.activeSide, s.activeSlot, heroId)
      return
    }
    // Always place on the official next pick slot
    const turn = nextPickTurn(s)
    if (turn.phase === 'done') return
    get().setPick(turn.activeSide, turn.activeSlot, heroId)
  },
  clearSlot: (kind, side, index) => {
    if (kind === 'ban') get().setBan(side, index, null)
    else get().setPick(side, index, null)
  },
  setBpm: (side, patch) => {
    const key = side === 'blue' ? 'bpmBlue' : 'bpmRed'
    set((s) => ({ [key]: { ...s[key], ...patch } }))
    persistAndBroadcast(get())
  },
  setPredictorLabel: (label) => {
    set({ predictorLabel: label })
    persistAndBroadcast(get())
  },
  setPredictor: (entries) => {
    set({ predictor: entries })
    persistAndBroadcast(get())
  },
  clearReveal: () => {
    set({ reveal: null })
    persistAndBroadcast(get())
  },
  syncPickTurn: () => {
    const turn = nextPickTurn(get())
    set(turn)
    persistAndBroadcast(get())
  },
  undo: () => {
    const { history } = get()
    if (!history.length) return
    const prev = history[history.length - 1]
    const parsed = normalizeHydrated(JSON.parse(prev) as DraftState)
    set({ ...parsed, history: history.slice(0, -1), reveal: null })
    persistAndBroadcast(get())
  },
  resetDraft: () => {
    const s = get()
    const blank = createInitialState()
    const firstPickSide = s.firstPickSide ?? 'blue'
    set({
      ...blank,
      matchLabel: s.matchLabel,
      firstPickSide,
      phase: 'ban',
      pickOrderIndex: 0,
      activeSide: firstPickSide,
      activeSlot: 0,
      timerSeconds: s.timerSeconds,
      timerRunning: false,
      blue: {
        ...blank.blue,
        name: s.blue.name,
        tag: s.blue.tag,
        logo: s.blue.logo,
        players: s.blue.players.map((p) => ({ ...p })),
      },
      red: {
        ...blank.red,
        name: s.red.name,
        tag: s.red.tag,
        logo: s.red.logo,
        players: s.red.players.map((p) => ({ ...p })),
      },
      bpmBlue: { ...s.bpmBlue },
      bpmRed: { ...s.bpmRed },
      predictorLabel: s.predictorLabel,
      predictor: s.predictor.map((e) => ({ ...e })),
      history: [],
      reveal: null,
    })
    persistAndBroadcast(get(), true)
  },
  loadMatchup: (opts) => {
    const firstPickSide = opts.firstPickSide ?? 'blue'
    const first = buildPickQueue(firstPickSide)[0]
    const blank = createInitialState()
    set({
      ...blank,
      matchLabel: opts.matchLabel,
      firstPickSide,
      pickOrderIndex: 0,
      activeSide: first.side,
      activeSlot: first.slot,
      phase: 'pick',
      timerRunning: false,
      blue: {
        ...blank.blue,
        name: opts.blue.name,
        tag: opts.blue.tag,
        logo: opts.blue.logo || '',
      },
      red: {
        ...blank.red,
        name: opts.red.name,
        tag: opts.red.tag,
        logo: opts.red.logo || '',
      },
      history: [],
      reveal: null,
    })
    persistAndBroadcast(get())
  },
  clearMatchup: () => {
    set(createInitialState())
    persistAndBroadcast(get())
  },
  hydrate: (state) => {
    applyingRemote = true
    set(normalizeHydrated(state))
    applyingRemote = false
  },
}))

export function initDraftSync() {
  if (syncStarted) return
  syncStarted = true

  // Only control desks author draft changes; overlays (OBS) just mirror the hub.
  const isController = window.location.pathname.startsWith('/control')
  let hubSeen = false
  const localStamp = () => useDraftStore.getState().updatedAt ?? 0

  const onHub = (payload: unknown) => {
    if (!hubSeen) {
      hubSeen = true
      // Hub is behind this desk (fresh hub / restart) — republish instead of
      // letting a stale browser cache overwrite the live draft.
      if (isController && localStamp() > stampOf(payload)) {
        pushSync('draft', snapshot(useDraftStore.getState()))
        return
      }
    }
    applyRemote(payload)
  }

  void loadJson<DraftState>(STORAGE_KEY).then((payload) => {
    if (!isDraftPayload(payload)) return
    const stamp = stampOf(payload)
    if (!hubSeen) {
      if (stamp >= localStamp()) applyRemote(payload)
      return
    }
    if (isController && stamp > localStamp()) {
      applyRemote(payload)
      pushSync('draft', snapshot(useDraftStore.getState()))
    }
  })

  getChannel()?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (data?.type === 'draft' && data.payload) {
      applyRemote(data.payload)
    }
  })

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      applyRemote(JSON.parse(e.newValue) as DraftState)
    } catch {
      /* ignore */
    }
  })

  subscribeSync('draft', onHub)
  void fetchSync('draft').then(onHub)
}

export { createInitialState }
