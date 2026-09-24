import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildPickQueue, isPickVisibleOnOverlay, PICK_BLOCKS } from '../data/pickOrder'
import { getHero, heroLocalSplashUrl, heroSplashUrl } from '../data/heroes'
import { DEFAULT_SKIN_ICON } from '../data/defaultSkinIcons'
import HeroImage from '../components/HeroImage'
import DraftRevealOverlay from '../components/overlay/DraftRevealOverlay'
import { Icon } from '../components/cme/Icon'
import { INSTITUTION_LOGOS } from '../components/cme/InstitutionLogos'
import { detectPortraitFocus, type FocusPoint } from '../lib/faceFocus'
import { cropAroundFace, SPLASH_FACE } from '../data/heroFocus'
import { initDraftSync, useDraftStore, type Player, type TeamSide, type TeamState } from '../store/draftStore'
import { initStingerSync, useStingerStore } from '../store/stingerStore'
import '../styles/pick-stage.css'

/** Length of the card lock-in glow → wallpaper transition. */
const LOCK_ANIM_MS = 2200

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

type ActiveSlot = {
  side: TeamSide
  index: number
  type: 'picks' | 'bans'
} | null

const PARTICLES = Array.from({ length: 36 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  const left = r(1) * 100
  return {
    left,
    size: 2 + r(2) * 4,
    delay: -r(3) * 14,
    dur: 9 + r(4) * 9,
    drift: (r(5) - 0.5) * 120,
    tone: left < 38 ? 'blue' : left > 62 ? 'red' : 'white',
  }
})

