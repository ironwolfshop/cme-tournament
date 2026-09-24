import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FittedPortrait } from '../components/FittedPortrait'
import { InstitutionLogos } from '../components/cme/InstitutionLogos'
import { heroLocalSplashUrl } from '../data/heroes'
import type { PortraitFrame } from '../lib/portraitFit'
import {
  displayIgn,
  findTeamByIdentity,
  playerPhoto,
  resolveCaptain,
} from '../lib/teamView'
import {
  initGameplaySync,
  useGameplayStore,
  type TeamSide,
} from '../store/gameplayStore'
import {
  initTournamentSync,
  selectActiveProject,
  starterPlayers,
  useTournamentStore,
  type TournamentTeam,
} from '../store/tournamentStore'
import '../styles/cme-overrides.css'
import '../styles/victory-scene.css'

/** Must match `.vc-mvp-photo` / `.vc-loser-photo` placement in victory-scene.css. */
const MVP_FRAME: PortraitFrame = { width: 700, height: 600, headTop: 46, headHeight: 236 }
const LOSER_FRAME: PortraitFrame = { width: 380, height: 330, headTop: 34, headHeight: 132 }

const TAGLINES = ['Lead', 'Play', 'Dominate', 'Victory']

const SPARKS = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  left: (i * 29.3 + 3) % 100,
  size: 4 + ((i * 5) % 7),
  duration: 7 + ((i * 11) % 8),
  delay: -((i * 1.3) % 12),
  drift: ((i * 31) % 90) - 45,
  tone: i % 3 === 0 ? 'gold' : i % 3 === 1 ? 'blue' : 'white',
}))

const SHARDS = [
  { left: 300, top: 60, w: 70, h: 120, r: 18, d: 0 },
  { left: 820, top: 190, w: 40, h: 70, r: -24, d: -2 },
  { left: 1420, top: 150, w: 56, h: 96, r: 30, d: -4 },
  { left: 1760, top: 520, w: 46, h: 80, r: -16, d: -1 },
  { left: 60, top: 520, w: 50, h: 88, r: 22, d: -3 },
  { left: 1180, top: 760, w: 36, h: 60, r: -30, d: -5 },
  { left: 700, top: 820, w: 44, h: 74, r: 12, d: -2.5 },
  { left: 1600, top: 90, w: 30, h: 52, r: 40, d: -6 },
]

type TeamLite = { name: string; tag: string; logo: string; seriesScore: number }

function Mark({ team, className }: { team: TeamLite; className: string }) {
  return (
    <div className={className}>
      {team.logo ? <img src={team.logo} alt="" /> : <span>{team.tag.slice(0, 2)}</span>}
    </div>
  )
}

function findPlayerPhoto(
  tourney: TournamentTeam | null,
  p: { name?: string; ign?: string } | undefined,
) {
  if (!tourney || !p) return { photo: '', isLeader: false, name: '', ign: '' }
  const name = (p.name ?? '').trim().toLowerCase()
  const ign = (p.ign ?? '').trim().toLowerCase()
  const hit = tourney.players.find(
    (tp) =>
      (name && tp.name.trim().toLowerCase() === name) ||
      (ign && tp.ign.trim().toLowerCase() === ign),
  )
  return {
    photo: playerPhoto(hit ?? null),
    isLeader: hit?.isLeader === true,
    name: hit?.name.trim() ?? '',
    ign: hit?.ign.trim() ?? '',
  }
}

function Laurel({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={`vc-laurel${flip ? ' is-flip' : ''}`}
      viewBox="0 0 60 60"
      aria-hidden
    >
      <path d="M48 56C24 50 12 32 16 6" fill="none" strokeWidth="2.4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse
          key={i}
          cx={18 + i * 5.5}
          cy={12 + i * 9.5}
          rx="7"
          ry="3.2"
          transform={`rotate(${-50 + i * 12} ${18 + i * 5.5} ${12 + i * 9.5})`}
        />
      ))}
    </svg>
  )
}

