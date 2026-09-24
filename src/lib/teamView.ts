import {
  PLAYER_ROLES,
  starterPlayers,
  type TournamentPlayer,
  type TournamentTeam,
} from '../store/tournamentStore'

export type MemberView = {
  id: string
  name: string
  ign: string
  role: string
  photo: string
  isLeader: boolean
}

export function playerPhoto(p: { photo?: string; photoOriginal?: string } | null) {
  if (!p) return ''
  return (p.photo || p.photoOriginal || '').trim()
}

export function resolveCaptain(players: TournamentPlayer[]): TournamentPlayer | null {
  const roster = [...players].sort((a, b) => a.order - b.order)
  const flagged = roster.find((p) => p.isLeader && p.name.trim())
  if (flagged) return flagged
  const flaggedAny = roster.find((p) => p.isLeader)
  if (flaggedAny) return flaggedAny
  const namedWithPhoto = roster.find((p) => p.name.trim() && p.photo)
  if (namedWithPhoto) return namedWithPhoto
  const mid = roster.find(
    (p) => p.name.trim() && (p.role === 'mid' || p.role === 'roam'),
  )
  if (mid) return mid
  return roster.find((p) => p.name.trim()) ?? null
}

/** Surname-style label; skips initials such as "E." or "J". */
export function shortName(name: string) {
  const cleaned = name.trim()
  if (!cleaned) return 'PLAYER'
  const parts = cleaned.split(/[\s,]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].toUpperCase()
  if (cleaned.includes(',')) return parts[0].toUpperCase()
  const isInitial = (p: string) => p.endsWith('.') || p.length <= 2
  const surname = [...parts].reverse().find((p) => !isInitial(p))
  return (surname ?? parts[parts.length - 1]).toUpperCase()
}

/** IGN when set, otherwise a short form of the real name. */
export function displayIgn(name: string, ign: string) {
  return ign.trim() ? ign.trim().toUpperCase() : shortName(name)
}

export function findTeamByIdentity(
  teams: TournamentTeam[],
  ident: { name?: string; tag?: string },
): TournamentTeam | null {
  const tag = (ident.tag ?? '').trim().toLowerCase()
  const name = (ident.name ?? '').trim().toLowerCase()
  if (tag) {
    const byTag = teams.find((t) => t.tag.trim().toLowerCase() === tag)
    if (byTag) return byTag
  }
  if (name) {
    const byName = teams.find((t) => t.name.trim().toLowerCase() === name)
    if (byName) return byName
  }
  return null
}

function roleLabel(role: string) {
  return PLAYER_ROLES.find((r) => r.id === role)?.label ?? (role === 'spare' ? 'Spare' : '')
}

export function teamMembers(team: TournamentTeam | null): MemberView[] {
  if (!team) return []
  const starters = starterPlayers(team.players)
  if (!starters.some((p) => p.name.trim() || p.ign.trim() || p.photo)) return []
  return starters.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      ign: p.ign.trim(),
      role: roleLabel(p.role),
      photo: playerPhoto(p),
      isLeader: p.isLeader === true,
    }))
}
