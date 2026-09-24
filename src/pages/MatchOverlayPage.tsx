import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InstitutionLogos } from '../components/cme/InstitutionLogos'
import { heroLocalSplashUrl } from '../data/heroes'
import { fitPortrait, type PortraitFrame } from '../lib/portraitFit'
import {
  findTeamByIdentity,
  playerPhoto,
  resolveCaptain,
  shortName,
  teamMembers,
  type MemberView,
} from '../lib/teamView'
import { usePortraitMetrics } from '../lib/usePortraitMetrics'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import { initDraftSync, useDraftStore } from '../store/draftStore'
import {
  initTournamentSync,
  selectActiveProject,
  useTournamentStore,
  type TournamentTeam,
} from '../store/tournamentStore'
import '../styles/cme-overrides.css'
import '../styles/match-scene.css'

type SideView = {
  name: string
  tag: string
  logo: string
  playerName: string
  playerIgn: string
  playerPhoto: string
  members: MemberView[]
}

function splitMatchTitle(raw: string) {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return { primary: 'MATCH', secondary: 'GAME 1' }
  const parts = cleaned
    .split(/[·•|/–—-]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { primary: parts[0].toUpperCase(), secondary: parts[1].toUpperCase() }
  }
  const gameMatch = cleaned.match(/^(.*?)(\bgame\s*\d+\b.*)$/i)
  if (gameMatch) {
    return {
      primary: gameMatch[1].trim().toUpperCase() || 'MATCH',
      secondary: gameMatch[2].trim().toUpperCase(),
    }
  }
  return { primary: cleaned.toUpperCase(), secondary: '' }
}

/** Captain spotlight first, then each other member one at a time, then back. */
const CAPTAIN_MS = 10_000
const MEMBER_MS = 6_000

type Spot = {
  key: string
  role: string
  name: string
  ign: string
  photo: string
}

function spotlightOrder(team: SideView): Spot[] {
  const captainName = team.playerName.trim().toLowerCase()
  const captain: Spot = {
    key: 'captain',
    role: 'Captain',
    name: team.playerName,
    ign: team.playerIgn,
    photo: team.playerPhoto,
  }
  const others = team.members
    .filter((m) => !m.isLeader && (m.name || m.ign || m.photo))
    .filter((m) => !captainName || m.name.toLowerCase() !== captainName)
    .map((m) => ({
      key: m.id,
      role: m.role || 'Member',
      name: m.name,
      ign: m.ign,
      photo: m.photo,
    }))
  return [captain, ...others]
}

/** Keeps full team names on one line inside a banner wing. */
function bannerNameSize(name: string) {
  return Math.round(Math.max(28, Math.min(58, 640 / Math.max(6, name.length))))
}

