import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import '../styles/standby-scene.css'

const STAGE_W = 1920
const STAGE_H = 1080

const TL_LINES = ['MORE', 'THAN', 'A GAME', 'A STRONGER', 'CREW']
const TR_LINES = ['OCEAN', 'UNITES', 'PLAYERS', 'CREATES', 'LEGENDS']

const SEALS = [
  { id: 'zscmst', src: '/logos/zscmst.png', alt: 'ZSCMST', size: 'sm' },
  { id: 'cme', src: '/logos/cme.png', alt: 'College of Maritime Education', size: 'lg' },
  { id: 'ysc', src: '/logos/young-sailors-club.png', alt: 'Young Sailors Club', size: 'sm' },
] as const

/** Official MLBB skins (maritime themed), background removed. Back row first. */
const HEROES = [
  { id: 'kadita', name: 'Kadita — Ocean Goddess', src: '/standby/hero-kadita.webp', side: 'blue' },
  { id: 'yuzhong', name: 'Yu Zhong — Tidescale Sealord', src: '/standby/hero-yuzhong.webp', side: 'red' },
  { id: 'bane', name: 'Bane — Lord of Scalding Seas', src: '/standby/hero-bane.webp', side: 'red' },
  { id: 'natan', name: 'Natan — Tidal Lord', src: '/standby/hero-natan.webp', side: 'blue' },
  { id: 'yss', name: 'Yi Sun-shin — Fleet Warden', src: '/standby/hero-yi-sun-shin.webp', side: 'blue' },
  { id: 'claude', name: 'Claude — Plunderous Pirate', src: '/standby/hero-claude.webp', side: 'red' },
  { id: 'kimmy', name: 'Kimmy — High Seas Cadet', src: '/standby/hero-kimmy.webp', side: 'blue' },
  { id: 'ruby', name: 'Ruby — Pirate Parrot', src: '/standby/hero-ruby.webp', side: 'red' },
] as const

const BIRDS = [
  { x: 60, y: 600, s: 1, d: 26, delay: 0 },
  { x: 180, y: 640, s: 0.7, d: 30, delay: -8 },
  { x: 300, y: 580, s: 0.85, d: 24, delay: -15 },
  { x: 1560, y: 610, s: 0.8, d: 28, delay: -4 },
  { x: 1720, y: 560, s: 1, d: 25, delay: -12 },
  { x: 1800, y: 650, s: 0.65, d: 32, delay: -20 },
]

