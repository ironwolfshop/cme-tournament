import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TeamRevealStage from '../components/lineup/TeamRevealStage'
import {
  initLineupSync,
  lineupTeamFromTournament,
  useLineupStore,
} from '../store/lineupStore'
import {
  initTournamentSync,
  selectActiveProject,
  starterPlayers,
  useTournamentStore,
  type TournamentTeam,
} from '../store/tournamentStore'
import '../styles/team-reveal.css'

/** Roster on screen between stingers. */
const HOLD_MS = 10_000
/** Full stinger: wipe in → hold name → wipe out. */
const STING_MS = 3200
/** Swap roster once the screen is fully covered. */
const SWITCH_AT_MS = 900

/** Include every team that has real form data — skip empty shells only. */
function isEnteredTeam(t: TournamentTeam): boolean {
  if (!t.name.trim()) return false
  const real = t.players.filter((p) => {
    const name = p.name.trim()
    if (!name) return false
    if (/^player\s*\d+$/i.test(name)) return false
    return true
  })
  return real.length >= 1 || t.players.some((p) => Boolean(p.photo) && p.name.trim())
}

type StingerState = {
  id: string
  name: string
  tag: string
}

export default function LineupOverlayPage() {
  const shellRef = useRef<HTMLDivElement>(null)
  const playing = useLineupStore((s) => s.playing)
  const revealed = useLineupStore((s) => s.revealed)
  const editSide = useLineupStore((s) => s.editSide)
  const layout = useLineupStore((s) => s.layout)
  const sceneTitle = useLineupStore((s) => s.sceneTitle)
  const storeTemplate = useLineupStore((s) => s.template)
  const [params] = useSearchParams()
  const templateParam = params.get('template')
  const pinnedTemplate =
    templateParam === 'cards' || templateParam === 'stage' ? templateParam : null
  const template = pinnedTemplate ?? storeTemplate
  const playerCount = useLineupStore((s) => s[s.editSide].players.length)
  const active = useTournamentStore(selectActiveProject)
  const [tourIndex, setTourIndex] = useState(0)
  const [stinger, setStinger] = useState<StingerState | null>(null)
  const timers = useRef<number[]>([])
  const cycling = useRef(false)
  const indexRef = useRef(0)

  const roster = useMemo(
    () => active.teams.filter(isEnteredTeam),
    [active.teams],
  )
  const rosterKey = roster.map((t) => t.id).join('|')

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
    return id
  }

  function playStinger(team: TournamentTeam, nextIndex: number) {
    clearTimers()
    const id = `${Date.now()}-${team.id}`
    const label = team.name.trim().toUpperCase() || team.tag.toUpperCase()
    setStinger({
      id,
      name: label,
      tag: (team.tag || '').toUpperCase(),
    })

    schedule(() => {
      indexRef.current = nextIndex
      setTourIndex(nextIndex)
    }, SWITCH_AT_MS)

    schedule(() => {
      setStinger((cur) => (cur?.id === id ? null : cur))
    }, STING_MS)
  }

  useEffect(() => {
    initLineupSync()
    initTournamentSync()
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    }
    html.style.background = 'transparent'
    body.style.background = 'transparent'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      clearTimers()
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [])

  // Start / restart the playlist when the entered roster changes.
  useEffect(() => {
    clearTimers()
    cycling.current = false
    indexRef.current = 0
    setTourIndex(0)
    setStinger(null)
    if (!roster.length) return

    // Opening stinger for first team, then loop.
    playStinger(roster[0]!, 0)
    cycling.current = true

    const tick = () => {
      if (!cycling.current || roster.length < 1) return
      const next =
        roster.length < 2 ? 0 : (indexRef.current + 1) % roster.length
      const team = roster[next]
      if (!team) return
      playStinger(team, next)
      schedule(tick, STING_MS + HOLD_MS)
    }

    schedule(tick, STING_MS + HOLD_MS)
    return () => {
      cycling.current = false
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey])

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const stage = shell.querySelector('.lu-stage-wrap') as HTMLElement | null
      if (!stage) return
      const box = shell.getBoundingClientRect()
      if (!box.width || !box.height) return
      const scale = Math.min(box.width / 1920, box.height / 1080)
      const x = (box.width - 1920 * scale) / 2
      const y = (box.height - 1080 * scale) / 2
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(shell)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [editSide, playerCount, tourIndex, rosterKey, template])

  useEffect(() => {
    if (!playing) return
    if (revealed >= playerCount) {
      useLineupStore.getState().setPlaying(false)
      return
    }
    const id = window.setTimeout(
      () => {
        const s = useLineupStore.getState()
        if (!s.playing) return
        s.advanceReveal()
      },
      revealed === 0 ? 900 : 2200,
    )
    return () => window.clearTimeout(id)
  }, [playing, revealed, editSide, playerCount])

  const rotatingTeam =
    roster.length >= 1 ? roster[tourIndex % roster.length]! : null

  const teamOverride = rotatingTeam
    ? lineupTeamFromTournament(
        {
          id: rotatingTeam.id,
          name: rotatingTeam.name,
          tag: rotatingTeam.tag,
          logo: rotatingTeam.logo,
          players: starterPlayers(rotatingTeam.players).map((p) => ({
            name: p.name,
            ign: p.ign,
            photo: p.photo,
            photoOriginal: p.photoOriginal || '',
            role: p.role,
            order: p.order,
            isLeader: p.isLeader === true,
          })),
        },
        layout,
      )
    : undefined

  return (
    <div ref={shellRef} className="lineup-overlay-root">
      <TeamRevealStage
        teamOverride={teamOverride}
        revealedOverride={
          teamOverride ? teamOverride.players.length : undefined
        }
        sceneOverride={
          rotatingTeam
            ? {
                introLabel: active.name.toUpperCase(),
                sceneTitle: sceneTitle.trim() || `${rotatingTeam.name} TEAM`,
                template,
              }
            : pinnedTemplate
              ? { template: pinnedTemplate }
              : undefined
        }
      />
      {stinger ? (
        <div
          key={stinger.id}
          className="lineup-stinger"
          aria-live="polite"
          aria-label={`Now revealing ${stinger.name}`}
        >
          <div className="lineup-stinger-panel lineup-stinger-panel-l" />
          <div className="lineup-stinger-panel lineup-stinger-panel-r" />
          <div className="lineup-stinger-copy">
            <p className="lineup-stinger-eyebrow">NOW REVEALING</p>
            <b className="lineup-stinger-name">{stinger.name}</b>
            <span className="lineup-stinger-tag">
              {stinger.tag || 'TEAM REVEAL'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