export default function MatchOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'

  const active = useTournamentStore(selectActiveProject)
  const blueTeamId = useTournamentStore((s) => s.blueTeamId)
  const redTeamId = useTournamentStore((s) => s.redTeamId)
  const getTeam = useTournamentStore((s) => s.getTeam)
  const status = useTournamentStore((s) => s.status)

  const draftBlue = useDraftStore((s) => s.blue)
  const draftRed = useDraftStore((s) => s.red)
  const matchLabel = useDraftStore((s) => s.matchLabel)

  const bracketActiveId = useBracketStore((s) => s.activeMatchId)
  const bracketMatches = useBracketStore((s) => s.matches)

  useEffect(() => {
    initTournamentSync()
    initDraftSync()
    initBracketSync()
    document.documentElement.style.background = preview ? '#0c1a2e' : 'transparent'
    document.body.style.background = preview ? '#0c1a2e' : 'transparent'
  }, [preview])

  const sides = useMemo(() => {
    const activeMatch = bracketMatches.find((m) => m.id === bracketActiveId)
    const fromBracketBlue = activeMatch?.teamAId
      ? getTeam(activeMatch.teamAId)
      : null
    const fromBracketRed = activeMatch?.teamBId
      ? getTeam(activeMatch.teamBId)
      : null

    const build = (
      tourneyId: string | null,
      bracketTeam: TournamentTeam | null,
      draft: typeof draftBlue,
    ): SideView => {
      const tourney =
        getTeam(tourneyId) ??
        bracketTeam ??
        findTeamByIdentity(active.teams, draft)

      const captain = tourney ? resolveCaptain(tourney.players) : null
      const draftPhoto =
        !playerPhoto(captain) && draft.players?.length
          ? draft.players.find((p) => p.photo)?.photo ?? ''
          : ''

      return {
        name: tourney?.name?.trim() || draft.name?.trim() || 'TBD',
        tag: tourney?.tag?.trim() || draft.tag?.trim() || 'TBD',
        logo: tourney?.logo || draft.logo || '',
        playerName: captain?.name?.trim() || '',
        playerIgn: captain?.ign?.trim() || '',
        playerPhoto: playerPhoto(captain) || draftPhoto,
        members: teamMembers(tourney),
      }
    }

    return {
      blue: build(blueTeamId, fromBracketBlue, draftBlue),
      red: build(redTeamId, fromBracketRed, draftRed),
    }
  }, [
    blueTeamId,
    redTeamId,
    getTeam,
    draftBlue,
    draftRed,
    active.teams,
    bracketActiveId,
    bracketMatches,
  ])

  const titleSource =
    active.matchTitle?.trim() ||
    matchLabel?.replace(/^.*?·\s*/, '').trim() ||
    'MATCH 1 · GAME 1'
  const { primary, secondary } = splitMatchTitle(titleSource)

  const hasTeams =
    (sides.blue.tag && sides.blue.tag !== 'TBD') ||
    (sides.red.tag && sides.red.tag !== 'TBD') ||
    Boolean(sides.blue.name !== 'TBD' || sides.red.name !== 'TBD')

  const blueSpots = useMemo(() => spotlightOrder(sides.blue), [sides.blue])
  const redSpots = useMemo(() => spotlightOrder(sides.red), [sides.red])
  const steps = Math.max(blueSpots.length, redSpots.length)
  const captainsOnly = params.get('view') === 'captains'
  const [rawStep, setStep] = useState(0)
  const step = captainsOnly || steps < 2 ? 0 : rawStep % steps
  useEffect(() => {
    if (captainsOnly || steps < 2) return
    const id = window.setTimeout(
      () => setStep((s) => (s + 1) % steps),
      step === 0 ? CAPTAIN_MS : MEMBER_MS,
    )
    return () => window.clearTimeout(id)
  }, [step, steps, captainsOnly])
  const blueSpot = blueSpots[step % blueSpots.length]!
  const redSpot = redSpots[step % redSpots.length]!

  return (
    <div
      className={`overlay-root match-scene ${preview ? 'is-preview' : ''}`}
    >
      <div className="ms-bg" aria-hidden />
      <div className="ms-watermark" aria-hidden>
        ML
      </div>
      <div className="ms-rays" aria-hidden />
      <div className="ms-floor" aria-hidden />

      <SidePanel side="blue" />
      <SidePanel side="red" />

      <div className="ms-sweep" aria-hidden />
      <div className="ms-particles" aria-hidden>
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className={`ms-particle ${p.tone}`}
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              ['--drift' as string]: `${p.drift}px`,
            }}
          />
        ))}
      </div>

      <header className="ms-header">
        <InstitutionLogos
          size="lg"
          showLabels
          className="ms-institutions"
        />
        <div className="ms-league-copy">
          <div className="ms-league-name">
            <span className="ms-rule ms-rule-left" aria-hidden />
            <span className="ms-league-text">
              {active.name || 'CME ML TOURNAMENT'}
            </span>
            <span className="ms-rule ms-rule-right" aria-hidden />
          </div>
          <div className="ms-league-sub">
            {status !== 'idle'
              ? `${status.toUpperCase()} • MATCH DAY`
              : 'YOUNG SAILORS CLUB • MATCH DAY'}
          </div>
        </div>
      </header>

      {!hasTeams ? (
        <div className="ms-empty">
          <div>
            <strong>NO MATCH LOADED</strong>
            <span>
              Select a bracket match and press Start fight on Live Desk so both
              captains can appear here.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="ms-stage">
            <Fighter key={`blue-${blueSpot.key}`} side="blue" team={sides.blue} spot={blueSpot} />
            <Fighter key={`red-${redSpot.key}`} side="red" team={sides.red} spot={redSpot} />
          </div>

          <div className="ms-banner" aria-label="Match info">
            <span className="ms-chevron ms-chevron-blue" aria-hidden />
            <div className="ms-banner-side ms-banner-blue">
              <span
                className="ms-banner-tag"
                style={{ fontSize: `${bannerNameSize(sides.blue.name)}px` }}
              >
                {sides.blue.name}
              </span>
              <TeamMark team={sides.blue} className="ms-banner-logo" />
            </div>
            <div className="ms-banner-center">
              {secondary ? (
                <>
                  <span className="ms-banner-match">{primary}</span>
                  <span className="ms-banner-game">{secondary}</span>
                </>
              ) : (
                <span className="ms-banner-game">{primary}</span>
              )}
            </div>
            <div className="ms-banner-side ms-banner-red">
              <TeamMark team={sides.red} className="ms-banner-logo" />
              <span
                className="ms-banner-tag"
                style={{ fontSize: `${bannerNameSize(sides.red.name)}px` }}
              >
                {sides.red.name}
              </span>
            </div>
            <span className="ms-chevron ms-chevron-red" aria-hidden />
          </div>

          <footer className="ms-footer">
            <span className="ms-footer-dash blue" aria-hidden />
            <div className="ms-footer-team blue">
              <TeamMark team={sides.blue} className="ms-footer-crest" />
              <span className="ms-footer-name">{sides.blue.tag}</span>
            </div>
            <span className="ms-footer-vs">VS</span>
            <div className="ms-footer-team red">
              <span className="ms-footer-name">{sides.red.tag}</span>
              <TeamMark team={sides.red} className="ms-footer-crest" />
            </div>
            <span className="ms-footer-dash red" aria-hidden />
          </footer>
        </>
      )}
    </div>
  )
}

