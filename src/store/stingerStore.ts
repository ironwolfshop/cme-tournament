import { create } from 'zustand'

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
  void fetch('/api/sync/stinger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch(() => {
    /* ignore */
  })
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

export function initStingerSync() {
  void fetch('/api/sync/stinger')
    .then((r) => r.json())
    .then((payload) => {
      if (payload && typeof payload === 'object') {
        useStingerStore.getState().hydrate(payload as StingerState)
      }
    })
    .catch(() => {
      /* ignore */
    })

  try {
    const es = new EventSource('/api/sync/stinger/stream')
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StingerState
        if (payload && typeof payload === 'object') {
          useStingerStore.getState().hydrate(payload)
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export { DURATION_MS }
