import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { DEFAULT_SKIN_ICON } from '../../data/defaultSkinIcons'
import {
  getHero,
  heroLocalSplashUrl,
  heroSplashUrl,
  UNIQUE_HEROES,
} from '../../data/heroes'
import { buildPickQueue } from '../../data/pickOrder'
import { SPLASH_BY_HERO_NAME } from '../../data/splashMap'
import { useDraftStore, type DraftReveal, type TeamSide } from '../../store/draftStore'

const CARD_MS = 4800
const EXIT_MS = 450
/** Ignore reveals left over in storage when the overlay (re)loads. */
const STALE_MS = 20000
const NAME_MAX_PX = 280
/** Room between the PICKS word and the right-hand shards, in stage px. */
const NAME_MAX_WIDTH = 820

type LockCard = {
  kind: DraftReveal['kind']
  heroId: string
  side: TeamSide
  slot: number
  playerName: string
  playerPhoto?: string
  teamTag: string
}

const ROLE_LINES: Record<string, { left: string[]; right: string }> = {
  assassin: { left: ['SPEED', 'PRECISION', 'DOMINATION'], right: 'A TRUE ASSASSIN NEVER RETREATS' },
  marksman: { left: ['RANGE', 'FOCUS', 'ANNIHILATION'], right: 'EVERY SHOT FINDS ITS MARK' },
  mage: { left: ['POWER', 'CONTROL', 'DESTRUCTION'], right: 'MAGIC BENDS TO MY WILL' },
  fighter: { left: ['STRENGTH', 'GRIT', 'CONQUEST'], right: 'NO FIGHT LEFT UNFINISHED' },
  tank: { left: ['IRON', 'RESOLVE', 'PROTECTION'], right: 'THE WALL THAT NEVER FALLS' },
  support: { left: ['GUIDANCE', 'SYNERGY', 'VICTORY'], right: 'TOGETHER WE ASCEND' },
}

const BAN_LINES = { left: ['DENIED', 'LOCKED', 'OUT'], right: 'NOT IN THIS DRAFT' }

type ShardSpec = {
  x: number
  y: number
  w: number
  h: number
  rot: number
  shape: 'spike' | 'blade' | 'chunk'
  gold?: boolean
  delay: number
  from: 'l' | 'r' | 'b' | 't'
}

const SHARDS: ShardSpec[] = [
  { x: 330, y: 170, w: 80, h: 270, rot: -34, shape: 'spike', gold: true, delay: 120, from: 't' },
  { x: 760, y: 190, w: 60, h: 210, rot: 28, shape: 'blade', delay: 200, from: 't' },
  { x: 150, y: 540, w: 130, h: 440, rot: -30, shape: 'spike', delay: 60, from: 'l' },
  { x: 285, y: 640, w: 90, h: 310, rot: -12, shape: 'blade', delay: 140, from: 'l' },
  { x: 60, y: 790, w: 120, h: 290, rot: -52, shape: 'chunk', delay: 220, from: 'l' },
  { x: 440, y: 800, w: 70, h: 230, rot: 16, shape: 'spike', delay: 260, from: 'b' },
  { x: 1560, y: 250, w: 90, h: 330, rot: 24, shape: 'spike', delay: 100, from: 'r' },
  { x: 1660, y: 600, w: 130, h: 400, rot: 32, shape: 'spike', delay: 60, from: 'r' },
  { x: 1780, y: 770, w: 100, h: 300, rot: 50, shape: 'chunk', delay: 180, from: 'r' },
  { x: 1480, y: 790, w: 70, h: 240, rot: 12, shape: 'blade', delay: 240, from: 'b' },
  { x: 700, y: 880, w: 80, h: 220, rot: -8, shape: 'blade', delay: 300, from: 'b' },
  { x: 1200, y: 900, w: 70, h: 200, rot: 10, shape: 'spike', delay: 320, from: 'b' },
]

const SHAPES: Record<ShardSpec['shape'], { body: string; facet: string }> = {
  spike: { body: '50,0 90,190 50,300 10,190', facet: '50,0 50,300 10,190' },
  blade: { body: '40,0 100,110 72,300 0,210', facet: '40,0 72,300 0,210' },
  chunk: { body: '28,0 100,70 82,300 0,235', facet: '28,0 82,300 0,235' },
}

const SPARKS = Array.from({ length: 40 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return {
    left: 120 + r(1) * 1680,
    top: 180 + r(2) * 820,
    size: 2 + r(3) * 5,
    delay: r(4) * 2400,
    dur: 1800 + r(5) * 2200,
  }
})