/** Must match `.ms-fighter-photo` size in match-scene.css. */
const PHOTO_FRAME: PortraitFrame = {
  width: 660,
  height: 610,
  headTop: 52,
  headHeight: 196,
}

const PARTICLES = Array.from({ length: 30 }, (_, i) => {
  const left = (i * 37.3 + 7) % 100
  return {
    id: i,
    left,
    size: 3 + ((i * 7) % 6),
    duration: 9 + ((i * 13) % 9),
    delay: -((i * 1.7) % 16),
    drift: ((i * 29) % 80) - 40,
    tone: left < 38 ? 'blue' : left > 62 ? 'red' : 'gold',
  }
})

const PANEL_ART: Record<'blue' | 'red', string> = {
  blue: heroLocalSplashUrl('kadita'),
  red: heroLocalSplashUrl('guinevere'),
}

function SidePanel({ side }: { side: 'blue' | 'red' }) {
  return (
    <div className={`ms-panel ms-panel-${side}`} aria-hidden>
      <div className="ms-panel-edge" />
      <div className="ms-panel-body">
        <img className="ms-panel-art" src={PANEL_ART[side]} alt="" />
        <div className="ms-panel-tint" />
      </div>
    </div>
  )
}

function TeamMark({ team, className }: { team: SideView; className: string }) {
  return (
    <div className={className}>
      {team.logo ? (
        <img src={team.logo} alt="" />
      ) : (
        <span>{team.tag.slice(0, 2)}</span>
      )}
    </div>
  )
}

function Fighter({
  side,
  team,
  spot,
}: {
  side: 'blue' | 'red'
  team: SideView
  spot: Spot
}) {
  const ign = spot.ign.trim()
  const fullName = spot.name.trim()
  const label = ign ? ign.toUpperCase() : shortName(fullName || team.tag)
  const metrics = usePortraitMetrics(spot.photo)
  const fit = metrics ? fitPortrait(metrics, PHOTO_FRAME) : null

  return (
    <div className={`ms-fighter ms-fighter-${side}${spot.key === 'captain' ? ' is-captain' : ' is-member'}`}>
      <div
        className={`ms-fighter-photo${metrics && !metrics.cutout ? ' is-framed' : ''}`}
      >
        {spot.photo ? (
          <img
            src={spot.photo}
            alt=""
            draggable={false}
            className={fit ? 'is-ready' : ''}
            style={
              fit
                ? {
                    width: `${fit.width}px`,
                    height: `${fit.height}px`,
                    left: `${fit.left}px`,
                    top: `${fit.top}px`,
                  }
                : undefined
            }
          />
        ) : (
          <div className="ms-fighter-fallback" aria-hidden>
            {team.logo ? <img src={team.logo} alt="" /> : team.tag.slice(0, 3)}
          </div>
        )}
      </div>
      <div className="ms-nameplate">
        <TeamMark team={team} className="ms-nameplate-mark" />
        <div className="ms-nameplate-text">
          <span className="ms-nameplate-role">{spot.role}</span>
          <span className="ms-nameplate-label">{label}</span>
          {fullName && fullName.toUpperCase() !== label.toUpperCase() ? (
            <span className="ms-nameplate-name">{fullName}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
