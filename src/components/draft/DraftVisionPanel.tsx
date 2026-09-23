import { useEffect, useState } from 'react'
import { getHero, UNIQUE_HEROES } from '../../data/heroes'
import { fetchSync, subscribeSync } from '../../lib/obsSync'
import { useDraftStore, type TeamSide } from '../../store/draftStore'

type VisionSlot = {
  hero: string | null
  hero_id: string | null
  confidence: number
  locked: boolean
}

type VisionSnapshot = {
  phase?: string
  picking_side?: string | null
  timer?: string
  last_detected?: string | null
  last_confidence?: number
  fps?: number
  hub_connected?: boolean
  completed?: boolean
  blue?: { picks?: VisionSlot[]; bans?: string[] }
  red?: { picks?: VisionSlot[]; bans?: string[] }
}

type VisionEvent = {
  type?: string
  team?: string
  slot?: number
  hero?: string
  hero_id?: string
  confidence?: number
}

function resolveHeroId(ev: VisionEvent): string | null {
  if (ev.hero_id && getHero(ev.hero_id)) return ev.hero_id
  if (ev.hero) {
    const hit = UNIQUE_HEROES.find(
      (h) => h.name.toLowerCase() === ev.hero!.toLowerCase(),
    )
    if (hit) return hit.id
  }
  return ev.hero_id ?? null
}

export default function DraftVisionPanel() {
  const applyPick = useDraftStore((s) => s.applyVisionPick)
  const applyBan = useDraftStore((s) => s.applyVisionBan)
  const [vision, setVision] = useState<VisionSnapshot | null>(null)
  const [autoApply, setAutoApply] = useState(true)
  const [lastEvent, setLastEvent] = useState<string>('')

  useEffect(() => {
    const unsubStatus = subscribeSync('draft_vision', (payload) => {
      if (payload && typeof payload === 'object') {
        setVision(payload as VisionSnapshot)
      }
    })
    const unsubEvent = subscribeSync('draft_vision_event', (payload) => {
      if (!payload || typeof payload !== 'object') return
      const envelope = payload as { event?: VisionEvent }
      const ev = envelope.event ?? (payload as VisionEvent)
      if (!ev?.type) return
      setLastEvent(`${ev.type} ${ev.team ?? ''} ${ev.hero ?? ''}`)
      if (!autoApply) return
      const heroId = resolveHeroId(ev)
      if (!heroId) return
      const side = (ev.team === 'red' ? 'red' : 'blue') as TeamSide
      const slot = Math.max(0, (ev.slot ?? 1) - 1)
      if (ev.type === 'hero_pick') applyPick(side, slot, heroId)
      if (ev.type === 'hero_ban') applyBan(side, slot, heroId)
    })
    void fetchSync('draft_vision').then((p) => {
      if (p && typeof p === 'object') setVision(p as VisionSnapshot)
    })
    return () => {
      unsubStatus()
      unsubEvent()
    }
  }, [autoApply, applyPick, applyBan])

  const blue = vision?.blue?.picks ?? []
  const red = vision?.red?.picks ?? []

  return (
    <section
      className="control-group"
      style={{ gridColumn: '1 / -1', marginTop: 8 }}
      aria-label="Draft vision OCR"
    >
      <div className="control-label">DRAFT VISION · HERO OCR</div>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
        Run <code>python main.py --run --dashboard</code> in{' '}
        <code>draft_hero_ocr/</code>. Heroes lock during pick/ban (default
        portraits only — skins ignored).
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
          />
          Auto-apply locked picks/bans to draft
        </label>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Phase: <b>{vision?.phase ?? '—'}</b> · Pick:{' '}
          <b>{vision?.picking_side ?? '—'}</b> · Timer:{' '}
          <b>{vision?.timer || '—'}</b> · FPS:{' '}
          <b>{vision?.fps?.toFixed?.(1) ?? vision?.fps ?? '—'}</b>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Last detect: {vision?.last_detected ?? '—'} (
          {(vision?.last_confidence ?? 0).toFixed(2)})
        </span>
        {lastEvent ? (
          <span style={{ fontSize: 12, color: 'var(--gold)' }}>Event: {lastEvent}</span>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <TeamColumn label="BLUE" picks={blue} bans={vision?.blue?.bans ?? []} />
        <TeamColumn label="RED" picks={red} bans={vision?.red?.bans ?? []} />
      </div>
    </section>
  )
}

function TeamColumn({
  label,
  picks,
  bans,
}: {
  label: string
  picks: VisionSlot[]
  bans: string[]
}) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        background: '#0c121c',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.14em',
          color: 'var(--muted)',
          marginBottom: 8,
        }}
      >
        {label} TEAM
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const p = picks[i]
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '4px 0',
                borderBottom: '1px solid #1e2736',
              }}
            >
              <span>
                P{i + 1} · {p?.hero ?? '—'}
              </span>
              <span
                style={{
                  color: p?.locked ? 'var(--gold)' : 'var(--muted)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                }}
              >
                {p?.locked ? 'LOCKED' : '····'}
              </span>
            </li>
          )
        })}
      </ul>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
        Bans: {bans.length ? bans.join(' · ') : '—'}
      </div>
    </div>
  )
}
