import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import EventBanner from '../components/gameplay/EventBanner'
import BottomFeedBar from '../components/gameplay/BottomFeedBar'
import { Icon } from '../components/cme/Icon'
import { InstitutionLogos } from '../components/cme/InstitutionLogos'
import {
  formatClock,
  initGameplaySync,
  useGameplayStore,
  type GameplayState,
  type TeamSide,
} from '../store/gameplayStore'
import { initCamsSync } from '../store/camsStore'
import { ensureObsSync } from '../lib/obsSync'

export default function GameplayOverlayPage() {
  const hideEvent = useGameplayStore((s) => s.hideEvent)
  const showScoreboard = useGameplayStore((s) => s.showScoreboard)
  const showCameras = useGameplayStore((s) => s.showCameras)
  const showMap = useGameplayStore((s) => s.showMap)
  const mapUrl = useGameplayStore((s) => s.mapUrl)
  const mapLabel = useGameplayStore((s) => s.mapLabel)
  const matchInfo = useGameplayStore((s) => s.matchInfo)
  const gameTimeSeconds = useGameplayStore((s) => s.gameTimeSeconds)
  const timerRunning = useGameplayStore((s) => s.timerRunning)
  const blue = useGameplayStore((s) => s.blue)
  const red = useGameplayStore((s) => s.red)
  const event = useGameplayStore((s) => s.event)
  const shellRef = useRef<HTMLDivElement>(null)
  const onHide = useCallback(() => hideEvent(), [hideEvent])

  useEffect(() => {
    ensureObsSync()
    initGameplaySync()
    initCamsSync()
    const html = document.documentElement
    const body = document.body
    const previous = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
    }
    html.style.background = 'transparent'
    body.style.background = 'transparent'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.height = '100%'
    const appRoot = document.getElementById('root')
    const rootHeight = appRoot?.style.height ?? ''
    const rootOverflow = appRoot?.style.overflow ?? ''
    if (appRoot) {
      appRoot.style.height = '100%'
      appRoot.style.overflow = 'hidden'
    }
    return () => {
      html.style.background = previous.htmlBg
      body.style.background = previous.bodyBg
      html.style.overflow = previous.htmlOverflow
      body.style.overflow = previous.bodyOverflow
      html.style.height = previous.htmlHeight
      body.style.height = previous.bodyHeight
      if (appRoot) {
        appRoot.style.height = rootHeight
        appRoot.style.overflow = rootOverflow
      }
    }
  }, [])

  useEffect(() => {
    if (!timerRunning) return
    const id = window.setInterval(() => {
      useGameplayStore.setState((s) =>
        s.timerRunning ? { gameTimeSeconds: s.gameTimeSeconds + 1 } : s,
      )
    }, 1000)
    return () => window.clearInterval(id)
  }, [timerRunning])

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const stage = shell.querySelector('.stage') as HTMLElement | null
      const width = shell.clientWidth || window.innerWidth
      const height = shell.clientHeight || window.innerHeight
      if (!stage || !width || !height) return
      const scale = Math.min(width / 1920, height / 1080)
      const x = Math.max(0, (width - 1920 * scale) / 2)
      const y = Math.max(0, (height - 1080 * scale) / 2)
      stage.style.transformOrigin = '0 0'
      stage.style.left = '0'
      stage.style.top = '0'
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(shell)
    window.addEventListener('resize', apply)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  return (
    <div
      className={`overlay-root cme-go output-mode${showCameras ? '' : ' hide-cameras'}`}
    >
      <div className="workspace">
        <div className="stage-shell" ref={shellRef}>
          <div className="stage">
            {showScoreboard && (
              <section className="scoreboard" aria-label="Match scoreboard">
                <TeamBanner side="blue" team={blue} />
                <div className="team-kills">
                  <b>{blue.kills}</b>
                  <small>KILLS</small>
                </div>
                <div className="match-core">
                  <InstitutionLogos size="md" className="scoreboard-institutions" />
                  <div className="event-brand">CME TOURNAMENT</div>
                  <div className="match-clock">{formatClock(gameTimeSeconds)}</div>
                  <div className={`clock-state${timerRunning ? ' running' : ''}`}>
                    {timerRunning ? 'MATCH TIME' : 'CLOCK PAUSED'}
                  </div>
                </div>
                <div className="team-kills red">
                  <b>{red.kills}</b>
                  <small>KILLS</small>
                </div>
                <TeamBanner side="red" team={red} />
              </section>
            )}
            <div className="match-ribbon">
              <span className="match-title">{matchInfo}</span>
            </div>
            {showMap && (
              <div className="map-frame">
                {mapUrl ? <img src={mapUrl} alt="" /> : mapLabel || 'MAP'}
              </div>
            )}

            <BottomFeedBar />

            <EventBanner event={event} onHide={onHide} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamBanner({
  side,
  team,
}: {
  side: TeamSide
  team: GameplayState['blue']
}) {
  const displayName =
    team.name.trim() || team.tag.trim() || (side === 'blue' ? 'BLUE' : 'RED')
  const displayTag = team.tag.trim() || side.toUpperCase()

  return (
    <div className={`team-banner${side === 'red' ? ' red' : ''}`}>
      <span className="crest institution-crest">
        {team.logo ? (
          <img src={team.logo} alt="" decoding="async" />
        ) : (
          displayTag.slice(0, 2).toUpperCase()
        )}
      </span>
      <div className="team-info">
        <div className="team-name" title={displayName}>
          {displayName}
        </div>
        <div className="team-abbr">
          {displayTag} · {side.toUpperCase()} SIDE
        </div>
      </div>
      <div className="team-economy">
        <div className="tower-total">
          <Icon name="tower" />
          <strong>{team.towers}</strong> TOWERS
        </div>
        <div className="series-total">
          <strong>{team.seriesScore}</strong> SERIES
        </div>
      </div>
    </div>
  )
}
