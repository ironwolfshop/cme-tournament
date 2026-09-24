import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { initCasterSync, useCasterStore } from '../store/casterStore'
import '../styles/caster-overlay.css'

const STAGE_W = 1920
const STAGE_H = 1080

const SEALS = [
  { id: 'zscmst', src: '/logos/zscmst.png', alt: 'ZSCMST', size: 'sm' },
  { id: 'cme', src: '/logos/cme.png', alt: 'College of Maritime Education', size: 'lg' },
  { id: 'ysc', src: '/logos/young-sailors-club.png', alt: 'Young Sailors Club', size: 'sm' },
] as const

const TL_LINES = ['MORE', 'THAN', 'A GAME', 'A STRONGER', 'CREW']
const TR_LINES = ['OCEAN', 'UNITES', 'PLAYERS', 'CREATES', 'LEGENDS']

const FRAME_PATH =
  'M48 8 H1400 L1440 48 V528 L1400 568 H48 L8 528 V48 Z'

export default function CasterOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'
  const showTitle = useCasterStore((s) => s.showTitle)
  const caster1 = useCasterStore((s) => s.caster1)
  const caster2 = useCasterStore((s) => s.caster2)
  const shellRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const plates = [caster1, caster2].filter((c) => c.visible)
  const names = plates.map((p) => p.name.trim()).filter(Boolean)
  const roles = plates.map((p) => p.role.trim()).filter(Boolean)
  const title = names.length ? names.join('  ·  ') : showTitle.trim() || 'SHOUTCASTER'
  const subtitle = (roles.length ? roles.join(' / ') : 'Play-by-play / Analyst').toUpperCase()
  const longTitle = title.length > 22

  useEffect(() => {
    initCasterSync()
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    }
    const bg = preview ? '#050810' : 'transparent'
    html.style.background = bg
    body.style.background = bg
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [preview])

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

  return (
    <div className={`sc-shell${preview ? ' is-preview' : ''}`} ref={shellRef}>
      <div className={`overlay-root sc-stage${preview ? ' is-preview' : ''}`} ref={stageRef}>
        <div className="sc-world" aria-hidden>
          <div className="sc-world-photo" />
          <div className="sc-world-fog sc-world-fog-a" />
          <div className="sc-world-fog sc-world-fog-b" />
          <div className="sc-world-pulse" />
          <div className="sc-world-sweep" />
        </div>
        {preview ? <div className="sc-hole-fill" aria-hidden /> : null}

        <div className="sc-frame" aria-hidden>
          <svg className="sc-frame-svg" viewBox="0 0 1448 576" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sc-frame-edge" x1="0" y1="0.5" x2="1" y2="0.5">
                <stop offset="0" stopColor="#3d9cff" />
                <stop offset="0.18" stopColor="#9fd0ff" />
                <stop offset="0.5" stopColor="#ffffff" />
                <stop offset="0.82" stopColor="#ff9aa6" />
                <stop offset="1" stopColor="#ff2f47" />
              </linearGradient>
              <filter id="sc-frame-blur" x="-4%" y="-8%" width="108%" height="116%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <path className="sc-frame-glow-path" d={FRAME_PATH} filter="url(#sc-frame-blur)" />
            <path className="sc-frame-body-path" d={FRAME_PATH} />
            <path className="sc-frame-edge-path" d={FRAME_PATH} />
            <path className="sc-frame-run-path" d={FRAME_PATH} pathLength={1000} />
          </svg>
          <span className="sc-tick sc-tick-tl" />
          <span className="sc-tick sc-tick-bl" />
          <span className="sc-tick sc-tick-tr" />
          <span className="sc-tick sc-tick-br" />
        </div>

        <CornerLines className="sc-corner sc-corner-tl" lines={TL_LINES} />
        <CornerLines className="sc-corner sc-corner-tr" lines={TR_LINES} />

        <div className="sc-live">
          <span className="sc-live-dot" />
          <span className="sc-live-word">LIVE</span>
        </div>

        <header className="sc-head">
          <div className="sc-seals">
            {SEALS.map((seal, i) => (
              <span
                key={seal.id}
                className={`sc-seal sc-seal-${seal.size}`}
                style={{ animationDelay: `${i * -1.2}s` }}
              >
                <span className="sc-seal-ring" />
                <span className="sc-seal-face">
                  <img src={seal.src} alt={seal.alt} draggable={false} />
                  <span className="sc-seal-glint" />
                </span>
              </span>
            ))}
          </div>
          <div className="sc-event">
            <span className="sc-event-kicker">CME ML TOURNAMENT</span>
            <span className="sc-event-sub">
              YOUNG SAILORS CLUB <i /> SHOUTCASTER DESK
            </span>
          </div>
        </header>

        <div className="sc-stage-ring" aria-hidden />

        <div className={`sc-podium${longTitle ? ' is-long' : ''}`}>
          <div className="sc-podium-bar">
            <span className="sc-podium-anchor sc-podium-anchor-l">
              <AnchorIcon />
            </span>
            <span className="sc-podium-anchor sc-podium-anchor-r">
              <AnchorIcon />
            </span>
            <div className="sc-podium-copy">
              <h1 className="sc-podium-title">{title}</h1>
              <p className="sc-podium-role">{subtitle}</p>
            </div>
          </div>
        </div>

        <footer className="sc-footer">
          <div className="sc-footer-line" />
          <div className="sc-footer-left">
            <span className="sc-footer-label">FOLLOW THE VOYAGE</span>
            <span className="sc-footer-sep" />
            <span className="sc-socials">
              <SocialIcon kind="youtube" />
              <SocialIcon kind="facebook" />
              <SocialIcon kind="x" />
              <SocialIcon kind="tiktok" />
            </span>
            <span className="sc-footer-handle">@YOUNGSAILORSCLUB</span>
          </div>
          <div className="sc-footer-mid">
            <span className="sc-chev">
              <b>‹</b>
              <b>‹</b>
            </span>
            <span className="sc-footer-onair">MATCHDAY ON AIR</span>
            <span className="sc-chev">
              <b>›</b>
              <b>›</b>
            </span>
          </div>
          <div className="sc-footer-right">
            <span className="sc-footer-rotator">
              <span>BATTLES TODAY&nbsp;&nbsp;A BRIGHTER TOMORROW</span>
              <span>SAME OCEAN&nbsp;&nbsp;HIGHER DREAMS</span>
              <span>MORE THAN A GAME&nbsp;&nbsp;A STRONGER CREW</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CornerLines({ className, lines }: { className: string; lines: string[] }) {
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <span key={line} style={{ animationDelay: `${i * 0.55}s` }}>
          {line}
        </span>
      ))}
    </div>
  )
}

function AnchorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.5V21M7 10h10M4 14c0 4 3.6 7 8 7s8-3 8-7M4 14l-1.5 1.8M4 14l2 1.2M20 14l1.5 1.8M20 14l-2 1.2" />
    </svg>
  )
}

function SocialIcon({ kind }: { kind: 'youtube' | 'facebook' | 'x' | 'tiktok' }) {
  const paths = {
    youtube:
      'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z',
    facebook:
      'M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.6v-7h-2.3v-2.7h2.3v-2c0-2.3 1.4-3.6 3.5-3.6l2.1.1v2.4h-1.4c-1.1 0-1.4.5-1.4 1.3v1.8h2.7l-.4 2.7h-2.3v7H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Z',
    x: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
    tiktok:
      'M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9a7.3 7.3 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5Z',
  } as const
  return (
    <span className="sc-social">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={paths[kind]} />
      </svg>
    </span>
  )
}
