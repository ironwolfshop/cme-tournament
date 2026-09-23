import { create } from 'zustand'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

export type CamsState = {
  accessCode: string
  matchName: string
  blueName: string
  redName: string
  casterName: string
  blueLive: boolean
  redLive: boolean
  casterLive: boolean
}

type Actions = {
  setAccessCode: (code: string) => void
  setMatchName: (name: string) => void
  setTeamName: (side: 'blue' | 'red', name: string) => void
  setCasterName: (name: string) => void
  setTeamLive: (side: 'blue' | 'red', live: boolean) => void
  setCasterLive: (live: boolean) => void
  setSlotLive: (slot: 'blue' | 'red' | 'caster', live: boolean) => void
  hydrate: (state: CamsState) => void
}

export type CamsStore = CamsState & Actions

const STORAGE_KEY = 'mlbb-team-cams-v2'
let applyingRemote = false

function defaults(): CamsState {
  return {
    accessCode: 'CME24',
    matchName: 'CME ML TOURNAMENT',
    blueName: 'BLUE TEAM',
    redName: 'RED TEAM',
    casterName: 'SHOUTCASTER',
    blueLive: false,
    redLive: false,
    casterLive: false,
  }
}

function loadStored(): CamsState | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('mlbb-team-cams-v1')
    if (!raw) return null
    return { ...defaults(), ...(JSON.parse(raw) as Partial<CamsState>) }
  } catch {
    return null
  }
}

function snapshot(s: CamsState): CamsState {
  return {
    accessCode: s.accessCode,
    matchName: s.matchName,
    blueName: s.blueName,
    redName: s.redName,
    casterName: s.casterName,
    blueLive: s.blueLive,
    redLive: s.redLive,
    casterLive: s.casterLive,
  }
}

function push(state: CamsState) {
  if (applyingRemote) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  pushSync('cams', state)
}

const initial = loadStored() ?? defaults()

export const useCamsStore = create<CamsStore>((set, get) => ({
  ...initial,

  setAccessCode: (accessCode) => {
    set({ accessCode: accessCode.trim().toUpperCase() || 'CME24' })
    push(snapshot(get()))
  },
  setMatchName: (matchName) => {
    set({ matchName })
    push(snapshot(get()))
  },
  setTeamName: (side, name) => {
    set(side === 'blue' ? { blueName: name } : { redName: name })
    push(snapshot(get()))
  },
  setCasterName: (casterName) => {
    set({ casterName })
    push(snapshot(get()))
  },
  setTeamLive: (side, live) => {
    set(side === 'blue' ? { blueLive: live } : { redLive: live })
    push(snapshot(get()))
  },
  setCasterLive: (casterLive) => {
    set({ casterLive })
    push(snapshot(get()))
  },
  setSlotLive: (slot, live) => {
    if (slot === 'caster') set({ casterLive: live })
    else if (slot === 'blue') set({ blueLive: live })
    else set({ redLive: live })
    push(snapshot(get()))
  },
  hydrate: (state) => {
    applyingRemote = true
    set({ ...defaults(), ...state })
    applyingRemote = false
  },
}))

export function initCamsSync() {
  subscribeSync('cams', (payload) => {
    if (payload && typeof payload === 'object') {
      useCamsStore.getState().hydrate(payload as CamsState)
    }
  })
  const isControl =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/control')

  void fetchSync('cams').then((payload) => {
    if (payload && typeof payload === 'object') {
      useCamsStore.getState().hydrate(payload as CamsState)
      return
    }
    if (isControl) {
      pushSync('cams', snapshot(useCamsStore.getState()))
    }
  })
}

export function codesMatch(input: string, expected: string) {
  return input.trim().toUpperCase() === expected.trim().toUpperCase()
}
