import { create } from 'zustand'
import { UNIQUE_HEROES } from '../data/heroes'
import { buildPickQueue } from '../data/pickOrder'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

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

export type DraftRevealEntry = {
  side: TeamSide
  slot: number
  heroId: string
  playerName: string
  playerPhoto?: string
  teamTag: string
  teamName: string
}

export type DraftReveal = {
  id: string
  kind: 'pick' | 'ban'
  /** One card for single picks/bans; two cards for a completed 2-pick block. */
  entries: DraftRevealEntry[]
  /** Convenience mirrors of entries[0] for sync / older consumers. */
  side: TeamSide
  slot: number
  heroId: string
  playerName: string
  playerPhoto?: string
  teamTag: string
  teamName: string
  startedAt: number
}

/** Broadcast pick/ban reveal modal duration (must match DraftRevealOverlay). */
export const DRAFT_REVEAL_MS = 5000

function revealEntryFrom(
  team: TeamState,
  side: TeamSide,
  slot: number,
  heroId: string,
  kind: 'pick' | 'ban',
): DraftRevealEntry {
  const player = team.players[slot]
  return {
    side,
    slot,
    heroId,
    playerName:
      kind === 'ban' ? team.tag : (player?.name?.trim() || team.tag),
    playerPhoto: kind === 'ban' ? team.logo || undefined : player?.photo,
    teamTag: team.tag,
    teamName: team.name,
  }
}

function makeReveal(
  kind: 'pick' | 'ban',
  entries: DraftRevealEntry[],
  idSuffix: string,
): DraftReveal {
  const primary = entries[0]
  return {
    id: `${Date.now()}-${idSuffix}`,
    kind,
    entries,
    side: primary.side,
    slot: primary.slot,
    heroId: primary.heroId,
    playerName: primary.playerName,
    playerPhoto: primary.playerPhoto,
    teamTag: primary.teamTag,
    teamName: primary.teamName,
    startedAt: Date.now(),
  }
}

function normalizeReveal(reveal: DraftReveal | null | undefined): DraftReveal | null {
  if (!reveal) return null
  if (reveal.entries?.length) {
    return {
      ...reveal,
      entries: reveal.entries.map((e) => ({ ...e })),
    }
  }
  // Older payloads without entries[]
  const legacy = reveal as DraftReveal & { entries?: DraftRevealEntry[] }
  if (!legacy.heroId) return null
  const entry: DraftRevealEntry = {
    side: legacy.side,
    slot: legacy.slot,
    heroId: legacy.heroId,
    playerName: legacy.playerName,
    playerPhoto: legacy.playerPhoto,
    teamTag: legacy.teamTag,
    teamName: legacy.teamName,
  }
  return { ...legacy, entries: [entry] }
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
}

