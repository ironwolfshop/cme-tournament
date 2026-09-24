import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  destroyOcrWorker,
  getOcrWorker,
  isActiveOcrField,
  isKdaField,
  readSnapshot,
  readSnapshots,
  snapshotRegions,
  type OcrField,
  type OcrReading,
  type OcrRegion,
} from '../../lib/gameplayOcr'
import {
  getGameplayStream,
  getGameplayViewerCount,
  isGameplayCapturing,
  startGameplayCapture,
  stopGameplayCapture,
  subscribeGameplayCapture,
} from '../../lib/gameplayCapture'
import { formatClock } from '../../store/gameplayStore'
import { initCamsSync } from '../../store/camsStore'
import { useOcrStore } from '../../store/ocrStore'

function isMapped(r: { enabled: boolean; w: number; h: number }) {
  return r.enabled && r.w >= 0.008 && r.h >= 0.008
}

function formatReading(r: OcrRegion, reading: OcrReading | undefined) {
  if (!reading) return null
  if (!reading.ok) {
    return { ok: false as const, label: 'no digits' }
  }
  if (r.id === 'clock' && reading.value != null) {
    return { ok: true as const, label: formatClock(reading.value) }
  }
  if (reading.kda) {
    return {
      ok: true as const,
      label: `${reading.kda.kills}/${reading.kda.deaths}/${reading.kda.assists}`,
    }
  }
  if (reading.value == null) return { ok: false as const, label: 'no digits' }
  return { ok: true as const, label: String(reading.value) }
}

type RegionBlockProps = {
  title: string
  list: OcrRegion[]
  selectedField: OcrField
  onToast?: (message: string) => void
}