const GHOST_LEFT = UNIQUE_HEROES.slice(10, 14)
const GHOST_RIGHT = UNIQUE_HEROES.slice(20, 24)

function wrapWords(text: string, max = 8): string[] {
  const lines: string[] = []
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1]
    if (last && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

function buildCards(reveal: DraftReveal): LockCard[] {
  const s = useDraftStore.getState()
  if (reveal.kind === 'ban') {
    const team = s[reveal.side]
    const player = team.players[reveal.slot]
    return [
      {
        kind: 'ban',
        heroId: reveal.heroId,
        side: reveal.side,
        slot: reveal.slot,
        playerName: player?.name || reveal.playerName,
        playerPhoto: player?.photo || reveal.playerPhoto,
        teamTag: team.tag || reveal.teamTag,
      },
    ]
  }
  const queue = buildPickQueue(s.firstPickSide ?? 'blue')
  const target = queue.find((t) => t.side === reveal.side && t.slot === reveal.slot)
  const steps = target
    ? queue.filter((t) => t.blockIndex === target.blockIndex)
    : [{ side: reveal.side, slot: reveal.slot }]

  const cards = steps.flatMap((step): LockCard[] => {
    const team = s[step.side]
    const isRevealSlot = step.side === reveal.side && step.slot === reveal.slot
    const heroId = isRevealSlot ? reveal.heroId : team.picks[step.slot]
    if (!heroId) return []
    const player = team.players[step.slot]
    return [
      {
        kind: 'pick',
        heroId,
        side: step.side,
        slot: step.slot,
        playerName: player?.name || '',
        playerPhoto: player?.photo || (isRevealSlot ? reveal.playerPhoto : undefined),
        teamTag: team.tag,
      },
    ]
  })

  return cards.length
    ? cards
    : [
        {
          kind: reveal.kind,
          heroId: reveal.heroId,
          side: reveal.side,
          slot: reveal.slot,
          playerName: reveal.playerName,
          playerPhoto: reveal.playerPhoto,
          teamTag: reveal.teamTag,
        },
      ]
}

export default function DraftRevealOverlay() {
  const reveal = useDraftStore((s) => s.reveal)
  const [finishedId, setFinishedId] = useState<string | null>(null)

  if (!reveal || reveal.id === finishedId) return null

  return <LockSequence key={reveal.id} reveal={reveal} onDone={setFinishedId} />
}

function LockSequence({
  reveal,
  onDone,
}: {
  reveal: DraftReveal
  onDone: (id: string) => void
}) {
  const [cards] = useState(() =>
    Date.now() - reveal.startedAt > STALE_MS ? [] : buildCards(reveal),
  )
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!cards.length) return
    const t1 = window.setTimeout(() => setLeaving(true), CARD_MS - EXIT_MS)
    const t2 = window.setTimeout(() => {
      if (index + 1 < cards.length) {
        setLeaving(false)
        setIndex(index + 1)
      } else {
        onDone(reveal.id)
      }
    }, CARD_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [index, cards.length, onDone, reveal.id])

  const card = cards[index]
  if (!card) return null
  return <LockModal key={`${card.side}-${card.slot}`} card={card} leaving={leaving} />
}

