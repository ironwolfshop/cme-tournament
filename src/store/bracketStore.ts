import { create } from 'zustand'
import {
  createBracketState,
  createDefaultTeams,
  getTeam,
  nextPowerOfTwo,
  seedTeamsIntoBracket,
  clearMatchResult,
  setMatchWinner,
  swapOpeningTeams,
  type BracketMatch,
  type BracketSlotRef,
  type BracketState,
  type BracketTeam,
} from '../lib/bracketEngine'
import { loadJson, loadJsonSync, saveJsonFire } from '../lib/appStorage'
import { fetchSync, pushSync, subscribeSync } from '../lib/obsSync'
import { useDraftStore } from './draftStore'

type Actions = {
  setTitle: (title: string) => void
  setTeamCount: (count: number) => void
  updateTeam: (id: string, patch: Partial<Omit<BracketTeam, 'id'>>) => void
  addTeam: () => void
  removeTeam: (id: string) => void
  rebuildBracket: () => void
  setWinner: (matchId: string, winnerId: string, scoreA?: number, scoreB?: number) => void
  clearResult: (matchId: string) => void
  setActiveMatch: (matchId: string | null) => void
  setMatchLive: (matchId: string) => void
  /** Drag-swap two opening-round placements */
  swapSlots: (from: BracketSlotRef, to: BracketSlotRef) => boolean
  /** Push selected matchup into draft overlay teams + reset picks */
  loadMatchIntoDraft: (matchId: string) => void
  /** After draft/series — mark winner and advance bracket */
  reportDraftWinner: (side: 'blue' | 'red') => void
  resetTournament: () => void
  /** Clear all matches so the tournament manager can re-seed. */
  unseed: () => void
  hydrate: (state: BracketState) => void
}

export type BracketStore = BracketState & Actions

const STORAGE_KEY = 'mlbb-bracket-state-v1'
let applyingRemote = false
let syncStarted = false

function loadStored(): BracketState | null {
  return loadJsonSync<BracketState>(STORAGE_KEY)
}

function push(state: BracketState) {
  if (applyingRemote) return
  const data = snapshot(state)
  saveJsonFire(STORAGE_KEY, data)
  pushSync('bracket', data)
}

function snapshot(s: BracketStore | BracketState): BracketState {
  return structuredClone({
    title: s.title,
    teamCount: s.teamCount,
    bracketSize: s.bracketSize,
    teams: s.teams,
    matches: s.matches,
    activeMatchId: s.activeMatchId,
  })
}

const initial = loadStored() ?? createBracketState(8)

