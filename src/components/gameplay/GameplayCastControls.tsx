import { useEffect, useRef, useState } from 'react'
import { Icon } from '../cme/Icon'
import {
  getGameplaySourceLabel,
  getGameplayStream,
  getGameplayViewerCount,
  isGameplayCapturing,
  startGameplayCapture,
  stopGameplayCapture,
  subscribeGameplayCapture,
} from '../../lib/gameplayCapture'
import {
  absoluteUrl,
  canUseDisplayCapture,
  displayCaptureBlockedMessage,
  isInsecureLanHttp,
  useLanOrigins,
} from '../../lib/lanOrigins'

type Props = {
  onToast?: (message: string) => void
  /** Show the local operator preview of the selected window. */
  showLocalPreview?: boolean
}

/** Operator controls — pick / change / stop the window shared to shoutcasters. */
export default function GameplayCastControls({
  onToast,
  showLocalPreview = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const origins = useLanOrigins()
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(() => isGameplayCapturing())
  const [label, setLabel] = useState(() => getGameplaySourceLabel())
  const [viewers, setViewers] = useState(() => getGameplayViewerCount())
  const [error, setError] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const captureOk = canUseDisplayCapture()
  const insecureLan = isInsecureLanHttp()

  const path =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/control/casters?tab=preview'
  const localCaptureUrl = absoluteUrl(origins.local, path)
  const secureCaptureUrl = origins.secureLan
    ? absoluteUrl(origins.secureLan, path)
    : null
  const certDownloadUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/cert.pem`
      : '/api/cert.pem'

  // Wi‑Fi HTTP cannot share windows — jump to HTTPS :5174 (same path).
  useEffect(() => {
    if (!insecureLan || !secureCaptureUrl || !origins.ready) return
    if (redirecting) return
    setRedirecting(true)
    onToast?.('Switching to HTTPS Wi‑Fi so Select window works…')
    window.location.replace(secureCaptureUrl)
  }, [insecureLan, secureCaptureUrl, origins.ready, redirecting, onToast])

  useEffect(() => {
    return subscribeGameplayCapture(() => {
      const capturing = isGameplayCapturing()
      setLive(capturing)
      setLabel(getGameplaySourceLabel())
      setViewers(getGameplayViewerCount())
      const video = videoRef.current
      const stream = getGameplayStream()
      if (video) {
        if (capturing && stream) {
          if (video.srcObject !== stream) {
            video.srcObject = stream
            void video.play().catch(() => undefined)
          }
        } else {
          video.srcObject = null
        }
      }
    })
  }, [])

  useEffect(() => {
    const stream = getGameplayStream()
    const video = videoRef.current
    if (stream && video) {
      video.srcObject = stream
      void video.play().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!captureOk) {
      setError(displayCaptureBlockedMessage() || '')
    }
  }, [captureOk])

  async function pickWindow() {
    if (!captureOk) {
      const msg = displayCaptureBlockedMessage() || 'Window share unavailable'
      setError(msg)
      onToast?.(msg)
      return
    }
    setBusy(true)
    setError('')
    try {
      await startGameplayCapture({ force: true })
      const name = getGameplaySourceLabel() || 'Window'
      onToast?.(`Casting “${name}” to shoutcaster preview`)
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === 'NotAllowedError'
            ? 'Window picker cancelled — pick a window to cast'
            : e.message
          : 'Could not open window picker'
      setError(msg)
      onToast?.(msg)
    } finally {
      setBusy(false)
    }
  }

  function stop() {
    stopGameplayCapture()
    onToast?.('Cast window stopped')
  }

  return (
    <div className="gpv-cast">
      <div className="gpv-cast-head">
        <div>
          <h3>Cast window</h3>
          <p className="display-note" style={{ marginTop: 4, marginBottom: 0 }}>
            {captureOk ? (
              <>
                Click <b>Select window</b>, open the <b>Window</b> tab in the picker,
                then choose BlueStacks / App Player (or any game window).
              </>
            ) : (
              <>
                Certify <b>HTTPS Wi‑Fi</b> (port 5174) once, or use{' '}
                <b>localhost</b> on this PC. Laptop viewers only need the LAN
                watch link.
              </>
            )}
          </p>
        </div>
        <span className={`connection${live ? ' connected' : ''}`}>
          {live ? `Live · ${label || 'Window'}` : 'No window selected'}
        </span>
      </div>

      {insecureLan || !captureOk ? (
        <div className="gpv-cast-secure">
          <strong>
            {redirecting
              ? 'Opening HTTPS Wi‑Fi…'
              : 'Certify Wi‑Fi HTTPS to unlock Select window'}
          </strong>
          <span>
            1) Open HTTPS Wi‑Fi → Advanced → Proceed (unsafe) once.
            <br />
            2) Or download the cert and install it as a Trusted Root on Windows.
            <br />
            3) Then click Select window.
          </span>
          <div className="gpv-actions" style={{ marginTop: 10 }}>
            {secureCaptureUrl ? (
              <a className="btn gold" href={secureCaptureUrl}>
                Certify HTTPS Wi‑Fi
              </a>
            ) : null}
            <a className="btn" href={localCaptureUrl}>
              Open localhost (this PC)
            </a>
            <a className="btn" href={certDownloadUrl} download="cme-wifi-cert.pem">
              Download cert
            </a>
          </div>
        </div>
      ) : null}

      {showLocalPreview ? (
        <div className="gpv-cast-preview">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={live ? 'is-live' : undefined}
          />
          {!live ? (
            <div className="gpv-cast-empty">
              <strong>No window selected</strong>
              <span>Pick BlueStacks or the game window to share</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="gpv-actions">
        <button
          className="btn gold"
          type="button"
          disabled={busy || !captureOk}
          onClick={() => void pickWindow()}
        >
          <Icon name="scan" />
          {busy ? 'Opening picker…' : live ? 'Change window' : 'Select window'}
        </button>
        {live ? (
          <button className="btn" type="button" onClick={stop}>
            <Icon name="close" />
            Stop cast
          </button>
        ) : null}
        {live && viewers > 0 ? (
          <span className="gpv-cast-meta">{viewers} watching</span>
        ) : null}
      </div>

      {error ? <p className="gpv-cast-error">{error}</p> : null}
    </div>
  )
}
