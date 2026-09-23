import { useEffect, useLayoutEffect, useRef } from 'react'
import HeroImage from '../components/HeroImage'
import {
  initLineupSync,
  useLineupStore,
  type LineupPlayer,
  type LineupTeam,
} from '../store/lineupStore'
import type { TeamSide } from '../store/draftStore'
import '../styles/lineup-scene.css'

const LANE_LABELS = ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'] as const

export default function LineupOverlayPage() {
  const store = useLineupStore()
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initLineupSync()
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
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [])

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const stage = shell.querySelector('.lu-stage') as HTMLElement | null
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
    return () => ro.disconnect()
  }, [])

  return (
    <div className="lu-shell" ref={shellRef}>
      <div className="overlay-root lineup-scene lu-stage">
        <div className="lu-bg" aria-hidden />
        <div className="lu-bg-texture" aria-hidden />
        <div className="lu-vignette" aria-hidden />

        <header className="lu-top">
          <div className="lu-top-mark">CME</div>
          <div className="lu-top-center">
            <div className="lu-game-pill">MOBILE LEGENDS</div>
            <h1 className="lu-title">{store.introLabel || 'TOURNAMENT LINEUP'}</h1>
            {store.subtitle ? (
              <p className="lu-subtitle">{store.subtitle}</p>
            ) : null}
          </div>
          <div className="lu-top-sponsor">{store.sponsorRight || 'CME ML'}</div>
        </header>

        <div className="lu-dual">
          <TeamRoster
            side="blue"
            team={store.blue}
            captainIndex={store.soloBlueIndex}
          />
          <div className="lu-vs" aria-hidden>
            <span>VS</span>
          </div>
          <TeamRoster
            side="red"
            team={store.red}
            captainIndex={store.soloRedIndex}
          />
        </div>

        {store.footerSponsors ? (
          <footer className="lu-footer">{store.footerSponsors}</footer>
        ) : null}
      </div>
    </div>
  )
}

function TeamRoster({
  side,
  team,
  captainIndex,
}: {
  side: TeamSide
  team: LineupTeam
  captainIndex: number
}) {
  return (
    <section className={`lu-team lu-team-${side}`} aria-label={`${team.teamName} roster`}>
      <div className="lu-team-head">
        <div className="lu-team-logo">
          {team.teamLogo ? (
            <img src={team.teamLogo} alt="" />
          ) : (
            <span>{(team.teamTag || side).slice(0, 3).toUpperCase()}</span>
          )}
        </div>
        <div className="lu-team-copy">
          <div className="lu-team-side">{side === 'blue' ? 'BLUE SIDE' : 'RED SIDE'}</div>
          <h2 className="lu-team-name">{team.headline || team.teamName}</h2>
          <div className="lu-team-tag">{team.teamTag}</div>
        </div>
      </div>

      <div className="lu-cards">
        {team.players.map((player, i) => (
          <PlayerCard
            key={`${side}-${i}`}
            player={player}
            index={i}
            side={side}
            isCaptain={i === captainIndex}
          />
        ))}
      </div>

      <div className="lu-team-foot">
        <div className="lu-team-foot-logo">
          {team.teamLogo ? (
            <img src={team.teamLogo} alt="" />
          ) : (
            <span>{(team.teamTag || '?').slice(0, 4)}</span>
          )}
        </div>
        <div className="lu-team-foot-name">{team.teamName}</div>
      </div>
    </section>
  )
}

function PlayerCard({
  player,
  index,
  side,
  isCaptain,
}: {
  player: LineupPlayer
  index: number
  side: TeamSide
  isCaptain: boolean
}) {
  const role = player.subtitle.trim() || LANE_LABELS[index] || 'PLAYER'
  return (
    <article
      className={`lu-vcard lu-vcard-${side}${isCaptain ? ' is-captain' : ''}`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {isCaptain ? <span className="lu-crown" title="Captain" aria-label="Captain">♛</span> : null}
      <div className="lu-vcard-frame">
        <div className="lu-vcard-photo">
          {player.photo ? (
            <img src={player.photo} alt="" />
          ) : player.heroId ? (
            <HeroImage
              heroId={player.heroId}
              variant="splash"
              className="h-full w-full"
              autoCrop
              showNameFallback={false}
            />
          ) : (
            <div className="lu-vcard-empty">
              <span>{(player.name || '?').slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="lu-vcard-shade" />
        </div>
        <div className="lu-vcard-role" title={role}>
          <RoleGlyph index={index} />
        </div>
        <div className="lu-vcard-name">{player.name || `PLAYER ${index + 1}`}</div>
      </div>
    </article>
  )
}

function RoleGlyph({ index }: { index: number }) {
  // Simple lane glyphs matching EXP / Jungle / Mid / Gold / Roam
  switch (index) {
    case 0:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 20 14 4l6 2-4 14H4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m14 4 2 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 1:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 2:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3 4 8v8l8 5 8-5V8L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 8v8M8 10.5 12 13l4-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 3:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 19c3-6 5-10 7-14 2 4 4 8 7 14" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 15h8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 21c4-3.2 7-6.4 7-10a7 7 0 1 0-14 0c0 3.6 3 6.8 7 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="11" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
  }
}