export const useBracketStore = create<BracketStore>((set, get) => ({
  ...initial,

  setTitle: (title) => {
    set({ title })
    push(snapshot(get()))
  },

  setTeamCount: (count) => {
    const clamped = Math.max(2, Math.min(16, Math.round(count)))
    const bracketSize = nextPowerOfTwo(clamped)
    const prev = get().teams
    let teams: BracketTeam[]
    if (prev.length === clamped) {
      teams = prev
    } else if (prev.length < clamped) {
      const extra = createDefaultTeams(clamped - prev.length).map((t, i) => ({
        ...t,
        name: `Team ${prev.length + i + 1}`,
        tag: `T${prev.length + i + 1}`,
        seed: prev.length + i + 1,
      }))
      teams = [...prev, ...extra]
    } else {
      teams = prev.slice(0, clamped).map((t, i) => ({ ...t, seed: i + 1 }))
    }
    const matches = seedTeamsIntoBracket(teams, bracketSize)
    set({
      teamCount: clamped,
      bracketSize,
      teams,
      matches,
      activeMatchId:
        matches.find((m) => m.status === 'pending' && m.teamAId && m.teamBId)
          ?.id ?? null,
    })
    push(snapshot(get()))
  },

  updateTeam: (id, patch) => {
    set((s) => ({
      teams: s.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
    push(snapshot(get()))
  },

  addTeam: () => {
    const s = get()
    if (s.teamCount >= 16) return
    get().setTeamCount(s.teamCount + 1)
  },

  removeTeam: (id) => {
    const s = get()
    if (s.teamCount <= 2) return
    const teams = s.teams
      .filter((t) => t.id !== id)
      .map((t, i) => ({ ...t, seed: i + 1 }))
    const teamCount = teams.length
    const bracketSize = nextPowerOfTwo(teamCount)
    const matches = seedTeamsIntoBracket(teams, bracketSize)
    set({
      teams,
      teamCount,
      bracketSize,
      matches,
      activeMatchId:
        matches.find((m) => m.status === 'pending' && m.teamAId && m.teamBId)
          ?.id ?? null,
    })
    push(snapshot(get()))
  },

  rebuildBracket: () => {
    const s = get()
    const matches = seedTeamsIntoBracket(s.teams, s.bracketSize)
    set({
      matches,
      activeMatchId:
        matches.find((m) => m.status === 'pending' && m.teamAId && m.teamBId)
          ?.id ?? null,
    })
    push(snapshot(get()))
  },

  clearResult: (matchId) => {
    const matches = clearMatchResult(get().matches, matchId)
    const nextLive = matches.find(
      (m) => m.status === 'pending' && m.teamAId && m.teamBId,
    )
    set({ matches, activeMatchId: nextLive?.id ?? null })
    push(snapshot(get()))
  },

  setWinner: (matchId, winnerId, scoreA = 1, scoreB = 0) => {
    const matches = setMatchWinner(get().matches, matchId, winnerId, scoreA, scoreB)
    const nextLive = matches.find(
      (m) => m.status === 'pending' && m.teamAId && m.teamBId,
    )
    set({
      matches,
      activeMatchId: nextLive?.id ?? get().activeMatchId,
    })
    push(snapshot(get()))
  },

  setActiveMatch: (matchId) => {
    set({ activeMatchId: matchId })
    push(snapshot(get()))
  },

  setMatchLive: (matchId) => {
    set((s) => ({
      activeMatchId: matchId,
      matches: s.matches.map((m) =>
        m.id === matchId
          ? { ...m, status: 'live' }
          : m.status === 'live'
            ? { ...m, status: 'pending' }
            : m,
      ),
    }))
    push(snapshot(get()))
  },

  swapSlots: (from, to) => {
    const matches = get().matches
    const src = matches.find((m) => m.id === from.matchId)
    const dst = matches.find((m) => m.id === to.matchId)
    // Only unfinished opening-round slots — never later rounds or after a result
    if (!src || !dst || src.round !== 0 || dst.round !== 0) return false
    if (src.winnerId || dst.winnerId) return false
    const next = swapOpeningTeams(matches, from, to)
    if (!next) return false
    const nextLive = next.find(
      (m) => m.status === 'pending' && m.teamAId && m.teamBId,
    )
    set({
      matches: next,
      activeMatchId: nextLive?.id ?? get().activeMatchId,
    })
    push(snapshot(get()))
    return true
  },

  loadMatchIntoDraft: (matchId) => {
    const s = get()
    const match = s.matches.find((m) => m.id === matchId)
    if (!match) return
    const a = getTeam(s, match.teamAId)
    const b = getTeam(s, match.teamBId)
    if (!a || !b) return

    get().setMatchLive(matchId)

    useDraftStore.getState().loadMatchup({
      matchLabel: `${s.title} · ${a.tag} vs ${b.tag}`,
      blue: { name: a.name, tag: a.tag, logo: a.logo },
      red: { name: b.name, tag: b.tag, logo: b.logo },
      firstPickSide: 'blue',
    })
  },

  reportDraftWinner: (side) => {
    const s = get()
    const matchId = s.activeMatchId
    if (!matchId) return
    const match = s.matches.find((m) => m.id === matchId)
    if (!match) return
    const winnerId = side === 'blue' ? match.teamAId : match.teamBId
    if (!winnerId) return
    const scoreA = side === 'blue' ? 1 : 0
    const scoreB = side === 'red' ? 1 : 0
    get().setWinner(matchId, winnerId, scoreA, scoreB)
  },

  resetTournament: () => {
    const next = createBracketState(get().teamCount, get().title)
    set(next)
    push(snapshot(get()))
  },

  unseed: () => {
    set({ matches: [], activeMatchId: null })
    push(snapshot(get()))
  },

  hydrate: (state) => {
    applyingRemote = true
    set({ ...state })
    applyingRemote = false
  },
}))

export function initBracketSync() {
  if (syncStarted) return
  syncStarted = true

  let hubSeen = false
  const isBracket = (p: unknown): p is BracketState =>
    !!p && typeof p === 'object' && Array.isArray((p as BracketState).matches)

  void loadJson<BracketState>(STORAGE_KEY).then((payload) => {
    if (!hubSeen && isBracket(payload)) {
      useBracketStore.getState().hydrate(payload)
    }
  })

  subscribeSync('bracket', (payload) => {
    if (!isBracket(payload)) return
    hubSeen = true
    useBracketStore.getState().hydrate(payload)
  })

  // The hub copy wins; a desk only republishes its cache when the hub is empty,
  // so opening a stale tab can no longer swap the live match.
  void fetchSync('bracket').then((payload) => {
    if (isBracket(payload)) {
      hubSeen = true
      useBracketStore.getState().hydrate(payload)
      return
    }
    if (!hubSeen && window.location.pathname.startsWith('/control')) {
      pushSync('bracket', snapshot(useBracketStore.getState()))
    }
  })
}

export type { BracketMatch, BracketTeam }
