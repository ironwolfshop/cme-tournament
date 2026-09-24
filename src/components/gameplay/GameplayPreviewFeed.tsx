import { useEffect, useRef, useState } from 'react'
import {
  createCamViewer,
  tuneLowLatencyVideo,
} from '../../lib/camWebRtc'
import { GAMEPLAY_SLOT } from '../../lib/gameplayCapture'
import { ensureObsSync } from '../../lib/obsSync'
import { formatClock, initGameplaySync, useGameplayStore } from '../../store/gameplayStore'
import { initCamsSync, useCamsStore } from '../../store/camsStore'

export type GameplayPreviewStatus = 'connecting' | 'live' | 'idle' | 'error'

type Props = {
  className?: string
  showHud?: boolean
}

export default function GameplayPreviewFeed({
  className = '',
  showHud = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<GameplayPreviewStatus>('idle')
  const gameplayLive = useCamsStore((s) => s.gameplayLive)
  const matchInfo = useGameplayStore((s) => s.matchInfo)
  const clock = useGameplayStore((s) => s.gameTimeSeconds)
  const blue = useGameplayStore((s) => s.blue)
  const red = useGameplayStore((s) => s.red)

  useEffect(() => {
    ensureObsSync()
    initCamsSync()
    initGameplaySync()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    tuneLowLatencyVideo(video)
    const viewer = createCamViewer({
      slotId: GAMEPLAY_SLOT,
      video,
      lowLatency: true,
      onStatus: setStatus,
    })
    return () => viewer.stop()
  }, [])

  const live = status === 'live'
  const waiting = !live

  return (
    <div className={`gpv-stage ${className}`.trim()}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        disablePictureInPicture
        className={`gpv-video${live ? ' is-live' : ''}`}
      />
      {waiting ? (
        <div className="gpv-waiting">
          <span className="gpv-waiting-kicker">
            {gameplayLive || status === 'connecting'
              ? 'Connecting'
              : 'Gameplay preview'}
          </span>
          <strong>
            {status === 'error'
              ? 'Feed dropped — retrying'
              : gameplayLive
                ? 'BlueStacks is live — locking on'
                : 'Waiting for BlueStacks'}
          </strong>
          <p>
            On the operator PC: Gameplay desk → Capture & OCR → Capture window,
            then pick BlueStacks / App Player. This screen goes live on its own.
          </p>
        </div>
      ) : null}
      <div className="gpv-chrome">
        <span className={`gpv-pill${live ? ' is-live' : ''}`}>
          <i />
          {live ? 'LIVE · BLUESTACKS' : 'STANDBY'}
        </span>
        {showHud ? (
          <span className="gpv-match">
            {matchInfo || 'CME ML'} · {formatClock(clock)}
          </span>
        ) : null}
      </div>
      {showHud ? (
        <div className="gpv-score">
          <span className="gpv-side is-blue">
            <b>{blue.tag || 'BLUE'}</b>
            <em>{blue.seriesScore}</em>
          </span>
          <span className="gpv-kills">
            {blue.kills} – {red.kills}
          </span>
          <span className="gpv-side is-red">
            <em>{red.seriesScore}</em>
            <b>{red.tag || 'RED'}</b>
          </span>
        </div>
      ) : null}
    </div>
  )
}
