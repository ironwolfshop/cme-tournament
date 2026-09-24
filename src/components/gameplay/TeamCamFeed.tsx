import { useEffect, useRef, useState } from 'react'
import {
  createCamViewer,
  type CamSlotId,
} from '../../lib/camWebRtc'

/** Live WebRTC feed for team / shoutcaster slots published from /cam */
export default function TeamCamFeed({
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

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const viewer = createCamViewer({
      slotId: side,
      video,
      onStatus: (s) => setLive(s === 'live'),
    })
    return () => viewer.stop()
  }, [side])

  const label =
    waitingLabel ??
    (side === 'caster' ? 'shoutcaster cam' : `${side} cam`)

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className={`absolute inset-0 h-full w-full object-cover ${className} ${
          live ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-slate-800/80 to-slate-950/90">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
            {label}
          </span>
          <span className="text-[9px] text-white/35">Waiting for feed…</span>
        </div>
      )}
    </>
  )
}
