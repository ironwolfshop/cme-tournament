export type BracketTeam = {
  id: string
  name: string
  tag: string
  logo: string
  seed: number
}

export type MatchStatus = 'pending' | 'live' | 'done'

export type BracketMatch = {
  id: string
  round: number
  index: number
  /** Team id or null (TBD / bye) */
  teamAId: string | null
  teamBId: string | null
  winnerId: string | null
  scoreA: number
  scoreB: number
  status: MatchStatus
  /** Feeds into next match */
  nextMatchId: string | null
  /** Which slot in next match: 'A' | 'B' */
  nextSlot: 'A' | 'B' | null
}

export type BracketState = {
  title: string
  teamCount: number
  bracketSize: number
  teams: BracketTeam[]
  matches: BracketMatch[]
  activeMatchId: string | null
}

export function nextPowerOfTwo(n: number): number {
  let p = 2
  while (p < n) p *= 2
  return Math.max(2, p)
}

export function roundLabel(round: number, bracketSize: number): string {
  const teamsInRound = bracketSize / 2 ** round
  if (teamsInRound === 2) return 'GRAND FINAL'
  if (teamsInRound === 4) return 'SEMI FINALS'
  if (teamsInRound === 8) return 'QUARTER FINALS'
  if (teamsInRound === 16) return 'ROUND OF 16'
  return `ROUND ${round + 1}`
}

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Build empty single-elim bracket tree + wire nextMatch links. */
export function buildEmptyBracket(bracketSize: number): BracketMatch[] {
  const rounds = Math.log2(bracketSize)
  const byRound: BracketMatch[][] = []

  for (let r = 0; r < rounds; r++) {
    const count = bracketSize / 2 ** (r + 1)
    const roundMatches: BracketMatch[] = []
    for (let i = 0; i < count; i++) {
      roundMatches.push({
        id: `r${r}-m${i}`,
        round: r,
        index: i,
        teamAId: null,
        teamBId: null,
        winnerId: null,
        scoreA: 0,
        scoreB: 0,
        status: 'pending',
        nextMatchId: null,
        nextSlot: null,
      })
    }
    byRound.push(roundMatches)
  }

  for (let r = 0; r < rounds - 1; r++) {
    for (let i = 0; i < byRound[r].length; i++) {
      const next = byRound[r + 1][Math.floor(i / 2)]
      byRound[r][i].nextMatchId = next.id
      byRound[r][i].nextSlot = i % 2 === 0 ? 'A' : 'B'
    }
  }

  return byRound.flat()
}

/**
 * Seed teams into round 0. Extra bracket slots become BYEs
 * (auto-advance the present team).
 */
export function seedTeamsIntoBracket(
  teams: BracketTeam[],
  bracketSize: number,
): BracketMatch[] {
  const matches = buildEmptyBracket(bracketSize)
  const sorted = [...teams].sort((a, b) => a.seed - b.seed)
  const slots: (string | null)[] = Array.from({ length: bracketSize }, () => null)

  // Standard seeding pairs: 1 vs N, 2 vs N-1, ...
  const order = seedingOrder(bracketSize)
  sorted.forEach((t, i) => {
    if (i < order.length) slots[order[i]] = t.id
  })

  const round0 = matches.filter((m) => m.round === 0)
  round0.forEach((m, i) => {
    m.teamAId = slots[i * 2] ?? null
    m.teamBId = slots[i * 2 + 1] ?? null

    // Auto-bye
    if (m.teamAId && !m.teamBId) {
      m.winnerId = m.teamAId
      m.status = 'done'
      m.scoreA = 1
    } else if (!m.teamAId && m.teamBId) {
      m.winnerId = m.teamBId
      m.status = 'done'
      m.scoreB = 1
    }
  })

  // Propagate bye winners into later rounds
  return propagateWinners(matches)
}

/** Classic bracket slot order for power-of-two sizes. */
function seedingOrder(size: number): number[] {
  // 8-team board places 1v8 and 4v5 on the left, 2v7 and 3v6 on the right.
  if (size === 8) return [0, 4, 6, 2, 3, 7, 5, 1]
  if (size === 2) return [0, 1]
  // Recursive: place seeds so 1 and 2 meet in final
  let order = [0, 1]
  while (order.length < size) {
    const next: number[] = []
    const len = order.length * 2
    for (const s of order) {
      next.push(s)
      next.push(len - 1 - s)
    }
    order = next
  }
  return order
}

export function propagateWinners(matches: BracketMatch[]): BracketMatch[] {
  const map = new Map(matches.map((m) => [m.id, { ...m }]))
  const sorted = [...map.values()].sort(
    (a, b) => a.round - b.round || a.index - b.index,
  )

  for (const m of sorted) {
    if (!m.winnerId || !m.nextMatchId) continue
    const next = map.get(m.nextMatchId)
    if (!next) continue
    if (m.nextSlot === 'A') next.teamAId = m.winnerId
    if (m.nextSlot === 'B') next.teamBId = m.winnerId

    // Chain byes further
    if (next.teamAId && !next.teamBId && next.status !== 'done') {
      next.winnerId = next.teamAId
      next.status = 'done'
      next.scoreA = 1
      next.scoreB = 0
    } else if (!next.teamAId && next.teamBId && next.status !== 'done') {
      next.winnerId = next.teamBId
      next.status = 'done'
      next.scoreB = 1
      next.scoreA = 0
    }
    map.set(next.id, next)
  }

  return [...map.values()].sort(
    (a, b) => a.round - b.round || a.index - b.index,
  )
}