type DraftActions = {
  setMatchLabel: (label: string) => void
  setPhase: (phase: DraftPhase) => void
  setFirstPickSide: (side: TeamSide) => void
  setActiveSide: (side: TeamSide) => void
  setActiveSlot: (slot: number) => void
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

function cloneTeam(team: TeamState): TeamState {
  return {
    name: team.name,
    tag: team.tag,
    logo: team.logo,
    players: team.players.map((p) => ({ name: p.name, photo: p.photo })),
    bans: team.bans.slice(),
    picks: team.picks.slice(),
  }
}

/** Fast shallow snapshot — avoids structuredClone on every lock/tick. */
function snapshot(state: DraftState, includeHistory = true): DraftState {
  return {
    matchLabel: state.matchLabel,
    phase: state.phase,
    firstPickSide: state.firstPickSide ?? 'blue',
    pickOrderIndex: state.pickOrderIndex ?? 0,
    activeSide: state.activeSide,
    activeSlot: state.activeSlot,
    timerSeconds: state.timerSeconds,
    timerRunning: state.timerRunning,
    blue: cloneTeam(state.blue),
    red: cloneTeam(state.red),
    bpmBlue: { ...state.bpmBlue },
    bpmRed: { ...state.bpmRed },
    predictorLabel: state.predictorLabel,
    predictor: state.predictor.map((p) => ({ ...p })),
    history: includeHistory ? state.history.slice(-40) : [],
    reveal: normalizeReveal(state.reveal),
  }
}

/** Overlay/peers never need undo history — keeps lock payloads small & fast. */
function snapshotForSync(state: DraftState): DraftState {
  return snapshot(state, false)
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

/** Next empty ban in first-pick-side alternating order, or pick turn when bans done. */
function nextBanTurn(state: DraftState): {
  activeSide: TeamSide
  activeSlot: number
  phase: DraftPhase
  pickOrderIndex?: number
} {
  const first = state.firstPickSide ?? 'blue'
  const second: TeamSide = first === 'blue' ? 'red' : 'blue'
  const order: TeamSide[] = [first, second]
  for (let i = 0; i < 5; i++) {
    for (const side of order) {
      if (!state[side].bans[i]) {
        return { activeSide: side, activeSlot: i, phase: 'ban' }
      }
    }
  }
  const pick = nextPickTurn(state)
  return {
    activeSide: pick.activeSide,
    activeSlot: pick.activeSlot,
    phase: pick.phase,
    pickOrderIndex: pick.pickOrderIndex,
  }
}

function scheduleRevealClear(revealId: string) {
  if (typeof window === 'undefined') return
  window.setTimeout(() => {
    const current = useDraftStore.getState().reveal
    if (current?.id === revealId) {
      useDraftStore.getState().clearReveal()
    }
  }, DRAFT_REVEAL_MS)
}

function normalizeHydrated(state: DraftState): DraftState {
  const firstPickSide = state.firstPickSide ?? 'blue'
  const base = {
    ...state,
    firstPickSide,
    pickOrderIndex: state.pickOrderIndex ?? 0,
    reveal: normalizeReveal(state.reveal),
  }
  if (base.phase === 'pick' || base.phase === 'done') {
    const turn = nextPickTurn(base)
    return { ...base, ...turn }
  }
  return base
}

function loadStored(): DraftState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeHydrated(JSON.parse(raw) as DraftState)
  } catch {
    return null
  }
}

let channel: BroadcastChannel | null = null
let applyingRemote = false
let persistTimer: number | null = null
let storageTimer: number | null = null
let pendingState: DraftState | null = null
let lastSoftPushAt = 0
/** Bumps on every local edit — blocks late GET /api/sync from stomping newer locks. */
let localRevision = 0

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL)
  return channel
}

function writeLocalStorage(state: DraftState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state, true)))
  } catch {
    /* ignore quota */
  }
}

function flushSyncNow(state: DraftState) {
  const data = snapshotForSync(state)
  getChannel()?.postMessage({ type: 'draft', payload: data })
  pushSync('draft', data)
}

function scheduleStorageWrite(state: DraftState) {
  pendingState = state
  if (typeof window === 'undefined') return
  if (storageTimer != null) window.clearTimeout(storageTimer)
  storageTimer = window.setTimeout(() => {
    storageTimer = null
    writeLocalStorage(pendingState ?? useDraftStore.getState())
  }, 60)
}

/**
 * Push overlay sync immediately on locks; throttle only timer ticks.
 * localStorage is debounced so disk I/O never blocks the lock path.
 */
