import { memo } from 'react'
import { INSTITUTION_LOGOS } from '../cme/InstitutionLogos'
import { useGameplayStore } from '../../store/gameplayStore'
import TeamCamFeed from './TeamCamFeed'

const CAROUSEL_ITEMS = INSTITUTION_LOGOS.map((logo) => ({
  ...logo,
  short:
    logo.id === 'zscmst'
      ? 'ZSCMST'
      : logo.id === 'cme'
        ? 'College of Maritime Education'
        : 'Commandant Office',
}))

/** Full-width bottom overlay — reads store itself so clock ticks don't remount cams */
function BottomFeedBar() {
  const blue = useGameplayStore((s) => s.blue)
  const red = useGameplayStore((s) => s.red)
  const featuredBlue = useGameplayStore((s) => s.featuredBlue)
  const featuredRed = useGameplayStore((s) => s.featuredRed)

  const bluePlayer = blue.players[featuredBlue.playerIndex]
  const redPlayer = red.players[featuredRed.playerIndex]

  return (
    <section className="bottom-feed-bar" aria-label="Team camera feeds">
      <div className="bottom-feed-glow" aria-hidden />
      <div className="bottom-feed-frame">
        <div className="bottom-feed-cams">
          <TeamFeedPanel
            side="blue"
            teamName={blue.name}
            teamTag={blue.tag}
            teamLogo={blue.logo}
            camLabel={featuredBlue.camLabel}
            playerName={bluePlayer?.name}
          />
          <TeamFeedPanel
            side="red"
            teamName={red.name}
            teamTag={red.tag}
            teamLogo={red.logo}
            camLabel={featuredRed.camLabel}
            playerName={redPlayer?.name}
          />
        </div>
        <InstitutionCarousel />
      </div>
    </section>
  )
}

const TeamFeedPanel = memo(function TeamFeedPanel({
  side,
  teamName,
  teamTag,
  teamLogo,
  camLabel,
  playerName,
}: {
  side: 'blue' | 'red'
  teamName: string
  teamTag: string
  teamLogo: string
  camLabel: string
  playerName?: string
}) {
  const isRed = side === 'red'
  const displayName =
    teamName.trim() || teamTag.trim() || (isRed ? 'RED' : 'BLUE')
  const displayTag = teamTag.trim() || side.toUpperCase()
  const label = camLabel.trim() || `${side.toUpperCase()} TEAM CAM`
  const footerName = (playerName ?? displayName).trim().toUpperCase()

  return (
    <article
      className={`bottom-feed-panel${isRed ? ' red' : ' blue'}`}
      aria-label={`${displayName} camera`}
    >
      <header className="bottom-feed-head">
        <span className="bottom-feed-crest">
          {teamLogo ? (
            <img src={teamLogo} alt="" decoding="async" />
          ) : (
            displayTag.slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="bottom-feed-identity">
          <div className="bottom-feed-name">{displayName}</div>
          <div className="bottom-feed-meta">
            {displayTag} · {label.toUpperCase()}
          </div>
        </div>
        <span className="bottom-feed-slot">{isRed ? '02' : '01'}</span>
      </header>
      <div className="bottom-feed-window">
        <TeamCamFeed
          side={side}
          waitingLabel={`${displayTag} cam`}
          className="team-cam-video"
        />
      </div>
      <footer className="bottom-feed-foot">
        <span>LIVE FEED</span>
        <span className="bottom-feed-player">{footerName}</span>
      </footer>
    </article>
  )
})

function InstitutionCarousel() {
  const loop = [...CAROUSEL_ITEMS, ...CAROUSEL_ITEMS, ...CAROUSEL_ITEMS]

  return (
    <div className="bottom-feed-center" aria-label="Institution logos">
      <div className="bottom-feed-center-label">CME TOURNAMENT</div>
      <div className="inst-carousel">
        <div className="inst-carousel-track">
          {loop.map((item, i) => (
            <div key={`${item.id}-${i}`} className="inst-carousel-item">
              <span className={`inst-carousel-seal seal-${item.slot}`}>
                <img
                  src={item.src}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
              </span>
              <span className="inst-carousel-name">{item.short}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(BottomFeedBar)