/** Target time from `?until=HH:MM` (today, local) or `?minutes=N` (from page load). */
function useCountdownTarget(): number | null {
  const [params] = useSearchParams()
  return useMemo(() => {
    const until = params.get('until')
    if (until && /^\d{1,2}:\d{2}$/.test(until)) {
      const [h, m] = until.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      return d.getTime()
    }
    const minutes = Number(params.get('minutes'))
    if (Number.isFinite(minutes) && minutes > 0) return Date.now() + minutes * 60_000
    return null
  }, [params])
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

export default function StandbyOverlayPage() {
  const shellRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const target = useCountdownTarget()
  const now = useNow(target !== null)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = [html.style.background, body.style.background, html.style.overflow, body.style.overflow]
    html.style.background = '#050b1c'
    body.style.background = '#050b1c'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      ;[html.style.background, body.style.background, html.style.overflow, body.style.overflow] = prev
    }
  }, [])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const stage = stageRef.current
    if (!shell || !stage) return
    const apply = () => {
      const box = shell.getBoundingClientRect()
      if (!box.width || !box.height) return
      const scale = Math.min(box.width / STAGE_W, box.height / STAGE_H)
      const x = (box.width - STAGE_W * scale) / 2
      const y = (box.height - STAGE_H * scale) / 2
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(shell)
    return () => ro.disconnect()
  }, [])

  let pillText = 'STREAM BEGINS SHORTLY'
  if (target !== null) {
    const left = Math.max(0, Math.ceil((target - now) / 1000))
    const mm = String(Math.floor(left / 60)).padStart(2, '0')
    const ss = String(left % 60).padStart(2, '0')
    pillText = left > 0 ? `STREAM BEGINS IN ${mm}:${ss}` : 'GOING LIVE NOW'
  }

  return (
    <div className="sb-shell" ref={shellRef}>
      <div className="overlay-root sb-stage" ref={stageRef}>
        <WaterFilter />

        {/* ——— Scene ——— */}
        <div className="sb-scene" aria-hidden>
          <div className="sb-bg" />
          <div className="sb-sky">
            <div className="sb-sky-track" />
          </div>
          <div className="sb-wedge sb-wedge-l" />
          <div className="sb-wedge sb-wedge-r" />
          <div className="sb-rays" />
          <div className="sb-helm">
            <ShipWheel />
            <HelmRing />
          </div>
          <div className="sb-dots sb-dots-l" />
          <div className="sb-dots sb-dots-r" />
          <div className="sb-beam sb-beam-l" />
          <div className="sb-beam sb-beam-r" />

          <div className="sb-sea">
            <div className="sb-sea-track" />
          </div>
          <div className="sb-sea-tint" />
          <div className="sb-horizon" />
          <div className="sb-mist sb-mist-l" />
          <div className="sb-mist sb-mist-r" />

          {HEROES.map((h) => (
            <HeroCutout key={h.id} {...h}>
              {h.id === 'kadita' ? <div className="sb-orb" /> : null}
              {h.id === 'claude' ? (
                <div className="sb-muzzle">
                  <span className="sb-muzzle-core" />
                  <span className="sb-muzzle-flare" />
                </div>
              ) : null}
            </HeroCutout>
          ))}
        </div>

        <Particles />

        <div className="sb-birds" aria-hidden>
          {BIRDS.map((b, i) => (
            <span
              key={i}
              className="sb-bird"
              style={
                {
                  left: b.x,
                  top: b.y,
                  '--s': b.s,
                  animationDuration: `${b.d}s`,
                  animationDelay: `${b.delay}s`,
                } as CSSProperties
              }
            >
              <svg viewBox="0 0 40 16">
                <path d="M0 8 Q10 0 20 8 Q30 0 40 8 Q30 4 20 11 Q10 4 0 8Z" />
              </svg>
            </span>
          ))}
        </div>

        {/* ——— Corner copy ——— */}
        <CornerLines className="sb-corner sb-corner-tl" lines={TL_LINES} />
        <CornerLines className="sb-corner sb-corner-tr" lines={TR_LINES} />
        <CornerLines className="sb-side sb-side-l" lines={['BLUE', 'SIDE', 'SAIL FURTHER']} />
        <CornerLines className="sb-side sb-side-r" lines={['RED', 'SIDE', 'RISE HIGHER']} />

        {/* ——— Seals + event line ——— */}
        <div className="sb-seals">
          {SEALS.map((seal, i) => (
            <span
              key={seal.id}
              className={`sb-seal sb-seal-${seal.size}`}
              style={{ animationDelay: `${i * -1.3}s` }}
            >
              <span className="sb-seal-ring" />
              <span className="sb-seal-face">
                <img src={seal.src} alt={seal.alt} draggable={false} />
                <span className="sb-seal-glint" />
              </span>
            </span>
          ))}
        </div>

        <div className="sb-event">
          <span className="sb-event-line" />
          <span className="sb-event-text">CME ML TOURNAMENT</span>
          <span className="sb-event-line is-right" />
        </div>
        <div className="sb-event-anchor">
          <AnchorIcon />
        </div>

        {/* ——— Title plate ——— */}
        <TitlePlate pillText={pillText} />

        {/* ——— Tagline ——— */}
        <div className="sb-tagline">
          <Letters text="SAME OCEAN" offset={0} />
          <span className="sb-tagline-anchor">
            <AnchorIcon />
          </span>
          <Letters text="HIGHER DREAMS" offset={10} />
        </div>

        {/* ——— Footer ——— */}
        <footer className="sb-footer">
          <div className="sb-footer-line" />
          <div className="sb-footer-left">
            <span className="sb-footer-label">FOLLOW THE VOYAGE</span>
            <span className="sb-footer-sep" />
            <span className="sb-socials">
              <SocialIcon kind="youtube" />
              <SocialIcon kind="facebook" />
              <SocialIcon kind="x" />
              <SocialIcon kind="tiktok" />
            </span>
            <span className="sb-footer-handle">@YOUNGSAILORSCLUB</span>
          </div>
          <div className="sb-footer-right">
            <span className="sb-footer-sep" />
            <span className="sb-footer-rotator">
              <span>BATTLES TODAY&nbsp;&nbsp;A BRIGHTER TOMORROW</span>
              <span>SAME OCEAN&nbsp;&nbsp;HIGHER DREAMS</span>
              <span>MORE THAN A GAME&nbsp;&nbsp;A STRONGER CREW</span>
            </span>
            <span className="sb-footer-dash" />
          </div>
        </footer>

        <div className="sb-sweep" aria-hidden />
        <div className="sb-vignette" aria-hidden />
        <div className="sb-grain" aria-hidden />
      </div>
    </div>
  )
}