function persistAndBroadcast(
  state: DraftState,
  opts: { urgent?: boolean; soft?: boolean } = {},
) {
  if (applyingRemote) return
  if (typeof window === 'undefined') return
  localRevision += 1
  pendingState = state

  if (opts.urgent) {
    if (persistTimer != null) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
    // Immediate hub + BroadcastChannel so OBS overlay stays in lockstep
    flushSyncNow(state)
    lastSoftPushAt = performance.now()
    scheduleStorageWrite(state)
    return
  }

  if (opts.soft) {
    const now = performance.now()
    const due = Math.max(0, 200 - (now - lastSoftPushAt))
    if (persistTimer != null) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      const latest = pendingState ?? useDraftStore.getState()
      flushSyncNow(latest)
      lastSoftPushAt = performance.now()
    }, due)
    scheduleStorageWrite(state)
    return
  }

  if (persistTimer != null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    const latest = pendingState ?? useDraftStore.getState()
    flushSyncNow(latest)
    writeLocalStorage(latest)
    lastSoftPushAt = performance.now()
  }, 0)
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
    persistAndBroadcast(get(), { soft: true })
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
    let revealId: string | null = null
    set((s) => {
      const bans = [...s[side].bans]
      bans[index] = heroId
      const team = s[side]
      const nextTeam = { ...s[side], bans }
      const provisional = { ...s, [side]: nextTeam } as DraftState
      const reveal: DraftReveal | null = heroId
        ? makeReveal(
            'ban',
            [revealEntryFrom(nextTeam, side, index, heroId, 'ban')],
            `ban-${side}-${index}`,
          )
        : s.reveal?.kind === 'ban' &&
            s.reveal.entries.some((e) => e.side === side && e.slot === index)
          ? null
          : s.reveal
      if (reveal?.id && reveal.id !== s.reveal?.id) revealId = reveal.id
      const turn = heroId
        ? nextBanTurn(provisional)
        : {
            activeSide: s.activeSide,
            activeSlot: s.activeSlot,
            phase: s.phase as DraftPhase,
            pickOrderIndex: s.pickOrderIndex,
          }
      return {
        [side]: nextTeam,
        history: [
          ...s.history.slice(-39),
          JSON.stringify(snapshot(s, false)),
        ],
        reveal,
        activeSide: turn.activeSide,
        activeSlot: turn.activeSlot,
        phase: turn.phase,
        ...(turn.pickOrderIndex != null
          ? { pickOrderIndex: turn.pickOrderIndex }
          : {}),
        timerSeconds: heroId ? 30 : s.timerSeconds,
      }
    })
    persistAndBroadcast(get(), { urgent: true })
    if (revealId) scheduleRevealClear(revealId)
  },
  setPick: (side, index, heroId) => {
    let revealId: string | null = null
    set((s) => {
      const picks = [...s[side].picks]
      picks[index] = heroId
      const nextTeam = { ...s[side], picks }
      const provisional = { ...s, [side]: nextTeam } as DraftState
      const turn = nextPickTurn(provisional)

      let reveal: DraftReveal | null = s.reveal
      if (!heroId) {
        reveal =
          s.reveal?.kind === 'pick' &&
          s.reveal.entries.some((e) => e.side === side && e.slot === index)
            ? null
            : s.reveal
      } else {
        const queue = buildPickQueue(s.firstPickSide ?? 'blue')
        const target = queue.find((t) => t.side === side && t.slot === index)
        if (!target) {
          reveal = makeReveal(
            'pick',
            [revealEntryFrom(nextTeam, side, index, heroId, 'pick')],
            `pick-${side}-${index}`,
          )
        } else {
          const block = queue.filter((t) => t.blockIndex === target.blockIndex)
          const pickAt = (t: (typeof block)[number]) =>
            (t.side === side ? picks : s[t.side].picks)[t.slot]
          const blockComplete = block.every((t) => !!pickAt(t))

          // 2-pick blocks: wait until both heroes are selected before popup.
          if (target.blockSize > 1 && !blockComplete) {
            reveal = s.reveal
          } else if (target.blockSize > 1 && blockComplete) {
            const entries = block.map((t) => {
              const hid = pickAt(t)!
              const team = t.side === side ? nextTeam : s[t.side]
              return revealEntryFrom(team, t.side, t.slot, hid, 'pick')
            })
            reveal = makeReveal(
              'pick',
              entries,
              `pick-block-${target.blockIndex}`,
            )
          } else {
            reveal = makeReveal(
              'pick',
              [revealEntryFrom(nextTeam, side, index, heroId, 'pick')],
              `pick-${side}-${index}`,
            )
          }
        }
      }

      if (reveal?.id && reveal.id !== s.reveal?.id) revealId = reveal.id

      return {
        [side]: nextTeam,
        history: [
          ...s.history.slice(-39),
          JSON.stringify(snapshot(s, false)),
        ],
        reveal,
        ...turn,
        timerSeconds: heroId ? 30 : s.timerSeconds,
      }
    })
    persistAndBroadcast(get(), { urgent: true })
    if (revealId) scheduleRevealClear(revealId)
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
    persistAndBroadcast(get(), { soft: true })
  },
  syncPickTurn: () => {
    const turn = nextPickTurn(get())
    set(turn)
    persistAndBroadcast(get(), { urgent: true })
  },
  undo: () => {
    const { history } = get()
    if (!history.length) return
    const prev = history[history.length - 1]
    const parsed = normalizeHydrated(JSON.parse(prev) as DraftState)
    set({ ...parsed, history: history.slice(0, -1), reveal: null })
    persistAndBroadcast(get(), { urgent: true })
  },
  resetDraft: () => {
    const next = createInitialState()
    set(next)
    persistAndBroadcast(get(), { urgent: true })
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
    persistAndBroadcast(get(), { urgent: true })
  },
  clearMatchup: () => {
    set(createInitialState())
    persistAndBroadcast(get(), { urgent: true })
  },
  hydrate: (state) => {
    applyingRemote = true
    try {
      const incoming = normalizeHydrated(state)
      const cur = get()
      const keepHistory =
        incoming.history?.length > 0 ? incoming.history : cur.history
      const nextBlue =
        incoming.blue && teamsDraftEqual(cur.blue, incoming.blue)
          ? cur.blue
          : (incoming.blue ?? cur.blue)
      const nextRed =
        incoming.red && teamsDraftEqual(cur.red, incoming.red)
          ? cur.red
          : (incoming.red ?? cur.red)
      set({
        ...incoming,
        blue: nextBlue,
        red: nextRed,
        history: keepHistory,
        reveal:
          incoming.reveal?.id && incoming.reveal.id === cur.reveal?.id
            ? cur.reveal
            : (incoming.reveal ?? null),
      })
    } finally {
      applyingRemote = false
    }
  },
}))