function LockModal({ card, leaving }: { card: LockCard; leaving: boolean }) {
  const hero = getHero(card.heroId)
  const heroName = hero?.name ?? card.heroId
  const role = (hero?.role ?? 'fighter').split(/[/,]/)[0].trim().toLowerCase()
  const isBan = card.kind === 'ban'
  const lines = isBan ? BAN_LINES : (ROLE_LINES[role] ?? ROLE_LINES.fighter)
  const playerName = card.playerName || `PLAYER ${card.slot + 1}`
  const teamLabel = card.teamTag || card.side.toUpperCase()
  const subtitle = isBan
    ? `BAN ${card.slot + 1} · ${teamLabel}`
    : (SPLASH_BY_HERO_NAME[heroName]?.file ?? hero?.role ?? '').toUpperCase()
  const nameRef = useRef<HTMLDivElement>(null)
  const plate = isBan ? `BANNED BY ${playerName}` : `${teamLabel} | ${playerName}`

  useLayoutEffect(() => {
    const el = nameRef.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = `${NAME_MAX_PX}px`
      const width = el.offsetWidth
      if (width > NAME_MAX_WIDTH) {
        el.style.fontSize = `${Math.floor((NAME_MAX_PX * NAME_MAX_WIDTH) / width)}px`
      }
    }
    fit()
    void document.fonts?.ready.then(fit)
  }, [heroName])

  return (
    <div
      className={`lk-root${card.side === 'red' ? ' red' : ''}${isBan ? ' is-ban' : ''}${
        leaving ? ' leaving' : ''
      }`}
    >
      <div className="lk-dim" />
      <div className="lk-frame">
        <div className="lk-veil" />

        <div className="lk-panel">
          <div className="lk-panel-strip">
            <span>ALL</span>
            <i />
            <i />
            <i />
          </div>
          <div className="lk-ghosts left">
            {GHOST_LEFT.map((h) => (
              <img key={h.id} src={DEFAULT_SKIN_ICON[h.id]} alt="" />
            ))}
          </div>
          <div className="lk-ghosts right">
            {GHOST_RIGHT.map((h) => (
              <img key={h.id} src={DEFAULT_SKIN_ICON[h.id]} alt="" />
            ))}
          </div>
        </div>

        <div className="lk-moon" />
        <div className="lk-aura" />

        <HeroArt heroId={card.heroId} heroName={heroName} />

        {isBan && (
          <div className="lk-ban-mark">
            <i className="lk-ban-cut a" />
            <i className="lk-ban-cut b" />
            <div className="lk-ban-stamp">BANNED</div>
          </div>
        )}

        {SHARDS.map((s, i) => (
          <Shard key={i} spec={s} />
        ))}

        <div className="lk-player">
          {card.playerPhoto ? (
            <img src={card.playerPhoto} alt={playerName} />
          ) : (
            <div className="lk-player-fallback">
              {(playerName || teamLabel || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          {isBan && (
            <div className="lk-player-tag">
              <small>BANNED BY</small>
              <b>{playerName}</b>
            </div>
          )}
        </div>

        <div className="lk-tagline left">
          {lines.left.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div className="lk-tagline right">
          {wrapWords(lines.right).map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>

        <div className="lk-sparks">
          {SPARKS.map((p, i) => (
            <i
              key={i}
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                animationDelay: `${p.delay}ms`,
                animationDuration: `${p.dur}ms`,
              }}
            />
          ))}
        </div>

        <div className="lk-title">
          <div className="lk-title-left">
            <div className="lk-plate">
              <span>{plate}</span>
            </div>
            <div className="lk-picks">{isBan ? 'BANS' : 'PICKS'}</div>
          </div>
          <div className="lk-title-right">
            <div className="lk-hero-name" ref={nameRef}>
              {heroName}
            </div>
            {subtitle && (
              <div className="lk-ribbon">
                <span>{subtitle}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lk-flash" />
      </div>
    </div>
  )
}

function HeroArt({ heroId, heroName }: { heroId: string; heroName: string }) {
  const sources = [
    heroSplashUrl(heroName),
    heroLocalSplashUrl(heroId),
    DEFAULT_SKIN_ICON[heroId],
  ].filter((src): src is string => !!src)
  const [srcIndex, setSrcIndex] = useState(0)
  const src = sources[srcIndex]

  return (
    <div className="lk-hero">
      {src && (
        <img
          key={src}
          src={src}
          alt={heroName}
          draggable={false}
          onError={() => setSrcIndex((i) => i + 1)}
        />
      )}
    </div>
  )
}

function Shard({ spec }: { spec: ShardSpec }) {
  const id = useId()
  const shape = SHAPES[spec.shape]
  const light = spec.gold ? '#fff4c8' : 'var(--lk-c)'
  const mid = spec.gold ? '#f2b431' : 'var(--lk-a)'
  const deep = spec.gold ? '#6b3b05' : 'var(--lk-deep)'

  return (
    <div
      className={`lk-shard from-${spec.from}${spec.gold ? ' gold' : ''}`}
      style={
        {
          left: spec.x,
          top: spec.y,
          width: spec.w,
          height: spec.h,
          '--rot': `${spec.rot}deg`,
          animationDelay: `${spec.delay}ms`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 100 300" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: light }} />
            <stop offset="45%" style={{ stopColor: mid }} />
            <stop offset="100%" style={{ stopColor: deep }} />
          </linearGradient>
        </defs>
        <polygon
          points={shape.body}
          style={{ fill: `url(#${id}-g)`, stroke: light, strokeWidth: 1.5, strokeOpacity: 0.9 }}
        />
        <polygon points={shape.facet} style={{ fill: '#ffffff', fillOpacity: 0.22 }} />
      </svg>
    </div>
  )
}
