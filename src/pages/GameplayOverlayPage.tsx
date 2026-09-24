import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import EventBanner from '../components/gameplay/EventBanner'
import HeroImage from '../components/HeroImage'
import { Icon } from '../components/cme/Icon'
import { INSTITUTION_LOGOS } from '../components/cme/InstitutionLogos'
import { getHero } from '../data/heroes'
import {
  createCamViewer,
  tuneLowLatencyVideo,
} from '../lib/camWebRtc'
import { GAMEPLAY_SLOT } from '../lib/gameplayCapture'
import {
  formatClock,
  initGameplaySync,
  useGameplayStore,
  type FeaturedCam,
  type GameplayState,
  type TeamSide,
} from '../store/gameplayStore'
import { ensureObsSync } from '../lib/obsSync'
import { initCamsSync, useCamsStore } from '../store/camsStore'
import '../styles/gameplay-hud.css'
import '../styles/gameplay-preview.css'

type Team = GameplayState['blue']
type CamStatus = 'connecting' | 'live' | 'idle' | 'error'

function teamName(team: Team, side: TeamSide) {
  return team.name?.trim() || team.tag?.trim() || (side === 'blue' ? 'BLUE TEAM' : 'RED TEAM')
}

function teamTag(team: Team, side: TeamSide) {
  return team.tag?.trim() || side.toUpperCase()
}

export default function GameplayOverlayPage({
  withGameplayFeed = false,
}: {
  /** Shoutcaster viewer: BlueStacks feed behind the HUD. */
  withGameplayFeed?: boolean
}) {
  const [params] = useSearchParams()
  const showFeed =
    withGameplayFeed ||
    params.get('feed') === '1' ||
    params.get('preview') === '1'
  const hideEvent = useGameplayStore((s) => s.hideEvent)
  const showScoreboard = useGameplayStore((s) => s.showScoreboard)
  const showCameras = useGameplayStore((s) => s.showCameras)
  const showMap = useGameplayStore((s) => s.showMap)
  const mapUrl = useGameplayStore((s) => s.mapUrl)
  const mapLabel = useGameplayStore((s) => s.mapLabel)
  const matchInfo = useGameplayStore((s) => s.matchInfo)
  const bestOf = useGameplayStore((s) => s.bestOf)
  const currentGame = useGameplayStore((s) => s.currentGame)
  const gameTimeSeconds = useGameplayStore((s) => s.gameTimeSeconds)
  const timerRunning = useGameplayStore((s) => s.timerRunning)
  const blue = useGameplayStore((s) => s.blue)
  const red = useGameplayStore((s) => s.red)
  const featuredBlue = useGameplayStore((s) => s.featuredBlue)
  const featuredRed = useGameplayStore((s) => s.featuredRed)
  const event = useGameplayStore((s) => s.event)
  const shellRef = useRef<HTMLDivElement>(null)
  const onHide = useCallback(() => hideEvent(), [hideEvent])

  useEffect(() => {
    ensureObsSync()
    initGameplaySync()
    if (showFeed) initCamsSync()
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
    html.style.background = showFeed ? '#05070c' : 'transparent'
    body.style.background = showFeed ? '#05070c' : 'transparent'
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
  }, [showFeed])

  // Local clock only — do not persist/broadcast from the overlay (control owns that)
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

  const winsNeeded = Math.ceil(bestOf / 2)

  return (
    <div
      className={`overlay-root cme-go output-mode${showFeed ? ' viewer-mode' : ''}`}
    >
      <div className="workspace">
        <div className="stage-shell" ref={shellRef}>
          <div className="stage">
            {showFeed ? <GameplayFeedBackground /> : null}
            <div className="gx-root">
              {showScoreboard && (
                <section className="gx-board" aria-label="Match scoreboard">
                  <TeamPlate side="blue" team={blue} winsNeeded={winsNeeded} />
                  <Kills side="blue" value={blue.kills} />
                  <div className="gx-core">
                    <div className="gx-seals">
                      {INSTITUTION_LOGOS.map((logo) => (
                        <span key={logo.id} className={`gx-seal ${logo.slot}`}>
                          <img src={logo.src} alt={logo.alt} draggable={false} />
                        </span>
                      ))}
                    </div>
                    <div className="gx-clock">{formatClock(gameTimeSeconds)}</div>
                    <div className={`gx-clock-state${timerRunning ? ' live' : ''}`}>
                      <i />
                      {timerRunning ? 'LIVE · MATCH TIME' : 'CLOCK PAUSED'}
                    </div>
                  </div>
                  <Kills side="red" value={red.kills} />
                  <TeamPlate side="red" team={red} winsNeeded={winsNeeded} />
                </section>
              )}

              <div className={`gx-ribbon${showScoreboard ? '' : ' solo'}`}>
                <span className="gx-anchor">
                  <AnchorIcon />
                </span>
                <span className="gx-ribbon-info">
                  {matchInfo?.trim() || `CME ML TOURNAMENT · GAME ${currentGame} · BO${bestOf}`}
                </span>
              </div>

              {showMap && (
                <div className="gx-map">
                  {mapUrl ? <img src={mapUrl} alt="" /> : <span>{mapLabel || 'MAP'}</span>}
                </div>
              )}

              {showCameras && (
                <>
                  <FeedCard side="blue" team={blue} featured={featuredBlue} />
                  <FeedCard side="red" team={red} featured={featuredRed} />
                </>
              )}

              <LogoCarousel blue={blue} red={red} />

              <EventBanner event={event} onHide={onHide} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Full-bleed BlueStacks / game window behind the HUD (shoutcaster viewer). */
function GameplayFeedBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CamStatus>('idle')
  const [everLive, setEverLive] = useState(false)
  const gameplayLive = useCamsStore((s) => s.gameplayLive)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    tuneLowLatencyVideo(video)
    const viewer = createCamViewer({
      slotId: GAMEPLAY_SLOT,
      video,
      lowLatency: true,
      onStatus: (s) => {
        setStatus(s)
        if (s === 'live') setEverLive(true)
        if (s === 'idle' || s === 'error') setEverLive(false)
      },
    })
    return () => viewer.stop()
  }, [])

  const live = status === 'live' || everLive

  return (
    <>
      <video
        ref={videoRef}
        className={`gx-gameplay-bg${live ? ' is-live' : ''}`}
        playsInline
        muted
        autoPlay
        disablePictureInPicture
      />
      {!live ? (
        <div className="gx-gameplay-wait">
          <span>GAMEPLAY PREVIEW</span>
          <strong>
            {status === 'error'
              ? 'Feed dropped — retrying'
              : gameplayLive || status === 'connecting'
                ? 'Connecting to cast window…'
                : 'Waiting for cast window'}
          </strong>
          <p>
            Operator: Gameplay Preview → Select window → pick BlueStacks / App Player
          </p>
        </div>
      ) : null}
    </>
  )
}

function AnchorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V21M7 11h10M4 14a8 7 0 0 0 16 0M4 14l-1.6 1.6M4 14l1.8 1.2M20 14l1.6 1.6M20 14l-1.8 1.2" />
    </svg>
  )
}

function TeamPlate({ side, team, winsNeeded }: { side: TeamSide; team: Team; winsNeeded: number }) {
  const name = teamName(team, side)
  const tag = teamTag(team, side)
  return (
    <div className={`gx-plate side-${side}`}>
      <span className="gx-crest">
        {team.logo ? <img src={team.logo} alt="" decoding="async" /> : <b>{tag.slice(0, 3).toUpperCase()}</b>}
      </span>
      <div className="gx-plate-info">
        <div className="gx-plate-name" title={name}>
          {name}
        </div>
        <div className="gx-plate-meta">
          <span className="gx-anchor">
            <AnchorIcon />
          </span>
          <span className="gx-plate-tag">{tag}</span>
          <span className="gx-plate-side">{side.toUpperCase()} SIDE</span>
        </div>
      </div>
      <div className="gx-plate-stats">
        <div className="gx-series" aria-label={`${team.seriesScore} series wins`}>
          {Array.from({ length: winsNeeded }, (_, i) => (
            <i key={i} className={i < team.seriesScore ? 'won' : ''} />
          ))}
        </div>
        <div className="gx-towers">
          <Icon name="tower" />
          <strong>{team.towers}</strong>
          <small>TOWERS</small>
        </div>
      </div>
    </div>
  )
}

const INSTITUTION_NAMES: Record<string, { name: string; sub: string }> = {
  zscmst: { name: 'ZSCMST', sub: 'Zamboanga State College of Marine Sciences & Technology' },
  cme: { name: 'CME', sub: 'College of Maritime Education' },
  'young-sailors-club': { name: 'Young Sailors Club', sub: '' },
}

type CarouselItem =
  | { kind: 'logo'; key: string; src: string; name: string; sub: string; side?: TeamSide }
  | { kind: 'title'; key: string; text: string }

