import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Brand, Icon } from '../components/cme/Icon'
import ControlNav from '../components/ControlNav'
import OcrControlPanel from '../components/gameplay/OcrControlPanel'
import HeroImage from '../components/HeroImage'
import { getHero, searchHeroes } from '../data/heroes'
import { getItem, ITEMS } from '../data/items'
import {
  formatClock,
  initGameplaySync,
  parseClockInput,
  useGameplayStore,
  type GameEventType,
  type TeamSide,
} from '../store/gameplayStore'
import { initStingerSync, useStingerStore } from '../store/stingerStore'

const EVENTS: { type: GameEventType; label: string; title: string }[] = [
  { type: 'turtle', label: 'Turtle', title: 'TURTLE SLAIN' },
  { type: 'lord', label: 'Lord', title: 'LORD SLAIN' },
  { type: 'triple', label: 'Triple kill', title: 'TRIPLE KILL' },
  { type: 'maniac', label: 'Maniac', title: 'MANIAC' },
  { type: 'savage', label: 'Savage', title: 'SAVAGE!' },
  { type: 'tower', label: 'Tower', title: 'TURRET DESTROYED' },
]

type Tab = 'players' | 'capture' | 'display'
type Dialog =
  | null
  | { kind: 'team'; side: TeamSide }
  | { kind: 'player'; side: TeamSide; index: number }
  | { kind: 'item'; side: TeamSide; player: number; slot: number }
  | { kind: 'reset' }
  | { kind: 'reset-clock' }

