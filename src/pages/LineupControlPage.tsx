import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/cme/Icon'
import TeamRevealStage, {
  emptySlotPortrait,
} from '../components/lineup/TeamRevealStage'
import StudioShell from '../components/cme/StudioShell'
import { compressImageFile } from '../lib/appStorage'
import {
  cancelBgRemover,
  preloadBgRemover,
  removePhotoBackground,
} from '../lib/bgRemove'
import { absoluteUrl, useLanOrigins } from '../lib/lanOrigins'
import { initDraftSync } from '../store/draftStore'
import {
  initLineupSync,
  useLineupStore,
  type RevealLayout,
  type RevealTemplate,
} from '../store/lineupStore'
import {
  initTournamentSync,
  selectActiveProject,
  starterPlayers,
  useTournamentStore,
} from '../store/tournamentStore'

const ACCENTS = ['#ef591f', '#145ab2', '#8e194c'] as const
const ROLES = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam', 'Substitute', 'Coach']

export default function LineupControlPage() {
  const store = useLineupStore()
  const side = store.editSide
  const team = store[side]
  const [selected, setSelected] = useState(0)
  const tournamentStore = useTournamentStore()
  const tournaments = useTournamentStore((s) => s.tournaments)
  const active = useTournamentStore(selectActiveProject)
  const [pickTournamentId, setPickTournamentId] = useState('')
  const [pickTeamId, setPickTeamId] = useState('')
  const [loadNote, setLoadNote] = useState('')
  const [autoCutout, setAutoCutout] = useState(true)
  const [bgBusy, setBgBusy] = useState(false)
  const [bgProgress, setBgProgress] = useState<string>('')
  const [batchJob, setBatchJob] = useState<{
    title: string
    detail: string
    current: number
    total: number
  } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    initLineupSync()
    initDraftSync()
    initTournamentSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
    void preloadBgRemover().catch(() => {
      // First-run download can fail offline — cutout will retry on demand.
    })
  }, [])

  // Tournament "Send to blue/red" lands here with ?cutall=1 to strip all photos.
  useEffect(() => {
    if (searchParams.get('cutall') !== '1') return
    const target =
      searchParams.get('side') === 'red' || searchParams.get('side') === 'blue'
        ? searchParams.get('side')!
        : useLineupStore.getState().editSide
    const next = new URLSearchParams(searchParams)
    next.delete('cutall')
    next.delete('side')
    setSearchParams(next, { replace: true })
    void (async () => {
      const n = await batchCutoutSide(
        target as 'blue' | 'red',
        'Removing backgrounds on loaded team…',
      )
      setLoadNote(
        n > 0
          ? `${n} cutout${n === 1 ? '' : 's'} saved permanently.`
          : 'No photos needed cutting.',
      )
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot from query
  }, [])

  useEffect(() => {
    if (selected >= team.players.length) setSelected(0)
  }, [selected, team.players.length])

  const pickProject =
    tournaments.find((t) => t.id === pickTournamentId) ?? active ?? null
  const savedTeams = pickProject?.teams ?? []

  useEffect(() => {
    if (!tournaments.length) {
      setPickTournamentId('')
      return
    }
    if (!tournaments.some((t) => t.id === pickTournamentId)) {
      setPickTournamentId(
        active?.id ?? tournamentStore.activeTournamentId ?? tournaments[0]!.id,
      )
    }
  }, [
    tournaments,
    pickTournamentId,
    active?.id,
    tournamentStore.activeTournamentId,
  ])

  useEffect(() => {
    if (!savedTeams.length) {
      setPickTeamId('')
      return
    }
    if (!savedTeams.some((t) => t.id === pickTeamId)) {
      setPickTeamId(savedTeams[0]!.id)
    }
  }, [savedTeams, pickTeamId])

  // Play sequence on the control desk (mirrors overlay)
  useEffect(() => {
    if (!store.playing) return
    if (store.revealed >= team.players.length) {
      store.setPlaying(false)
      return
    }
    const delay = store.revealed === 0 ? 900 : 2200
    const id = window.setTimeout(() => {
      useLineupStore.getState().advanceReveal()
    }, delay)
    return () => window.clearTimeout(id)
  }, [store.playing, store.revealed, team.players.length, store])

  const origins = useLanOrigins()
  const lineupLocal = absoluteUrl(origins.local, '/overlay/lineup')
  const lineupLan = origins.lan
    ? absoluteUrl(origins.lan, '/overlay/lineup')
    : null

  async function applyCutout(
    source: string | File,
    onTick?: (msg: string) => void,
  ): Promise<string> {
    onTick?.('Starting background removal…')
    return removePhotoBackground(source, (_pct, stage) => {
      onTick?.(stage ?? 'Working…')
    })
  }

  function abortBatchCutout() {
    cancelBgRemover()
    setBatchJob(null)
    setBgBusy(false)
    setBgProgress('')
    setLoadNote('Background removal cancelled. You can retry anytime.')
  }

  /** Cut out every player photo on a side; keeps originals for restore. */
  async function batchCutoutSide(
    target: 'blue' | 'red',
    title: string,
  ): Promise<number> {
    const players = useLineupStore.getState()[target].players
    const jobs = players
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => {
        if (!p.photo) return false
        // Already cut and saved — do not wipe / re-cut.
        const original = p.photoOriginal || ''
        return !(original && p.photo !== original)
      })
    if (!jobs.length) {
      persistCutoutsToTournament(target)
      return 0
    }

    setBatchJob({
      title,
      detail: 'Downloading AI model (first run ~80 MB)…',
      current: 0,
      total: jobs.length,
    })
    setBgBusy(true)
    try {
      await preloadBgRemover((_pct, stage) => {
        setBatchJob((prev) =>
          prev
            ? {
                ...prev,
                detail: stage ?? 'Downloading AI model…',
              }
            : prev,
        )
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not load AI model.'
      setBatchJob(null)
      setBgBusy(false)
      if (!/cancelled/i.test(msg)) {
        setLoadNote(`Background removal failed: ${msg}`)
      }
      return 0
    }

    let done = 0
    let failed = 0
    for (const { p, index } of jobs) {
      const label = p.name.trim() || `Player ${index + 1}`
      setBatchJob({
        title,
        detail: `Cutting ${label}…`,
        current: done,
        total: jobs.length,
      })
      const original = p.photoOriginal || p.photo
      try {
        const cutout = await applyCutout(original, (msg) => {
          setBatchJob({
            title,
            detail: `${label} — ${msg}`,
            current: done,
            total: jobs.length,
          })
        })
        useLineupStore.getState().updatePlayer(target, index, {
          photo: cutout,
          photoOriginal: original,
        })
        done += 1
        setBatchJob({
          title,
          detail: `Saved ${label}`,
          current: done,
          total: jobs.length,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (/cancelled/i.test(msg)) {
          persistCutoutsToTournament(target)
          setBatchJob(null)
          setBgBusy(false)
          return done
        }
        useLineupStore.getState().updatePlayer(target, index, {
          photoOriginal: original,
        })
        failed += 1
        setBatchJob({
          title,
          detail: msg ? `${label} failed: ${msg}` : `${label} failed`,
          current: done + failed,
          total: jobs.length,
        })
      }
    }

    persistCutoutsToTournament(target)
    setBatchJob(null)
    setBgBusy(false)
    if (failed) {
      setLoadNote(
        `${jobs.length - failed} cutouts saved · ${failed} failed (retry those photos).`,
      )
    }
    return jobs.length - failed
  }

  /** Write current side cutouts onto the tournament roster permanently. */
  function persistCutoutsToTournament(target: 'blue' | 'red') {
    const lineup = useLineupStore.getState()[target]
    const teamId = lineup.sourceTeamId
    if (!teamId) return
    useTournamentStore.getState().savePlayerCutouts(
      teamId,
      lineup.players.map((p, order) => ({
        order,
        photo: p.photo,
        photoOriginal: p.photoOriginal || p.photo,
      })),
    )
  }

  function onPhotoFile(index: number, file: File | null) {
    if (!file) return
    void (async () => {
      setBgBusy(true)
      setBgProgress(autoCutout ? 'Preparing photo…' : 'Uploading…')
      try {
        const original = await compressImageFile(file, {
          maxEdge: 1800,
          quality: 0.94,
        })
        if (autoCutout) {
          const photo = await applyCutout(original, setBgProgress)
          store.updatePlayer(side, index, {
            photo,
            photoOriginal: original,
          })
        } else {
          store.updatePlayer(side, index, {
            photo: original,
            photoOriginal: original,
          })
        }
        persistCutoutsToTournament(side)
        setBgProgress('Saved permanently')
      } catch (err) {
        setBgProgress(
          err instanceof Error
            ? err.message
            : 'Background removal failed — keeping original',
        )
        try {
          const original = await compressImageFile(file, {
            maxEdge: 1800,
            quality: 0.94,
          })
          store.updatePlayer(side, index, {
            photo: original,
            photoOriginal: original,
          })
        } catch {
          /* ignore */
        }
      } finally {
        setBgBusy(false)
      }
    })()
  }

  function onLogoFile(file: File | null) {
    if (!file) return
    void compressImageFile(file, { maxEdge: 512, quality: 0.85 }).then(
      (teamLogo) => {
        store.updateTeam(side, { teamLogo })
      },
    )
  }

  async function cutoutCurrentPhoto() {
    const current = team.players[selected]
    if (!current?.photo || bgBusy) return
    setBgBusy(true)
    try {
      const original = current.photoOriginal || current.photo
      const photo = await applyCutout(original, setBgProgress)
      store.updatePlayer(side, selected, {
        photo,
        photoOriginal: original,
      })
      persistCutoutsToTournament(side)
      setBgProgress('Cutout saved permanently')
    } catch (err) {
      setBgProgress(
        err instanceof Error ? err.message : 'Background removal failed',
      )
    } finally {
      setBgBusy(false)
    }
  }

  function restoreBackground() {
    const current = team.players[selected]
    if (!current?.photoOriginal) return
    store.updatePlayer(side, selected, { photo: current.photoOriginal })
    persistCutoutsToTournament(side)
    setBgProgress('Original restored (saved) — remove again anytime')
  }

  function tournamentPayload(teamId: string) {
    const t = savedTeams.find((x) => x.id === teamId)
    if (!t) return null
    const starters = starterPlayers(t.players)
    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      logo: t.logo,
      players: starters.map((p) => ({
        name: p.name,
        ign: p.ign,
        photo: p.photo,
        photoOriginal: p.photoOriginal || '',
        role: p.role,
        order: p.order,
        isLeader: p.isLeader === true,
      })),
    }
  }

  function loadTournamentTeam(target: 'blue' | 'red', teamId = pickTeamId) {
    const payload = tournamentPayload(teamId)
    if (!payload) {
      setLoadNote('Pick a saved team first.')
      return
    }
    store.loadTournamentTeamToSide(target, payload, pickProject?.name)
    setSelected(0)
    void (async () => {
      const n = await batchCutoutSide(
        target,
        `Removing backgrounds · ${payload.tag || payload.name}`,
      )
      setLoadNote(
        n > 0
          ? `Loaded ${payload.tag || payload.name} onto ${target.toUpperCase()} · ${n} new cutout${n === 1 ? '' : 's'} saved permanently.`
          : `Loaded ${payload.tag || payload.name} onto ${target.toUpperCase()} · saved cutouts kept.`,
      )
    })()
  }

  function loadActiveMatch() {
    const blueId = tournamentStore.blueTeamId
    const redId = tournamentStore.redTeamId
    const blueTeam = blueId
      ? (tournaments
          .flatMap((t) => t.teams)
          .find((t) => t.id === blueId) ?? null)
      : null
    const redTeam = redId
      ? (tournaments
          .flatMap((t) => t.teams)
          .find((t) => t.id === redId) ?? null)
      : null
    if (blueTeam && redTeam) {
      const blue = {
        id: blueTeam.id,
        name: blueTeam.name,
        tag: blueTeam.tag,
        logo: blueTeam.logo,
        players: starterPlayers(blueTeam.players).map((p) => ({
          name: p.name,
          ign: p.ign,
          photo: p.photo,
          photoOriginal: p.photoOriginal || '',
          role: p.role,
          order: p.order,
          isLeader: p.isLeader === true,
        })),
      }
      const red = {
        id: redTeam.id,
        name: redTeam.name,
        tag: redTeam.tag,
        logo: redTeam.logo,
        players: starterPlayers(redTeam.players).map((p) => ({
          name: p.name,
          ign: p.ign,
          photo: p.photo,
          photoOriginal: p.photoOriginal || '',
          role: p.role,
          order: p.order,
          isLeader: p.isLeader === true,
        })),
      }
      store.loadFromTournamentTeams(blue, red, pickProject?.name ?? active?.name)
      setSelected(0)
      void (async () => {
        const a = await batchCutoutSide('blue', `Cutting ${blue.tag}…`)
        const b = await batchCutoutSide('red', `Cutting ${red.tag}…`)
        setLoadNote(
          `Loaded ${blue.tag} vs ${red.tag} · ${a + b} cutouts saved.`,
        )
      })()
      return
    }
    if (blueId) loadTournamentTeam('blue', blueId)
    if (redId) loadTournamentTeam('red', redId)
  }

  const player = team.players[selected]
  const picked = savedTeams.find((t) => t.id === pickTeamId)
  const hasMatchPair =
    Boolean(tournamentStore.blueTeamId) && Boolean(tournamentStore.redTeamId)

  return (
    <StudioShell
      crumb={
        <>
          <Link to="/control/tournament">Workspace</Link>
          <span>/</span>
          <span>Team reveal</span>
        </>
      }
      note={
        <>
          <span className="dot" />
          Lineup scene · OBS output
        </>
      }
      topRight={
        <a
          className="btn gold small"
          href={lineupLocal}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="monitor" />
          Open scene
        </a>
      }
    >
      <div className="cme-reveal studio-page reveal-desk">
        {batchJob ? (
          <div
            className="reveal-desk-cutout-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="reveal-desk-cutout-card">
              <div className="eyebrow">BACKGROUND REMOVAL</div>
              <h2>{batchJob.title}</h2>
              <p>{batchJob.detail}</p>
              <div className="reveal-desk-cutout-bar">
                <span
                  style={{
                    width: `${
                      batchJob.total
                        ? Math.max(
                            8,
                            (batchJob.current / batchJob.total) * 100,
                          )
                        : 8
                    }%`,
                  }}
                />
              </div>
              <strong>
                {batchJob.current} / {batchJob.total} photos
              </strong>
              <p className="fine">
                First run downloads ~80 MB once, then the browser caches it.
                Stuck for a few minutes? Cancel and retry on a stable network.
              </p>
              <button
                type="button"
                className="btn quiet small"
                style={{ marginTop: 12 }}
                onClick={abortBatchCutout}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <header className="page-head reveal-desk-head">
          <div>
            <div className="eyebrow">ROSTER PRESENTATION</div>
            <h1>Team reveal</h1>
            <p>
              Insert your players. Set the names. Bring on the team — output
              shows on the lineup scene.
            </p>
          </div>
          <p className="reveal-desk-obs">
            OBS · 1920×1080
            <div style={{ marginTop: 6 }}>
              Localhost · <code>{lineupLocal}</code>
            </div>
            {lineupLan ? (
              <div style={{ marginTop: 4 }}>
                LAN · <code style={{ color: '#7ddea8' }}>{lineupLan}</code>
              </div>
            ) : null}
          </p>
        </header>

        <section className="panel reveal-desk-load">
          <div className="panel-title">
            <h2>Load tournament team</h2>
          </div>
          {tournaments.length && savedTeams.length ? (
            <>
              <div className="reveal-desk-load-row">
                <label className="label">
                  <span>Tournament</span>
                  <select
                    value={pickTournamentId}
                    onChange={(e) => {
                      setPickTournamentId(e.target.value)
                      useTournamentStore
                        .getState()
                        .selectTournament(e.target.value)
                    }}
                  >
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.teams.length} teams
                      </option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  <span>Saved team</span>
                  <select
                    value={pickTeamId}
                    onChange={(e) => setPickTeamId(e.target.value)}
                  >
                    {savedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {(t.tag || t.name) +
                          (t.name && t.tag ? ` · ${t.name}` : '')}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn gold"
                  onClick={() => loadTournamentTeam('blue')}
                >
                  Load → Blue
                </button>
                <button
                  type="button"
                  className="btn gold"
                  onClick={() => loadTournamentTeam('red')}
                >
                  Load → Red
                </button>
              </div>
              {picked ? (
                <p className="fine" style={{ marginTop: 10 }}>
                  {starterPlayers(picked.players).filter((p) => p.name.trim())
                    .length}
                  /5 named ·{' '}
                  {starterPlayers(picked.players)
                    .map((p) => p.role.toUpperCase())
                    .join(' · ')}
                  {hasMatchPair ? (
                    <>
                      {' '}
                      ·{' '}
                      <button
                        type="button"
                        className="btn quiet small"
                        style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                        onClick={loadActiveMatch}
                      >
                        Load active match
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
              {loadNote ? (
                <p className="reveal-desk-toast">
                  <strong>Loaded.</strong> {loadNote}
                </p>
              ) : null}
            </>
          ) : (
            <p className="fine">
              No saved teams yet. Add rosters under{' '}
              <Link to="/control/tournament?tab=teams">Tournaments → Teams</Link>
              , then come back here to load them onto Blue / Red.
            </p>
          )}
        </section>

        <div className="reveal-desk-grid">
          <section className="reveal-desk-stage">
            <div className="preview-shell reveal-desk-preview">
              <TeamRevealStage preview selectedIndex={selected} />
            </div>

            <div className="preview-toolbar">
              <div className="actions">
                <button
                  type="button"
                  className="btn quiet small"
                  onClick={() => store.hideAll()}
                >
                  Hide all
                </button>
                <button
                  type="button"
                  className="btn gold small"
                  disabled={store.revealed >= team.players.length}
                  onClick={() => store.revealNext()}
                >
                  Reveal next
                </button>
                <button
                  type="button"
                  className="btn quiet small"
                  onClick={() => {
                    if (store.playing) {
                      store.setPlaying(false)
                      return
                    }
                    store.hideAll()
                    window.setTimeout(() => {
                      useLineupStore.getState().setPlaying(true)
                    }, 50)
                  }}
                >
                  {store.playing ? 'Pause' : 'Play sequence'}
                </button>
                <button
                  type="button"
                  className="btn quiet small"
                  onClick={() => store.showAll()}
                >
                  Show all
                </button>
              </div>
              <div className="reveal-progress">
                <strong>{store.revealed}</strong> / {team.players.length}{' '}
                revealed
              </div>
            </div>

            <div className="reveal-desk-roster">
            <div className="section-head reveal-desk-roster-head">
              <h2>
                Your lineup{' '}
                <span>
                  {team.players.length} members · select to edit
                </span>
              </h2>
              <div className="actions">
                <button
                  type="button"
                  className="btn quiet small"
                  onClick={() => store.autoArrange(side)}
                >
                  Auto arrange
                </button>
              </div>
            </div>

            <div className="member-rail">
              {team.players.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`member-tile${selected === i ? ' active' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <div className="member-thumb">
                    <img
                      src={p.photo || emptySlotPortrait(i)}
                      alt=""
                      className={p.photo ? undefined : 'is-empty-slot'}
                    />
                    <span className="tile-number">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {p.photo ? <span className="photo-dot" /> : null}
                  </div>
                  <div className="member-tile-info">
                    <strong>{p.name.trim() || `PLAYER ${i + 1}`}</strong>
                    <span>
                      {p.isLeader
                        ? 'Team Leader'
                        : p.subtitle || 'Role'}{' '}
                      · {p.row === 'back' ? 'Back' : 'Front'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {player ? (
              <section className="member-editor">
                <div className="member-editor-head">
                  <h3>
                    <span>{String(selected + 1).padStart(2, '0')}</span>
                    Edit roster member
                  </h3>
                  <div className="head-actions">
                    <button
                      type="button"
                      className="iconbtn"
                      disabled={selected === 0}
                      aria-label="Move earlier"
                      onClick={() => {
                        store.movePlayer(side, selected, -1)
                        setSelected((s) => Math.max(0, s - 1))
                      }}
                    >
                      <Icon name="arrow" />
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      disabled={selected === team.players.length - 1}
                      aria-label="Move later"
                      onClick={() => {
                        store.movePlayer(side, selected, 1)
                        setSelected((s) =>
                          Math.min(team.players.length - 1, s + 1),
                        )
                      }}
                    >
                      <Icon name="arrow-right" />
                    </button>
                  </div>
                </div>
                <div className="member-editor-body">
                  <div>
                    <label className="photo-upload">
                      <img
                        src={player.photo || emptySlotPortrait(selected)}
                        alt=""
                        className={player.photo ? undefined : 'is-empty-slot'}
                      />
                      <span className="photo-upload-caption">
                        {bgBusy
                          ? 'Processing…'
                          : player.photo
                            ? 'Change photo'
                            : 'Upload photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        disabled={bgBusy}
                        onChange={(e) => {
                          onPhotoFile(selected, e.target.files?.[0] ?? null)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <div className="bg-remove-actions">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={autoCutout}
                          onChange={(e) => setAutoCutout(e.target.checked)}
                        />
                        Auto-remove on upload
                      </label>
                      <button
                        type="button"
                        className="btn gold small"
                        disabled={!player.photo || bgBusy}
                        onClick={() => void cutoutCurrentPhoto()}
                      >
                        Remove background
                      </button>
                      <button
                        type="button"
                        className="btn quiet small"
                        disabled={!player.photoOriginal || bgBusy}
                        onClick={restoreBackground}
                      >
                        Restore background
                      </button>
                      <button
                        type="button"
                        className="btn quiet small"
                        disabled={bgBusy || !team.players.some((p) => p.photo)}
                        onClick={() =>
                          void batchCutoutSide(
                            side,
                            `Removing backgrounds · ${side.toUpperCase()}`,
                          ).then((n) =>
                            setBgProgress(
                              n
                                ? `${n} cutouts saved`
                                : 'No photos to process',
                            ),
                          )
                        }
                      >
                        Cut all photos
                      </button>
                    </div>
                    {bgProgress ? (
                      <p className="bg-remove-status">{bgProgress}</p>
                    ) : (
                      <p className="fine" style={{ marginTop: 9 }}>
                        Originals are kept so you can restore and re-cut anytime
                      </p>
                    )}
                  </div>
                  <div className="member-fields">
                    <div className="field-row">
                      <label className="label">
                        <span>Player name</span>
                        <input
                          value={player.name}
                          maxLength={24}
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              name: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="label">
                        <span>In-game name (IGN)</span>
                        <input
                          value={player.ign}
                          maxLength={20}
                          placeholder="MLBB nickname"
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              ign: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="label">
                        <span>MLBB role</span>
                        <select
                          value={
                            ROLES.includes(player.subtitle)
                              ? player.subtitle
                              : player.subtitle || 'EXP'
                          }
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              subtitle: e.target.value,
                            })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="member-options">
                      <select
                        value={player.row}
                        onChange={(e) =>
                          store.updatePlayer(side, selected, {
                            row: e.target.value as 'back' | 'front',
                          })
                        }
                      >
                        <option value="back">Back row</option>
                        <option value="front">Front row</option>
                      </select>
                      {player.isLeader ? (
                        <span className="fine" style={{ alignSelf: 'center' }}>
                          Team Leader · auto-centered
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn quiet small"
                          onClick={() =>
                            store.updatePlayer(side, selected, {
                              isLeader: true,
                            })
                          }
                        >
                          Make team leader
                        </button>
                      )}
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={player.flip}
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              flip: e.target.checked,
                            })
                          }
                        />
                        Flip photo
                      </label>
                      <button
                        type="button"
                        className="btn quiet small"
                        onClick={() =>
                          store.updatePlayer(side, selected, {
                            scale: 1,
                            x: 0,
                            y: 0,
                            flip: false,
                          })
                        }
                      >
                        Reset position
                      </button>
                    </div>
                    <div className="range-grid" style={{ marginTop: 20 }}>
                      <label>
                        <span className="range-label">
                          Photo size
                          <output>{player.scale.toFixed(2)}×</output>
                        </span>
                        <input
                          type="range"
                          min={0.65}
                          max={1.8}
                          step={0.05}
                          value={player.scale}
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              scale: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        <span className="range-label">
                          Horizontal
                          <output>{player.x}</output>
                        </span>
                        <input
                          type="range"
                          min={-18}
                          max={18}
                          step={1}
                          value={player.x}
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              x: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        <span className="range-label">
                          Vertical
                          <output>{player.y}</output>
                        </span>
                        <input
                          type="range"
                          min={-15}
                          max={15}
                          step={1}
                          value={player.y}
                          onChange={(e) =>
                            store.updatePlayer(side, selected, {
                              y: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            </div>
          </section>

          <aside className="reveal-desk-side">
            <section className="panel">
              <div className="panel-title">
                <h2>Scene identity</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  className={`btn small${side === 'blue' ? ' gold' : ' quiet'}`}
                  onClick={() => store.setEditSide('blue')}
                >
                  Blue
                </button>
                <button
                  type="button"
                  className={`btn small${side === 'red' ? ' gold' : ' quiet'}`}
                  onClick={() => store.setEditSide('red')}
                >
                  Red
                </button>
              </div>
              <label className="label">
                <span>Team name · behind the players</span>
                <input
                  value={team.teamName}
                  maxLength={32}
                  onChange={(e) =>
                    store.updateTeam(side, { teamName: e.target.value })
                  }
                />
              </label>
              <label className="label">
                <span>Title · above the team name</span>
                <input
                  value={store.sceneTitle}
                  maxLength={36}
                  onChange={(e) =>
                    store.setShared({ sceneTitle: e.target.value })
                  }
                />
              </label>
              <label className="label">
                <span>Tournament name</span>
                <input
                  value={store.introLabel}
                  maxLength={64}
                  onChange={(e) =>
                    store.setShared({ introLabel: e.target.value })
                  }
                />
              </label>
              <label className="label">
                <span>Bottom caption</span>
                <input
                  value={store.subtitle}
                  maxLength={48}
                  onChange={(e) =>
                    store.setShared({ subtitle: e.target.value })
                  }
                />
              </label>
              <label className="label">
                <span>Division · under caption (cards)</span>
                <input
                  value={store.sponsorRight}
                  maxLength={36}
                  onChange={(e) =>
                    store.setShared({ sponsorRight: e.target.value })
                  }
                />
              </label>
              <label className="label">
                <span>Template</span>
                <select
                  value={store.template}
                  onChange={(e) => {
                    const template = e.target.value as RevealTemplate
                    store.setShared({ template })
                  }}
                >
                  <option value="stage">Stage cutouts</option>
                  <option value="cards">Card roster (SEA Games)</option>
                </select>
              </label>
              <div className="field-row">
                <label className="label">
                  <span>Arrangement</span>
                  <select
                    value={store.layout}
                    disabled={store.template === 'cards'}
                    onChange={(e) => {
                      const layout = e.target.value as RevealLayout
                      store.setShared({ layout })
                      window.setTimeout(
                        () => useLineupStore.getState().autoArrange(side),
                        0,
                      )
                    }}
                  >
                    <option value="layered">Two rows</option>
                    <option value="lineup">One row</option>
                  </select>
                </label>
                <label className="label">
                  <span>Background color</span>
                  <div className="swatches">
                    <input
                      type="color"
                      value={store.accent}
                      aria-label="Background color"
                      onChange={(e) =>
                        store.setShared({ accent: e.target.value })
                      }
                    />
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`swatch${store.accent === c ? ' active' : ''}`}
                        style={{ ['--color' as string]: c }}
                        aria-label={c}
                        onClick={() => store.setShared({ accent: c })}
                      />
                    ))}
                  </div>
                </label>
              </div>
              <div className="logo-upload">
                <div className="logo-thumb">
                  {team.teamLogo ? (
                    <img src={team.teamLogo} alt="" />
                  ) : (
                    <Icon name="upload" />
                  )}
                </div>
                <label className="upload-button">
                  <Icon name="upload" />
                  Team logo
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={(e) =>
                      onLogoFile(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {team.teamLogo ? (
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Remove logo"
                    onClick={() => store.updateTeam(side, { teamLogo: '' })}
                  >
                    <Icon name="close" />
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <h2>Draft sources</h2>
              <p className="fine" style={{ margin: '8px 0 14px' }}>
                Pull names and photos from the draft room. Tournament teams load
                from the panel at the top of this page.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  type="button"
                  className="btn quiet"
                  onClick={() => store.loadFromDraft(side)}
                >
                  Load this side from draft
                </button>
                <button
                  type="button"
                  className="btn quiet"
                  onClick={() => store.loadBothFromDraft()}
                >
                  Load both from draft
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </StudioShell>
  )
}
