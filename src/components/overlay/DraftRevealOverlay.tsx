import { useEffect, useState, type CSSProperties } from 'react'
import { getHero, heroLocalSplashUrl } from '../../data/heroes'
import {
  DRAFT_REVEAL_MS,
  useDraftStore,
  type DraftReveal,
  type DraftRevealEntry,
} from '../../store/draftStore'
import HeroImage from '../HeroImage'

type Stage = 'enter' | 'player' | 'hero' | 'hold' | 'exit'

export default function DraftRevealOverlay() {
  const reveal = useDraftStore((s) => s.reveal)
  const clearReveal = useDraftStore((s) => s.clearReveal)

  if (!reveal?.entries?.length) return null

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
  const entries = reveal.entries
  const duo = entries.length > 1
  const isBan = reveal.kind === 'ban'
  const isBlue = reveal.side === 'blue'
  const accent = isBlue ? '#68adff' : '#ff718a'
  const accentDeep = isBlue ? '#1e5cff' : '#e11d2e'

  useEffect(() => {
    // 5s total: player hold → hero → hold → fade out (no shrink).
    const tPlayer = window.setTimeout(() => setStage('player'), 60)
    const tHero = window.setTimeout(() => setStage('hero'), 1800)
    const tHold = window.setTimeout(() => setStage('hold'), 2800)
    const tExit = window.setTimeout(() => setStage('exit'), DRAFT_REVEAL_MS - 1000)
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

  const statusLabel = isBan
    ? 'BANNING'
    : duo
      ? 'DOUBLE PICK'
      : 'PICKING'

  const heroNames = entries
    .map((e) => getHero(e.heroId)?.name ?? 'HERO')
    .join('  ·  ')
  const playerNames = entries
    .map((e) => e.playerName || e.teamTag)
    .join('  ·  ')

  return (
    <div
      className={`draft-reveal ${stage === 'exit' ? 'is-exit' : 'is-enter'}${
        isBan ? ' is-ban' : ' is-pick'
      }${isBlue ? ' is-blue' : ' is-red'}${duo ? ' is-duo' : ''}`}
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

      <div className={`draft-reveal-card${duo ? ' is-duo' : ''}`}>
        <div
          className={`draft-reveal-status ${
            isBan ? 'status-ban' : 'status-pick'
          }`}
        >
          {statusLabel}
        </div>

        <div className={`draft-reveal-grid${duo ? ' is-duo' : ''}`}>
          {entries.map((entry) => (
            <RevealCard
              key={`${entry.side}-${entry.slot}-${entry.heroId}`}
              entry={entry}
              isBan={isBan}
              showHero={showHero}
              showPlayer={showPlayer}
              stage={stage}
            />
          ))}
        </div>

        <div className="draft-reveal-footer">
          <div className="footer-left">
            <span className="footer-meta">
              {reveal.teamTag} · {isBan ? 'BAN' : duo ? '2 PICKS' : 'PICK'}
            </span>
            <span className="footer-title">
              {showHero ? heroNames : playerNames}
            </span>
          </div>
          <div className="footer-right">
            <span className="footer-team">{reveal.teamName}</span>
            <span className={`footer-lock ${isBan ? 'ban' : 'pick'}`}>
              {showHero
                ? isBan
                  ? 'HERO BANNED'
                  : duo
                    ? 'HEROES LOCKED'
                    : 'HERO LOCKED'
                : isBan
                  ? 'SELECTING BAN'
                  : duo
                    ? 'PLAYER LOCK ×2'
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

function RevealCard({
  entry,
  isBan,
  showHero,
  showPlayer,
  stage,
}: {
  entry: DraftRevealEntry
  isBan: boolean
  showHero: boolean
  showPlayer: boolean
  stage: Stage
}) {
  const hero = getHero(entry.heroId)
  return (
    <div className="draft-reveal-stage">
      <div
        className={`draft-reveal-panel panel-player ${
          showPlayer && !showHero ? 'is-active' : 'is-leaving'
        }`}
      >
        <PlayerPreview entry={entry} />
        <div className="draft-reveal-name-burst">
          <span className="burst-kicker">
            {entry.teamTag}
            <em>{isBan ? 'BAN' : 'PICK'}</em>
          </span>
          <h2 className="burst-name">{entry.playerName || entry.teamTag}</h2>
          <span className="burst-team">{entry.teamName}</span>
        </div>
      </div>

      <div
        className={`draft-reveal-panel panel-hero ${
          showHero ? 'is-active' : 'is-waiting'
        }`}
      >
        <div className="draft-reveal-hero-art">
          <img
            src={heroLocalSplashUrl(entry.heroId)}
            alt={hero?.name ?? 'Hero'}
            className="draft-reveal-hero-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div className="draft-reveal-hero-fallback">
            <HeroImage
              heroId={entry.heroId}
              variant="splash"
              className="h-full w-full"
              autoCrop
              imgClassName="object-cover"
            />
          </div>
          <div className="draft-reveal-hero-shade" />
          {isBan && <div className="draft-reveal-ban-stamp">BANNED</div>}
          {!isBan && showHero && <div className="draft-reveal-flash" />}
        </div>
      </div>

      {stage === 'hero' && <div className="draft-reveal-wipe" />}
    </div>
  )
}

function PlayerPreview({ entry }: { entry: DraftRevealEntry }) {
  const accent = entry.side === 'blue' ? '#68adff' : '#ff718a'
  if (entry.playerPhoto) {
    return (
      <div className="draft-reveal-photo">
        <img src={entry.playerPhoto} alt={entry.playerName} />
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
      <div className="draft-reveal-avatar" style={{ borderColor: accent }}>
        {(entry.playerName || entry.teamTag).slice(0, 2).toUpperCase()}
      </div>
    </div>
  )
}
