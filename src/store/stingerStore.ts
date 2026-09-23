import { create } from 'zustand'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

export type StingerStyle = 'wipe' | 'slam' | 'split'

export type StingerState = {
  id: string | null
  playing: boolean
  style: StingerStyle
  label: string
  startedAt: number | null
}

type Actions = {
  fire: (style?: StingerStyle, label?: string) => void
  clear: () => void
  hydrate: (state: StingerState) => void
}

export type StingerStore = StingerState & Actions

const DURATION_MS = 2200

const empty: StingerState = {
  id: null,
  playing: false,
  style: 'wipe',
  label: 'CME ML TOURNAMENT',
  startedAt: null,
}

let applyingRemote = false

function push(state: StingerState) {
  if (applyingRemote) return
  pushSync('stinger', state)
}

export const useStingerStore = create<StingerStore>((set, get) => ({
  ...empty,

  fire: (style = 'wipe', label = 'CME ML TOURNAMENT') => {
    const next: StingerState = {
      id: `${Date.now()}`,
      playing: true,
      style,
      label,
      startedAt: Date.now(),
    }
    set(next)
    push(next)
    window.setTimeout(() => {
      if (get().id === next.id) get().clear()
    }, DURATION_MS)
  },

  clear: () => {
    const next = { ...empty }
    set(next)
    push(next)
  },

  hydrate: (state) => {
    applyingRemote = true
    set({ ...empty, ...state })
    applyingRemote = false
  },
}))

let stingerSyncStarted = false

function applyStingerRemote(payload: unknown) {
  if (!payload || typeof payload !== 'object') return
  useStingerStore.getState().hydrate(payload as StingerState)
}

export function initStingerSync() {
  if (stingerSyncStarted) return
  stingerSyncStarted = true

  subscribeSync('stinger', applyStingerRemote)
  void fetchSync('stinger').then(applyStingerRemote)
}

export { DURATION_MS }