/** Kept outside the panel so OCR updates do not remount and reset scroll. */
function RegionBlock({
  title,
  list,
  selectedField,
  onToast,
}: Omit<RegionBlockProps, 'lastReadings'>) {
  const lastReadings = useOcrStore((s) => s.lastReadings)
  return (
    <>
      <div
        className="surface-head"
        style={{ paddingTop: title === 'Stat regions' ? undefined : 4 }}
      >
        <h3>{title}</h3>
      </div>
      <div
        className="region-list"
        style={{ maxHeight: 280, overflowY: 'auto', overflowAnchor: 'none' }}
      >
        {list.map((r) => {
          const reading = lastReadings.find((x) => x.field === r.id)
          const mapped = isMapped(r)
          const selected = selectedField === r.id
          const shown = formatReading(r, reading)
          return (
            <div
              key={r.id}
              className="region-row"
              style={{
                borderColor: selected ? 'var(--gold)' : undefined,
                background: selected ? '#e8bf7214' : undefined,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={() => useOcrStore.getState().setSelectedField(r.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 0,
                  color: 'inherit',
                  font: 'inherit',
                  padding: 0,
                }}
              >
                <span style={{ display: 'block', fontWeight: 650 }}>
                  {r.label}
                </span>
                <label
                  style={{
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    marginTop: 4,
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={!mapped}
                    onChange={(e) =>
                      useOcrStore
                        .getState()
                        .updateRegion(r.id, { enabled: e.target.checked })
                    }
                  />
                  OCR
                </label>
              </button>
              <span
                style={{
                  textAlign: 'right',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4,
                }}
              >
                <small
                  style={{
                    color: mapped ? '#7ddea8' : '#ff9aaf',
                    display: 'block',
                  }}
                >
                  {mapped ? 'Mapped · saved' : 'Not mapped'}
                </small>
                {shown ? (
                  <small
                    style={{
                      color: shown.ok ? '#7ddea8' : '#ff9aaf',
                      fontFamily: shown.ok ? 'monospace' : undefined,
                    }}
                    title={reading?.raw || undefined}
                  >
                    {shown.label}
                  </small>
                ) : null}
                {mapped ? (
                  <button
                    type="button"
                    className="btn small"
                    style={{
                      minHeight: 26,
                      padding: '2px 8px',
                      fontSize: 11,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      useOcrStore.getState().clearRegion(r.id)
                      onToast?.(`${r.label} map removed`)
                    }}
                  >
                    Remove map
                  </button>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

type Props = {
  onToast?: (message: string) => void
}

/** Capture + OCR panel styled for the gameplay control (`.cme-gc`) desk. */
export default function OcrControlPanel({ onToast }: Props) {
  const regions = useOcrStore((s) => s.regions)
  const intervalMs = useOcrStore((s) => s.intervalMs)
  const running = useOcrStore((s) => s.running)
  const lastError = useOcrStore((s) => s.lastError)
  const selectedField = useOcrStore((s) => s.selectedField)
  const status = useOcrStore((s) => s.status)

  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<number | null>(null)
  const loopActiveRef = useRef(false)
  const busyRef = useRef(false)
  const scanTickRef = useRef(0)
  const dragRef = useRef<{
    field: OcrField
    startX: number
    startY: number
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  /** Live drag box — local only so we don't rewrite Zustand/localStorage every move. */
  const [draftBox, setDraftBox] = useState<{
    field: OcrField
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  const [hasCapture, setHasCapture] = useState(() => isGameplayCapturing())
  const [booting, setBooting] = useState(false)
  const [viewers, setViewers] = useState(() => getGameplayViewerCount())

  useEffect(() => {
    initCamsSync()
  }, [])

  useEffect(() => {
    return subscribeGameplayCapture(() => {
      const live = isGameplayCapturing()
      setHasCapture(live)
      setViewers(getGameplayViewerCount())
      const video = videoRef.current
      const stream = getGameplayStream()
      if (video && stream && video.srcObject !== stream) {
        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        void video.play().catch(() => undefined)
      }
      if (video && !live) video.srcObject = null
    })
  }, [])

  useEffect(() => {
    const stream = getGameplayStream()
    const video = videoRef.current
    if (stream && video) {
      video.srcObject = stream
      video.playsInline = true
      video.muted = true
      void video.play().catch(() => undefined)
    }
  }, [])

  // OCR worker only — capture is a module singleton so shoutcaster preview
  // stays live when this panel unmounts.
  useEffect(() => {
    return () => {
      loopActiveRef.current = false
      if (loopRef.current != null) {
        window.clearTimeout(loopRef.current)
        loopRef.current = null
      }
      void destroyOcrWorker()
    }
  }, [])

  const stopLoop = useCallback(() => {
    loopActiveRef.current = false
    if (loopRef.current != null) {
      window.clearTimeout(loopRef.current)
      loopRef.current = null
    }
    useOcrStore.getState().setRunning(false)
  }, [])

  const stopCapture = useCallback(() => {
    stopLoop()
    stopGameplayCapture()
    if (videoRef.current) videoRef.current.srcObject = null
    setHasCapture(false)
    setDraftBox(null)
    useOcrStore.getState().setStatus('Capture stopped')
  }, [stopLoop])

  const statRegions = useMemo(
    () => regions.filter((r) => !isKdaField(r.id) && isActiveOcrField(r.id)),
    [regions],
  )
  const mappedCount = regions.filter(
    (r) => isActiveOcrField(r.id) && isMapped(r),
  ).length

  async function startCapture() {
    const ocr = useOcrStore.getState()
    ocr.setLastError('')
    try {
      const stream = await startGameplayCapture({ force: true })
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        video.disablePictureInPicture = true
        await video.play()
      }
      setHasCapture(true)
      ocr.setStatus('Capture live — sharing to shoutcaster preview')
      onToast?.('Window selected — shoutcasters can open Gameplay Preview')
      setBooting(true)
      void getOcrWorker()
        .then(() => {
          useOcrStore.getState().setStatus('Tesseract ready — map boxes, then start OCR')
        })
        .catch((e) => {
          useOcrStore
            .getState()
            .setLastError(e instanceof Error ? e.message : 'OCR failed to load')
        })
        .finally(() => setBooting(false))
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Could not start screen capture'
      useOcrStore.getState().setLastError(msg)
      onToast?.(msg)
      setBooting(false)
    }
  }

  async function runOnce() {
    const video = videoRef.current
    if (!video || busyRef.current) return
    if (!video.videoWidth || !video.videoHeight) {
      useOcrStore.getState().setLastError('No video frame yet — wait a moment')
      return
    }
    const ocr = useOcrStore.getState()
    const mapped = ocr.regions.filter(isMapped)
    if (!mapped.length) {
      ocr.setLastError(
        'Draw a box around each stat on the capture, then start OCR',
      )
      ocr.setStatus('No regions mapped')
      return
    }
    busyRef.current = true
    try {
      // All regions sampled from the same frame before any OCR runs
      const hot = ['clock', 'blueKills', 'redKills']
        .map((id) => mapped.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => r != null)
      const rest = mapped.filter(
        (r) =>
          r.id !== 'clock' && r.id !== 'blueKills' && r.id !== 'redKills',
      )
      const hotSnaps = snapshotRegions(video, hot)

      for (const snap of hotSnaps) {
        const reading = await readSnapshot(snap)
        if (reading.cached && reading.ok && snap.region.id !== 'clock') continue
        useOcrStore.getState().applyReadings([reading])
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
      }

      // Towers / series are not on the hot path — every 4th scan is enough
      scanTickRef.current += 1
      if (rest.length && scanTickRef.current % 4 === 0) {
        const more = await readSnapshots(snapshotRegions(video, rest))
        useOcrStore.getState().applyReadings(more)
      }

      useOcrStore.getState().setLastError('')
    } catch (e) {
      useOcrStore
        .getState()
        .setLastError(e instanceof Error ? e.message : 'OCR failed')
      useOcrStore.getState().setStatus('OCR error')
    } finally {
      busyRef.current = false
    }
  }

  function startLoop() {
    if (!hasCapture) return
    stopLoop()
    useOcrStore.getState().setRunning(true)
    useOcrStore.getState().setStatus('OCR running')
    onToast?.('OCR loop started — stats sync to the overlay')
    loopActiveRef.current = true
    // Self-scheduling: the next read waits for this one, so scans never pile up
    const tick = async () => {
      const started = performance.now()
      await runOnce()
      if (!loopActiveRef.current) return
      const ms = useOcrStore.getState().intervalMs
      const wait = Math.max(80, ms - (performance.now() - started))
      loopRef.current = window.setTimeout(() => void tick(), wait)
    }
    void tick()
  }

  function pointerToNorm(e: React.PointerEvent) {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onOverlayPointerDown(e: React.PointerEvent) {
    if (!hasCapture) return
    const p = pointerToNorm(e)
    if (!p) return
    e.preventDefault()
    const field = useOcrStore.getState().selectedField
    const box = {
      field,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      w: 0.02,
      h: 0.02,
    }
    dragRef.current = box
    setDraftBox({ field, x: p.x, y: p.y, w: 0.02, h: 0.02 })
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const dragRafRef = useRef<number | null>(null)

  function onOverlayPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const p = pointerToNorm(e)
    if (!p) return
    const left = Math.min(drag.startX, p.x)
    const top = Math.min(drag.startY, p.y)
    const w = Math.max(0.008, Math.abs(p.x - drag.startX))
    const h = Math.max(0.008, Math.abs(p.y - drag.startY))
    drag.x = left
    drag.y = top
    drag.w = w
    drag.h = h
    if (dragRafRef.current != null) return
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      const d = dragRef.current
      if (!d) return
      setDraftBox({ field: d.field, x: d.x, y: d.y, w: d.w, h: d.h })
    })
  }

  function onOverlayPointerUp() {
    if (dragRafRef.current != null) {
      window.cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    const drag = dragRef.current
    dragRef.current = null
    if (drag) {
      useOcrStore.getState().commitRegion(drag.field, {
        x: drag.x,
        y: drag.y,
        w: drag.w,
        h: drag.h,
      })
    }
    setDraftBox(null)
  }

  return (
    <div className="capture-layout">
      <div className="surface">
        <div className="surface-head">
          <div>
            <h3>Game window</h3>
            <div className="capture-status">
              {hasCapture
                ? running
                  ? `OCR running · sharing to shoutcasters${viewers ? ` · ${viewers} watching` : ''}`
                  : `${status}${viewers ? ` · ${viewers} watching` : ''}`
                : 'Share BlueStacks / game window — shoutcasters get a live preview'}
            </div>
          </div>
        </div>

        <div ref={stageRef} className="capture-stage">
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              pointerEvents: 'none',
              transform: 'translateZ(0)',
            }}
          />
          {hasCapture ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                cursor: 'crosshair',
                touchAction: 'none',
                zIndex: 2,
              }}
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
              onPointerCancel={onOverlayPointerUp}
            >
              {regions
                .filter(
                  (r) => isMapped(r) && !(draftBox && draftBox.field === r.id),
                )
                .map((r) => (
                  <div
                    key={r.id}
                    style={{
                      position: 'absolute',
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      border:
                        r.id === selectedField
                          ? '2px solid #f0d78c'
                          : r.enabled
                            ? '1px solid #6aafffcc'
                            : '1px solid #ffffff33',
                      background:
                        r.id === selectedField ? '#e8bf7233' : '#6aafff14',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: -16,
                        left: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#f5e6c0',
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px #000',
                      }}
                    >
                      {r.label}
                    </span>
                  </div>
                ))}
              {draftBox ? (
                <div
                  style={{
                    position: 'absolute',
                    left: `${draftBox.x * 100}%`,
                    top: `${draftBox.y * 100}%`,
                    width: `${draftBox.w * 100}%`,
                    height: `${draftBox.h * 100}%`,
                    border: '2px solid #f0d78c',
                    background: '#e8bf7244',
                    pointerEvents: 'none',
                    willChange: 'left, top, width, height',
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="capture-empty">
              <strong>Capture your game window</strong>
              <p>
                Click <b>Select window</b>, open the <b>Window</b> tab, pick
                BlueStacks / App Player, select a stat on the right, then drag a
                box over the digits.
              </p>
            </div>
          )}
        </div>

        <div className="capture-foot">
          <span>
            {hasCapture
              ? `Selected: ${regions.find((r) => r.id === selectedField)?.label ?? selectedField}`
              : 'Waiting for a capture source'}
          </span>
          <span>
            {mappedCount} / {regions.length} mapped · saved in this browser
          </span>
        </div>

        <div className="capture-settings" style={{ flexWrap: 'wrap', gap: 8 }}>
          {!hasCapture ? (
            <button
              className="btn gold small"
              type="button"
              onClick={() => void startCapture()}
            >
              {booting ? 'Loading Tesseract…' : hasCapture ? 'Change window' : 'Select window'}
            </button>
          ) : (
            <button className="btn small" type="button" onClick={stopCapture}>
              Stop capture
            </button>
          )}
          <button
            className="btn small"
            type="button"
            disabled={!hasCapture || running}
            onClick={() => void runOnce()}
          >
            Read once
          </button>
          {!running ? (
            <button
              className="btn gold small"
              type="button"
              disabled={!hasCapture}
              onClick={startLoop}
            >
              Start OCR loop
            </button>
          ) : (
            <button className="btn small" type="button" onClick={stopLoop}>
              Stop OCR loop
            </button>
          )}
          <label
            className="field"
            style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>Interval (sec)</span>
            <input
              type="number"
              min={0.6}
              max={15}
              step={0.2}
              value={intervalMs / 1000}
              onChange={(e) =>
                useOcrStore
                  .getState()
                  .setIntervalMs(
                    Math.round(Number(e.target.value) * 1000) || 2500,
                  )
              }
              style={{ width: 72 }}
            />
          </label>
          <button
            className="btn small"
            type="button"
            disabled={
              !regions.some((r) => r.id === selectedField && isMapped(r))
            }
            onClick={() => {
              const id = useOcrStore.getState().selectedField
              const label =
                regions.find((r) => r.id === id)?.label ?? String(id)
              useOcrStore.getState().clearRegion(id)
              onToast?.(`${label} map removed`)
            }}
          >
            Remove selected map
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              useOcrStore.getState().resetRegions()
              onToast?.('All region maps cleared')
            }}
          >
            Clear all maps
          </button>
        </div>
        {lastError ? (
          <p style={{ color: '#ff9aaf', padding: '0 14px 12px', margin: 0 }}>
            {lastError}
          </p>
        ) : null}
      </div>

      <aside className="surface">
        <RegionBlock
          title="Stat regions"
          list={statRegions}
          selectedField={selectedField}
          onToast={onToast}
        />
        <p className="display-note" style={{ padding: '0 14px 14px', margin: 0 }}>
          Map Blue / Red kills tight on the digit only — avoid gold and icons.
        </p>
      </aside>
    </div>
  )
}
