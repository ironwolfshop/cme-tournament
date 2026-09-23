import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ControlNav from '../components/ControlNav'
import { Icon } from '../components/cme/Icon'
import {
  initTournamentSync,
  PLAYER_ROLES,
  selectActiveProject,
  useTournamentStore,
  type PlayerRole,
  type TournamentProject,
  type TournamentTeam,
} from '../store/tournamentStore'
import '../styles/draft-room.css'
import '../styles/tournament-hub.css'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function formatUpdated(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function isDefaultTeamName(name: string, seed: number) {
  const trimmed = name.trim()
  return !trimmed || /^team\s*\d+$/i.test(trimmed) || trimmed === `Team ${seed}`
}

function isDefaultTag(tag: string, seed: number) {
  const trimmed = tag.trim()
  return !trimmed || /^t\d+$/i.test(trimmed) || trimmed === `T${seed}`
}

function isDefaultPlayerName(name: string, order: number) {
  const trimmed = name.trim()
  return !trimmed || /^player\s*\d+$/i.test(trimmed) || trimmed === `Player ${order + 1}`
}

function displayTeamName(name: string, seed: number) {
  return isDefaultTeamName(name, seed) ? 'Untitled team' : name.trim()
}

function displayTag(tag: string, seed: number) {
  return isDefaultTag(tag, seed) ? 'Add tag' : tag.trim()
}

export default function TournamentControlPage() {
  const store = useTournamentStore()
  const active = useTournamentStore(selectActiveProject)
  const [view, setView] = useState<'portfolio' | 'edit'>('portfolio')
  const [expanded, setExpanded] = useState<string | null>(
    active.teams[0]?.id ?? null,
  )
  const [seededMsg, setSeededMsg] = useState('')

  useEffect(() => {
    initTournamentSync()
    document.documentElement.style.background = '#0b1220'
    document.body.style.background = '#0b1220'
  }, [])

  useEffect(() => {
    if (view === 'edit') {
      setExpanded(active.teams[0]?.id ?? null)
    }
  }, [view, active.id])

  return (
    <div className="cme-draft tournament-hub">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <Icon name="swords" />
          </div>
          <div>
            <div className="brand-name">CME TOURNAMENT</div>
            <div className="brand-sub">
              {view === 'portfolio' ? 'PORTFOLIO' : active.name.toUpperCase()}
            </div>
          </div>
        </div>
        <ControlNav />
        <div className="operator">
          <Link className="preview-tag" to="/control/live">
            Live Desk
          </Link>
        </div>
      </header>

      <main>
        {view === 'portfolio' ? (
          <PortfolioView
            tournaments={store.tournaments}
            activeId={store.activeTournamentId}
            onOpen={(id) => {
              store.selectTournament(id)
              setView('edit')
            }}
            onCreate={() => {
              store.createTournament()
              setView('edit')
            }}
            onDelete={(id) => store.deleteTournament(id)}
          />
        ) : (
          <EditorView
            active={active}
            expanded={expanded}
            setExpanded={setExpanded}
            seededMsg={seededMsg}
            onBack={() => setView('portfolio')}
            onSeed={() => {
              store.seedIntoBracket()
              setSeededMsg('Bracket seeded — open Live Desk to start a fight')
              window.setTimeout(() => setSeededMsg(''), 3500)
            }}
          />
        )}
      </main>
    </div>
  )
}

function PortfolioView({
  tournaments,
  activeId,
  onOpen,
  onCreate,
  onDelete,
}: {
  tournaments: TournamentProject[]
  activeId: string
  onOpen: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">All events · pick one to edit</div>
          <h1>
            Portfolio<span style={{ color: 'var(--gold)' }}>.</span>
          </h1>
        </div>
        <button type="button" className="btn gold" onClick={onCreate}>
          New tournament
        </button>
      </div>

      <div className="th-portfolio-grid">
        {tournaments.map((t) => (
          <TournamentCard
            key={t.id}
            project={t}
            isActive={t.id === activeId}
            canDelete={tournaments.length > 1}
            onOpen={() => onOpen(t.id)}
            onDelete={() => onDelete(t.id)}
          />
        ))}
        <button type="button" className="th-add-card" onClick={onCreate}>
          <span className="th-add-icon">+</span>
          <span className="th-add-label">ADD TOURNAMENT</span>
        </button>
      </div>
    </>
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
  const logoStrip = project.teams.filter((t) => t.logo).slice(0, 6)
  const nameIsPlaceholder =
    !project.name.trim() || /^new tournament/i.test(project.name.trim())

  return (
    <article className={`th-card${isActive ? ' is-active' : ''}`}>
      <button type="button" className="th-card-hit" onClick={onOpen}>
        <div className="th-card-top">
          <div>
            <div className="th-card-meta">
              {project.formatSize}-TEAM · {project.matchTitle}
            </div>
            <h2
              className={`th-card-title${nameIsPlaceholder ? ' is-placeholder' : ''}`}
            >
              {nameIsPlaceholder ? 'Untitled tournament' : project.name}
            </h2>
          </div>
          {isActive ? <span className="th-badge-active">ACTIVE</span> : null}
        </div>

        <div className="th-logo-strip">
          {logoStrip.length ? (
            logoStrip.map((team) => (
              <span key={team.id} title={team.name} className="th-logo-chip">
                <img src={team.logo} alt="" />
              </span>
            ))
          ) : (
            <span className="th-logo-empty">
              {project.teams.length} teams · logos pending
            </span>
          )}
        </div>

        <div className="th-card-updated">
          Updated {formatUpdated(project.updatedAt)}
        </div>
      </button>

      <div className="th-card-actions">
        <button type="button" className="btn gold" onClick={onOpen}>
          Open
        </button>
        {canDelete ? (
          <button
            type="button"
            className="btn th-btn-danger"
            onClick={(e) => {
              e.stopPropagation()
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
      </div>
    </article>
  )
}

function EditorView({
  active,
  expanded,
  setExpanded,
  seededMsg,
  onBack,
  onSeed,
}: {
  active: TournamentProject
  expanded: string | null
  setExpanded: (id: string | null) => void
  seededMsg: string
  onBack: () => void
  onSeed: () => void
}) {
  const store = useTournamentStore()

  return (
    <>
      <div className="page-heading">
        <div>
          <button type="button" className="th-back" onClick={onBack}>
            ← Portfolio
          </button>
          <div className="eyebrow">Setup once · run live</div>
          <h1>
            {active.name}
            <span style={{ color: 'var(--gold)' }}>.</span>
          </h1>
        </div>
        <div className="th-heading-actions">
          <a
            className="btn"
            href="/overlay/match"
            target="_blank"
            rel="noreferrer"
          >
            Logo / match scene
          </a>
          <Link className="btn gold" to="/control/live">
            Live Desk
          </Link>
        </div>
      </div>

      <section className="th-meta-grid">
        <label className="field">
          <span>Tournament name</span>
          <input
            value={active.name}
            onChange={(e) => store.setProjectName(e.target.value)}
            placeholder="e.g. CME ML Invitational"
            maxLength={48}
          />
        </label>
        <label className="field">
          <span>Match title</span>
          <input
            value={active.matchTitle}
            onChange={(e) => store.setMatchTitle(e.target.value)}
            placeholder="SEMI FINAL · GAME 1"
            maxLength={40}
          />
        </label>
        <label className="field">
          <span>Bracket size</span>
          <select
            value={active.formatSize}
            onChange={(e) =>
              store.setFormatSize(Number(e.target.value) as 4 | 8 | 16)
            }
          >
            <option value={4}>4 teams</option>
            <option value={8}>8 teams</option>
            <option value={16}>16 teams</option>
          </select>
        </label>
        <div className="th-meta-actions">
          <button
            type="button"
            className="btn"
            onClick={() => store.addTeam()}
            disabled={active.teams.length >= active.formatSize}
          >
            Add team
          </button>
          <button type="button" className="btn gold" onClick={onSeed}>
            Seed into bracket
          </button>
        </div>
      </section>

      {seededMsg ? <p className="th-seed-msg">{seededMsg}</p> : null}

      <div className="th-team-list">
        {active.teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            expanded={expanded === team.id}
            onToggle={() =>
              setExpanded(expanded === team.id ? null : team.id)
            }
            canRemove={active.teams.length > 2}
          />
        ))}
      </div>

      <p className="th-foot-note">
        Match title + tournament name feed the{' '}
        <a href="/overlay/match" target="_blank" rel="noreferrer">
          logo preview scene
        </a>{' '}
        and Live Desk Start fight overlays.
      </p>
    </>
  )
}

function TeamCard({
  team,
  expanded,
  onToggle,
  canRemove,
}: {
  team: TournamentTeam
  expanded: boolean
  onToggle: () => void
  canRemove: boolean
}) {
  const updateTeam = useTournamentStore((s) => s.updateTeam)
  const updatePlayer = useTournamentStore((s) => s.updatePlayer)
  const removeTeam = useTournamentStore((s) => s.removeTeam)

  const namePending = isDefaultTeamName(team.name, team.seed)
  const tagPending = isDefaultTag(team.tag, team.seed)

  return (
    <article className={`th-team${expanded ? ' is-open' : ''}`}>
      <button type="button" className="th-team-head" onClick={onToggle}>
        <span className={`th-crest${team.logo ? '' : ' is-empty'}`}>
          {team.logo ? (
            <img src={team.logo} alt="" />
          ) : (
            team.tag.slice(0, 2).toUpperCase() || `#${team.seed}`
          )}
        </span>
        <span className="th-team-identity">
          <span className="th-team-name-row">
            <span className="th-seed">#{String(team.seed).padStart(2, '0')}</span>
            <strong
              className={`th-team-name${namePending ? ' is-placeholder' : ''}`}
            >
              {displayTeamName(team.name, team.seed)}
            </strong>
          </span>
          <span className={`th-team-tag${tagPending ? ' is-placeholder' : ''}`}>
            {displayTag(team.tag, team.seed)}
          </span>
        </span>
        <span className="th-team-toggle">{expanded ? 'Hide' : 'Edit'}</span>
      </button>

      {expanded ? (
        <div className="th-team-body">
          <div className="th-team-fields">
            <label className="th-field">
              <span className="th-field-label">Team name</span>
              <input
                className={`th-field-input${namePending ? ' is-empty' : ''}`}
                value={namePending ? '' : team.name}
                onChange={(e) => updateTeam(team.id, { name: e.target.value })}
                placeholder="e.g. Apex Titans"
                maxLength={28}
                autoComplete="off"
              />
              <span className="th-field-hint">Shown on scoreboard & overlays</span>
            </label>
            <label className="th-field">
              <span className="th-field-label">Tag</span>
              <input
                className={`th-field-input th-field-tag${tagPending ? ' is-empty' : ''}`}
                value={tagPending ? '' : team.tag}
                onChange={(e) =>
                  updateTeam(team.id, {
                    tag: e.target.value.toUpperCase().replace(/\s+/g, ''),
                  })
                }
                placeholder="e.g. APX"
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="th-field-hint">3–5 letters · crest fallback</span>
            </label>
            <div className="th-field th-field-logo">
              <span className="th-field-label">Logo</span>
              <label
                className={`th-logo-drop${team.logo ? ' has-logo' : ''}`}
                title="Upload team logo"
              >
                {team.logo ? (
                  <>
                    <img src={team.logo} alt="" className="th-logo-preview" />
                    <span className="th-logo-drop-meta">
                      <strong>Logo set</strong>
                      <small>Click to replace image</small>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="th-logo-drop-icon" aria-hidden>
                      <Icon name="plus" />
                    </span>
                    <span className="th-logo-drop-meta">
                      <strong>Add team logo</strong>
                      <small>PNG / JPG · square works best</small>
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void readFileAsDataUrl(file).then((logo) =>
                      updateTeam(team.id, { logo }),
                    )
                  }}
                />
              </label>
              {team.logo ? (
                <button
                  type="button"
                  className="th-logo-clear"
                  onClick={() => updateTeam(team.id, { logo: '' })}
                >
                  Remove logo
                </button>
              ) : (
                <span className="th-field-hint">Optional · used on bracket & cams</span>
              )}
            </div>
          </div>

          <div className="th-roster">
            <div className="th-roster-label">Players · roles</div>
            {team.players.map((player) => {
              const playerPending = isDefaultPlayerName(player.name, player.order)
              return (
                <div key={player.id} className="th-player-row">
                  <label
                    className={`th-photo${player.photo ? ' has-image' : ''}`}
                    title="Upload player photo"
                  >
                    {player.photo ? (
                      <img src={player.photo} alt="" />
                    ) : (
                      <span className="th-photo-fallback">
                        <Icon name="users" />
                        <small>PHOTO</small>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        void readFileAsDataUrl(file).then((photo) =>
                          updatePlayer(team.id, player.id, { photo }),
                        )
                      }}
                    />
                  </label>
                  <input
                    className={`th-input${playerPending ? ' is-placeholder-value' : ''}`}
                    value={playerPending ? '' : player.name}
                    onChange={(e) =>
                      updatePlayer(team.id, player.id, { name: e.target.value })
                    }
                    placeholder="Player IGN"
                    maxLength={24}
                  />
                  <select
                    className="th-select"
                    value={player.role}
                    onChange={(e) =>
                      updatePlayer(team.id, player.id, {
                        role: e.target.value as PlayerRole,
                      })
                    }
                  >
                    {PLAYER_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <span className="th-slot-meta">Slot {player.order + 1}</span>
                </div>
              )
            })}
          </div>

          {canRemove ? (
            <button
              type="button"
              className="btn th-remove"
              onClick={() => removeTeam(team.id)}
            >
              Remove team
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
