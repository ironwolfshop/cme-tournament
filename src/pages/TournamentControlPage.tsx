import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/cme/Icon'
import StudioShell from '../components/cme/StudioShell'
import {
  compressImageFile,
  downloadBackup,
  exportAllData,
  importAllData,
  type BackupBundle,
} from '../lib/appStorage'
import {
  getTeam,
  roundLabel,
  seedPositions,
  type BracketMatch,
  type BracketSlotRef,
} from '../lib/bracketEngine'
import {
  initTournamentSync,
  ALL_PLAYER_ROLES,
  MAX_ROSTER_SIZE,
  PLAYER_ROLES,
  SPARE_ROLE,
  STARTER_COUNT,
  makeSparePlayer,
  selectActiveProject,
  starterPlayers,
  useTournamentStore,
  type PlayerRole,
  type TournamentPlayer,
  type TournamentProject,
  type TournamentTeam,
} from '../store/tournamentStore'
import {
  cancelBgRemover,
  preloadBgRemover,
  removePhotoBackground,
} from '../lib/bgRemove'
import { useBracketStore, initBracketSync } from '../store/bracketStore'
import {
  initLineupSync,
  lineupTeamFromTournament,
  useLineupStore,
} from '../store/lineupStore'
import TeamRevealStage, {
  emptySlotPortrait,
} from '../components/lineup/TeamRevealStage'
import '../styles/team-reveal.css'

type Tab = 'teams' | 'bracket' | 'lineup' | 'settings'
type Dialog =
  | null
  | { kind: 'new' }
  | { kind: 'settings' }
  | { kind: 'team'; teamId?: string }
  | { kind: 'result'; matchId: string }

/** Ask the Vite server to pull the Google Sheet and download Drive photos to /form-media. */
async function pullFormImport(fresh = true): Promise<BackupBundle> {
  let res: Response
  try {
    res = await fetch(
      fresh ? '/api/sync/import-form' : '/api/sync/import-form?fresh=0',
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    )
  } catch {
    throw new Error(
      'Cannot reach /api/sync/import-form — start the app with npm run dev (or npm run prod after install).',
    )
  }
  let bundle: BackupBundle & { ok?: boolean; error?: string }
  try {
    bundle = (await res.json()) as BackupBundle & {
      ok?: boolean
      error?: string
    }
  } catch {
    throw new Error(
      `Import API returned ${res.status} (not JSON). Is the Vite sync plugin running?`,
    )
  }
  if (!res.ok || bundle?.ok === false) {
    throw new Error(bundle?.error || `import failed (${res.status})`)
  }
  if (!bundle?.channels?.['mlbb-tournament-state-v2']) {
    throw new Error('import returned no tournament data')
  }
  return bundle
}

function isBracketForProject(
  project: TournamentProject,
  teamIds: string[],
  matchCount: number,
) {
  if (!matchCount || !teamIds.length) return false
  if (teamIds.length !== project.teams.length) return false
  const set = new Set(project.teams.map((t) => t.id))
  return teamIds.every((id) => set.has(id))
}

function readFileAsDataUrl(file: File): Promise<string> {
  // Compress portraits so IndexedDB / hub can hold full tournament data.
  return compressImageFile(file, { maxEdge: 720, quality: 0.82 })
}

function formatUpdated(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function summarize(project: TournamentProject, completed = 0, total = 0) {
  const playerCount = project.teams.reduce(
    (n, t) => n + t.players.filter((p) => p.name.trim()).length,
    0,
  )
  const filled = project.teams.length
  const champion = completed > 0 && completed === total && total > 0
  const status = champion
    ? 'Completed'
    : completed > 0
      ? 'In progress'
      : 'Setup'
  return { playerCount, filled, status, champion, completed, total }
}

function Avatar({
  label,
  url,
  tone = 0,
  className = '',
}: {
  label: string
  url?: string
  tone?: number
  className?: string
}) {
  const text = (label || '—').slice(0, 3).toUpperCase()
  return (
    <span className={`avatar tone${tone % 4} ${className}`.trim()}>
      {url ? <img src={url} alt="" /> : text}
    </span>
  )
}

export default function TournamentControlPage() {
  const store = useTournamentStore()
  const active = useTournamentStore(selectActiveProject)
  const bracket = useBracketStore()
  const [params, setParams] = useSearchParams()
  const view = params.get('tournament') ? 'edit' : 'portfolio'
  const tab = (
    ['teams', 'bracket', 'lineup', 'settings'].includes(params.get('tab') ?? '')
      ? params.get('tab')
      : 'teams'
  ) as Tab
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [presenting, setPresenting] = useState(false)

  useEffect(() => {
    initTournamentSync()
    initBracketSync()
    initLineupSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
  }, [])

  // One-click form import: /control/tournament?import=form
  useEffect(() => {
    const flag = params.get('import')
    if (flag !== 'form' && flag !== '1') return
    const force = params.get('force') === '1'
    if (!force && sessionStorage.getItem('cme-form-imported') === '1') {
      const next = new URLSearchParams(params)
      next.delete('import')
      next.delete('force')
      setParams(next)
      setToast('Form already imported this session — use Settings → Load form teams to reload')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const bundle = await pullFormImport(true)
        const n = await importAllData(bundle)
        if (cancelled || !n) return
        const payload = bundle.channels['mlbb-tournament-state-v2']
        if (payload && typeof payload === 'object') {
          const result = useTournamentStore
            .getState()
            .mergeFormRosters(payload as never)
          sessionStorage.setItem('cme-form-imported', '1')
          setToast(
            `Form downloaded · ${result.matched} teams already there (unchanged), ${result.added} new teams, ${result.players} players added`,
          )
        }
        const next = new URLSearchParams(params)
        next.delete('import')
        next.delete('force')
        const tid = useTournamentStore.getState().activeTournamentId
        if (tid) next.set('tournament', tid)
        setParams(next)
      } catch (err) {
        if (!cancelled) {
          setToast(
            err instanceof Error
              ? `Form download failed: ${err.message}`
              : 'Form download failed — is the sheet shared and the dev server running?',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, setParams])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const id = params.get('tournament')
    if (
      id &&
      store.tournaments.some((t) => t.id === id) &&
      store.activeTournamentId !== id
    ) {
      store.selectTournament(id)
    }
  }, [params, store.tournaments, store.activeTournamentId, store])

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting])

  function openPortfolio() {
    setPresenting(false)
    setParams({})
  }

  function openTournament(id: string, nextTab: Tab = 'teams') {
    store.selectTournament(id)
    const next = new URLSearchParams()
    next.set('tournament', id)
    if (nextTab !== 'teams') next.set('tab', nextTab)
    setParams(next)
  }

  function setTab(next: Tab) {
    const id = params.get('tournament') ?? active.id
    openTournament(id, next)
  }

  const portfolioStats = useMemo(() => {
    const teams = store.tournaments.reduce((n, t) => n + t.teams.length, 0)
    const players = store.tournaments.reduce(
      (n, t) =>
        n + t.teams.reduce((m, team) => m + team.players.filter((p) => p.name.trim()).length, 0),
      0,
    )
    return { teams, players }
  }, [store.tournaments])

  const matchDone = bracket.matches.filter((m) => m.winnerId).length
  const bracketSeeded = isBracketForProject(
    active,
    bracket.teams.map((t) => t.id),
    bracket.matches.length,
  )

  const crumb = (
    <>
      <button type="button" onClick={openPortfolio}>
        Workspace
      </button>
      <span>/</span>
      {view === 'edit' ? (
        <>
          <button type="button" onClick={openPortfolio}>
            Tournaments
          </button>
          <span>/</span>
          <span>{active.name}</span>
        </>
      ) : (
        <span>Tournaments</span>
      )}
    </>
  )

  return (
    <StudioShell
      presenting={presenting}
      crumb={crumb}
      note={
        <>
          <span className="dot" />
          {view === 'edit' ? 'Saved tournament' : 'Your tournament workspace'}
        </>
      }
    >
      <main>
        {view === 'portfolio' ? (
          <PortfolioView
            tournaments={store.tournaments}
            activeId={store.activeTournamentId}
            query={query}
            onQuery={setQuery}
            stats={portfolioStats}
            onOpen={(id) => openTournament(id)}
            onCreate={() => setDialog({ kind: 'new' })}
            onDelete={(id) => store.deleteTournament(id)}
            onLoadForm={() => {
              void (async () => {
                try {
                  setToast('Downloading sheet + photos…')
                  const bundle = await pullFormImport(true)
                  const n = await importAllData(bundle)
                  const payload = bundle.channels['mlbb-tournament-state-v2']
                  if (payload && typeof payload === 'object') {
                    useTournamentStore
                      .getState()
                      .mergeFormRosters(payload as never)
                  }
                  sessionStorage.removeItem('cme-form-imported')
                  const tid =
                    (payload as { activeTournamentId?: string } | null)
                      ?.activeTournamentId
                  const teams =
                    (payload as { tournaments?: { teams?: unknown[] }[] } | null)
                      ?.tournaments?.[0]?.teams?.length ?? 0
                  if (!n) {
                    setToast('Form import was empty')
                    return
                  }
                  setToast(`Downloaded form teams · ${teams} team(s)`)
                  if (tid) openTournament(tid)
                } catch (err) {
                  setToast(
                    err instanceof Error
                      ? `Download failed: ${err.message}`
                      : 'Download failed — share the sheet + keep the dev server running',
                  )
                }
              })()
            }}
          />
        ) : (
          <DetailView
            active={active}
            tab={tab}
            matchDone={matchDone}
            matchTotal={bracket.matches.length}
            bracketSeeded={bracketSeeded}
            onTab={setTab}
            onSettings={() => setDialog({ kind: 'settings' })}
            onAddTeam={() => setDialog({ kind: 'team' })}
            onEditTeam={(teamId) => setDialog({ kind: 'team', teamId })}
            onSeed={() => {
              if (active.teams.length < 2) {
                setToast('Add at least 2 teams first')
                return
              }
              store.seedIntoBracket()
              setToast('Teams bracketed · Match Day ready')
            }}
            onResult={(matchId) => setDialog({ kind: 'result', matchId })}
            onPresent={() => setPresenting(true)}
            onToast={setToast}
            onImported={(id) => openTournament(id)}
          />
        )}
      </main>

      <button
        type="button"
        className="btn presentation-exit"
        onClick={() => setPresenting(false)}
      >
        Exit presentation <span className="muted">Esc</span>
      </button>

      {toast ? (
        <div className="toast show" role="status">
          {toast}
    </div>
      ) : null}

      {dialog?.kind === 'new' && (
        <NewTournamentDialog
          onClose={() => setDialog(null)}
          onCreate={(values) => {
            const id = store.createTournament({
              name: values.name,
              formatSize: values.formatSize,
              matchTitle: values.matchTitle,
              logo: values.logo,
              empty: true,
            })
            setDialog(null)
            openTournament(id)
            setToast('Tournament created')
          }}
        />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          project={active}
          onClose={() => setDialog(null)}
          onSave={(values) => {
            store.setProjectName(values.name)
            store.setMatchTitle(values.matchTitle)
            store.setProjectLogo(values.logo)
            if (values.formatSize !== active.formatSize) {
              store.setFormatSize(values.formatSize)
            }
            setDialog(null)
            setToast('Settings saved')
          }}
        />
      )}
      {dialog?.kind === 'team' && (
        <TeamDialog
          team={
            dialog.teamId
              ? active.teams.find((t) => t.id === dialog.teamId) ?? null
              : null
          }
          onClose={() => setDialog(null)}
          onSave={(payload) => {
            if (dialog.teamId) {
              store.updateTeam(dialog.teamId, {
                name: payload.name,
                tag: payload.tag,
                logo: payload.logo,
              })
              store.setTeamRoster(dialog.teamId, payload.players)
            } else {
              store.addTeam()
              const created =
                useTournamentStore.getState().getActive().teams.at(-1)
              if (created) {
                store.updateTeam(created.id, {
                  name: payload.name,
                  tag: payload.tag,
                  logo: payload.logo,
                })
                store.setTeamRoster(created.id, payload.players)
              }
            }
            setDialog(null)
            setToast(dialog.teamId ? 'Team updated' : 'Team added')
          }}
          onRemove={
            dialog.teamId
              ? () => {
                  if (
                    window.confirm(
                      'Remove this team and its roster from the tournament?',
                    )
                  ) {
                    store.removeTeam(dialog.teamId!)
                    setDialog(null)
                    setToast('Team removed')
                  }
                }
              : undefined
          }
        />
      )}
      {dialog?.kind === 'result' && (
        <ResultDialog
          matchId={dialog.matchId}
          onClose={() => setDialog(null)}
          onToast={setToast}
        />
      )}
    </StudioShell>
  )
}