function LogoCarousel({ blue, red }: { blue: Team; red: Team }) {
  const items: CarouselItem[] = [
    { kind: 'title', key: 'title', text: 'CME ML TOURNAMENT' },
    ...INSTITUTION_LOGOS.map<CarouselItem>((logo) => ({
      kind: 'logo',
      key: logo.id,
      src: logo.src,
      ...(INSTITUTION_NAMES[logo.id] ?? { name: logo.alt, sub: '' }),
    })),
    { kind: 'title', key: 'mlbb', text: 'MOBILE LEGENDS: BANG BANG' },
    ...(['blue', 'red'] as const)
      .map((side) => ({ side, team: side === 'blue' ? blue : red }))
      .filter(({ team }) => team.logo)
      .map<CarouselItem>(({ side, team }) => ({
        kind: 'logo',
        key: `team-${side}`,
        src: team.logo,
        name: teamName(team, side),
        sub: `${side.toUpperCase()} SIDE`,
        side,
      })),
  ]

  const renderRun = (run: number) =>
    items.map((item) =>
      item.kind === 'title' ? (
        <span key={`${run}-${item.key}`} className="gx-carousel-title">
          <span className="gx-anchor">
            <AnchorIcon />
          </span>
          {item.text}
        </span>
      ) : (
        <span
          key={`${run}-${item.key}`}
          className={`gx-carousel-logo${item.side ? ` side-${item.side}` : ''}`}
        >
          <img src={item.src} alt="" draggable={false} decoding="async" />
          <span>
            <b>{item.name}</b>
            {item.sub && <small>{item.sub}</small>}
          </span>
        </span>
      ),
    )

  return (
    <div className="gx-carousel" aria-label="Tournament partners">
      <div className="gx-carousel-view">
        <div className="gx-carousel-track" style={{ '--n': items.length } as CSSProperties}>
          <div className="gx-carousel-run">{renderRun(0)}</div>
          <div className="gx-carousel-run" aria-hidden="true">
            {renderRun(1)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kills({ side, value }: { side: TeamSide; value: number }) {
  return (
    <div className={`gx-kills side-${side}`}>
      <b key={value}>{value}</b>
      <small>KILLS</small>
    </div>
  )
}

function FeedCard({ side, team, featured }: { side: TeamSide; team: Team; featured: FeaturedCam }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CamStatus>('connecting')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const viewer = createCamViewer({ slotId: side, video, onStatus: setStatus })
    return () => viewer.stop()
  }, [side])

  const live = status === 'live'
  const player = team.players?.[featured?.playerIndex ?? 0]
  const hero = getHero(player?.heroId)
  const tag = teamTag(team, side)
  const playerName = player?.ign?.trim() || player?.name?.trim() || `${tag} PLAYER`
  const footer = featured?.camLabel?.trim() ?? ''
  const bpm = featured?.bpm ?? 0
  const waiting =
    status === 'idle' ? 'CAMERA OFFLINE' : status === 'error' ? 'RECONNECTING' : 'WAITING FOR FEED'

  return (
    <article
      className={`gx-feed side-${side}${live ? ' is-live' : ''}`}
      aria-label={`${teamName(team, side)} camera`}
    >
      <header className="gx-feed-head">
        <span className="gx-anchor">
          <AnchorIcon />
        </span>
        <span className="gx-feed-team" title={teamName(team, side)}>
          {teamName(team, side)}
        </span>
        <span className={`gx-feed-status${live ? ' live' : ''}`}>
          <i />
          {live ? 'LIVE' : 'STANDBY'}
        </span>
      </header>

      <div className="gx-feed-screen">
        <div className="gx-feed-bg" />
        <div className="gx-feed-cme" aria-hidden="true">
          <span>C</span>
          <span>M</span>
          <span>E</span>
        </div>
        {!live && (
          <div className="gx-feed-wait">
            {team.logo ? (
              <img src={team.logo} alt="" decoding="async" />
            ) : (
              <b>{tag.slice(0, 3).toUpperCase()}</b>
            )}
            <span>
              {waiting}
              <em className="gx-dots">
                <i />
                <i />
                <i />
              </em>
            </span>
          </div>
        )}
        <video ref={videoRef} playsInline autoPlay muted className={live ? 'on' : ''} />
        <span className="gx-feed-corner tl" />
        <span className="gx-feed-corner tr" />
        <span className="gx-feed-corner bl" />
        <span className="gx-feed-corner br" />
        <div className="gx-feed-scan" />
      </div>

      <footer className="gx-feed-foot">
        {hero && (
          <span className="gx-feed-hero">
            <HeroImage hero={hero} variant="portrait" showNameFallback={false} />
          </span>
        )}
        <div className="gx-feed-player">
          <b title={playerName}>{playerName}</b>
          <small title={footer || hero?.name}>
            {footer || (hero ? hero.name : `${tag} · FEATURED PLAYER`)}
          </small>
        </div>
        {bpm > 0 && (
          <span className="gx-feed-bpm" style={{ '--beat': `${60 / bpm}s` } as CSSProperties}>
            <Icon name="heart" />
            {bpm}
          </span>
        )}
      </footer>
    </article>
  )
}
