import { memo, useEffect, useRef, useState } from 'react'
import {
  createCamViewer,
  type CamSlotId,
} from '../../lib/camWebRtc'
import { Icon } from '../cme/Icon'

/** Live WebRTC feed for team / shoutcaster slots published from /cam */
function TeamCamFeed({
  side,
  className = '',
  waitingLabel,
}: {
  side: CamSlotId
  className?: string
  waitingLabel?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState(false)
  // Sticky: once we have frames, keep showing video through brief reconnect blips
  const everLiveRef = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const viewer = createCamViewer({
      slotId: side,
      video,
      onStatus: (s) => {
        if (s === 'live') {
          everLiveRef.current = true
          setLive(true)
          return
        }
        if (s === 'idle' || s === 'error') {
          everLiveRef.current = false
          setLive(false)
          return
        }
        // 'connecting' — keep last frame visible if we were already live
        if (!everLiveRef.current) setLive(false)
      },
    })
    return () => viewer.stop()
  }, [side])

  const label =
    waitingLabel ??
    (side === 'caster' ? 'shoutcaster cam' : `${side} cam`)

  const showWaiting = !live && !everLiveRef.current

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className={`team-cam-feed-video ${className} ${live || everLiveRef.current ? 'is-live' : 'is-waiting'}`}
      />
      {showWaiting && (
        <div className="team-cam-waiting" aria-hidden>
          <Icon name="camera" />
          <span className="team-cam-waiting-label">{label}</span>
          <span className="team-cam-waiting-note">Waiting for feed…</span>
        </div>
      )}
    </>
  )
}

export default memo(TeamCamFeed)