function PortfolioView({
  tournaments,
  activeId,
  query,
  onQuery,
  stats,
  onOpen,
  onCreate,
  onDelete,
  onLoadForm,
}: {
  tournaments: TournamentProject[]
  activeId: string
  query: string
  onQuery: (q: string) => void
  stats: { teams: number; players: number }
  onOpen: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onLoadForm: () => void
}) {
  const filtered = tournaments.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">YOUR COMPETITION. YOUR STAGE.</div>
          <h1>Tournament portfolio</h1>
          <p>A home for your tournaments, teams, and every match ahead.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn quiet" onClick={onLoadForm}>
            <Icon name="users" />
            Load form teams
          </button>
        <button type="button" className="btn gold" onClick={onCreate}>
            <Icon name="plus" />
          New tournament
        </button>
        </div>
      </div>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">FROM FIRST SEED TO FINAL VICTORY</div>
          <h2>Make match day feel effortless.</h2>
          <p>
            Build your roster, arrange your bracket, and bring every team into
            the spotlight.
          </p>
          <button type="button" className="btn gold small" onClick={onCreate}>
            <Icon name="plus" />
            Create a tournament
          </button>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="art-stack">
            <div className="art-slot" />
            <div className="art-slot" />
          </div>
          <div className="art-trophy">
            <Icon name="trophy" />
          </div>
          <div className="art-stack">
            <div className="art-slot" />
            <div className="art-slot" />
          </div>
        </div>
      </section>

      <div className="stats">
        <Stat icon="trophy" value={tournaments.length} label="Saved tournaments" />
        <Stat icon="users" value={stats.teams} label="Registered teams" />
        <Stat icon="layers" value={stats.players} label="Rostered players" />
        <Stat
          icon="check"
          value={
            tournaments.filter((t) => t.teams.length >= t.formatSize).length
          }
          label="Ready to seed"
        />
      </div>

      <div className="section-top">
        <h2>
          Your tournaments <span>{tournaments.length} saved</span>
        </h2>
        <label className="search">
          <Icon name="search" />
          <input
            aria-label="Search tournaments"
            placeholder="Search tournaments…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="tournament-grid">
        {filtered.map((project) => (
          <TournamentCard
            key={project.id}
            project={project}
            isActive={project.id === activeId}
            canDelete={tournaments.length > 1}
            onOpen={() => onOpen(project.id)}
            onDelete={() => onDelete(project.id)}
          />
        ))}
        {!query ? (
          <button type="button" className="new-card" onClick={onCreate}>
            <span className="new-icon">
              <Icon name="plus" />
          </span>
            <strong>Start a new tournament</strong>
            <span>Choose your bracket size and build your team lineup.</span>
        </button>
        ) : null}
        {!filtered.length && query ? (
          <p className="muted">No tournaments match your search.</p>
        ) : null}
      </div>

      <div className="footer-note">
        <Icon name="info" />
        Teams, rosters, and bracket results stay together in each saved
        tournament.
      </div>
    </>
  )
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: string
  value: number | string
  label: string
}) {
  return (
    <div className="stat">
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function TournamentCard({
  project,
  isActive,
  canDelete,
  onOpen,
  onDelete,
}: {
  project: TournamentProject
  isActive: boolean
  canDelete: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const z = summarize(project)
  return (
    <article className="tournament-card">
      <div className={`event-cover${isActive ? ' sample' : ''}`}>
        <Avatar label="CME" url={project.logo} tone={1} />
        <span className={`badge${isActive ? ' gold' : ''}`}>
          {isActive ? 'ACTIVE' : z.status.toUpperCase()}
        </span>
      </div>
      <div className="event-body">
        <h3>{project.name}</h3>
        <div className="event-meta">Mobile Legends · Single elimination</div>
        <div className="event-progress">
          <span
      style={{
              width: `${Math.min(100, (project.teams.length / project.formatSize) * 100)}%`,
            }}
          />
        </div>
        <div className="event-detail">
          <span>
            {project.teams.length} of {project.formatSize} teams
          </span>
          <span>{z.playerCount} players</span>
        </div>
        <div className="team-pile">
          {project.teams.slice(0, 7).map((t, i) => (
            <Avatar key={t.id} label={t.tag} url={t.logo} tone={i} />
          ))}
          {project.teams.length > 7 ? (
            <Avatar label={`+${project.teams.length - 7}`} />
          ) : null}
        </div>
        <div className="event-meta">{project.matchTitle}</div>
      </div>
      <div className="event-footer">
        <small>Saved {formatUpdated(project.updatedAt)}</small>
        <div className="actions">
          {canDelete ? (
      <button
        type="button"
              className="btn quiet small danger"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${project.name}”? This cannot be undone.`,
                  )
                ) {
                  onDelete()
                }
              }}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="btn quiet small" onClick={onOpen}>
            Open tournament
            <Icon name="arrow-right" />
          </button>
        </div>
      </div>
    </article>
  )
}

function DetailView({
  active,
  tab,
  matchDone,
  matchTotal,
  bracketSeeded,
  onTab,
  onSettings,
  onAddTeam,
  onEditTeam,
  onSeed,
  onResult,
  onPresent,
  onToast,
  onImported,
}: {
  active: TournamentProject
  tab: Tab
  matchDone: number
  matchTotal: number
  bracketSeeded: boolean
  onTab: (t: Tab) => void
  onSettings: () => void
  onAddTeam: () => void
  onEditTeam: (id: string) => void
  onSeed: () => void
  onResult: (matchId: string) => void
  onPresent: () => void
  onToast: (msg: string) => void
  onImported: (id: string) => void
}) {
  const z = summarize(active, matchDone, matchTotal)
  const full = active.teams.length >= active.formatSize

  return (
    <>
      <div className="page-head">
        <div className="detail-title">
          <Avatar label="CME" url={active.logo} tone={1} />
          <div>
            <div className="eyebrow">TOURNAMENT WORKSPACE</div>
            <h1>{active.name}</h1>
            <div className="detail-meta">
              <span className={`badge${z.champion ? ' green' : ''}`}>
                {z.status}
              </span>
              <span>Mobile Legends</span>
              <span>·</span>
              <span>Single elimination</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn quiet" onClick={onSettings}>
            <Icon name="gear" />
            Settings
          </button>
          <button
            type="button"
            className="btn quiet"
            disabled={active.teams.length < 2}
            title={
              active.teams.length < 2
                ? 'Add at least 2 teams first.'
                : bracketSeeded
                  ? 'Rebuild the bracket and refresh Match Day.'
                  : 'Place teams on the bracket and load Match Day.'
            }
            onClick={() => {
              onSeed()
              onTab('bracket')
            }}
          >
            <Icon name="bracket" />
            {bracketSeeded ? 'Update bracket' : 'Add to bracket'}
          </button>
          <button
            type="button"
            className="btn gold"
            onClick={onAddTeam}
            disabled={full}
            title={
              full
                ? 'Increase the bracket size in Settings to add another team.'
                : undefined
            }
          >
            <Icon name="plus" />
            Add team
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat
          icon="users"
          value={`${active.teams.length} / ${active.formatSize}`}
          label="Registered teams"
        />
        <Stat icon="layers" value={z.playerCount} label="Rostered players" />
        <Stat icon="bracket" value={active.formatSize} label="Bracket size" />
        <Stat
          icon="check"
          value={`${matchDone} / ${matchTotal || active.formatSize - 1}`}
          label="Matches completed"
        />
      </div>

      <nav className="tabs" aria-label="Tournament sections">
        {(
          [
            ['teams', 'Teams & rosters', 'users'],
            ['bracket', 'Bracket', 'bracket'],
            ['lineup', 'Lineup scene', 'photo'],
            ['settings', 'Settings', 'gear'],
          ] as const
        ).map(([key, title, ico]) => (
          <button
            key={key}
            type="button"
            className={`tab${tab === key ? ' active' : ''}`}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => onTab(key)}
          >
            <Icon name={ico} />
            {title}
            {key === 'teams' ? (
              <span className="count">{active.teams.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === 'teams' ? (
        <TeamsTab
          active={active}
          bracketSeeded={bracketSeeded}
          onAdd={onAddTeam}
          onEdit={onEditTeam}
          onSeed={() => {
            onSeed()
            onTab('bracket')
          }}
          onToBracket={() => onTab('bracket')}
          onLoadForm={async () => {
            const bundle = await pullFormImport(true)
            await importAllData(bundle)
            const payload = bundle.channels['mlbb-tournament-state-v2']
            if (!payload || typeof payload !== 'object') {
              throw new Error('empty')
            }
            const result = useTournamentStore
              .getState()
              .mergeFormRosters(payload as never)
            onToast(
              `Form sync · ${result.matched} teams already there · ${result.added} new teams · ${result.players} players added`,
            )
          }}
        />
      ) : null}
      {tab === 'bracket' ? (
        <BracketTab
          active={active}
          seeded={bracketSeeded}
          onSeed={onSeed}
          onResult={onResult}
          onPresent={onPresent}
          onToast={onToast}
        />
      ) : null}
      {tab === 'lineup' ? (
        <LineupSceneTab active={active} onToast={onToast} onEditTeam={onEditTeam} />
      ) : null}
      {tab === 'settings' ? (
        <SettingsTab
          active={active}
          onEdit={onSettings}
          onImported={onImported}
        />
      ) : null}

      <div className="footer-note">
        <Icon name="info" />
        {bracketSeeded
          ? 'Match winners automatically advance to the next round.'
          : 'Team order becomes the seed order when you generate the bracket.'}
      </div>
    </>
  )
}

function TeamsTab({
  active,
  bracketSeeded,
  onAdd,
  onEdit,
  onSeed,
  onToBracket,
  onLoadForm,
}: {
  active: TournamentProject
  bracketSeeded: boolean
  onAdd: () => void
  onEdit: (id: string) => void
  onSeed: () => void
  onToBracket: () => void
  onLoadForm: () => Promise<void>
}) {
  const [loadingForm, setLoadingForm] = useState(false)
  const canSeed = active.teams.length >= 2
  return (
    <>
      <div className="section-top">
        <div>
          <h2>
            Meet the teams{' '}
            <span>
              {active.teams.length} / {active.formatSize} slots
            </span>
            </h2>
          <div className="muted tiny" style={{ marginTop: 5 }}>
            Add teams to the bracket to load Match Day, Draft, and Live Desk.
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn quiet small"
            disabled={loadingForm}
            onClick={() => {
              setLoadingForm(true)
              void onLoadForm()
                .catch((err: unknown) => {
                  const detail =
                    err instanceof Error && err.message
                      ? err.message
                      : 'Unknown error'
                  window.alert(
                    `Could not download form teams.\n\n${detail}\n\nIf the API is missing, run npm run dev (not preview only). The Google Sheet must be shared Anyone with the link → Viewer.`,
                  )
                })
                .finally(() => setLoadingForm(false))
            }}
          >
            <Icon name="users" />
            {loadingForm ? 'Downloading…' : 'Load form teams'}
          </button>
          <button
            type="button"
            className="btn quiet small"
            onClick={onToBracket}
          >
            <Icon name="bracket" />
            View bracket
          </button>
          <button
            type="button"
            className="btn gold small"
            disabled={!canSeed}
            title={
              !canSeed
                ? 'Add at least 2 teams first.'
                : bracketSeeded
                  ? 'Rebuild the bracket and refresh Match Day with the first pairing.'
                  : 'Place teams on the bracket and load Match Day.'
            }
            onClick={onSeed}
          >
            <Icon name="bracket" />
            {bracketSeeded ? 'Update bracket' : 'Add teams to bracket'}
          </button>
        </div>
      </div>

      {active.teams.length ? (
        <div className="team-grid">
          {active.teams.map((team, i) => {
            const named = team.players.filter((p) => p.name.trim()).length
            return (
              <article key={team.id} className="team-card">
                <div className="team-head">
                  <Avatar label={team.tag} url={team.logo} tone={i} />
                  <div>
                    <h3>{team.name}</h3>
                    <small>{team.tag}</small>
                  </div>
                  <span className="seed">#{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="roster-title">STARTING ROSTER</div>
                <div className="roster">
                  {team.players.map((p, j) => (
                    <div key={p.id} className="player">
                      <Avatar label={String(j + 1)} url={p.photo} />
                      <span className={`player-name${!p.name.trim() ? ' muted' : ''}`}>
                        {p.name.trim() || 'Add player'}
            </span>
                      <span className="role">
                        {ALL_PLAYER_ROLES.find((r) => r.id === p.role)?.label ??
                          p.role}
                      </span>
        </div>
                  ))}
                </div>
                <div className="team-footer">
                  <span
                    className={`roster-health${named >= STARTER_COUNT ? ' complete' : ''}`}
                  >
                    {named} / {team.players.length} players
                    {team.players.length > STARTER_COUNT ? ' · 6-man' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn quiet small"
                    onClick={() => onEdit(team.id)}
                  >
                    <Icon name="edit" />
                    Edit team
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="users" />
          <h2>Your lineup starts here</h2>
          <p>
            Add your first team, upload its logo, and give each player a name and
            role.
          </p>
          <button type="button" className="btn gold" onClick={onAdd}>
            <Icon name="plus" />
            Add first team
          </button>
        </div>
      )}
    </>
  )
}

function needsCutout(p: TournamentPlayer) {
  if (!p.photo) return false
  // Already a saved cutout (transparent PNG differs from original).
  if (p.photoOriginal && p.photo !== p.photoOriginal) return false
  return true
}

function LineupSceneTab({
  active,
  onToast,
  onEditTeam,
}: {
  active: TournamentProject
  onToast: (msg: string) => void
  onEditTeam: (id: string) => void
}) {
  const [selectedId, setSelectedId] = useState(active.teams[0]?.id ?? '')
  const lineup = useLineupStore()
  const navigate = useNavigate()
  const savePlayerCutouts = useTournamentStore((s) => s.savePlayerCutouts)
  const [cutJob, setCutJob] = useState<{
    title: string
    detail: string
    current: number
    total: number
  } | null>(null)
  const cutGen = useRef(0)

  useEffect(() => {
    if (!active.teams.some((t) => t.id === selectedId)) {
      setSelectedId(active.teams[0]?.id ?? '')
    }
  }, [active.teams, selectedId])

  const team = active.teams.find((t) => t.id === selectedId) ?? null
  const players = useMemo(() => {
    if (!team) return [] as TournamentPlayer[]
    return [...team.players].sort((a, b) => a.order - b.order)
  }, [team])

  const starters = useMemo(
    () => (team ? starterPlayers(team.players) : []),
    [team],
  )

  const revealTeam = useMemo(() => {
    if (!team) return null
    return lineupTeamFromTournament(
      {
        id: team.id,
        name: team.name,
        tag: team.tag,
        logo: team.logo,
        players: starters.map((p) => ({
          name: p.name,
          photo: p.photo,
          photoOriginal: p.photoOriginal || '',
          role: p.role,
          order: p.order,
          isLeader: p.isLeader === true,
        })),
      },
      lineup.layout,
    )
  }, [team, starters, lineup.layout])

  const photoCount = starters.filter((p) => p.photo).length
  const namedCount = starters.filter((p) => p.name.trim()).length
  const teamIndex = team ? active.teams.findIndex((t) => t.id === team.id) : -1
  const cutoutCount = starters.filter(
    (p) => p.photo && p.photoOriginal && p.photo !== p.photoOriginal,
  ).length

  const cutQueueKey = useMemo(
    () =>
      active.teams
        .map((t) => {
          const s = starterPlayers(t.players)
          return `${t.id}:${s.map((p) => (needsCutout(p) ? '1' : '0')).join('')}`
        })
        .join('|'),
    [active.teams],
  )

  // Auto-remove backgrounds for every starter photo that still has one.
  useEffect(() => {
    if (!cutQueueKey.includes('1')) {
      setCutJob(null)
      return
    }

    const gen = ++cutGen.current
    let alive = true

    async function cutTeamPhotos(
      t: TournamentProject['teams'][number],
      label: string,
    ): Promise<number> {
      const roster = starterPlayers(t.players)
      const jobs = roster
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => needsCutout(p))
      if (!jobs.length) return 0

      setCutJob({
        title: label,
        detail: 'Loading AI model…',
        current: 0,
        total: jobs.length,
      })
      await preloadBgRemover((pct, stage) => {
        if (!alive || cutGen.current !== gen) return
        setCutJob((prev) =>
          prev
            ? { ...prev, detail: stage ?? `Downloading AI model… ${pct}%` }
            : prev,
        )
      })

      const slots: { order: number; photo: string; photoOriginal: string }[] =
        []
      let done = 0
      for (const { p, index } of jobs) {
        if (!alive || cutGen.current !== gen) return done
        const name = p.name.trim() || `Player ${index + 1}`
        const original = p.photoOriginal || p.photo
        setCutJob({
          title: label,
          detail: `Cutting ${name}…`,
          current: done,
          total: jobs.length,
        })
        try {
          const cutout = await removePhotoBackground(original, (_pct, stage) => {
            if (!alive || cutGen.current !== gen) return
            setCutJob({
              title: label,
              detail: `${name} — ${stage ?? 'Working…'}`,
              current: done,
              total: jobs.length,
            })
          })
          slots.push({ order: index, photo: cutout, photoOriginal: original })
          done += 1
          setCutJob({
            title: label,
            detail: `Saved ${name}`,
            current: done,
            total: jobs.length,
          })
        } catch (err) {
          if (err instanceof Error && /cancelled/i.test(err.message)) return done
          console.error('[tournament-lineup cutout]', name, err)
        }
      }

      if (slots.length && alive && cutGen.current === gen) {
        savePlayerCutouts(t.id, slots)
      }
      return done
    }

    void (async () => {
      try {
        const latest = useTournamentStore.getState().getActive()
        const ordered = [...latest.teams].sort((a, b) => {
          if (a.id === selectedId) return -1
          if (b.id === selectedId) return 1
          return 0
        })
        let totalSaved = 0
        for (const t of ordered) {
          if (!alive || cutGen.current !== gen) return
          // Re-read team from store so we skip photos already saved mid-run.
          const live =
            useTournamentStore
              .getState()
              .getActive()
              .teams.find((x) => x.id === t.id) ?? t
          const n = await cutTeamPhotos(
            live,
            `Removing backgrounds · ${live.tag || live.name}`,
          )
          totalSaved += n
        }
        if (!alive || cutGen.current !== gen) return
        setCutJob(null)
        if (totalSaved > 0) {
          onToast(
            `${totalSaved} cutout${totalSaved === 1 ? '' : 's'} saved · leaders stay centered`,
          )
        }
      } catch (err) {
        if (!alive || cutGen.current !== gen) return
        setCutJob(null)
        onToast(
          err instanceof Error
            ? `Background removal failed: ${err.message}`
            : 'Background removal failed',
        )
      }
    })()

    return () => {
      alive = false
      cutGen.current += 1
      cancelBgRemover()
    }
  }, [active.id, cutQueueKey, selectedId, savePlayerCutouts, onToast])

  function sendToSide(side: 'blue' | 'red') {
    if (!team) return
    lineup.loadTournamentTeamToSide(
      side,
      {
        id: team.id,
        name: team.name,
        tag: team.tag,
        logo: team.logo,
        players: starters.map((p) => ({
          name: p.name,
          ign: p.ign,
          photo: p.photo,
          photoOriginal: p.photoOriginal || '',
          role: p.role,
          order: p.order,
          isLeader: p.isLeader === true,
        })),
      },
      active.name,
    )
    onToast(`${team.tag} starters loaded onto ${side} — opening Team reveal`)
    navigate(`/control/lineup?cutall=1&side=${side}`)
  }

  function step(delta: number) {
    if (!active.teams.length) return
    const i = Math.max(0, teamIndex)
    const next = (i + delta + active.teams.length) % active.teams.length
    setSelectedId(active.teams[next].id)
  }

  if (!active.teams.length) {
    return (
      <div className="empty-state">
        <Icon name="photo" />
        <h2>No teams to preview yet</h2>
        <p>
          Add teams and player photos under Teams &amp; rosters, then return here
          to browse the Team reveal lineup.
        </p>
      </div>
    )
  }

  const leaderName =
    revealTeam?.players.find((p) => p.isLeader)?.name.trim() ||
    starters.find((p) => p.isLeader)?.name.trim() ||
    ''

  return (
    <>
      {cutJob ? (
        <div className="lineup-cutout-overlay" role="status" aria-live="polite">
          <div className="lineup-cutout-card">
            <h2>{cutJob.title}</h2>
            <p>{cutJob.detail}</p>
            <div className="lineup-cutout-bar">
              <span
                style={{
                  width: `${cutJob.total ? Math.round((cutJob.current / cutJob.total) * 100) : 8}%`,
                }}
              />
            </div>
            <strong>
              {cutJob.current} / {cutJob.total}
            </strong>
            <button
              type="button"
              className="btn quiet small"
              style={{ marginTop: 12 }}
              onClick={() => {
                cancelBgRemover()
                cutGen.current += 1
                setCutJob(null)
                onToast('Background removal cancelled')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="section-top">
        <div>
          <h2>
            Lineup scene{' '}
            <span>
              {photoCount} / {STARTER_COUNT} starters · {namedCount} named
              {cutoutCount ? ` · ${cutoutCount} cutouts` : ''}
              {players.length > STARTER_COUNT ? ' · 6-man roster' : ''}
              </span>
          </h2>
          <div className="muted tiny" style={{ marginTop: 5 }}>
            Team leader stays centered. Backgrounds are removed automatically for
            every starter photo.
          </div>
        </div>
        <div className="actions">
          <a className="btn quiet small" href="/overlay/lineup" target="_blank" rel="noreferrer">
            <Icon name="monitor" />
            Open overlay
          </a>
          <Link className="btn quiet small" to="/control/lineup">
            <Icon name="sliders" />
            Lineup desk
          </Link>
        </div>
        </div>

      <div className="lineup-scene-layout">
        <aside className="lineup-team-rail" aria-label="Teams">
          {active.teams.map((t, i) => {
            const shots = starterPlayers(t.players).filter((p) => p.photo).length
            const cuts = starterPlayers(t.players).filter(
              (p) => p.photo && p.photoOriginal && p.photo !== p.photoOriginal,
            ).length
            return (
              <button
                key={t.id}
                type="button"
                className={`lineup-team-chip${selectedId === t.id ? ' active' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <Avatar label={t.tag} url={t.logo} tone={i} />
                <span className="lineup-team-chip-copy">
                  <strong>{t.name}</strong>
                  <small>
                    {t.tag} · {shots}/{STARTER_COUNT} photos
                    {cuts ? ` · ${cuts} cut` : ''}
                    {t.players.length > STARTER_COUNT ? ' · 6' : ''}
                  </small>
                </span>
              </button>
            )
          })}
        </aside>

        <div className="lineup-stage-panel">
          {team && revealTeam ? (
            <>
              <div className="lineup-stage-head">
                <div className="lineup-stage-identity">
                  <Avatar label={team.tag} url={team.logo} tone={Math.max(0, teamIndex)} />
                  <div>
                    <div className="eyebrow">TEAM REVEAL</div>
                    <h3>{team.name}</h3>
                    <div className="muted tiny">
                      Seed #{String(teamIndex + 1).padStart(2, '0')} · {team.tag}
                      {leaderName ? ` · Leader ${leaderName}` : ''}
        </div>
                  </div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Previous team"
                    onClick={() => step(-1)}
                  >
                    <Icon name="arrow" />
      </button>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Next team"
                    onClick={() => step(1)}
                    style={{ transform: 'scaleX(-1)' }}
                  >
                    <Icon name="arrow" />
                  </button>
                </div>
              </div>

              <div className="lineup-reveal-preview" aria-label="Team reveal lineup">
                <TeamRevealStage
                  preview
                  teamOverride={revealTeam}
                  revealedOverride={revealTeam.players.length}
                  sceneOverride={{
                    introLabel: active.name.toUpperCase(),
                    sceneTitle: lineup.sceneTitle,
                    subtitle: lineup.subtitle,
                    accent: lineup.accent,
                    layout: lineup.layout,
                    template: lineup.template,
                  }}
                />
              </div>

              <div className="lineup-stage-foot">
                <div className="muted tiny">
                  {photoCount === STARTER_COUNT
                    ? 'Starting five ready on the Team reveal stage.'
                    : `${STARTER_COUNT - photoCount} starter${STARTER_COUNT - photoCount === 1 ? '' : 's'} still need a photo.`}
                  {players.length > STARTER_COUNT
                    ? ' Spare stays out of the lineup overlay.'
                    : ''}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn quiet small"
                    onClick={() => onEditTeam(team.id)}
                  >
                    <Icon name="edit" />
                    Edit photos
        </button>
          <button
            type="button"
                    className="btn quiet small"
                    onClick={() => sendToSide('blue')}
                  >
                    <Icon name="users" />
                    Send to blue
                  </button>
                  <button
                    type="button"
                    className="btn gold small"
                    onClick={() => sendToSide('red')}
                  >
                    <Icon name="users" />
                    Send to red
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

function BracketTab({
  active,
  seeded,
  onSeed,
  onResult,
  onPresent,
  onToast,
}: {
  active: TournamentProject
  seeded: boolean
  onSeed: () => void
  onResult: (matchId: string) => void
  onPresent: () => void
  onToast: (msg: string) => void
}) {
  const moveTeam = useTournamentStore((s) => s.moveTeam)
  const unseed = useBracketStore((s) => s.unseed)
  const bracket = useBracketStore()
  const remaining = active.formatSize - active.teams.length
  const canBracket = active.teams.length >= 2
  const order = seedPositions(active.formatSize)

  if (seeded) {
    return (
      <SeededBracketView
        active={active}
        onResult={onResult}
        onPresent={onPresent}
        onUnseed={() => {
              if (
                window.confirm(
              'Clear this bracket and all match results? Your teams and rosters will stay.',
            )
          ) {
            unseed()
            onToast('Bracket cleared')
          }
        }}
      />
    )
  }

  return (
    <>
      <div className="bracket-toolbar">
        <div>
          <h2>Set the stage</h2>
          <p>
            Arrange seeds, then add teams to the bracket. Everyone starts in
            Round 1 and must win to advance — no automatic winners.
            {remaining > 0
              ? ` (${remaining} open registration slot${remaining === 1 ? '' : 's'}.)`
              : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn gold"
          disabled={!canBracket}
          title={
            !canBracket
              ? 'Add at least 2 teams first.'
              : 'Place teams on the bracket and load the first match for today.'
          }
          onClick={onSeed}
        >
          <Icon name="bracket" />
          Add teams to bracket
          </button>
      </div>

      <div className="seed-layout">
        <section className="panel">
          <h3>Seed order</h3>
          <p className="panel-intro">
            Move teams up or down to set their seed position.
          </p>
          <div className="seed-list">
            {active.teams.map((t, i) => (
              <div key={t.id} className="seed-row">
                <span className="seed-number">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Avatar label={t.tag} url={t.logo} tone={i} />
                <strong>{t.name}</strong>
                <div className="actions">
                  <button
                    type="button"
                    className="iconbtn"
                    disabled={i === 0}
                    aria-label={`Move ${t.name} up`}
                    onClick={() => moveTeam(t.id, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="iconbtn"
                    disabled={i === active.teams.length - 1}
                    aria-label={`Move ${t.name} down`}
                    onClick={() => moveTeam(t.id, 1)}
                  >
                    <Icon name="down" />
                  </button>
                </div>
              </div>
            ))}
            {!active.teams.length ? (
              <p className="muted tiny">Add teams to start arranging the seeds.</p>
        ) : null}
      </div>
          {remaining > 0 ? (
            <div className="notice" style={{ margin: '18px 0 0' }}>
              Add {remaining} more team{remaining === 1 ? '' : 's'} to complete
              this bracket.
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h3>Opening matchups</h3>
          <p className="panel-intro">
            Higher seeds face lower seeds in the opening round.
          </p>
          {Array.from({ length: active.formatSize / 2 }, (_, i) => {
            const a = active.teams[order[i * 2]! - 1]
            const b = active.teams[order[i * 2 + 1]! - 1]
            return (
              <div key={i} className="pairing">
                <strong>{a?.tag || `Seed ${order[i * 2]}`}</strong>
                <span>vs</span>
                <strong>{b?.tag || `Seed ${order[i * 2 + 1]}`}</strong>
              </div>
            )
          })}
        </section>
      </div>
      {bracket.matches.length > 0 && !seeded ? (
        <div className="notice" style={{ marginTop: 18 }}>
          <span>
            A different bracket is loaded in the workspace. Seed this tournament
            to replace it, or open the bracket desk.
          </span>
          <Link className="btn quiet small" to="/control/bracket">
            Bracket desk
          </Link>
        </div>
      ) : null}
    </>
  )
}

function SeededBracketView({
  active,
  onResult,
  onPresent,
  onUnseed,
}: {
  active: TournamentProject
  onResult: (matchId: string) => void
  onPresent: () => void
  onUnseed: () => void
}) {
  const bracket = useBracketStore()
  const swapSlots = useBracketStore((s) => s.swapSlots)
  const roundsRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragHint, setDragHint] = useState('')
  const completed = bracket.matches.filter((m) => m.winnerId).length
  const total = bracket.matches.length
  const finalMatch = bracket.matches
    .filter((m) => m.round === Math.max(...bracket.matches.map((x) => x.round)))
    .at(0)
  const champ =
    finalMatch?.winnerId
      ? active.teams.find((t) => t.id === finalMatch.winnerId) ??
        getTeam(bracket, finalMatch.winnerId)
      : null

  const rounds = useMemo(() => {
    const maxRound = Math.max(0, ...bracket.matches.map((m) => m.round))
    return Array.from({ length: maxRound + 1 }, (_, r) =>
      bracket.matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.index - b.index),
    )
  }, [bracket.matches])

  useEffect(() => {
    if (!dragHint) return
    const id = window.setTimeout(() => setDragHint(''), 2400)
    return () => window.clearTimeout(id)
  }, [dragHint])

  useLayoutEffect(() => {
    const draw = () => {
      const root = roundsRef.current
      const svg = svgRef.current
      if (!root || !svg) return
      const bounds = root.getBoundingClientRect()
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`)
      const paths: string[] = []
      for (const m of bracket.matches) {
        if (!m.nextMatchId) continue
        const src = root.querySelector(`[data-match="${m.id}"]`)
        const dest = root.querySelector(`[data-match="${m.nextMatchId}"]`)
        if (!src || !dest) continue
        const a = src.getBoundingClientRect()
        const b = dest.getBoundingClientRect()
        const x1 = a.right - bounds.left
        const y1 = a.top - bounds.top + a.height / 2
        const x2 = b.left - bounds.left
        const y2 = b.top - bounds.top + b.height / 2
        const mid = (x1 + x2) / 2
        paths.push(`<path d="M${x1} ${y1}H${mid}V${y2}H${x2}"/>`)
      }
      svg.innerHTML = paths.join('')
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [bracket.matches, rounds])

  function handleSwap(from: BracketSlotRef, to: BracketSlotRef) {
    const ok = swapSlots(from, to)
    if (ok) setDragHint('Opening matchups updated')
    else {
      setDragHint(
        'Only unfinished opening-round slots can be swapped. Clear a result first if needed.',
      )
    }
    return ok
  }

  return (
    <>
      <div className="bracket-toolbar">
        <div>
          <h2>The road to the trophy</h2>
          <p>
            {completed} of {total} matches complete · Drag teams in the opening
            round to rearrange · Select a match to enter the result.
            {dragHint ? (
              <>
                {' '}
                <span style={{ color: 'var(--gold)' }}>{dragHint}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn quiet small" onClick={onUnseed}>
            Clear bracket
          </button>
          <button type="button" className="btn quiet small" onClick={onPresent}>
            <Icon name="expand" />
            Present
          </button>
        </div>
      </div>

      {champ ? (
        <div className="champion-banner">
          <Icon name="trophy" />
          <div>
            <p>TOURNAMENT CHAMPION</p>
            <h3>{champ.name}</h3>
          </div>
          <Avatar label={champ.tag} url={champ.logo} tone={1} />
        </div>
      ) : null}

      <div
        className="bracket-scroll"
        tabIndex={0}
        aria-label="Tournament bracket. Drag opening-round teams to rearrange. Scroll horizontally for later rounds."
      >
        <div className="rounds" ref={roundsRef}>
          <svg
            className="bracket-wires"
            ref={svgRef}
            aria-hidden="true"
          />
          {rounds.map((ms, r) => (
            <section key={r} className="round">
              <div className="round-heading">
                {roundLabel(r, bracket.bracketSize)}
                <small>
                  {ms.length} match{ms.length === 1 ? '' : 'es'}
                  {r === 0 ? ' · drag to move' : ''}
                </small>
              </div>
              <div className="matches">
                {ms
                  .filter(
                    (m) =>
                      m.round > 0 ||
                      Boolean(m.teamAId) ||
                      Boolean(m.teamBId),
                  )
                  .map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onResult={() => onResult(m.id)}
                    onSwap={handleSwap}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}

const BRACKET_DRAG_MIME = 'application/x-cme-bracket-slot'

function MatchCard({
  match,
  onResult,
  onSwap,
}: {
  match: BracketMatch
  onResult: () => void
  onSwap: (from: BracketSlotRef, to: BracketSlotRef) => boolean
}) {
  const bracket = useBracketStore()
  const tournament = useTournamentStore()
  const [dropSlot, setDropSlot] = useState<'A' | 'B' | null>(null)
  const ids = [match.teamAId, match.teamBId]
  const ready = ids.every(Boolean)
  const isBye =
    match.round === 0 &&
    ((Boolean(match.teamAId) && !match.teamBId) ||
      (!match.teamAId && Boolean(match.teamBId)))
  const canResult = ready || isBye
  const teams = ids.map((id) => {
    if (!id) return null
    return tournament.getTeam(id) ?? getTeam(bracket, id) ?? null
  })
  const scores = [match.scoreA, match.scoreB]
  const label = match.winnerId
    ? 'Final'
    : ready
      ? 'Ready to play'
      : isBye
        ? 'BYE'
        : match.round === 0
          ? 'Open slot'
          : 'TBD'
  const canMove = match.round === 0 && !match.winnerId

  function slotRef(slot: 'A' | 'B'): BracketSlotRef {
    return { matchId: match.id, slot }
  }

  return (
    <article className="match-card" data-match={match.id}>
      <div className="match-label">
        <span>{match.id.toUpperCase()}</span>
        <span>{canMove ? 'Drag to rearrange' : label}</span>
      </div>
      {teams.map((t, i) => {
        const slot: 'A' | 'B' = i === 0 ? 'A' : 'B'
        const over = dropSlot === slot
        return (
          <div
            key={slot}
            className={`match-team${match.winnerId && t?.id === match.winnerId ? ' winner' : ''}${canMove ? ' draggable' : ''}${over ? ' drop-target' : ''}`}
            draggable={canMove}
            title={
              canMove
                ? 'Drag onto another opening-round team to swap'
                : undefined
            }
            onDragStart={(e) => {
              if (!canMove) return
              e.dataTransfer.setData(
                BRACKET_DRAG_MIME,
                JSON.stringify(slotRef(slot)),
              )
              e.dataTransfer.effectAllowed = 'move'
              e.currentTarget.classList.add('dragging')
            }}
            onDragEnd={(e) => {
              e.currentTarget.classList.remove('dragging')
              setDropSlot(null)
            }}
            onDragOver={(e) => {
              if (!canMove) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropSlot(slot)
            }}
            onDragLeave={() => setDropSlot((cur) => (cur === slot ? null : cur))}
            onDrop={(e) => {
              if (!canMove) return
              e.preventDefault()
              e.stopPropagation()
              setDropSlot(null)
              try {
                const raw = e.dataTransfer.getData(BRACKET_DRAG_MIME)
                if (!raw) return
                const from = JSON.parse(raw) as BracketSlotRef
                onSwap(from, slotRef(slot))
              } catch {
                /* ignore */
              }
            }}
          >
            <Avatar
              label={
                t?.tag ??
                (match.round === 0
                  ? ids[i === 0 ? 1 : 0]
                    ? 'BYE'
                    : '—'
                  : 'TBD')
              }
              url={t?.logo}
            />
            <span className={`match-name${!t ? ' muted' : ''}`}>
              {t?.name ??
                (match.round === 0
                  ? ids[i === 0 ? 1 : 0]
                    ? 'BYE'
                    : 'Empty'
                  : 'TBD')}
            </span>
            {canMove && t ? (
              <span className="match-move" aria-hidden>
                ⋮⋮
              </span>
            ) : null}
            <span className="match-score">
              {match.winnerId || match.status === 'done' ? scores[i] : '—'}
            </span>
        </div>
        )
      })}
      <div className="match-bottom">
        {canResult ? (
          <button type="button" className="btn quiet small" onClick={onResult}>
            {match.winnerId
              ? 'Edit result'
              : isBye
                ? 'Confirm BYE'
                : 'Enter result'}
          </button>
        ) : (
          <span>{match.round === 0 ? 'Add an opponent or confirm BYE' : 'Waiting for earlier results'}</span>
        )}
        {ready && !match.winnerId ? (
          <Link
            className="btn quiet small"
            to={`/control/live`}
            onClick={() => useBracketStore.getState().setActiveMatch(match.id)}
          >
            Live desk
            <Icon name="arrow-right" />
          </Link>
        ) : null}
        </div>
    </article>
  )
}

function SettingsTab({
  active,
  onEdit,
  onImported,
}: {
  active: TournamentProject
  onEdit: () => void
  onImported: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onExport() {
    setBusy(true)
    try {
      const bundle = await exportAllData()
      downloadBackup(bundle)
      setNote('Backup downloaded — keep this file safe.')
    } catch {
      setNote('Could not build backup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text) as BackupBundle
      const n = await importAllData(bundle)
      setNote(
        n
          ? `Restored ${n} data sets. Reloading…`
          : 'Backup file had no usable data.',
      )
      if (n) window.setTimeout(() => window.location.reload(), 700)
    } catch {
      setNote('Invalid backup file.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="settings-panel">
      <div className="section-top">
        <h2>Tournament details</h2>
        <button type="button" className="btn quiet small" onClick={onEdit}>
          <Icon name="edit" />
          Edit details
        </button>
      </div>
      <p>Keep your event identity and match labels consistent across the tournament.</p>
      <dl className="settings-list">
        <div>
          <dt>Tournament name</dt>
          <dd>{active.name}</dd>
        </div>
        <div>
          <dt>Match title</dt>
          <dd>{active.matchTitle}</dd>
        </div>
        <div>
          <dt>Bracket size</dt>
          <dd>{active.formatSize} teams</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>Single elimination</dd>
        </div>
      </dl>
      <div className="notice" style={{ marginBottom: 18 }}>
        All {active.formatSize} team slots must be filled before seeding. You can
        leave player details unfinished and add them later.
      </div>

      <div className="section-top" style={{ marginTop: 8 }}>
        <div>
          <h2>Data backup</h2>
          <div className="muted tiny" style={{ marginTop: 5 }}>
            Everything is saved in this browser (IndexedDB) and on the sync hub.
            Export a backup before clearing cache or switching PCs.
          </div>
        </div>
      </div>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn gold"
          disabled={busy}
          onClick={() => void onExport()}
        >
          <Icon name="upload" />
          Download backup
        </button>
        <label className="btn quiet" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <Icon name="photo" />
          Restore backup
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="btn quiet"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true)
              setNote('Downloading Google Sheet + Drive photos…')
              try {
                const bundle = await pullFormImport(true)
                await importAllData(bundle)
                const payload = bundle.channels['mlbb-tournament-state-v2']
                if (payload && typeof payload === 'object') {
                  const result = useTournamentStore
                    .getState()
                    .mergeFormRosters(payload as never)
                  sessionStorage.removeItem('cme-form-imported')
                  setNote(
                    `Form sync · ${result.matched} teams already on lineup (left alone), ${result.added} new teams, ${result.players} players added.`,
                  )
                } else {
                  setNote('Form import was empty.')
                }
                onImported(useTournamentStore.getState().activeTournamentId)
              } catch (err) {
                setNote(
                  err instanceof Error
                    ? `Download failed: ${err.message}`
                    : 'Download failed. Share the sheet + keep Vite running.',
                )
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          <Icon name="users" />
          Load form teams
        </button>
      </div>
      {note ? (
        <div className="notice" style={{ marginBottom: 0 }}>
          {note}
        </div>
      ) : null}
    </section>
  )
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return ref
}

function NewTournamentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (v: {
    name: string
    matchTitle: string
    formatSize: 4 | 8 | 16
    logo: string
  }) => void
}) {
  const ref = useDialog(true)
  const [name, setName] = useState('')
  const [matchTitle, setMatchTitle] = useState('Match 1 · Game 1')
  const [formatSize, setFormatSize] = useState<4 | 8 | 16>(8)
  const [logo, setLogo] = useState('')
  const [error, setError] = useState('')

  return (
    <dialog
      className="dialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) {
            setError('Tournament name is required.')
            return
          }
          onCreate({
            name: name.trim(),
            matchTitle: matchTitle.trim() || 'Match 1 · Game 1',
            formatSize,
            logo,
          })
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">TOURNAMENT STUDIO</div>
            <h2 id="dialog-title">Create a tournament</h2>
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">
          <LogoUpload logo={logo} onLogo={setLogo} />
        <label className="field">
          <span>Tournament name</span>
          <input
              value={name}
              maxLength={80}
              placeholder="e.g. CME ML Championship"
              required
              onChange={(e) => setName(e.target.value)}
          />
        </label>
          <div className="field-row">
        <label className="field">
          <span>Match title</span>
          <input
                value={matchTitle}
                maxLength={42}
                onChange={(e) => setMatchTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Bracket size</span>
          <select
                value={formatSize}
            onChange={(e) =>
                  setFormatSize(Number(e.target.value) as 4 | 8 | 16)
            }
          >
            <option value={4}>4 teams</option>
            <option value={8}>8 teams</option>
            <option value={16}>16 teams</option>
          </select>
        </label>
        </div>
          <p className="field-help">
            Single elimination · Five player slots per team.
          </p>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
      ) : null}
      </div>
        <div className="dialog-foot">
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn gold">
            Create tournament
          </button>
        </div>
      </form>
    </dialog>
  )
}

function SettingsDialog({
  project,
  onClose,
  onSave,
}: {
  project: TournamentProject
  onClose: () => void
  onSave: (v: {
    name: string
    matchTitle: string
    formatSize: 4 | 8 | 16
    logo: string
  }) => void
}) {
  const ref = useDialog(true)
  const [name, setName] = useState(project.name)
  const [matchTitle, setMatchTitle] = useState(project.matchTitle)
  const [formatSize, setFormatSize] = useState(project.formatSize)
  const [logo, setLogo] = useState(project.logo)
  const [error, setError] = useState('')

  return (
    <dialog
      className="dialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) {
            setError('Tournament name is required.')
            return
          }
          if (formatSize < project.teams.length) {
            setError('Choose a bracket size that can hold every team.')
            return
          }
          if (
            formatSize !== project.formatSize &&
            !window.confirm(
              'Changing the bracket size may trim extra team slots. Continue?',
            )
          ) {
            return
          }
          onSave({
            name: name.trim(),
            matchTitle: matchTitle.trim() || project.matchTitle,
            formatSize,
            logo,
          })
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">TOURNAMENT STUDIO</div>
            <h2>Tournament settings</h2>
          </div>
      <button
        type="button"
            className="iconbtn"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="close" />
      </button>
        </div>
        <div className="dialog-body">
          <LogoUpload logo={logo} onLogo={setLogo} />
            <label className="field">
            <span>Tournament name</span>
              <input
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
              />
            </label>
          <div className="field-row">
            <label className="field">
              <span>Match title</span>
              <input
                value={matchTitle}
                maxLength={42}
                onChange={(e) => setMatchTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Bracket size</span>
              <select
                value={formatSize}
                onChange={(e) =>
                  setFormatSize(Number(e.target.value) as 4 | 8 | 16)
                }
              >
                <option value={4}>4 teams</option>
                <option value={8}>8 teams</option>
                <option value={16}>16 teams</option>
              </select>
            </label>
          </div>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn gold">
            Save changes
          </button>
        </div>
      </form>
    </dialog>
  )
}

function TeamDialog({
  team,
  onClose,
  onSave,
  onRemove,
}: {
  team: TournamentTeam | null
  onClose: () => void
  onSave: (payload: {
    name: string
    tag: string
    logo: string
    players: TournamentPlayer[]
  }) => void
  onRemove?: () => void
}) {
  const ref = useDialog(true)
  const [name, setName] = useState(team?.name ?? '')
  const [tag, setTag] = useState(team?.tag ?? '')
  const [logo, setLogo] = useState(team?.logo ?? '')
  const [players, setPlayers] = useState<TournamentPlayer[]>(
    () =>
      team?.players.map((p) => ({
        ...p,
        ign: p.ign ?? '',
      })) ??
      PLAYER_ROLES.map((r, i) => ({
        id: `new-${i}`,
        name: '',
        ign: '',
        photo: '',
        role: r.id,
        order: i,
      })),
  )
  const [error, setError] = useState('')

  return (
    <dialog
      className="dialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) {
            setError('Team name is required.')
            return
          }
          if (!tag.trim()) {
            setError('Team tag is required.')
            return
          }
          onSave({
            name: name.trim(),
            tag: tag.trim().toUpperCase().slice(0, 8),
            logo,
            players,
          })
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">TOURNAMENT STUDIO</div>
            <h2>{team ? 'Edit team' : 'Add a team'}</h2>
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">
          <LogoUpload logo={logo} onLogo={setLogo} tag={tag || 'TEAM'} />
          <div className="field-row">
            <label className="field">
              <span>Team name</span>
              <input
                value={name}
                maxLength={48}
                placeholder="e.g. AP Bren"
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Team tag</span>
              <input
                value={tag}
                maxLength={8}
                placeholder="e.g. APBR"
                required
                onChange={(e) => setTag(e.target.value)}
              />
            </label>
          </div>
          <div className="editor-roster-title">
            <h3>Starting roster</h3>
            <span>Optional 6th spare allowed</span>
          </div>
          {players.map((p, i) => {
            const isSpare = p.role === 'spare' || i >= STARTER_COUNT
            return (
              <div key={p.id} className="editor-player">
                <label
                  className="player-photo"
                  title={`Upload player ${i + 1} photo`}
                >
                  <img
                    src={p.photo || emptySlotPortrait(i)}
                      alt=""
                    className={p.photo ? undefined : 'is-empty-slot'}
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={`Player ${i + 1} photo`}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) {
                        setError('Choose an image up to 2 MB.')
                        return
                      }
                      void readFileAsDataUrl(file).then((photo) => {
                        setPlayers((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, photo } : row,
                          ),
                        )
                      })
                    }}
                  />
                </label>
                <input
                  aria-label={`Player ${i + 1} name`}
                  maxLength={32}
                  value={p.name}
                  placeholder={isSpare ? 'Spare player' : `Player ${i + 1}`}
                  onChange={(e) =>
                    setPlayers((prev) =>
                      prev.map((row, idx) =>
                        idx === i ? { ...row, name: e.target.value } : row,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Player ${i + 1} IGN`}
                  maxLength={20}
                  value={p.ign ?? ''}
                  placeholder="In-game name"
                  title="MLBB in-game name (shown on lineup)"
                  onChange={(e) =>
                    setPlayers((prev) =>
                      prev.map((row, idx) =>
                        idx === i ? { ...row, ign: e.target.value } : row,
                      ),
                    )
                  }
                />
                <select
                  aria-label={`Player ${i + 1} role`}
                  value={p.role}
                  onChange={(e) =>
                    setPlayers((prev) =>
                      prev.map((row, idx) =>
                        idx === i
                          ? { ...row, role: e.target.value as PlayerRole }
                          : row,
                      ),
                    )
                  }
                >
                  {(isSpare ? ALL_PLAYER_ROLES : PLAYER_ROLES).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <label
                  className="check-label"
                  style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                  title="Team Captain / Leader from the form"
                >
                  <input
                    type="checkbox"
                    checked={p.isLeader === true}
                    onChange={(e) =>
                      setPlayers((prev) =>
                        prev.map((row, idx) => ({
                          ...row,
                          isLeader: e.target.checked ? idx === i : false,
                        })),
                      )
                    }
                  />
                  Leader
                </label>
              </div>
            )
          })}
          <div className="actions" style={{ marginTop: 12, marginBottom: 8 }}>
            {players.length < MAX_ROSTER_SIZE ? (
              <button
                type="button"
                className="btn quiet small"
                onClick={() =>
                  setPlayers((prev) => [
                    ...prev,
                    { ...makeSparePlayer(prev.length), name: '' },
                  ])
                }
              >
                <Icon name="plus" />
                Add spare player
              </button>
            ) : (
              <button
                type="button"
                className="btn quiet small"
                onClick={() =>
                  setPlayers((prev) =>
                    prev.filter((p) => p.role !== 'spare').slice(0, STARTER_COUNT),
                  )
                }
              >
                <Icon name="close" />
                Remove spare
              </button>
            )}
          </div>
          <p className="field-help" style={{ marginTop: 6 }}>
            Starting five play draft &amp; lineup. The spare is optional roster
            depth only.
          </p>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="dialog-foot">
          {onRemove ? (
            <button
              type="button"
              className="btn danger small"
              onClick={onRemove}
            >
              Remove team
            </button>
          ) : null}
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn gold">
            Save changes
          </button>
        </div>
      </form>
    </dialog>
  )
}

function LogoUpload({
  logo,
  onLogo,
  tag = 'CME',
}: {
  logo: string
  onLogo: (url: string) => void
  tag?: string
}) {
  return (
    <div className="upload-row">
      <div id="logo-preview">
        <Avatar label={tag} url={logo} tone={1} />
      </div>
      <div className="upload-meta">
        <label className="upload-btn">
          <Icon name="upload" />
          Upload logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Upload logo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > 2 * 1024 * 1024) return
              void readFileAsDataUrl(file).then(onLogo)
            }}
          />
        </label>
        <small>PNG, JPG or WebP · up to 2 MB</small>
      </div>
      {logo ? (
        <button
          type="button"
          className="btn quiet small"
          onClick={() => onLogo('')}
        >
          Remove logo
        </button>
      ) : null}
    </div>
  )
}

function ResultDialog({
  matchId,
  onClose,
  onToast,
}: {
  matchId: string
  onClose: () => void
  onToast: (msg: string) => void
}) {
  const ref = useDialog(true)
  const bracket = useBracketStore()
  const tournament = useTournamentStore()
  const match = bracket.matches.find((m) => m.id === matchId)
  const teamA = match
    ? tournament.getTeam(match.teamAId) ?? getTeam(bracket, match.teamAId)
    : null
  const teamB = match
    ? tournament.getTeam(match.teamBId) ?? getTeam(bracket, match.teamBId)
    : null
  const [scoreA, setScoreA] = useState(match?.scoreA ?? 0)
  const [scoreB, setScoreB] = useState(match?.scoreB ?? 0)
  const [error, setError] = useState('')

  const isBye = Boolean(match && ((teamA && !teamB) || (!teamA && teamB)))
  const sole = teamA ?? teamB

  if (!match || (!teamA && !teamB)) {
    return null
  }

  if (isBye && sole) {
    return (
      <dialog
        className="dialog"
        ref={ref}
        onClose={onClose}
        onCancel={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault()
            useBracketStore
              .getState()
              .setWinner(matchId, sole.id, teamA ? 1 : 0, teamB ? 1 : 0)
            onToast(`${sole.tag} advances (BYE)`)
            onClose()
          }}
        >
          <div className="dialog-head">
            <div>
              <div className="eyebrow">TOURNAMENT STUDIO</div>
              <h2>Confirm BYE</h2>
            </div>
            <button
              type="button"
              className="iconbtn"
              aria-label="Close editor"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-body">
            <p className="field-help">
              {roundLabel(match.round, bracket.bracketSize)} ·{' '}
              {match.id.toUpperCase()}
            </p>
            <p>
              <strong>{sole.name}</strong> has no opponent in this round. Confirm
              only when you are ready for them to advance — they do not start
              ahead automatically.
            </p>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn gold">
              Advance {sole.tag}
            </button>
          </div>
        </form>
      </dialog>
    )
  }

  if (!teamA || !teamB) {
    return null
  }

  return (
    <dialog
      className="dialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          const a = Math.round(Number(scoreA))
          const b = Math.round(Number(scoreB))
          if (
            !Number.isInteger(a) ||
            !Number.isInteger(b) ||
            a < 0 ||
            b < 0 ||
            a > 99 ||
            b > 99
          ) {
            setError('Enter two whole-number scores from 0 to 99.')
            return
          }
          if (a === b) {
            setError('The score cannot be tied.')
            return
          }
          const winnerId = a > b ? teamA.id : teamB.id
          useBracketStore.getState().setWinner(matchId, winnerId, a, b)
          onToast('Result saved')
          onClose()
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">TOURNAMENT STUDIO</div>
            <h2>Match result</h2>
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">
          <p className="field-help">
            {roundLabel(match.round, bracket.bracketSize)} ·{' '}
            {match.id.toUpperCase()}
          </p>
          <div className="score-grid">
            <label className="score-team">
              <Avatar label={teamA.tag} url={teamA.logo} tone={0} />
              <strong>{teamA.name}</strong>
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                required
                value={scoreA}
                aria-label={`${teamA.name} score`}
                onChange={(e) => setScoreA(Number(e.target.value))}
              />
            </label>
            <span>:</span>
            <label className="score-team">
              <Avatar label={teamB.tag} url={teamB.logo} tone={1} />
              <strong>{teamB.name}</strong>
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                required
                value={scoreB}
                aria-label={`${teamB.name} score`}
                onChange={(e) => setScoreB(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="field-help" style={{ marginTop: 24 }}>
            Enter the final series score. The winning team advances automatically.
          </p>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="dialog-foot">
          {match.winnerId ? (
            <button
              type="button"
              className="btn danger small"
              onClick={() => {
                if (
                  window.confirm(
                    'Clear this match result and any dependent results in later rounds?',
                  )
                ) {
                  useBracketStore.getState().clearResult(matchId)
                  onToast('Result cleared')
                  onClose()
                }
              }}
            >
              Clear result
            </button>
          ) : null}
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn gold">
            Save result
          </button>
        </div>
      </form>
    </dialog>
  )
}