export default function GameplayControlPage() {
  const store = useGameplayStore()
  const [tab, setTab] = useState<Tab>('players')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState('')
  const [clockText, setClockText] = useState<string | null>(null)

  useEffect(() => {
    initGameplaySync()
    initStingerSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
    document.documentElement.style.overflowY = 'auto'
    document.body.style.overflowY = 'auto'
    document.body.style.height = 'auto'
    return () => {
      document.documentElement.style.overflowY = ''
      document.body.style.overflowY = ''
      document.body.style.height = ''
    }
  }, [])

  useEffect(() => {
    if (!store.timerRunning) return
    const id = window.setInterval(() => useGameplayStore.getState().tickTimer(), 1000)
    return () => window.clearInterval(id)
  }, [store.timerRunning])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  function commitClock(value: string) {
    const seconds = parseClockInput(value)
    if (seconds == null) {
      setToast('Enter the clock as HH:MM:SS or MM:SS, for example 00:09:17.')
      setClockText(null)
      return
    }
    store.setGameTime(seconds)
    setClockText(null)
  }

  function announce(side: TeamSide, type: GameEventType, title: string) {
    const team = store[side]
    const player = team.players[side === 'blue' ? store.featuredBlue.playerIndex : store.featuredRed.playerIndex]
    store.triggerEvent({
      type,
      title,
      playerName: player?.name ?? team.tag,
      teamTag: team.tag,
      side,
    })
    setToast(`${team.tag} · ${title} sent to overlay.`)
  }

  return (
    <div className="cme-gc">
      <header className="topbar">
        <Brand />
        <ControlNav />
        <div className="connection connected">Overlay linked</div>
      </header>
      <main className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">Match operations</div>
            <h1>
              Gameplay control<span>.</span>
            </h1>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'reset' })}>
              <Icon name="rotate" />
              Reset match
            </button>
            <a className="btn gold" href="/overlay/game" target="_blank" rel="noreferrer">
              <Icon name="external" />
              Open overlay
            </a>
          </div>
        </div>

        <section className="matchbar" aria-label="Match details and clock">
          <div className="match-ident">
            <label className="field">
              <span>Event / match</span>
              <input
                maxLength={80}
                value={store.matchInfo}
                onChange={(e) => store.setMatchInfo(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Series score</span>
              <input
                readOnly
                value={`${store.blue.tag} ${store.blue.seriesScore}  –  ${store.red.seriesScore} ${store.red.tag}`}
              />
            </label>
          </div>
          <div className="clock-group">
            <div className="clock-block">
              <span>Game clock</span>
              <input
                className="clock-input"
                value={clockText ?? formatClock(store.gameTimeSeconds)}
                inputMode="numeric"
                onFocus={() => setClockText(formatClock(store.gameTimeSeconds))}
                onChange={(e) => setClockText(e.target.value)}
                onBlur={() => clockText !== null && commitClock(clockText)}
              />
            </div>
            <button className="btn gold" type="button" onClick={() => store.setTimerRunning(!store.timerRunning)}>
              <Icon name={store.timerRunning ? 'pause' : 'play'} />
              <span>{store.timerRunning ? 'Pause clock' : 'Start clock'}</span>
            </button>
            <button className="btn icon-only" type="button" aria-label="Reset match clock" onClick={() => setDialog({ kind: 'reset-clock' })}>
              <Icon name="rotate" />
            </button>
          </div>
        </section>

        <section className="team-grid" aria-label="Team scoreboard">
          <TeamPanel side="blue" onEdit={() => setDialog({ kind: 'team', side: 'blue' })} onEvent={announce} />
          <TeamPanel side="red" onEdit={() => setDialog({ kind: 'team', side: 'red' })} onEvent={announce} />
        </section>

        <div className="tabs" role="tablist">
          <button className={`tab${tab === 'players' ? ' active' : ''}`} type="button" onClick={() => setTab('players')}>
            <Icon name="users" />
            Players & loadouts
            <span className="tab-count">10</span>
          </button>
          <button className={`tab${tab === 'capture' ? ' active' : ''}`} type="button" onClick={() => setTab('capture')}>
            <Icon name="scan" />
            Capture & OCR
          </button>
          <button className={`tab${tab === 'display' ? ' active' : ''}`} type="button" onClick={() => setTab('display')}>
            <Icon name="monitor" />
            Display settings
          </button>
        </div>

        {tab === 'players' && (
          <section className="tab-panel">
            <div className="section-heading">
              <div>
                <h2>Player statistics</h2>
                <p>Update each player’s level, KDA, gold and equipment.</p>
              </div>
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  store.recalculateTeamStats()
                  setToast('Team kills and gold updated from the player totals.')
                }}
              >
                <Icon name="refresh" />
                Use player totals
              </button>
            </div>
            <div className="rosters">
              <Roster side="blue" onEditPlayer={(index) => setDialog({ kind: 'player', side: 'blue', index })} onEditItem={(player, slot) => setDialog({ kind: 'item', side: 'blue', player, slot })} />
              <Roster side="red" onEditPlayer={(index) => setDialog({ kind: 'player', side: 'red', index })} onEditItem={(player, slot) => setDialog({ kind: 'item', side: 'red', player, slot })} />
            </div>
            <p className="totals-help">Team totals are controlled separately. Select “Use player totals” to calculate kills and gold from the roster.</p>
          </section>
        )}

        {tab === 'capture' && <CapturePanel onToast={setToast} />}

        {tab === 'display' && (
          <section className="tab-panel">
            <div className="section-heading">
              <div>
                <h2>Broadcast display</h2>
                <p>Choose featured players and control the map window.</p>
              </div>
            </div>
            <div className="surface" style={{ marginBottom: 18 }}>
              <div className="surface-head">
                <h3>Scene controls</h3>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={store.showScoreboard}
                    onChange={(e) => store.setDisplay({ showScoreboard: e.target.checked })}
                  />
                  Show scoreboard
                </label>
              </div>
              <div className="display-body" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: '#8fa5c1', marginRight: 8 }}>Transition</span>
                <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('wipe')}>
                  Wipe
                </button>
                <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('slam')}>
                  Slam
                </button>
                <button className="btn" type="button" onClick={() => useStingerStore.getState().fire('split')}>
                  Split
                </button>
              </div>
            </div>
            <div className="display-grid">
              <div className="surface">
                <div className="surface-head">
                  <h3>Featured player cameras</h3>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={store.showCameras}
                      onChange={(e) => store.setDisplay({ showCameras: e.target.checked })}
                    />
                    Show frames
                  </label>
                </div>
                <div className="display-body">
                  <CamControls side="blue" />
                  <CamControls side="red" />
                  <p className="display-note" style={{ marginTop: 12 }}>
                    Shoutcaster is a separate OBS source — not on the gameplay
                    overlay. Use{' '}
                    <code>http://localhost:5173/overlay/cam/caster</code> or the{' '}
                    <a href="/control/cams">Cams</a> /{' '}
                    <a href="/control/casters">Shoutcasters</a> tabs.
                  </p>
                </div>
              </div>
              <div className="surface">
                <div className="surface-head">
                  <h3>Shoutcasters</h3>
                  <a className="btn small" href="/control/casters">
                    Open tab
                  </a>
                </div>
                <div className="display-body">
                  <p className="display-note" style={{ marginTop: 0 }}>
                    Set caster names and roles in the <b>Shoutcasters</b> tab. Overlay:{' '}
                    <code>http://localhost:5173/overlay/caster</code>
                  </p>
                </div>
              </div>
              <div className="surface">
                <div className="surface-head">
                  <h3>Map window</h3>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={store.showMap}
                      onChange={(e) => store.setDisplay({ showMap: e.target.checked })}
                    />
                    Show on overlay
                  </label>
                </div>
                <div className="display-body">
                  <label className="field">
                    <span>Window label</span>
                    <input
                      maxLength={30}
                      value={store.mapLabel}
                      onChange={(e) => store.setDisplay({ mapLabel: e.target.value || 'MAP' })}
                    />
                  </label>
                  <label className="field">
                    <span>Map image URL · optional</span>
                    <input
                      type="url"
                      placeholder="https://…"
                      value={store.mapUrl}
                      onChange={(e) => store.setDisplay({ mapUrl: e.target.value })}
                    />
                  </label>
                  <div className="map-sample">
                    {store.mapUrl ? <img src={store.mapUrl} alt="Map preview" /> : (
                      <>
                        <Icon name="map" />
                        <span>Transparent map window</span>
                      </>
                    )}
                  </div>
                  <p className="display-note">Leave the image blank to place your game map source behind the frame.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <span>Live match · changes sync to the gameplay overlay</span>
          <span>
            Keep this page open while using the <b>gameplay overlay</b>.
          </span>
        </footer>
      </main>

      {dialog?.kind === 'team' && (
        <TeamDialog side={dialog.side} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'player' && (
        <PlayerDialog side={dialog.side} index={dialog.index} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'item' && (
        <ItemDialog
          side={dialog.side}
          player={dialog.player}
          slot={dialog.slot}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reset' && (
        <SimpleDialog
          title="Reset this match?"
          note="Clear the clock, team totals, player statistics and equipment."
          confirm="Reset match"
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            store.resetGameplay()
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'reset-clock' && (
        <SimpleDialog
          title="Reset the clock?"
          note="Pause the clock and return it to 00:00:00. Match scores will stay in place."
          confirm="Reset clock"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            store.setTimerRunning(false)
            store.setGameTime(0)
            setDialog(null)
          }}
        />
      )}
      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  )
}