let draftSyncStarted = false

function teamsDraftEqual(a: TeamState | null | undefined, b: TeamState | null | undefined) {
  if (!a || !b) return false
  if (a === b) return true
  if (a.name !== b.name || a.tag !== b.tag || a.logo !== b.logo) return false
  if (!a.bans || !a.picks || !b.bans || !b.picks) return false
  for (let i = 0; i < 5; i++) {
    if (a.bans[i] !== b.bans[i] || a.picks[i] !== b.picks[i]) return false
    if ((a.players?.[i]?.name ?? '') !== (b.players?.[i]?.name ?? '')) return false
    if ((a.players?.[i]?.photo ?? '') !== (b.players?.[i]?.photo ?? '')) return false
  }
  return true
}

function isDraftPayload(payload: unknown): payload is DraftState {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Partial<DraftState>
  return !!p.blue && !!p.red && Array.isArray(p.blue.picks) && Array.isArray(p.red.picks)
}

function applyDraftRemote(payload: unknown) {
  if (!isDraftPayload(payload)) return
  const incoming = payload
  const cur = useDraftStore.getState()

  const picksChanged =
    !teamsDraftEqual(incoming.blue, cur.blue) || !teamsDraftEqual(incoming.red, cur.red)
  const turnChanged =
    incoming.phase !== cur.phase ||
    (incoming.firstPickSide ?? 'blue') !== (cur.firstPickSide ?? 'blue') ||
    (incoming.pickOrderIndex ?? 0) !== (cur.pickOrderIndex ?? 0) ||
    incoming.activeSide !== cur.activeSide ||
    incoming.activeSlot !== cur.activeSlot ||
    incoming.matchLabel !== cur.matchLabel ||
    incoming.timerRunning !== cur.timerRunning ||
    (incoming.reveal?.id ?? null) !== (cur.reveal?.id ?? null)

  // Pure timer tick from control — patch clock only (OBS stays smooth)
  if (!picksChanged && !turnChanged && incoming.timerSeconds !== cur.timerSeconds) {
    useDraftStore.setState({ timerSeconds: incoming.timerSeconds })
    return
  }

  // Exact echo of what we already have
  if (!picksChanged && !turnChanged && incoming.timerSeconds === cur.timerSeconds) {
    return
  }

  useDraftStore.getState().hydrate(incoming)
}

export function initDraftSync() {
  if (draftSyncStarted) return
  draftSyncStarted = true

  getChannel()?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (data?.type === 'draft' && data.payload) {
      applyDraftRemote(data.payload)
    }
  })

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      applyDraftRemote(JSON.parse(e.newValue))
    } catch {
      /* ignore */
    }
  })

  subscribeSync('draft', applyDraftRemote)

  const revisionAtFetch = localRevision
  const isControl =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/control')

  void fetchSync('draft').then((payload) => {
    // Don't let a slow GET wipe a lock that landed while we were fetching
    if (localRevision !== revisionAtFetch) {
      if (isControl && (!payload || typeof payload !== 'object')) {
        pushSync('draft', snapshotForSync(useDraftStore.getState()))
      }
      return
    }
    if (isDraftPayload(payload)) {
      applyDraftRemote(payload)
      return
    }
    // Seed hub only when empty — never stomp a live overlay with stale localStorage
    if (isControl) {
      pushSync('draft', snapshotForSync(useDraftStore.getState()))
    }
  })
}

export { createInitialState }
