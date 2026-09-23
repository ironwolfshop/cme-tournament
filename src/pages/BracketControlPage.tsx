import { useEffect, useRef, useState } from 'react'
import { Brand, Icon } from '../components/cme/Icon'
import ControlNav from '../components/ControlNav'
import BracketBoard, { MatchList } from '../components/bracket/BracketBoard'
import { getTeam, roundLabel, type BracketMatch } from '../lib/bracketEngine'
import { initBracketSync, useBracketStore } from '../store/bracketStore'
import {
  initTournamentSync,
  useTournamentStore,
} from '../store/tournamentStore'

type Dialog =
  | null
  | { kind: 'match'; match: BracketMatch }
  | { kind: 'teams' }
  | { kind: 'reset' }
  | { kind: 'clear'; match: BracketMatch }

export default function BracketControlPage() {
  const store = useBracketStore()
  const [view, setView] = useState<'bracket' | 'matches'>('bracket')
  const [present, setPresent] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState('')
  const shellRef = useRef<HTMLDivElement>(null)
  const done = store.matches.filter((m) => m.winnerId).length

  useEffect(() => {
    initBracketSync()
    initTournamentSync()
    document.documentElement.style.background = '#0b0e15'
    document.body.style.background = '#0b0e15'
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
    window.addEventListener('resize', apply)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [view, present])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && present) setPresent(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [present])

  function loadMatchToScenes(match: BracketMatch) {
    if (!match.teamAId || !match.teamBId) {
      setToast('Both teams must be set before loading this match.')
      return false
    }
    const ok = useTournamentStore.getState().loadMatchScenes(match.id)
    if (!ok) {
      setToast('Could not load that match.')
      return false
    }
    setSelected(match.id)
    const a = getTeam(store, match.teamAId)
    const b = getTeam(store, match.teamBId)
    setToast(
      `Loaded ${a?.name || a?.tag || 'Blue'} vs ${b?.name || b?.tag || 'Red'} → Draft, Lineup & Gameplay`,
    )
    return true
  }

  function openMatch(match: BracketMatch) {
    if (!match.teamAId || !match.teamBId) {
      setToast('Complete the preceding matches before entering this result.')
      return
    }
    setSelected(match.id)
    loadMatchToScenes(match)
    setDialog({ kind: 'match', match })
  }

  const champion = (() => {
    const final = [...store.matches].sort((a, b) => b.round - a.round)[0]
    return final?.winnerId ? getTeam(store, final.winnerId) : null
  })()

  return (
    <div className={`cme-br${view === 'matches' ? ' show-list' : ''}${present ? ' presentation-mode' : ''}`}>
      <header className="topbar">
        <Brand />
        <ControlNav />
      </header>
      <main className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">Tournament workspace</div>
            <h1>
              Tournament bracket<span style={{ color: 'var(--gold)' }}>.</span>
            </h1>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'teams' })}>
              <Icon name="teams" />
              Teams
            </button>
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'reset' })}>
              <Icon name="rotate" />
              <span className="compact-label">Reset</span>
            </button>
            <a className="btn" href="/overlay/bracket" target="_blank" rel="noreferrer">
              <Icon name="external" />
              Overlay
            </a>
            <button className="btn gold" type="button" onClick={() => setPresent(true)}>
              <Icon name="expand" />
              Presentation view
            </button>
          </div>
        </div>
        <div className="toolbar">
          <div className="tool-group">
            <div className="view-toggle" aria-label="Bracket view">
              <button
                type="button"
                className={view === 'bracket' ? 'active' : ''}
                aria-pressed={view === 'bracket'}
                onClick={() => setView('bracket')}
              >
                <Icon name="bracket" />
                Bracket
              </button>
              <button
                type="button"
                className={view === 'matches' ? 'active' : ''}
                aria-pressed={view === 'matches'}
                onClick={() => setView('matches')}
              >
                <Icon name="list" />
                Matches
              </button>
            </div>
            <span className="format-pill">
              Single elimination<b>{store.teamCount} teams</b>
            </span>
          </div>
          <div className="summary">
            <div className="mini-progress">
              <span style={{ width: `${store.matches.length ? (done / store.matches.length) * 100 : 0}%` }} />
            </div>
            <span>
              <strong>{done}</strong> / {store.matches.length} matches complete
            </span>
          </div>
        </div>
        <div className="stage-shell" id="stage-shell" ref={shellRef}>
          <div className="stage">
            <BracketBoard
              state={store}
              selectedId={selected}
              onSelect={openMatch}
              onSwapSlots={(from, to) => {
                const ok = store.swapSlots(from, to)
                if (ok) setToast('Teams swapped — opening placements updated.')
                return ok
              }}
            />
          </div>
        </div>
        <MatchList
          state={store}
          selectedId={selected}
          onSelect={openMatch}
          onSwapSlots={(from, to) => {
            const ok = store.swapSlots(from, to)
            if (ok) setToast('Teams swapped — opening placements updated.')
            return ok
          }}
        />
        <div className="caption">
          <span>
            Drag only on unfinished quarterfinals. Semis / finals and eliminated
            matches are locked.
          </span>
          <span className="result-shortcut">
            <Icon name="trophy" />
            <span>{champion ? `${champion.name} · Champion` : 'Champion to be decided'}</span>
          </span>
        </div>
        <div className="preview-footer">
          <span>Results sync to the bracket overlay.</span>
          <span>
            Presentation view hides the controls. Press <b>Esc</b> to return.
          </span>
        </div>
      </main>
      <button className="btn presentation-exit" type="button" onClick={() => setPresent(false)}>
        Exit presentation
      </button>

      {dialog?.kind === 'match' && (
        <MatchDialog
          match={store.matches.find((m) => m.id === dialog.match.id) ?? dialog.match}
          onClose={() => {
            setDialog(null)
            setSelected(null)
          }}
          onLoad={() => {
            const m =
              store.matches.find((x) => x.id === dialog.match.id) ?? dialog.match
            loadMatchToScenes(m)
          }}
          onClear={() => setDialog({ kind: 'clear', match: dialog.match })}
          onSaved={(name) => setToast(`${name} advances.`)}
        />
      )}
      {dialog?.kind === 'teams' && <TeamsDialog onClose={() => setDialog(null)} onSaved={() => setToast('Tournament and teams updated.')} />}
      {dialog?.kind === 'reset' && (
        <Confirm
          title="Reset bracket results?"
          note="Clear all match scores and the champion. Team names, logos and seed order stay in place."
          confirm="Reset results"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            store.rebuildBracket()
            setDialog(null)
            setToast('Results cleared.')
          }}
        />
      )}
      {dialog?.kind === 'clear' && (
        <Confirm
          title="Clear this result?"
          note="Clear this match and any later results that depend on it."
          confirm="Clear results"
          onClose={() => setDialog({ kind: 'match', match: dialog.match })}
          onConfirm={() => {
            store.clearResult(dialog.match.id)
            setDialog(null)
            setSelected(null)
            setToast('Result cleared.')
          }}
        />
      )}
      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  )
}