function TeamPanel({
  side,
  onEdit,
  onEvent,
}: {
  side: TeamSide
  onEdit: () => void
  onEvent: (side: TeamSide, type: GameEventType, title: string) => void
}) {
  const team = useGameplayStore((s) => s[side])
  const update = useGameplayStore((s) => s.updateTeamMeta)
  const fields: { key: 'kills' | 'gold' | 'towers' | 'seriesScore'; label: string; max: number }[] = [
    { key: 'kills', label: 'Kills', max: 99 },
    { key: 'gold', label: 'Team gold', max: 999999 },
    { key: 'towers', label: 'Towers', max: 11 },
    { key: 'seriesScore', label: 'Series', max: 9 },
  ]
  return (
    <article className={`team-panel ${side}`}>
      <div className="team-head">
        <span className="crest">{team.logo ? <img src={team.logo} alt="" /> : team.tag}</span>
        <div className="team-title">
          <h2>{team.name}</h2>
          <small>
            {side.toUpperCase()} SIDE · {team.tag}
          </small>
        </div>
        <button className="btn icon-only ghost" type="button" aria-label={`Edit ${side} team`} onClick={onEdit}>
          <Icon name="edit" />
        </button>
      </div>
      <div className="team-stats">
        {fields.map((field) => (
          <div key={field.key} className={`stat${field.key === 'gold' ? ' gold-stat' : ''}`}>
            <label>
              {field.label}
              <input
                type="number"
                min={0}
                max={field.max}
                value={team[field.key]}
                onChange={(e) => update(side, { [field.key]: clamp(e.target.value, 0, field.max) })}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="team-events">
        <span>Announce</span>
        {EVENTS.map((event) => (
          <button key={event.type} className="event-btn" type="button" onClick={() => onEvent(side, event.type, event.title)}>
            {event.label}
          </button>
        ))}
      </div>
    </article>
  )
}

function Roster({
  side,
  onEditPlayer,
  onEditItem,
}: {
  side: TeamSide
  onEditPlayer: (index: number) => void
  onEditItem: (player: number, slot: number) => void
}) {
  const team = useGameplayStore((s) => s[side])
  const focus = useGameplayStore((s) => (side === 'blue' ? s.featuredBlue.playerIndex : s.featuredRed.playerIndex))
  const setFeatured = useGameplayStore((s) => s.setFeatured)
  const updatePlayer = useGameplayStore((s) => s.updatePlayer)
  return (
    <div className={`roster ${side}`}>
      <div className="roster-heading">
        <span>
          {side.toUpperCase()} TEAM · {team.tag}
        </span>
        <small>5 players</small>
      </div>
      {team.players.map((player, index) => {
        const hero = getHero(player.heroId)
        const filled = player.items.filter(Boolean).length
        return (
          <article key={index} className={`player-card${focus === index ? ' featured' : ''}`}>
            <div className="player-top">
              <span className="portrait">
                {player.heroId ? (
                  <HeroImage heroId={player.heroId} className="cme-fill" showNameFallback={false} />
                ) : (
                  player.name.slice(0, 2)
                )}
              </span>
              <div className="player-identity">
                <div className="player-name">{player.name}</div>
                <div className="player-hero">{hero?.name ?? 'Choose hero'}</div>
              </div>
              {focus === index ? (
                <span className="featured-label">
                  <Icon name="camera" />
                  <span>Featured</span>
                </span>
              ) : (
                <button className="btn ghost" type="button" aria-label={`Feature ${player.name}`} onClick={() => setFeatured(side, { playerIndex: index })}>
                  <Icon name="camera" />
                </button>
              )}
              <button className="btn ghost" type="button" aria-label={`Edit ${player.name}`} onClick={() => onEditPlayer(index)}>
                <Icon name="edit" />
              </button>
            </div>
            <div className="player-stats">
              <StatField label="Level" value={player.level} min={1} max={15} onChange={(level) => updatePlayer(side, index, { level })} />
              <StatField label="Kills" value={player.kills} min={0} max={99} onChange={(kills) => updatePlayer(side, index, { kills })} />
              <StatField label="Deaths" value={player.deaths} min={0} max={99} onChange={(deaths) => updatePlayer(side, index, { deaths })} />
              <StatField label="Assists" value={player.assists} min={0} max={99} onChange={(assists) => updatePlayer(side, index, { assists })} />
              <StatField label="Gold" gold value={player.gold} min={0} max={99999} onChange={(gold) => updatePlayer(side, index, { gold })} />
            </div>
            <details className="loadout-details">
              <summary>
                <span>
                  <Icon name="bag" />
                  Equipment <span style={{ color: '#607b9c' }}>· {filled} / 6</span>
                </span>
                <Icon name="down" />
              </summary>
              <div className="item-editor">
                {player.items.map((itemId, slot) => {
                  const item = getItem(itemId)
                  return (
                    <button key={slot} className="item-box" type="button" onClick={() => onEditItem(index, slot)}>
                      <span className="item-number">{slot + 1}</span>
                      {item && <span className="swatch" style={{ background: item.color }} />}
                      <span className="item-text">{item?.name ?? 'Empty slot'}</span>
                    </button>
                  )
                })}
              </div>
            </details>
          </article>
        )
      })}
    </div>
  )
}

function StatField({
  label,
  value,
  min,
  max,
  gold,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  gold?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className={`field${gold ? ' gold-field' : ''}`}>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(clamp(e.target.value, min, max))} />
    </label>
  )
}

function CasterNameFields({ which }: { which: 1 | 2 }) {
  const person = useCasterStore((s) => (which === 1 ? s.caster1 : s.caster2))
  const setCaster = useCasterStore((s) => s.setCaster)
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        background: '#0e1623',
      }}
    >
      <label className="check-label" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={person.visible}
          onChange={(e) => setCaster(which, { visible: e.target.checked })}
        />
        Caster {which}
      </label>
      <label className="field">
        <span>Name</span>
        <input
          maxLength={32}
          placeholder={`Caster ${which} name`}
          value={person.name}
          onChange={(e) => setCaster(which, { name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Role</span>
        <input
          maxLength={28}
          placeholder="Play-by-play / Color"
          value={person.role}
          onChange={(e) => setCaster(which, { role: e.target.value })}
        />
      </label>
    </div>
  )
}

function CamControls({ side }: { side: TeamSide }) {
  const team = useGameplayStore((s) => s[side])
  const featured = useGameplayStore((s) => (side === 'blue' ? s.featuredBlue : s.featuredRed))
  const setFeatured = useGameplayStore((s) => s.setFeatured)
  return (
    <div className="cam-controls">
      <div className={`cam-heading${side === 'red' ? ' red' : ''}`}>
        <Icon name="camera" />
        {side[0].toUpperCase() + side.slice(1)} team
      </div>
      <div className="form-row">
        <label className="field">
          <span>Featured player</span>
          <select value={featured.playerIndex} onChange={(e) => setFeatured(side, { playerIndex: Number(e.target.value) })}>
            {team.players.map((player, i) => (
              <option key={i} value={i}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Camera footer</span>
          <input maxLength={30} value={featured.camLabel} onChange={(e) => setFeatured(side, { camLabel: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

function CapturePanel({ onToast }: { onToast: (message: string) => void }) {
  return (
    <section className="tab-panel">
      <div className="section-heading">
        <div>
          <h2>Capture & automatic stats</h2>
          <p>
            Capture the game window, map clock / team kills / towers /
            series, then start OCR. Gold stays manual. Use Edit team for
            institution logos.
          </p>
        </div>
      </div>
      <OcrControlPanel onToast={onToast} />
    </section>
  )
}

function TeamDialog({ side, onClose }: { side: TeamSide; onClose: () => void }) {
  const team = useGameplayStore((s) => s[side])
  const update = useGameplayStore((s) => s.updateTeamMeta)
  const [logoPreview, setLogoPreview] = useState(team.logo)

  return (
    <DialogShell title={`Edit ${side} team`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          update(side, {
            name: String(data.get('name') ?? '').trim() || team.name,
            tag: String(data.get('code') ?? '').trim().toUpperCase() || team.tag,
            logo: logoPreview.trim(),
          })
          onClose()
        }}
      >
        <label className="field">
          <span>Team name</span>
          <input name="name" defaultValue={team.name} maxLength={28} />
        </label>
        <label className="field">
          <span>Short code</span>
          <input name="code" defaultValue={team.tag} maxLength={6} />
        </label>
        <label className="field">
          <span>Institution logo · upload or paste a URL</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                if (typeof reader.result === 'string') setLogoPreview(reader.result)
              }
              reader.readAsDataURL(file)
            }}
          />
        </label>
        <label className="field">
          <span>Or logo URL</span>
          <input
            name="logo"
            type="url"
            value={logoPreview.startsWith('data:') ? '' : logoPreview}
            placeholder="https://…"
            onChange={(e) => setLogoPreview(e.target.value)}
          />
        </label>
        {logoPreview ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
            }}
          >
            <img
              src={logoPreview}
              alt=""
              style={{
                width: 56,
                height: 56,
                objectFit: 'contain',
                borderRadius: 8,
                background: '#0d1726',
                border: '1px solid #34455f',
              }}
            />
            <button
              className="btn small"
              type="button"
              onClick={() => setLogoPreview('')}
            >
              Remove logo
            </button>
          </div>
        ) : null}
        <div className="dialog-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn gold" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

function PlayerDialog({ side, index, onClose }: { side: TeamSide; index: number; onClose: () => void }) {
  const player = useGameplayStore((s) => s[side].players[index])
  const update = useGameplayStore((s) => s.updatePlayer)
  const heroes = searchHeroes('')
  if (!player) return null
  return (
    <DialogShell title="Player details" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const name = String(data.get('name') ?? '').trim()
          const heroName = String(data.get('hero') ?? '').trim().toLowerCase()
          const hero = heroes.find((item) => item.name.toLowerCase() === heroName || item.id === heroName)
          if (!name) return
          update(side, index, { name, heroId: hero?.id ?? (heroName ? player.heroId : null) })
          onClose()
        }}
      >
        <label className="field">
          <span>Player name</span>
          <input name="name" defaultValue={player.name} maxLength={25} required />
        </label>
        <label className="field">
          <span>Hero</span>
          <input name="hero" list="hero-names" defaultValue={getHero(player.heroId)?.name ?? ''} maxLength={30} />
          <datalist id="hero-names">
            {heroes.map((hero) => (
              <option key={hero.id} value={hero.name} />
            ))}
          </datalist>
        </label>
        <div className="dialog-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn gold" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

function ItemDialog({
  side,
  player,
  slot,
  onClose,
}: {
  side: TeamSide
  player: number
  slot: number
  onClose: () => void
}) {
  const setItem = useGameplayStore((s) => s.setPlayerItem)
  return (
    <DialogShell title={`Equipment · slot ${slot + 1}`} onClose={onClose}>
      <div className="item-picker">
        <button
          type="button"
          onClick={() => {
            setItem(side, player, slot, null)
            onClose()
          }}
        >
          Empty slot
        </button>
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setItem(side, player, slot, item.id)
              onClose()
            }}
          >
            <span className="swatch" style={{ background: item.color }} />
            {item.name}
          </button>
        ))}
      </div>
    </DialogShell>
  )
}

function SimpleDialog({
  title,
  note,
  confirm,
  danger,
  onClose,
  onConfirm,
}: {
  title: string
  note: string
  confirm: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <DialogShell title={title} onClose={onClose}>
      <p className="dialog-note">{note}</p>
      <div className="dialog-foot">
        <button className="btn" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className={`btn ${danger ? 'danger' : 'gold'}`} type="button" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </DialogShell>
  )
}

function DialogShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="btn ghost" type="button" aria-label="Close dialog" onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}

function clamp(value: string, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.trunc(n)))
}