export default function OverlayPage() {
  const phase = useDraftStore((s) => s.phase)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const pickOrderIndex = useDraftStore((s) => s.pickOrderIndex)
  const activeSide = useDraftStore((s) => s.activeSide)
  const activeSlot = useDraftStore((s) => s.activeSlot)
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  const stinger = useStingerStore()
  const shellRef = useRef<HTMLDivElement>(null)
  const [params] = useSearchParams()
  const showBackdrop = ['1', 'true', 'on'].includes(params.get('bg') ?? '')

  useEffect(() => {
    initDraftSync()
    initStingerSync()
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const box = shell.getBoundingClientRect()
      const stage = shell.querySelector('.stage') as HTMLElement | null
      if (!stage || !box.width || !box.height) return
      stage.style.setProperty('--scale', String(Math.min(box.width / 1920, box.height / 1080)))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const queue = useMemo(
    () => buildPickQueue(firstPickSide ?? 'blue'),
    [firstPickSide],
  )

  const active = useMemo<ActiveSlot>(() => {
    if (phase === 'done') return null
    if (phase === 'ban') {
      return { side: activeSide, index: activeSlot, type: 'bans' }
    }
    const next = queue[pickOrderIndex ?? 0]
    const teamOf = (side: TeamSide) => (side === 'blue' ? blue : red)
    if (!next || teamOf(next.side).picks[next.slot]) {
      const found = queue.find((step) => !teamOf(step.side).picks[step.slot])
      if (!found) return null
      return { side: found.side, index: found.slot, type: 'picks' }
    }
    return { side: next.side, index: next.slot, type: 'picks' }
  }, [queue, phase, activeSide, activeSlot, pickOrderIndex, blue, red])

  const count = (['blue', 'red'] as const).reduce((n, side) => {
    const team = side === 'blue' ? blue : red
    return n + (phase === 'ban' ? team.bans : team.picks).filter(Boolean).length
  }, 0)

  return (
    <div className="overlay-root cme-bo output-mode">
      <div className="workspace">
        <div className="stage-shell" ref={shellRef}>
          <div className="stage">
            <div className={`pk-root${showBackdrop ? '' : ' no-bg'}`}>
              {showBackdrop ? <Backdrop /> : <div className="pk-scrim" aria-hidden="true" />}
              <div className="pk-dock">
                <Crest />
                <BanStrip side="blue" active={active} />
                <BanStrip side="red" active={active} />
                <TeamPanel side="blue" active={active} />
                <CenterPanel active={active} count={count} />
                <PickOrder active={active} />
                <TeamPanel side="red" active={active} />
              </div>
            </div>
            <DraftRevealOverlay />
            {stinger.playing && (
              <div className={`stinger effect-${stinger.style}`}>
                <b>{stinger.label || 'CME TOURNAMENT'}</b>
                <span>MOBILE LEGENDS: BANG BANG</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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

function ShipWheel() {
  const spokes = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg viewBox="-110 -110 220 220" aria-hidden="true">
      {spokes.map((deg) => (
        <g key={deg} transform={`rotate(${deg})`}>
          <rect x="-4" y="-104" width="8" height="40" rx="4" />
          <rect x="-2.5" y="-70" width="5" height="50" />
        </g>
      ))}
      <circle r="64" fill="none" strokeWidth="11" />
      <circle r="50" fill="none" strokeWidth="3" />
      <circle r="20" />
      <circle r="8" className="hub" />
    </svg>
  )
}

function ShipBridge() {
  return (
    <svg viewBox="0 0 300 260" aria-hidden="true">
      <path d="M140 10h8v34h-8zM120 44h48v10h-48z" />
      <path d="M100 54h88l6 30H94z" />
      <path d="M70 84h148v14H70z" />
      <path d="M60 98h168l8 50H52z" />
      <path d="M86 108h20v18H86zM116 108h20v18h-20zM146 108h20v18h-20zM176 108h20v18h-20z" className="win" />
      <path d="M30 148h240l14 112H16z" />
      <path d="M10 170h40v6H10zM250 170h40v6h-40z" />
    </svg>
  )
}

function Backdrop() {
  return (
    <div className="pk-bg" aria-hidden="true">
      <div className="pk-bg-base" />
      <div className="pk-bg-glow left" />
      <div className="pk-bg-glow right" />
      <div className="pk-bg-glow center" />
      <div className="pk-dots left" />
      <div className="pk-dots right" />
      <div className="pk-wheel">
        <ShipWheel />
      </div>
      <div className="pk-ship left">
        <ShipBridge />
      </div>
      <div className="pk-ship right">
        <ShipBridge />
      </div>
      <div className="pk-beam left b1" />
      <div className="pk-beam left b2" />
      <div className="pk-beam left b3" />
      <div className="pk-beam right b1" />
      <div className="pk-beam right b2" />
      <div className="pk-beam right b3" />
      <div className="pk-sweep" />
      <div className="pk-floor" />
      <div className="pk-smoke s1" />
      <div className="pk-smoke s2" />
      <div className="pk-smoke s3" />
      <div className="pk-particles">
        {PARTICLES.map((p, i) => (
          <i
            key={i}
            className={p.tone}
            style={
              {
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
                '--drift': `${p.drift}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}

function Crest() {
  return (
    <div className="pk-crest">
      <div className="pk-logos">
        {INSTITUTION_LOGOS.map((logo) => (
          <span key={logo.id} className={`pk-seal ${logo.slot}`}>
            <img src={logo.src} alt={logo.alt} draggable={false} />
          </span>
        ))}
      </div>
      <div className="pk-title">
        <i />
        <span>CME ML TOURNAMENT</span>
        <i />
      </div>
      <div className="pk-title-anchor">
        <AnchorIcon />
      </div>
    </div>
  )
}

function shortPlayerName(player: Player | undefined, index: number) {
  const token = (player?.name ?? '').split(/[,\s]+/).find(Boolean)
  return token || `P${index + 1}`
}

function BanStrip({ side, active }: { side: TeamSide; active: ActiveSlot }) {
  const bans = useDraftStore((s) => s[side].bans)
  const players = useDraftStore((s) => s[side].players)
  return (
    <div className={`pk-bans side-${side}`}>
      <span className="pk-bans-label">BANS</span>
      <div className="pk-bans-slots">
        {bans.map((heroId, i) => (
          <BanSlot
            key={i}
            heroId={heroId}
            player={players[i]}
            index={i}
            onClock={active?.type === 'bans' && active.side === side && active.index === i}
          />
        ))}
      </div>
      <span className="pk-bans-cap" />
    </div>
  )
}

function BanSlot({
  heroId,
  player,
  index,
  onClock,
}: {
  heroId: string | null
  player: Player | undefined
  index: number
  onClock: boolean
}) {
  const [shownHero, setShownHero] = useState(heroId)
  const [locking, setLocking] = useState(false)
  if (heroId !== shownHero) {
    setShownHero(heroId)
    setLocking(!!heroId)
  }
  useEffect(() => {
    if (!locking) return
    const t = window.setTimeout(() => setLocking(false), 1600)
    return () => window.clearTimeout(t)
  }, [locking, heroId])

  const who = shortPlayerName(player, index)
  return (
    <div
      className={`pk-ban${heroId ? ' filled' : ''}${onClock ? ' on-clock' : ''}${
        locking ? ' is-banning' : ''
      }`}
    >
      {heroId ? (
        <div key={heroId} className="pk-ban-hero">
          <HeroImage heroId={heroId} variant="ban" className="pk-fill" showNameFallback={false} />
          <i className="pk-ban-slash" />
          <i className="pk-ban-burst" />
        </div>
      ) : (
        <Icon name="ban" />
      )}
      {player?.photo && (
        <img className="pk-ban-face" src={player.photo} alt="" draggable={false} />
      )}
      <span className={`pk-ban-by${heroId ? '' : ' is-empty'}`}>{who}</span>
    </div>
  )
}

function TeamPanel({ side, active }: { side: TeamSide; active: ActiveSlot }) {
  const team = useDraftStore((s) => s[side])
  const first = useDraftStore((s) => s.firstPickSide)
  const bluePicks = useDraftStore((s) => s.blue.picks)
  const redPicks = useDraftStore((s) => s.red.picks)
  const queue = useMemo(() => buildPickQueue(first ?? 'blue'), [first])
  const picksBySide = useMemo(
    () => ({ blue: bluePicks, red: redPicks }),
    [bluePicks, redPicks],
  )
  const sideLabel = `${side.toUpperCase()} SIDE`

  return (
    <section className={`pk-panel side-${side}`} aria-label={`${side} team lineup`}>
      <header className="pk-panel-head">
        <span className="pk-panel-anchor">
          <AnchorIcon />
        </span>
        <span className="pk-panel-name">{team.name || sideLabel}</span>
        {team.name && <span className="pk-panel-side">{sideLabel}</span>}
        {first === side && (
          <span className="pk-first">
            <b>»</b> FIRST PICK
          </span>
        )}
      </header>
      <div className="pk-cards">
        {team.players.map((player, i) => {
          const lockedId = team.picks[i]
          const visible = isPickVisibleOnOverlay(queue, picksBySide, side, i)
          return (
            <PickCard
              key={i}
              side={side}
              index={i}
              team={team}
              player={player}
              heroId={visible ? lockedId : null}
              hiddenPending={!!lockedId && !visible}
              onClock={active?.type === 'picks' && active.side === side && active.index === i}
            />
          )
        })}
      </div>
    </section>
  )
}

function PickCard({
  side,
  index,
  team,
  player,
  heroId,
  hiddenPending,
  onClock,
}: {
  side: TeamSide
  index: number
  team: TeamState
  player: Player
  heroId: string | null
  hiddenPending: boolean
  onClock: boolean
}) {
  const hero = getHero(heroId)
  const [shownHero, setShownHero] = useState(heroId)
  const [locking, setLocking] = useState(false)

  if (heroId !== shownHero) {
    setShownHero(heroId)
    setLocking(!!heroId)
  }

  useEffect(() => {
    if (!locking) return
    const t = window.setTimeout(() => setLocking(false), LOCK_ANIM_MS)
    return () => window.clearTimeout(t)
  }, [locking, heroId])

  const state = hero ? 'locked' : hiddenPending ? 'hidden' : onClock ? 'on-clock' : 'waiting'
  const status = hero
    ? hero.name
    : hiddenPending
      ? 'LOCKED IN'
      : onClock
        ? 'SELECTING'
        : 'AWAITING PICK'

  return (
    <article
      className={`pk-card side-${side} is-${state}${locking ? ' is-locking' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="pk-card-glow" />
      <div className="pk-card-ring" />
      <div className="pk-card-frame">
        <div className="pk-card-bg" />
        <div className="pk-cme" aria-hidden="true">
          <span>C</span>
          <span>M</span>
          <span>E</span>
        </div>
        <div className="pk-card-photo">
          {player.photo ? (
            <img src={player.photo} alt={player.name} draggable={false} />
          ) : team.logo ? (
            <img className="is-logo" src={team.logo} alt={team.name} draggable={false} />
          ) : (
            <span className="pk-card-tag">{team.tag || side.toUpperCase()}</span>
          )}
        </div>
        <div className="pk-card-waves" />
        {hero && heroId && (
          <div className="pk-card-hero">
            <HeroWallpaper key={heroId} heroId={heroId} heroName={hero.name} />
          </div>
        )}
        <div className="pk-card-scan" />
        <div className="pk-card-shade" />
        <div className="pk-card-flash" />
        <span className="pk-card-num">{pad(index + 1)}</span>
        {hero && (
          <span className="pk-card-check">
            <Icon name="check" />
          </span>
        )}
        <div className="pk-card-foot">
          <span className="pk-card-status">
            {status}
            {state === 'on-clock' && (
              <span className="pk-dots-anim">
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
          <span className="pk-card-player">{player.name || `PLAYER ${index + 1}`}</span>
        </div>
      </div>
    </article>
  )
}

function HeroWallpaper({ heroId, heroName }: { heroId: string; heroName: string }) {
  const sources = useMemo(
    () =>
      [heroSplashUrl(heroName), heroLocalSplashUrl(heroId), DEFAULT_SKIN_ICON[heroId]].filter(
        (src): src is string => !!src,
      ),
    [heroId, heroName],
  )
  const [srcIndex, setSrcIndex] = useState(0)
  const [detected, setDetected] = useState<{ src: string; focus: FocusPoint } | null>(null)
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const src = sources[srcIndex]
  const isIcon = src === DEFAULT_SKIN_ICON[heroId]
  const isSplash = src === heroSplashUrl(heroName)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const known = isSplash ? SPLASH_FACE[heroId] : undefined
  const face: FocusPoint | null = known
    ? { x: known[0], y: known[1] }
    : isIcon
      ? { x: 50, y: 34 }
      : detected?.src === src
        ? detected.focus
        : null
  const crop =
    face && box && box.w > 0 && natural?.src === src ? cropAroundFace(natural, box, face) : null

  if (!src) return null
  return (
    <div ref={boxRef} className="pk-wall">
      <img
        key={src}
        src={src}
        alt={heroName}
        draggable={false}
        crossOrigin={isIcon ? undefined : 'anonymous'}
        className={crop ? 'is-framed' : undefined}
        style={
          crop
            ? {
                left: crop.left,
                top: crop.top,
                width: crop.width,
                height: crop.height,
                transformOrigin: `${crop.originX - crop.left}px ${crop.originY - crop.top}px`,
              }
            : undefined
        }
        onLoad={(e) => {
          const img = e.currentTarget
          setNatural({ src, w: img.naturalWidth, h: img.naturalHeight })
          if (known || isIcon) return
          void detectPortraitFocus(img, `wall:${heroId}:${src}`, heroId)
            .catch(() => ({ x: 50, y: 22 }))
            .then((focus) => setDetected({ src, focus }))
        }}
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </div>
  )
}

function SideSquare({ side, active }: { side: TeamSide; active: ActiveSlot }) {
  const team = useDraftStore((s) => s[side])
  const phase = useDraftStore((s) => s.phase)
  const list = phase === 'ban' ? team.bans : team.picks
  const next = list.findIndex((id) => !id)
  const live = active?.side === side
  return (
    <div className={`pk-square side-${side}${live ? ' live' : ''}`}>
      <div className="pk-square-box">
        {team.logo ? <img src={team.logo} alt="" /> : <span>{(team.tag || side).slice(0, 3)}</span>}
      </div>
      <b>{team.tag || `${side.toUpperCase()} SIDE`}</b>
      <small>{next === -1 ? 'COMPLETE' : `SLOT ${pad((live && active ? active.index : next) + 1)}`}</small>
    </div>
  )
}

function CenterPanel({ active, count }: { active: ActiveSlot; count: number }) {
  const phase = useDraftStore((s) => s.phase)
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)
  const matchLabel = useDraftStore((s) => s.matchLabel)
  const word = !active ? 'READY' : phase === 'ban' ? 'BAN' : 'PICK'
  const turnTeam = active ? (active.side === 'blue' ? blue : red) : null
  const turn = active
    ? `${turnTeam?.tag || `${active.side.toUpperCase()} SIDE`} ${phase === 'ban' ? 'BAN' : 'PICK'}`
    : phase === 'ban'
      ? 'BANS COMPLETE'
      : 'DRAFT COMPLETE'

  return (
    <section className={`pk-center${active ? ` turn-${active.side}` : ' turn-none'}`} aria-label="Draft status">
      <div className="pk-center-turn">
        <span className="pk-center-arrow" />
        {turn}
      </div>
      <div className="pk-center-row">
        <SideSquare side="blue" active={active} />
        <div key={word} className="pk-center-word" data-word={word}>
          {word}
        </div>
        <SideSquare side="red" active={active} />
      </div>
      <div className="pk-center-count">
        {phase === 'ban' ? 'BANS' : 'PICKS'} LOCKED <strong>{count}/10</strong>
      </div>
      {matchLabel && <div className="pk-center-match">{matchLabel}</div>}
    </section>
  )
}

function PickOrder({ active }: { active: ActiveSlot }) {
  const phase = useDraftStore((s) => s.phase)
  const firstPickSide = useDraftStore((s) => s.firstPickSide)
  const blue = useDraftStore((s) => s.blue)
  const red = useDraftStore((s) => s.red)

  const groups = useMemo(() => {
    const queue = buildPickQueue(firstPickSide ?? 'blue')
    let cursor = 0
    return PICK_BLOCKS.map((block) => {
      const slice = queue.slice(cursor, cursor + block.count)
      cursor += block.count
      return slice
    })
  }, [firstPickSide])

  return (
    <div className="pk-order" aria-label="Pick order">
      <div className="pk-order-steps">
        {groups.map((slice, i) => {
          const side = slice[0]?.side ?? 'blue'
          const finished = slice.every((step) => !!(step.side === 'blue' ? blue : red).picks[step.slot])
          const current =
            phase === 'pick' &&
            active?.type === 'picks' &&
            slice.some((step) => step.side === active.side && step.slot === active.index)
          return (
            <span
              key={i}
              className={`pk-step side-${side}${current ? ' current' : ''}${finished ? ' done' : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              x{slice.length}
            </span>
          )
        })}
      </div>
      <div className="pk-order-label">PICK ORDER • 1-2-2-2-2-1</div>
    </div>
  )
}
