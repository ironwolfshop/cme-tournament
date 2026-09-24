import { useEffect, useRef } from 'react'
import { heroLocalSplashUrl } from '../../data/heroes'
import { fitPortrait } from '../../lib/portraitFit'
import { usePortraitMetrics } from '../../lib/usePortraitMetrics'
import { INSTITUTION_LOGOS } from '../cme/InstitutionLogos'
import {
  useLineupStore,
  type LineupPlayer,
  type LineupTeam,
  type RevealLayout,
  type RevealTemplate,
} from '../../store/lineupStore'
import '../../styles/sea-games-cards.css'

type Props = {
  /** When true, scales to fill a preview shell instead of OBS fullscreen. */
  preview?: boolean
  selectedIndex?: number | null
  /**
   * Render a team without touching the live lineup store
   * (used by Tournament → Lineup scene).
   */
  teamOverride?: LineupTeam
  /** Defaults to all players when teamOverride is set. */
  revealedOverride?: number
  sceneOverride?: {
    sceneTitle?: string
    introLabel?: string
    subtitle?: string
    accent?: string
    layout?: RevealLayout
    template?: RevealTemplate
    sponsorRight?: string
  }
}

export default function TeamRevealStage({
  preview = false,
  selectedIndex = null,
  teamOverride,
  revealedOverride,
  sceneOverride,
}: Props) {
  const store = useLineupStore()
  const team = teamOverride ?? store[store.editSide]
  const revealed =
    revealedOverride ??
    (teamOverride ? team.players.length : store.revealed)
  const layout = sceneOverride?.layout ?? store.layout
  const template = sceneOverride?.template ?? store.template
  const prevReveal = useRef(revealed)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      prevReveal.current = revealed
    })
    return () => window.cancelAnimationFrame(id)
  }, [revealed])

  const teamName = team.teamName.trim() || team.teamTag || 'YOUR TEAM'
  const title =
    (sceneOverride?.sceneTitle ?? store.sceneTitle).trim() || 'Season 8'
  const eventTitle =
    (sceneOverride?.introLabel ?? store.introLabel).trim() ||
    'CME ML TOURNAMENT'
  const caption =
    (sceneOverride?.subtitle ?? store.subtitle).trim() || 'OFFICIAL ROSTER'
  const division =
    (sceneOverride?.sponsorRight ?? store.sponsorRight).trim() ||
    "MEN'S DIVISION"
  const accentRaw = sceneOverride?.accent ?? store.accent
  const accent = /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : '#ef591f'

  const shellClass = `cme-reveal${preview ? ' studio-preview' : ' lu-shell'}`

  if (template === 'cards') {
    return (
      <div className={shellClass}>
        <div className="lu-stage-wrap">
          <CardsRosterScene
            team={team}
            teamName={teamName}
            title={title}
            eventTitle={eventTitle}
            caption={caption}
            division={division}
            revealed={revealed}
            prevReveal={prevReveal.current}
            selectedIndex={selectedIndex}
            preview={preview}
          />
        </div>
      </div>
    )
  }

  const slots = lineupSlots(layout, team.players)
  const sideKey = teamOverride
    ? team.sourceTeamId || team.teamTag || 'preview'
    : store.editSide

  const teamFont = Math.min(21, 150 / Math.max(5, teamName.length))
  const titleFont = Math.min(6.1, 125 / Math.max(12, title.length))

  return (
    <div className={shellClass}>
      <div className="lu-stage-wrap">
        <div
          className="scene"
          style={{ ['--accent' as string]: accent }}
          aria-label="Team roster scene"
        >
          <div className="backdrop" />
          <div className="texture" />
          <div className="lu-light" aria-hidden />
          <div className="lu-sky-panel lu-sky-left" aria-hidden>
            <div className="lu-sky-edge" />
            <div className="lu-sky-body">
              <img src={heroLocalSplashUrl('kadita')} alt="" />
            </div>
          </div>
          <div className="lu-sky-panel lu-sky-right" aria-hidden>
            <div className="lu-sky-edge" />
            <div className="lu-sky-body">
              <img src={heroLocalSplashUrl('valir')} alt="" />
            </div>
          </div>
          <div className="lu-shards" aria-hidden>
            {SHARDS.map((s, i) => (
              <span
                key={i}
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  width: `${s.w}cqw`,
                  height: `${s.w * 1.7}cqw`,
                  ['--rot' as string]: `${s.r}deg`,
                  animationDelay: `${s.d}s`,
                }}
              />
            ))}
          </div>
          <div className="lu-embers" aria-hidden>
            {EMBERS.map((e) => (
              <span
                key={e.id}
                style={{
                  left: `${e.left}%`,
                  width: `${e.size}cqw`,
                  height: `${e.size}cqw`,
                  animationDuration: `${e.duration}s`,
                  animationDelay: `${e.delay}s`,
                  ['--drift' as string]: `${e.drift}cqw`,
                }}
              />
            ))}
          </div>
          <div className="stage-logo">
            {team.teamLogo ? (
              <img src={team.teamLogo} alt="" />
            ) : (
              <div className="default-mark">
                CME<small>MLBB</small>
              </div>
            )}
          </div>
          <div className="stage-top-right">{eventTitle}</div>
          <div className="stage-team" style={{ fontSize: `${teamFont}cqw` }}>
            {teamName}
          </div>
          <div className="stage-title" style={{ fontSize: `${titleFont}cqw` }}>
            {title}
          </div>
          <div className="player-stage">
            {slots.map((s) => {
              const p = team.players[s.index]!
              const visible = s.index < revealed
              const justIn = visible && s.index >= prevReveal.current
              return (
                <LineupPortrait
                  key={`${sideKey}-${s.index}`}
                  slot={s}
                  src={
                    visible && p.photo
                      ? p.photo
                      : placeholderPortrait(p, s.index, !visible)
                  }
                  empty={!(visible && p.photo)}
                  visible={visible}
                  justIn={justIn}
                  selected={selectedIndex === s.index}
                  leader={p.isLeader}
                  flip={p.flip}
                  alt={visible ? p.name || 'Player' : 'Unrevealed'}
                />
              )
            })}
          </div>
          <div className="stage-fade" />
          <div className="stage-cast lu-cast">
            {slots.map((s) => {
              const p = team.players[s.index]!
              const visible = s.index < revealed
              const nameSize = Math.min(
                team.players.length > 8 ? 1.45 : 1.85,
                ((s.spacing / STAGE_W) * 100 * 1.9) /
                  Math.max(5, (p.ign.trim() || p.name || 'PLAYER').length),
              )
              return (
                <div
                  key={`cast-${s.index}`}
                  className={`cast-label${visible ? '' : ' hidden'}${
                    p.isLeader ? ' is-leader' : ''
                  }`}
                  style={{
                    left: `${(s.cx / STAGE_W) * 100}%`,
                    width: `${((s.spacing - 14) / STAGE_W) * 100}%`,
                    animationDelay: `${s.slot * 0.35}s`,
                  }}
                >
                  <span className="lane-icon" aria-hidden>
                    <LaneGlyph role={p.subtitle} leader={p.isLeader} />
                  </span>
                  <strong
                    className="cast-name"
                    style={{ fontSize: `${nameSize}cqw` }}
                  >
                    {visible
                      ? (p.ign.trim() || p.name.trim() || '—')
                      : '???'}
                  </strong>
                  <span className={`cast-role${p.isLeader ? ' is-leader' : ''}`}>
                    {visible
                      ? p.isLeader
                        ? p.ign.trim() && p.name.trim()
                          ? `Leader · ${p.name.trim()}`
                          : 'Team Leader'
                        : p.ign.trim() && p.name.trim() && p.ign.trim() !== p.name.trim()
                          ? p.name.trim()
                          : p.subtitle.trim() || laneFallback(s.index)
                      : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="stage-bottom">
            <span>{caption}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CardsRosterScene({
  team,
  teamName,
  title,
  eventTitle,
  caption,
  division,
  revealed,
  prevReveal,
  selectedIndex,
}: {
  team: LineupTeam
  teamName: string
  title: string
  eventTitle: string
  caption: string
  division: string
  revealed: number
  prevReveal: number
  selectedIndex: number | null
  preview: boolean
}) {
  const tag = (team.teamTag || 'CME').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CME'
  const rail = `${eventTitle} · ${teamName}`.toUpperCase()
  const headline = title.trim() || `${teamName} Team`
  const footerMain = (caption.trim() || 'MOBILE LEGENDS FINAL ROSTER').toUpperCase()
  const count = Math.max(1, team.players.length)
  const watermarkFont = Math.min(17, 150 / Math.max(6, teamName.length))
  const headlineFont = Math.min(5.4, 110 / Math.max(10, headline.length))

  const carousel = [
    ...INSTITUTION_LOGOS.map((logo) => ({
      src: logo.src,
      label:
        logo.id === 'cme'
          ? 'CME'
          : logo.id === 'zscmst'
            ? 'ZSCMST'
            : 'Young Sailors Club',
    })),
    ...(team.teamLogo ? [{ src: team.teamLogo, label: teamName }] : []),
  ]

  return (
    <div className="scene scene-cards" aria-label="SEA Games card roster">
      <div className="sg-bg" aria-hidden />
      <div className="sg-sun" aria-hidden>
        <i className="sg-sun-core" />
        <i className="sg-sun-ring" />
        <i className="sg-sun-rays" />
      </div>
      <div className="sg-grid" aria-hidden />
      <div className="sg-panel sg-panel-left" aria-hidden>
        <div className="sg-panel-edge" />
        <div className="sg-panel-body">
          <img src={heroLocalSplashUrl('kadita')} alt="" />
        </div>
      </div>
      <div className="sg-panel sg-panel-right" aria-hidden>
        <div className="sg-panel-edge" />
        <div className="sg-panel-body">
          <img src={heroLocalSplashUrl('valir')} alt="" />
        </div>
      </div>
      <div className="sg-watermark" style={{ fontSize: `${watermarkFont}cqw` }} aria-hidden>
        {teamName}
      </div>
      <div className="sg-shards" aria-hidden>
        {SHARDS.map((s, i) => (
          <span
            key={i}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.w}cqw`,
              height: `${s.w * 1.7}cqw`,
              ['--rot' as string]: `${s.r}deg`,
              animationDelay: `${s.d}s`,
            }}
          />
        ))}
      </div>
      <div className="sg-embers" aria-hidden>
        {EMBERS.map((e) => (
          <span
            key={e.id}
            style={{
              left: `${e.left}%`,
              width: `${e.size}cqw`,
              height: `${e.size}cqw`,
              animationDuration: `${e.duration}s`,
              animationDelay: `${e.delay}s`,
              ['--drift' as string]: `${e.drift}cqw`,
            }}
          />
        ))}
      </div>
      <div className="sg-rail sg-rail-left" aria-hidden>
        <div className="sg-rail-track">
          <span>{rail}</span>
          <span>{rail}</span>
        </div>
      </div>
      <div className="sg-rail sg-rail-right" aria-hidden>
        <div className="sg-rail-track">
          <span>{rail}</span>
          <span>{rail}</span>
        </div>
      </div>

      <header className="cards-header">
        <div className="cards-logo cards-logo-left">
          <span className="sg-logo-ring" aria-hidden />
          {team.teamLogo ? (
            <img src={team.teamLogo} alt="" />
          ) : (
            <div className="cards-logo-fallback">CME</div>
          )}
        </div>
        <div className="sg-head-center">
          <p className="sg-eyebrow">
            <i />
            <span>SEA GAMES · SIBOL</span>
            <i />
          </p>
          <p className="sg-event">{eventTitle}</p>
          <h1 className="cards-headline" style={{ fontSize: `${headlineFont}cqw` }}>
            {headline}
          </h1>
        </div>
        <div className="cards-logo cards-logo-right">
          <span className="sg-logo-ring" aria-hidden />
          <div className="cards-logo-fallback cards-logo-sibol">
            <strong>{tag}</strong>
            <small>POWERED BY CME</small>
          </div>
        </div>
      </header>

      <div
        className="cards-row"
        style={{ ['--card-count' as string]: String(count) }}
      >
        {team.players.map((p, index) => {
          const visible = index < revealed
          const justIn = visible && index >= prevReveal
          const isCoach = /coach/i.test(p.subtitle)
          const handle = cardHandle(p.ign || p.name, index)
          const nick = isCoach
            ? 'Coach'
            : p.ign.trim()
              ? p.name.trim() || p.subtitle.trim() || laneFallback(index)
              : cardNick(p) || laneFallback(index)
          const role = isCoach ? 'Coach' : p.isLeader ? 'Leader' : p.subtitle.trim() || laneFallback(index)
          return (
            <article
              key={`card-${index}`}
              className={`roster-card${visible ? '' : ' is-hidden'}${
                selectedIndex === index ? ' is-selected' : ''
              }${justIn ? ' reveal-in' : ''}${isCoach ? ' is-coach' : ''}${
                p.isLeader ? ' is-leader' : ''
              }`}
              style={{ ['--i' as string]: String(index) }}
            >
              <div className="sg-card-float">
                {p.isLeader && <span className="sg-card-aura" aria-hidden />}
                <div className="roster-card-frame">
                  <div className="roster-card-photo">
                    <div className="sg-card-bg" aria-hidden />
                    <div className="sg-card-cme" aria-hidden>
                      <span>C</span>
                      <span>M</span>
                      <span>E</span>
                    </div>
                    <div className="sg-card-mark" aria-hidden>
                      {tag}
                    </div>
                    <img
                      src={
                        visible && p.photo
                          ? p.photo
                          : placeholderPortrait(p, index, !visible)
                      }
                      alt={visible ? p.name || 'Player' : 'Unrevealed'}
                      className={
                        visible && p.photo ? undefined : 'is-empty-slot'
                      }
                      style={{
                        transform: `scale(${p.scale}) scaleX(${p.flip ? -1 : 1})`,
                      }}
                    />
                    <div className="roster-card-fade" />
                    <div className="sg-card-scan" aria-hidden />
                    <div className="sg-card-shine" aria-hidden />
                    <span className="sg-card-tick tl" />
                    <span className="sg-card-tick tr" />
                    <span className="sg-card-tick bl" />
                    <span className="sg-card-tick br" />
                  </div>
                  <div className="sg-card-top">
                    <span className="sg-card-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="sg-card-lane" title={role}>
                      <LaneGlyph role={p.subtitle} leader={p.isLeader} />
                    </span>
                  </div>
                  <div className="roster-card-meta">
                    {isCoach ? (
                      <span className="roster-card-coach">COACH</span>
                    ) : p.isLeader ? (
                      <span className="roster-card-coach">TEAM LEADER</span>
                    ) : (
                      <span className="roster-card-coach is-role">{role}</span>
                    )}
                    <p className="roster-card-ign">
                      {visible ? (
                        <>
                          <span className="roster-card-prefix">{tag}.</span>
                          <span className="roster-card-handle">{handle}</span>
                        </>
                      ) : (
                        <span className="roster-card-handle">???</span>
                      )}
                    </p>
                    <span className="roster-card-nick">
                      {visible ? nick : 'Revealing soon'}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="sg-waves" aria-hidden />
      <div className="sg-floor" aria-hidden />

      <footer className="cards-footer">
        <div className="cards-footer-sponsors cards-footer-left">
          <img src="/logos/cme.png" alt="" />
          <span>
            ORGANIZED BY
            <strong>CME</strong>
          </span>
        </div>
        <div className="cards-footer-center">
          <p className="cards-footer-outline">{footerMain}</p>
          <p className="cards-footer-division">{division.toUpperCase()}</p>
          <div className="sg-carousel" aria-hidden>
            <div className="sg-carousel-track">
              {[0, 1].map((run) => (
                <div key={run} className="sg-carousel-run">
                  {carousel.map((item, i) => (
                    <span key={`${run}-${i}`}>
                      <img src={item.src} alt="" />
                      <b>{item.label}</b>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="cards-footer-sponsors cards-footer-right">
          <span>
            POWERED BY
            <strong>CME ML</strong>
          </span>
          <span className="sg-seals">
            {INSTITUTION_LOGOS.map((logo) => (
              <img key={logo.id} src={logo.src} alt={logo.alt} />
            ))}
          </span>
        </div>
      </footer>
    </div>
  )
}

/** Classic scene is authored at 1920×1080; slots are converted to % so the studio preview scales. */
const STAGE_W = 1920
const STAGE_H = 1080
const FRAME_TOP = 190
const FRAME_BOTTOM = 965

type LineupSlot = {
  index: number
  /** Position left→right. */
  slot: number
  /** Steps away from the center slot. */
  depth: number
  cx: number
  spacing: number
  frameW: number
  frameH: number
  frameTop: number
  headTop: number
  headHeight: number
  z: number
}

const SHARDS = [
  { left: 14, top: 8, w: 2.6, r: 18, d: 0 },
  { left: 30, top: 30, w: 1.4, r: -24, d: -2 },
  { left: 70, top: 26, w: 1.8, r: 30, d: -4 },
  { left: 86, top: 10, w: 2.2, r: -16, d: -1 },
  { left: 6, top: 48, w: 1.6, r: 22, d: -3 },
  { left: 93, top: 46, w: 1.5, r: -30, d: -5 },
  { left: 60, top: 6, w: 1.1, r: 40, d: -6 },
]

const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: (i * 41.7 + 5) % 100,
  size: 0.18 + ((i * 7) % 5) * 0.07,
  duration: 8 + ((i * 11) % 8),
  delay: -((i * 1.9) % 14),
  drift: ((i * 23) % 6) - 3,
}))

/**
 * Even, symmetric roster: leader in the center, the rest split left/right.
 * `layered` steps outer players back (smaller, lower); `lineup` keeps one row.
 */
function lineupSlots(layout: RevealLayout, players: LineupPlayer[]): LineupSlot[] {
  const n = players.length
  if (!n) return []
  const all = players.map((_, i) => i)
  const leader = all.find((i) => players[i]!.isLeader)
  let order = all
  if (leader !== undefined) {
    const rest = all.filter((i) => i !== leader)
    const half = Math.floor(rest.length / 2)
    order = [...rest.slice(0, half), leader, ...rest.slice(half)]
  }

  const spacing = Math.min(360, 1720 / n)
  const baseHead = Math.min(236, spacing * 0.64)
  const mid = (n - 1) / 2
  const frameH = FRAME_BOTTOM - FRAME_TOP

  return order.map((index, slot) => {
    const p = players[index]!
    const depth = Math.abs(slot - mid)
    const tier = layout === 'layered' ? depth : 0
    const leaderBoost = p.isLeader ? 1.08 : 1
    const headHeight = baseHead * (1 - 0.07 * tier) * leaderBoost * p.scale
    const headTop = 118 + tier * 26 - (p.isLeader ? 14 : 0)
    const cx = STAGE_W / 2 + (slot - mid) * spacing + (p.x / 100) * STAGE_W
    const lift = (p.y / 100) * STAGE_H
    return {
      index,
      slot,
      depth,
      cx,
      spacing,
      frameW: spacing * 2,
      frameH,
      frameTop: FRAME_TOP - lift,
      headTop,
      headHeight,
      z: p.isLeader ? 60 : 50 - Math.round(depth * 2),
    }
  })
}

function LineupPortrait({
  slot,
  src,
  empty,
  visible,
  justIn,
  selected,
  leader,
  flip,
  alt,
}: {
  slot: LineupSlot
  src: string
  empty: boolean
  visible: boolean
  justIn: boolean
  selected: boolean
  leader: boolean
  flip: boolean
  alt: string
}) {
  const metrics = usePortraitMetrics(src)
  const fit = metrics
    ? fitPortrait(metrics, {
        width: slot.frameW,
        height: slot.frameH,
        headTop: slot.headTop,
        headHeight: slot.headHeight,
        maxShift: 0.06,
      })
    : null
  const pctW = (v: number) => `${(v / slot.frameW) * 100}%`
  const pctH = (v: number) => `${(v / slot.frameH) * 100}%`

  return (
    <div
      className={`lu-slot${visible ? '' : ' hidden'}${selected ? ' is-selected' : ''}${
        justIn ? ' reveal-in' : ''
      }${leader ? ' is-leader' : ''}${metrics && !metrics.cutout && !empty ? ' is-framed' : ''}`}
      style={{
        left: `${((slot.cx - slot.frameW / 2) / STAGE_W) * 100}%`,
        top: `${(slot.frameTop / STAGE_H) * 100}%`,
        width: `${(slot.frameW / STAGE_W) * 100}%`,
        height: `${(slot.frameH / STAGE_H) * 100}%`,
        zIndex: slot.z,
        ['--idle-delay' as string]: `${slot.slot * -1.1}s`,
      }}
    >
      {leader ? <span className="lu-slot-aura" aria-hidden /> : null}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`${empty ? 'is-empty-slot' : ''}${fit ? ' is-ready' : ''}`}
        style={
          fit
            ? {
                left: pctW(fit.left),
                top: pctH(fit.top),
                width: pctW(fit.width),
                height: pctH(fit.height),
                transform: flip ? 'scaleX(-1)' : undefined,
              }
            : undefined
        }
      />
    </div>
  )
}

function cardHandle(name: string, index: number): string {
  const cleaned = name.trim()
  if (!cleaned) return `P${index + 1}`
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const last = (parts[parts.length - 1] || cleaned)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 14)
  return last || `P${index + 1}`
}

function cardNick(p: LineupPlayer): string {
  const role = p.subtitle.trim()
  if (
    role &&
    !/^(exp|jungle|mid|gold|roam|spare|substitute|coach|team\s*leader)/i.test(
      role,
    )
  ) {
    return role
  }
  const parts = p.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return parts[0]!
  return p.name.trim()
}

function laneFallback(index: number) {
  return ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'][index] ?? 'Player'
}

const LANE_ICON: Record<string, string> = {
  exp: '/lanes/exp.webp',
  jungle: '/lanes/jungle.webp',
  mid: '/lanes/mid.webp',
  gold: '/lanes/gold.webp',
  roam: '/lanes/roam.webp',
}

function laneKey(role: string): string | null {
  const r = role.toLowerCase().trim()
  if (!r) return null
  if (r === 'exp' || r.includes('exp')) return 'exp'
  if (r.includes('jung')) return 'jungle'
  if (r === 'mid' || r.includes('mid')) return 'mid'
  if (r.includes('gold') || r.includes('mm') || r.includes('marks')) return 'gold'
  if (r.includes('roam') || r.includes('support') || r.includes('tank'))
    return 'roam'
  return null
}

function LaneGlyph({
  role,
  leader = false,
}: {
  role: string
  leader?: boolean
}) {
  if (leader) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M3 18h18v2H3zM5 16l2.5-8 2.5 5 2-7 2 7 2.5-5L19 16H5z" />
      </svg>
    )
  }
  const r = role.toLowerCase()
  const lane = laneKey(role)
  if (lane && LANE_ICON[lane]) {
    return <img src={LANE_ICON[lane]} alt="" />
  }
  if (r.includes('coach')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 2h6v4H9V2m0 9h6m-6 4h6" />
      </svg>
    )
  }
  if (r.includes('sub') || r.includes('spare')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 7h15l-4-4m4 14H4l4 4M19 7l-4 4M4 17l4-4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20v-2a5 5 0 0 1 14 0v2" />
    </svg>
  )
}

/** Empty-slot silhouette art (1–6). Falls back to slot 1. */
export function emptySlotPortrait(index: number): string {
  const n = Math.min(6, Math.max(1, (index % 6) + 1))
  return `/placeholders/empty-slot-${n}.png`
}

function placeholderPortrait(p: LineupPlayer, index: number, dim = false) {
  void p
  void dim
  return emptySlotPortrait(index)
}
