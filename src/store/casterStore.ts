import { create } from 'zustand'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'
import { isControlDeskPath } from '../lib/controlPath'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'

export type CasterPerson = {
  name: string
  role: string
  visible: boolean
}

export type CasterState = {
  showTitle: string
  caster1: CasterPerson
  caster2: CasterPerson
}

type Actions = {
  setShowTitle: (v: string) => void
  setCaster: (which: 1 | 2, patch: Partial<CasterPerson>) => void
  hydrate: (state: CasterState) => void
}

export type CasterStore = CasterState & Actions

const STORAGE_KEY = 'mlbb-casters-v2'
const CHANNEL = 'mlbb-casters-sync'
let applyingRemote = false
let channel: BroadcastChannel | null = null

function defaults(): CasterState {
  return {
    showTitle: 'SHOUTCASTER',
    caster1: { name: '', role: 'Play-by-play', visible: true },
    caster2: { name: '', role: 'Color', visible: true },
  }
}

function loadStored(): CasterState | null {
  const parsed =
    loadJsonSync<Partial<CasterState>>(STORAGE_KEY) ??
    loadJsonSync<Partial<CasterState>>('mlbb-casters-v1')
  if (!parsed) return null
  const d = defaults()
  return {
    showTitle: typeof parsed.showTitle === 'string' ? parsed.showTitle : d.showTitle,
    caster1: { ...d.caster1, ...(parsed.caster1 ?? {}) },
    caster2: { ...d.caster2, ...(parsed.caster2 ?? {}) },
  }
}

function snapshot(s: CasterState): CasterState {
  return {
    showTitle: s.showTitle,
    caster1: { ...s.caster1 },
    caster2: { ...s.caster2 },
  }
}

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL)
  return channel
}

function push(state: CasterState) {
  if (applyingRemote) return
  const data = snapshot(state)
  saveJsonFire(STORAGE_KEY, data)
  getChannel()?.postMessage({ type: 'casters', payload: data })
  pushSync('casters', data)
}

const initial = loadStored() ?? defaults()

export const useCasterStore = create<CasterStore>((set, get) => ({
  ...initial,

  setShowTitle: (showTitle) => {
    set({ showTitle })
    push(get())
  },
  setCaster: (which, patch) => {
    const key = which === 1 ? 'caster1' : 'caster2'
    set((s) => ({ [key]: { ...s[key], ...patch } }))
    push(get())
  },
  hydrate: (state) => {
    applyingRemote = true
    const d = defaults()
    set({
      showTitle: typeof state.showTitle === 'string' ? state.showTitle : d.showTitle,
      caster1: { ...d.caster1, ...(state.caster1 ?? {}) },
      caster2: { ...d.caster2, ...(state.caster2 ?? {}) },
    })
    applyingRemote = false
  },
}))

export function initCasterSync() {
  const applyRemote = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    useCasterStore.getState().hydrate(payload as CasterState)
  }

  void loadJson<CasterState>(STORAGE_KEY).then(applyRemote)

  getChannel()?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (data?.type === 'casters' && data.payload) applyRemote(data.payload)
  })

  window.addEventListener('storage', (e) => {
    if (
      (e.key !== STORAGE_KEY && e.key !== 'mlbb-casters-v1') ||
      !e.newValue
    ) {
      return
    }
    try {
      applyRemote(JSON.parse(e.newValue))
    } catch {
      /* ignore */
    }
  })

  subscribeSync('casters', applyRemote)
  void fetchSync('casters').then(applyRemote)

  if (typeof window !== 'undefined' && isControlDeskPath()) {
    window.setTimeout(() => {
      pushSync('casters', snapshot(useCasterStore.getState()))
    }, 50)
  }
}