export default function VictoryOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'

  const active = useTournamentStore(selectActiveProject)
  const blue = useGameplayStore((s) => s.blue)
  const red = useGameplayStore((s) => s.red)
  const winnerSide = useGameplayStore((s) => s.winnerSide)
  const mvpSide = useGameplayStore((s) => s.mvpSide)
  const mvpIndex = useGameplayStore((s) => s.mvpIndex)

  useEffect(() => {
    initGameplaySync()
    initTournamentSync()
    document.documentElement.style.background = preview ? '#07111f' : 'transparent'
    document.body.style.background = preview ? '#07111f' : 'transparent'
  }, [preview])

  const demo = params.get('demo') === '1'

  const victory = useMemo(() => {
    let side: TeamSide | null =
      winnerSide === 'blue' || winnerSide === 'red' ? winnerSide : null
    let blueT = blue
    let redT = red
    let mvpIdx = mvpIndex
    if (!side && demo) {
      const named = active.teams.filter((t) => t.name.trim())
      const withPhotos = named.filter((t) => t.players.some((p) => p.photo))
      const [a, b] = withPhotos.length >= 2 ? withPhotos : named
      if (!a || !b) return null
      const asGame = (t: TournamentTeam, score: number) => ({
        ...blue,
        name: t.name,
        tag: t.tag,
        logo: t.logo,
        seriesScore: score,
        players: starterPlayers(t.players).map((p) => ({
          heroId: null,
          level: 1,
          kills: 0,
          deaths: 0,
          assists: 0,
          gold: 0,
          items: [],
          name: p.name,
          ign: p.ign,
          photo: playerPhoto(p),
        })),
      })
      blueT = asGame(a, 2)
      redT = asGame(b, 0)
      side = 'blue'
      const cap = resolveCaptain(a.players)
      mvpIdx = Math.max(0, starterPlayers(a.players).findIndex((p) => p.id === cap?.id))
    }
    if (!side) return null
    const win = side === 'blue' ? blueT : redT
    const lose = side === 'blue' ? redT : blueT
    const winTourney = findTeamByIdentity(active.teams, win)
    const loseTourney = findTeamByIdentity(active.teams, lose)

    const mvpTeam = mvpSide === 'red' ? redT : mvpSide === 'blue' ? blueT : win
    const mvpTourney = mvpTeam === win ? winTourney : loseTourney
    const idx =
      typeof mvpIdx === 'number' && mvpIdx >= 0 && mvpIdx < 5 ? mvpIdx : 0
    const mvp = mvpTeam.players[idx] ?? win.players[0]
    const winCaptain = winTourney ? resolveCaptain(winTourney.players) : null
    const mvpNamed = Boolean(mvp?.name?.trim() || mvp?.ign?.trim())
    const mvpPick =
      mvpNamed || !winCaptain
        ? mvp
        : { name: winCaptain.name, ign: winCaptain.ign, photo: playerPhoto(winCaptain) }
    const mvpMatch = findPlayerPhoto(mvpNamed ? mvpTourney : winTourney, mvpPick)
    const mvpName = mvpPick?.name?.trim() || mvpMatch.name
    const mvpIgn = mvpPick?.ign?.trim() || mvpMatch.ign

    const loseCaptain = loseTourney ? resolveCaptain(loseTourney.players) : null
    const loseGameCaptain = loseCaptain
      ? undefined
      : lose.players.find((p) => p.photo) ?? lose.players[0]

    const lite = (t: typeof blue, tt: TournamentTeam | null): TeamLite => ({
      name: t.name.trim() || tt?.name || t.tag || 'TEAM',
      tag: t.tag.trim() || tt?.tag || 'TEAM',
      logo: t.logo || tt?.logo || '',
      seriesScore: t.seriesScore,
    })

    return {
      win: lite(win, winTourney),
      lose: lite(lose, loseTourney),
      mvp: {
        label: displayIgn(mvpName, mvpIgn),
        name: mvpName,
        photo: mvpPick?.photo || mvpMatch.photo,
        isCaptain: mvpMatch.isLeader,
        teamName:
          mvpNamed && mvpTeam !== win
            ? lite(lose, loseTourney).name
            : lite(win, winTourney).name,
      },
      loser: {
        label: loseCaptain
          ? displayIgn(loseCaptain.name, loseCaptain.ign)
          : displayIgn(loseGameCaptain?.name ?? '', loseGameCaptain?.ign ?? ''),
        photo: loseCaptain ? playerPhoto(loseCaptain) : loseGameCaptain?.photo ?? '',
      },
    }
  }, [winnerSide, mvpSide, mvpIndex, blue, red, active.teams, demo])

  return (
    <div className={`overlay-root victory-scene${preview ? ' is-preview' : ''}`}>
      <div className="vc-bg" aria-hidden />
      <div className="vc-rays" aria-hidden />

      <div className="vc-panel vc-panel-win" aria-hidden>
        <div className="vc-panel-edge" />
        <div className="vc-panel-body">
          <img src={heroLocalSplashUrl('kadita')} alt="" />
        </div>
      </div>
      <div className="vc-panel vc-panel-lose" aria-hidden>
        <div className="vc-panel-edge" />
        <div className="vc-panel-body">
          <img src={heroLocalSplashUrl('guinevere')} alt="" />
        </div>
      </div>

      <div className="vc-shards" aria-hidden>
        {SHARDS.map((s, i) => (
          <span
            key={i}
            style={{
              left: `${s.left}px`,
              top: `${s.top}px`,
              width: `${s.w}px`,
              height: `${s.h}px`,
              ['--rot' as string]: `${s.r}deg`,
              animationDelay: `${s.d}s`,
            }}
          />
        ))}
      </div>
      <div className="vc-sparks" aria-hidden>
        {SPARKS.map((p) => (
          <span
            key={p.id}
            className={p.tone}
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              ['--drift' as string]: `${p.drift}px`,
            }}
          />
        ))}
      </div>

      <header className="vc-header">
        <InstitutionLogos size="md" showLabels className="vc-institutions" />
        <div className="vc-league">{active.name || 'CME ML TOURNAMENT'}</div>
        <div className="vc-league-sub">YOUNG SAILORS CLUB • POST MATCH</div>
      </header>

      <div className="vc-slogan" aria-hidden>
        <span>More Than Games</span>
        <span>A Stronger Crew</span>
      </div>

      {!victory ? (
        <div className="vc-empty">
          <strong>NO WINNER YET</strong>
          <span>
            On Gameplay desk, click who won, then select the MVP to fill this
            scene.
          </span>
        </div>
      ) : (
        <>
          <div className="vc-mvp">
            <div className="vc-mvp-aura" aria-hidden />
            {victory.mvp.photo ? (
              <FittedPortrait
                src={victory.mvp.photo}
                frame={MVP_FRAME}
                className="vc-mvp-photo"
              />
            ) : (
              <div className="vc-mvp-photo vc-photo-fallback">
                <Mark team={victory.win} className="vc-fallback-mark" />
              </div>
            )}
          </div>

          <div className="vc-kicker">
            <span>{victory.mvp.isCaptain ? 'Captain' : 'Winning team'}</span>
            <strong>{victory.win.tag}</strong>
          </div>

          <div className="vc-badge">
            <svg className="vc-crown" viewBox="0 0 120 70" aria-hidden>
              <defs>
                <linearGradient id="vcGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff3c4" />
                  <stop offset="0.45" stopColor="#f2c14e" />
                  <stop offset="1" stopColor="#9a6a12" />
                </linearGradient>
              </defs>
              <path
                d="M8 62 L14 20 L36 42 L60 6 L84 42 L106 20 L112 62 Z"
                fill="url(#vcGold)"
                stroke="#7a520c"
                strokeWidth="2"
              />
              <circle cx="60" cy="8" r="6" fill="#e0324b" stroke="#fff3c4" strokeWidth="2" />
              <circle cx="14" cy="20" r="4.5" fill="url(#vcGold)" />
              <circle cx="106" cy="20" r="4.5" fill="url(#vcGold)" />
              <rect x="8" y="58" width="104" height="9" rx="2" fill="url(#vcGold)" />
            </svg>
            <span className="vc-wing vc-wing-l" aria-hidden />
            <span className="vc-wing vc-wing-r" aria-hidden />
            <div className="vc-shield">
              <span className="vc-mvp-word">MVP</span>
              <span className="vc-mvp-player">PLAYER</span>
            </div>
            <span className="vc-twinkle t1" aria-hidden />
            <span className="vc-twinkle t2" aria-hidden />
            <span className="vc-twinkle t3" aria-hidden />
          </div>

          <ul className="vc-taglines">
            {TAGLINES.map((t, i) => (
              <li key={t} style={{ animationDelay: `${1 + i * 0.12}s` }}>
                {t}
              </li>
            ))}
          </ul>

          <div className="vc-plate">
            <Mark team={victory.win} className="vc-plate-mark" />
            <div className="vc-plate-text">
              <strong>{victory.mvp.label}</strong>
              {victory.mvp.name && victory.mvp.name.toUpperCase() !== victory.mvp.label ? (
                <span className="vc-plate-name">{victory.mvp.name}</span>
              ) : null}
              <span className="vc-plate-team">{victory.mvp.teamName}</span>
            </div>
          </div>

          <div className="vc-title">
            <h1 className="vc-victory" data-text="VICTORY">
              VICTORY
            </h1>
            <div className="vc-winner">
              <Laurel />
              <span>
                Winner: <b>{victory.win.name}</b>
              </span>
              <Laurel flip />
            </div>
            <div className="vc-motto">
              <span>Teamwork builds</span>
              <span>Brighter tomorrows</span>
            </div>
          </div>

          <div className="vc-loser">
            {victory.loser.photo ? (
              <FittedPortrait
                src={victory.loser.photo}
                frame={LOSER_FRAME}
                className="vc-loser-photo"
              />
            ) : (
              <div className="vc-loser-photo vc-photo-fallback">
                <Mark team={victory.lose} className="vc-fallback-mark" />
              </div>
            )}
            <div className="vc-loser-plate">
              <div className="vc-loser-text">
                <span>Captain</span>
                <strong>{victory.loser.label}</strong>
              </div>
              <Mark team={victory.lose} className="vc-loser-mark" />
            </div>
            <div className="vc-defeated">Defeated</div>
          </div>

          <div className="vc-result">
            <span className="vc-chev vc-chev-l" aria-hidden />
            <div className="vc-result-side vc-result-win">
              <Mark team={victory.win} className="vc-result-mark" />
              <span
                className="vc-result-name"
                style={{
                  fontSize: `${Math.round(
                    Math.max(26, Math.min(50, 560 / Math.max(6, victory.win.name.length))),
                  )}px`,
                }}
              >
                {victory.win.name}
              </span>
            </div>
            <div className="vc-result-center">
              <span>Match result</span>
              <strong>
                {victory.win.seriesScore} - {victory.lose.seriesScore}
              </strong>
            </div>
            <div className="vc-result-side vc-result-lose">
              <span
                className="vc-result-name"
                style={{
                  fontSize: `${Math.round(
                    Math.max(26, Math.min(50, 560 / Math.max(6, victory.lose.name.length))),
                  )}px`,
                }}
              >
                {victory.lose.name}
              </span>
              <Mark team={victory.lose} className="vc-result-mark" />
            </div>
            <span className="vc-chev vc-chev-r" aria-hidden />
          </div>

          <footer className="vc-footer">
            <Mark team={victory.win} className="vc-footer-mark" />
            <span>{victory.win.tag}</span>
            <b>VS</b>
            <span>{victory.lose.tag}</span>
            <Mark team={victory.lose} className="vc-footer-mark" />
          </footer>

          <div className="vc-corner vc-corner-l" aria-hidden>
            <span>Discipline</span>
            <span>Skill</span>
            <span>Brotherhood</span>
          </div>
          <div className="vc-corner vc-corner-r" aria-hidden>
            <span>Same passion</span>
            <span>Brighter futures</span>
          </div>
        </>
      )}
    </div>
  )
}