function TitlePlate({ pillText }: { pillText: string }) {
  const outline =
    'M285 8 L835 8 L868 41 L868 80 L1055 80 L1105 130 L1105 305 L1055 355 L65 355 L15 305 L15 130 L65 80 L252 80 L252 41 Z'
  const pill = 'M275 337 L845 337 L880 368 L845 399 L275 399 L240 368 Z'
  return (
    <div className="sb-plate">
      <svg className="sb-plate-svg" viewBox="0 0 1120 410" aria-hidden>
        <defs>
          <linearGradient id="sb-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0a2466" />
            <stop offset="0.5" stopColor="#081535" />
            <stop offset="1" stopColor="#3a0a1c" />
          </linearGradient>
          <linearGradient id="sb-fill-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="sb-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2f8cff" />
            <stop offset="0.42" stopColor="#8fc4ff" />
            <stop offset="0.58" stopColor="#ff9aa6" />
            <stop offset="1" stopColor="#ff2a44" />
          </linearGradient>
          <filter id="sb-glow" x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <path d={outline} className="sb-plate-glow" stroke="url(#sb-edge)" filter="url(#sb-glow)" />
        <path d={outline} fill="url(#sb-fill)" />
        <path d={outline} fill="url(#sb-fill-v)" />
        <path d={outline} className="sb-plate-edge" stroke="url(#sb-edge)" />
        <path
          d="M40 138 L78 100 L1042 100 L1080 138 L1080 297 L1042 335 L78 335 L40 297 Z"
          className="sb-plate-inner"
        />
        <path d={outline} className="sb-plate-run" pathLength={1000} />
        <path d={outline} className="sb-plate-run is-late" pathLength={1000} />

        <path d={pill} className="sb-plate-glow" stroke="url(#sb-edge)" filter="url(#sb-glow)" />
        <path d={pill} fill="#07122e" />
        <path d={pill} fill="url(#sb-fill)" opacity="0.7" />
        <path d={pill} className="sb-plate-edge" stroke="url(#sb-edge)" />
        <path d={pill} className="sb-plate-run is-pill" pathLength={1000} />
      </svg>

      <div className="sb-live">
        <span className="sb-live-dot" />
        <span className="sb-live-word">
          <span className="sb-live-glow" aria-hidden>
            LIVE
          </span>
          <span className="sb-live-text">LIVE</span>
        </span>
      </div>

      <h1 className="sb-title">
        <span className="sb-title-glow" aria-hidden>
          STARTING SOON
        </span>
        <span className="sb-title-text">STARTING SOON</span>
        <span className="sb-title-glitch is-c" aria-hidden>
          STARTING SOON
        </span>
        <span className="sb-title-glitch is-m" aria-hidden>
          STARTING SOON
        </span>
      </h1>

      <div className="sb-subtitle">
        <span>YOUNG SAILORS CLUB</span>
        <i className="sb-subtitle-dot" />
        <span>MARITIME ML TOURNAMENT</span>
      </div>

      <div className="sb-pill">
        <span className="sb-chev sb-chev-l">
          <b>›</b>
          <b>›</b>
          <b>›</b>
        </span>
        <span className="sb-pill-text" key={pillText.startsWith('STREAM BEGINS IN') ? 'cd' : pillText}>
          {pillText}
        </span>
        <span className="sb-chev sb-chev-r">
          <b>‹</b>
          <b>‹</b>
          <b>‹</b>
        </span>
      </div>
    </div>
  )
}

function CornerLines({ className, lines }: { className: string; lines: string[] }) {
  return (
    <div className={className}>
      <span className="sb-corner-bar" />
      {lines.map((line, i) => (
        <span key={line} className="sb-corner-line" style={{ animationDelay: `${i * 0.6}s` }}>
          {line}
        </span>
      ))}
    </div>
  )
}

function Letters({ text, offset }: { text: string; offset: number }) {
  return (
    <span className="sb-letters">
      {[...text].map((ch, i) => (
        <span key={i} style={{ animationDelay: `${(i + offset) * 0.12}s` }}>
          {ch === ' ' ? '\u00a0' : ch}
        </span>
      ))}
    </span>
  )
}

function AnchorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <AnchorPaths />
    </svg>
  )
}

function HelmRing() {
  const ticks = Array.from({ length: 48 }, (_, i) => i)
  return (
    <svg viewBox="-220 -220 440 440" className="sb-helm-svg">
      <g className="sb-helm-spin">
        <circle r="205" className="sb-helm-dash" />
        {ticks.map((i) => (
          <line
            key={i}
            x1="0"
            y1={i % 4 === 0 ? -214 : -209}
            x2="0"
            y2="-200"
            transform={`rotate(${i * 7.5})`}
          />
        ))}
      </g>
      <g className="sb-helm-spin-rev">
        <circle r="186" className="sb-helm-thin" />
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d="M0 -196 L6 -184 L-6 -184 Z" transform={`rotate(${a + 45})`} />
        ))}
      </g>
    </svg>
  )
}