function descendantMatchIds(matches: BracketMatch[], matchId: string): string[] {
  const ids: string[] = []
  let current = matches.find((m) => m.id === matchId)
  const seen = new Set<string>()
  while (current?.nextMatchId && !seen.has(current.nextMatchId)) {
    seen.add(current.nextMatchId)
    ids.push(current.nextMatchId)
    current = matches.find((m) => m.id === current?.nextMatchId)
  }
  return ids
}

function blankLaterMatch(match: BracketMatch): BracketMatch {
  return {
    ...match,
    teamAId: null,
    teamBId: null,
    winnerId: null,
    scoreA: 0,
    scoreB: 0,
    status: 'pending',
  }
}

export function setMatchWinner(
  matches: BracketMatch[],
  matchId: string,
  winnerId: string,
  scoreA = 1,
  scoreB = 0,
): BracketMatch[] {
  const target = matches.find((m) => m.id === matchId)
  if (!target) return matches
  const clear =
    target.winnerId !== winnerId
      ? new Set(descendantMatchIds(matches, matchId))
      : new Set<string>()

  const updated = matches.map((m) => {
    if (m.id === matchId) {
      return {
        ...m,
        winnerId,
        scoreA,
        scoreB,
        status: 'done' as MatchStatus,
      }
    }
    if (clear.has(m.id)) return blankLaterMatch(m)
    return m
  })

  return propagateWinners(updated)
}

export function clearMatchResult(
  matches: BracketMatch[],
  matchId: string,
): BracketMatch[] {
  const clear = new Set([matchId, ...descendantMatchIds(matches, matchId)])
  const updated = matches.map((m) => {
    if (!clear.has(m.id)) return m
    if (m.id === matchId) {
      return {
        ...m,
        winnerId: null,
        scoreA: 0,
        scoreB: 0,
        status: 'pending' as MatchStatus,
      }
    }
    return blankLaterMatch(m)
  })
  return propagateWinners(updated)
}

export type BracketSlotRef = { matchId: string; slot: 'A' | 'B' }

function slotTeamId(match: BracketMatch, slot: 'A' | 'B') {
  return slot === 'A' ? match.teamAId : match.teamBId
}

function withSlotTeam(
  match: BracketMatch,
  slot: 'A' | 'B',
  teamId: string | null,
): BracketMatch {
  return slot === 'A'
    ? { ...match, teamAId: teamId }
    : { ...match, teamBId: teamId }
}

function applyOpeningByes(matches: BracketMatch[]): BracketMatch[] {
  return matches.map((m) => {
    if (m.round !== 0) return m
    if (m.teamAId && !m.teamBId) {
      return {
        ...m,
        winnerId: m.teamAId,
        status: 'done' as MatchStatus,
        scoreA: 1,
        scoreB: 0,
      }
    }
    if (!m.teamAId && m.teamBId) {
      return {
        ...m,
        winnerId: m.teamBId,
        status: 'done' as MatchStatus,
        scoreA: 0,
        scoreB: 1,
      }
    }
    return {
      ...m,
      winnerId: null,
      status: 'pending' as MatchStatus,
      scoreA: 0,
      scoreB: 0,
    }
  })
}

/**
 * Swap two opening-round (round 0) placements. Later rounds reset from byes.
 * Returns null if either slot is not in the opening round.
 */
export function swapOpeningTeams(
  matches: BracketMatch[],
  from: BracketSlotRef,
  to: BracketSlotRef,
): BracketMatch[] | null {
  if (from.matchId === to.matchId && from.slot === to.slot) return null
  const src = matches.find((m) => m.id === from.matchId)
  const dst = matches.find((m) => m.id === to.matchId)
  if (!src || !dst || src.round !== 0 || dst.round !== 0) return null

  const fromId = slotTeamId(src, from.slot)
  const toId = slotTeamId(dst, to.slot)

  let next = matches.map((m) => {
    if (m.round !== 0) return blankLaterMatch(m)
    let updated = { ...m, winnerId: null, scoreA: 0, scoreB: 0, status: 'pending' as MatchStatus }
    if (m.id === from.matchId && m.id === to.matchId) {
      // Same match A <-> B
      return {
        ...updated,
        teamAId: from.slot === 'A' ? toId : fromId,
        teamBId: from.slot === 'A' ? fromId : toId,
      }
    }
    if (m.id === from.matchId) updated = withSlotTeam(updated, from.slot, toId)
    if (m.id === to.matchId) updated = withSlotTeam(updated, to.slot, fromId)
    return updated
  })

  next = applyOpeningByes(next)
  return propagateWinners(next)
}

export function createDefaultTeams(count: number): BracketTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    id: id(),
    name: `Team ${i + 1}`,
    tag: `T${i + 1}`,
    logo: '',
    seed: i + 1,
  }))
}

export function createBracketState(
  teamCount: number,
  title = 'CME ML TOURNAMENT',
): BracketState {
  const clamped = Math.max(2, Math.min(16, teamCount))
  const bracketSize = nextPowerOfTwo(clamped)
  const teams = createDefaultTeams(clamped)
  const matches = seedTeamsIntoBracket(teams, bracketSize)
  return {
    title,
    teamCount: clamped,
    bracketSize,
    teams,
    matches,
    activeMatchId: matches.find((m) => m.status === 'pending' && m.teamAId && m.teamBId)?.id ?? null,
  }
}

export function getTeam(
  state: BracketState,
  teamId: string | null,
): BracketTeam | null {
  if (!teamId) return null
  return state.teams.find((t) => t.id === teamId) ?? null
}