function MatchDialog({
  match,
  onClose,
  onClear,
  onLoad,
  onSaved,
}: {
  match: BracketMatch
  onClose: () => void
  onClear: () => void
  onLoad: () => void
  onSaved: (name: string) => void
}) {
  const store = useBracketStore()
  const ref = useRef<HTMLDialogElement>(null)
  const a = getTeam(store, match.teamAId)
  const b = getTeam(store, match.teamBId)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!el.open) el.showModal()
  }, [])

  if (!a || !b) return null

  function pickWinner(teamId: string, name: string) {
    // Winner = 1, loser = 0 (no manual score entry)
    const scoreA = teamId === a!.id ? 1 : 0
    const scoreB = teamId === b!.id ? 1 : 0
    store.setWinner(match.id, teamId, scoreA, scoreB)
    onSaved(name)
    ref.current?.close()
  }

  return (
    <dialog ref={ref} className="cme-br-match-dialog" onClose={onClose}>
      <div className="dialog-head">
        <div>
          <h2>{matchTitle(match, store.bracketSize)}</h2>
          <small>
            {match.winnerId ? 'CHANGE WINNER' : 'SELECT WINNER'}
          </small>
        </div>
        <button
          className="btn ghost"
          type="button"
          aria-label="Close dialog"
          onClick={() => ref.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">
        <p className="dialog-note">
          Match loaded into Draft, Lineup &amp; Gameplay. Tap the winning team
          to advance them.
        </p>
        <div className="winner-pick-grid">
          <button
            type="button"
            className={`winner-pick blue${match.winnerId === a.id ? ' is-winner' : ''}`}
            onClick={() => pickWinner(a.id, a.name)}
          >
            <span className="winner-pick-badge">
              {a.logo ? <img src={a.logo} alt="" /> : a.tag.slice(0, 2)}
            </span>
            <span className="winner-pick-name">{a.name}</span>
            <span className="winner-pick-meta">
              Seed {a.seed} · {a.tag}
              {match.winnerId === a.id ? ' · WINNER' : ''}
            </span>
          </button>
          <div className="winner-pick-vs">VS</div>
          <button
            type="button"
            className={`winner-pick red${match.winnerId === b.id ? ' is-winner' : ''}`}
            onClick={() => pickWinner(b.id, b.name)}
          >
            <span className="winner-pick-badge">
              {b.logo ? <img src={b.logo} alt="" /> : b.tag.slice(0, 2)}
            </span>
            <span className="winner-pick-name">{b.name}</span>
            <span className="winner-pick-meta">
              Seed {b.seed} · {b.tag}
              {match.winnerId === b.id ? ' · WINNER' : ''}
            </span>
          </button>
        </div>
      </div>
      <div className="dialog-actions">
        {match.winnerId ? (
          <button className="btn ghost clear-result" type="button" onClick={onClear}>
            Clear result
          </button>
        ) : null}
        <button className="btn" type="button" onClick={onLoad}>
          Reload to Draft
        </button>
        <button className="btn" type="button" onClick={() => ref.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  )
}

function TeamsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const store = useBracketStore()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  return (
    <dialog ref={ref} style={{ width: 'min(820px, calc(100vw - 24px))' }} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const title = String(data.get('title') ?? '').trim()
          if (title) store.setTitle(title)
          for (const team of store.teams) {
            store.updateTeam(team.id, {
              name: String(data.get(`name-${team.id}`) ?? team.name).trim() || team.name,
              tag: String(data.get(`code-${team.id}`) ?? team.tag).trim().toUpperCase() || team.tag,
              logo: String(data.get(`logo-${team.id}`) ?? '').trim(),
            })
          }
          onSaved()
          ref.current?.close()
        }}
      >
        <div className="dialog-head">
          <div>
            <h2>Tournament & teams</h2>
            <small>{store.teamCount} TEAMS · SINGLE ELIMINATION</small>
          </div>
          <button className="btn ghost" type="button" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span>Tournament name</span>
            <input name="title" defaultValue={store.title} maxLength={50} required />
          </label>
          <div className="team-form-labels">
            <span>Seed</span>
            <span>Team name</span>
            <span>Code</span>
            <span>Logo URL · optional</span>
          </div>
          {store.teams.map((team) => (
            <div className="team-edit-row" key={team.id}>
              <span className="seed-number">{team.seed}</span>
              <input name={`name-${team.id}`} defaultValue={team.name} maxLength={32} required />
              <input name={`code-${team.id}`} defaultValue={team.tag} maxLength={6} required />
              <input className="logo-field" name={`logo-${team.id}`} defaultValue={team.logo} placeholder="Logo URL (optional)" type="url" />
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button className="btn gold" type="submit">
            Save teams
          </button>
        </div>
      </form>
    </dialog>
  )
}

function matchTitle(match: BracketMatch, size: number) {
  if (size === 8) {
    if (match.round === 2) return 'Grand Final'
    if (match.round === 1) return `Semifinal ${match.index + 1}`
    return `Quarterfinal ${match.index + 1}`
  }
  const label = roundLabel(match.round, size)
  if (label === 'GRAND FINAL') return 'Grand Final'
  return `${label} ${match.index + 1}`
}

function Confirm({
  title,
  note,
  confirm,
  onClose,
  onConfirm,
}: {
  title: string
  note: string
  confirm: string
  onClose: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  return (
    <dialog ref={ref} onClose={onClose}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="btn ghost" type="button" onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">
        <p className="dialog-note">{note}</p>
      </div>
      <div className="dialog-actions">
        <button className="btn" type="button" onClick={() => ref.current?.close()}>
          Cancel
        </button>
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            onConfirm()
            ref.current?.close()
          }}
        >
          {confirm}
        </button>
      </div>
    </dialog>
  )
}