function HeroCutout({
  id,
  name,
  src,
  side,
  children,
}: (typeof HEROES)[number] & { children?: ReactNode }) {
  return (
    <div
      className={`sb-hero sb-hero-${id} is-${side}`}
      style={{ '--img': `url("${src}")` } as CSSProperties}
      title={name}
    >
      <img src={src} alt={name} draggable={false} decoding="async" />
      <span className="sb-hero-tint" />
      <span className="sb-hero-shine" />
      {children}
    </div>
  )
}

function ShipWheel() {
  const spokes = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg viewBox="-220 -220 440 440" className="sb-wheel">
      <g className="sb-wheel-spin">
        {spokes.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x="-5" y="-176" width="10" height="150" rx="4" />
            <path d="M0 -214 C9 -214 11 -204 9 -196 L6 -178 L-6 -178 L-9 -196 C-11 -204 -9 -214 0 -214Z" />
          </g>
        ))}
        <circle r="150" className="sb-wheel-rim" />
        <circle r="134" className="sb-wheel-rim is-inner" />
        <circle r="36" className="sb-wheel-hub" />
      </g>
      <g className="sb-wheel-anchor" transform="translate(-60 -60) scale(5)">
        <AnchorPaths />
      </g>
    </svg>
  )
}

function AnchorPaths() {
  return (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.5V21M7 10h10M4 14c0 4 3.6 7 8 7s8-3 8-7M4 14l-1.5 1.8M4 14l2 1.2M20 14l1.5 1.8M20 14l-2 1.2" />
    </>
  )
}

function WaterFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="sb-water-fx" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.05" numOctaves="2" seed="4" result="n">
          <animate
            attributeName="baseFrequency"
            dur="14s"
            values="0.006 0.05;0.009 0.07;0.006 0.05"
            repeatCount="indefinite"
          />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

type SocialKind = 'youtube' | 'facebook' | 'x' | 'tiktok'

function SocialIcon({ kind }: { kind: SocialKind }) {
  const paths: Record<SocialKind, string> = {
    youtube:
      'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z',
    facebook:
      'M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.6v-7h-2.3v-2.7h2.3v-2c0-2.3 1.4-3.6 3.5-3.6l2.1.1v2.4h-1.4c-1.1 0-1.4.5-1.4 1.3v1.8h2.7l-.4 2.7h-2.3v7H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Z',
    x: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
    tiktok:
      'M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9a7.3 7.3 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5Z',
  }
  return (
    <span className="sb-social">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={paths[kind]} />
      </svg>
    </span>
  )
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  max: number
  hue: 'blue' | 'red' | 'white'
}

const PARTICLE_COLORS = {
  blue: '120, 190, 255',
  red: '255, 90, 90',
  white: '235, 245, 255',
} as const

function spawn(p?: Particle): Particle {
  const roll = Math.random()
  const hue: Particle['hue'] = roll < 0.42 ? 'blue' : roll < 0.84 ? 'red' : 'white'
  const x =
    hue === 'blue'
      ? Math.random() * 720
      : hue === 'red'
        ? STAGE_W - Math.random() * 720
        : 560 + Math.random() * 800
  const next = p ?? ({} as Particle)
  next.x = x
  next.y = STAGE_H - 60 - Math.random() * 260
  next.vx = (hue === 'blue' ? 0.25 : hue === 'red' ? -0.25 : 0) + (Math.random() - 0.5) * 0.5
  next.vy = -(0.35 + Math.random() * 1.1)
  next.r = 0.8 + Math.random() * 2.4
  next.life = 0
  next.max = 260 + Math.random() * 420
  next.hue = hue
  return next
}

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const parts: Particle[] = Array.from({ length: 140 }, () => {
      const p = spawn()
      p.life = Math.random() * p.max
      p.y -= p.life * -p.vy
      return p
    })
    let raf = 0
    let t = 0
    const tick = () => {
      t += 1
      ctx.clearRect(0, 0, STAGE_W, STAGE_H)
      ctx.globalCompositeOperation = 'lighter'
      for (const p of parts) {
        p.life += 1
        p.x += p.vx + Math.sin((p.life + p.r * 40) / 38) * 0.35
        p.y += p.vy
        if (p.life > p.max || p.y < -20) spawn(p)
        const k = p.life / p.max
        const alpha = Math.sin(Math.PI * k) * (0.55 + 0.45 * Math.sin(t / 9 + p.r * 3))
        const c = PARTICLE_COLORS[p.hue]
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `rgba(${c}, ${alpha})`)
        g.addColorStop(1, `rgba(${c}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="sb-particles" width={STAGE_W} height={STAGE_H} aria-hidden />
}
