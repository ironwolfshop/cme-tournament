import { useEffect, useState, type CSSProperties } from 'react'
import { getHero, heroLocalSplashUrl } from '../../data/heroes'
import {
  DRAFT_REVEAL_MS,
  useDraftStore,
  type DraftReveal,
} from '../../store/draftStore'
import HeroImage from '../HeroImage'

type Stage = 'enter' | 'player' | 'hero' | 'hold' | 'exit'

export default function DraftRevealOverlay() {
  const reveal = useDraftStore((s) => s.reveal)
  const clearReveal = useDraftStore((s) => s.clearReveal)

  if (!reveal) return null

  return (
    <RevealSequence
      key={reveal.id}
      reveal={reveal}
      onDone={clearReveal}
    />
  )
}

function RevealSequence({
  reveal,
  onDone,
}: {
  reveal: DraftReveal
  onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>('enter')
  const hero = getHero(reveal.heroId)
  const isBan = reveal.kind === 'ban'
  const isBlue = reveal.side === 'blue'
  const accent = isBlue ? '#68adff' : '#ff718a'
  const accentDeep = isBlue ? '#1e5cff' : '#e11d2e'

  useEffect(() => {
    // Hold player identity on screen before revealing the hero splash.
    const tPlayer = window.setTimeout(() => setStage('player'), 60)
    const tHero = window.setTimeout(() => setStage('hero'), 2400)
    const tHold = window.setTimeout(() => setStage('hold'), 3200)
    const tExit = window.setTimeout(() => setStage('exit'), DRAFT_REVEAL_MS - 520)
    const tDone = window.setTimeout(onDone, DRAFT_REVEAL_MS)
    return () => {
      window.clearTimeout(tPlayer)
      window.clearTimeout(tHero)
      window.clearTimeout(tHold)
      window.clearTimeout(tExit)
      window.clearTimeout(tDone)
    }
  }, [onDone])

  const showHero = stage === 'hero' || stage === 'hold' || stage === 'exit'
  const showPlayer = stage === 'enter' || stage === 'player'

  return (
    <div
      className={`draft-reveal ${stage === 'exit' ? 'is-exit' : 'is-enter'}${
        isBan ? ' is-ban' : ' is-pick'
      }${isBlue ? ' is-blue' : ' is-red'}`}
        style={
          {
            '--reveal-accent': accent,
            '--reveal-accent-deep': accentDeep,
            '--reveal-ms': `${DRAFT_REVEAL_MS}ms`,
          } as CSSProperties
        }
    >
      <div className="draft-reveal-veil" />
      <div className="draft-reveal-beams" aria-hidden />
      <div className="draft-reveal-side left" />
      <div className="draft-reveal-side right" />

      <div className="draft-reveal-card">
        <div
          className={`draft-reveal-status ${
            isBan ? 'status-ban' : 'status-pick'
          }`}
        >
          {isBan ? 'BANNING' : 'PICKING'}
        </div>

        <div className="draft-reveal-stage">
          {/* Player / team identity first */}
          <div
            className={`draft-reveal-panel panel-player ${
              showPlayer && !showHero ? 'is-active' : 'is-leaving'
            }`}
          >
            <PlayerPreview reveal={reveal} accent={accent} />
            <div className="draft-reveal-name-burst">
              <span className="burst-kicker">
                {reveal.teamTag}
                <em>{isBan ? 'BAN' : 'PICK'}</em>
              </span>
              <h2 className="burst-name">{reveal.playerName || reveal.teamTag}</h2>
              <span className="burst-team">{reveal.teamName}</span>
            </div>
          </div>

          {/* Hero splash after */}
          <div
            className={`draft-reveal-panel panel-hero ${
              showHero ? 'is-active' : 'is-waiting'
            }`}
          >
            <div className="draft-reveal-hero-art">
              <img
                src={heroLocalSplashUrl(reveal.heroId)}
                alt={hero?.name ?? 'Hero'}
                className="draft-reveal-hero-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div className="draft-reveal-hero-fallback">
                <HeroImage
                  heroId={reveal.heroId}
                  variant="splash"
                  className="h-full w-full"
                  autoCrop
                  imgClassName="object-cover"
                />
              </div>
              <div className="draft-reveal-hero-shade" />
              {isBan && (
                <div className="draft-reveal-ban-stamp">BANNED</div>
              )}
              {!isBan && showHero && (
                <div className="draft-reveal-flash" />
              )}
            </div>
          </div>

          {stage === 'hero' && <div className="draft-reveal-wipe" />}
        </div>

        <div className="draft-reveal-footer">
          <div className="footer-left">
            <span className="footer-meta">
              {reveal.teamTag} · {isBan ? 'BAN' : 'PICK'}
            </span>
            <span className="footer-title">
              {showHero ? (hero?.name ?? 'HERO') : reveal.playerName || reveal.teamTag}
            </span>
          </div>
          <div className="footer-right">
            <span className="footer-team">{reveal.teamName}</span>
            <span className={`footer-lock ${isBan ? 'ban' : 'pick'}`}>
              {showHero
                ? isBan
                  ? 'HERO BANNED'
                  : 'HERO LOCKED'
                : isBan
                  ? 'SELECTING BAN'
                  : 'PLAYER LOCK'}
            </span>
          </div>
        </div>

        <div className="draft-reveal-progress">
          <div className="draft-reveal-progress-fill" />
        </div>
      </div>
    </div>
  )
}

function PlayerPreview({
  reveal,
  accent,
}: {
  reveal: DraftReveal
  accent: string
}) {
  if (reveal.playerPhoto) {
    return (
      <div className="draft-reveal-photo">
        <img src={reveal.playerPhoto} alt={reveal.playerName} />
        <div className="draft-reveal-photo-shade" />
      </div>
    )
  }

  return (
    <div
      className="draft-reveal-avatar-wrap"
      style={{
        background: `radial-gradient(ellipse at center, ${accent}55 0%, #0a1228 72%)`,
      }}
    >
      <div
        className="draft-reveal-avatar"
        style={{ borderColor: accent }}
      >
        {(reveal.playerName || reveal.teamTag).slice(0, 2).toUpperCase()}
      </div>
    </div>
  )
}
