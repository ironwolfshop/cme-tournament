import { useEffect, useRef, useState } from 'react'
import { createCamViewer, type TeamCamId } from '../lib/camWebRtc'
import { ensureObsSync } from '../lib/obsSync'
import { initCamsSync, useCamsStore } from '../store/camsStore'

/** OBS — blue + red team cams side by side */
export default function CamsGridOverlayPage() {
  const matchName = useCamsStore((s) => s.matchName)
  const blueName = useCamsStore((s) => s.blueName)
  const redName = useCamsStore((s) => s.redName)

  useEffect(() => {
    ensureObsSync()
    initCamsSync()
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  return (
    <div className="overlay-root overflow-hidden bg-[#050d18] font-ui text-white">
      <header className="absolute left-0 right-0 top-0 z-10 flex justify-center pt-8">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.35em] text-teal-300">
            CME ML TOURNAMENT
          </div>
          <h1 className="font-display text-3xl font-bold">{matchName}</h1>
        </div>
      </header>
      <div className="absolute inset-x-10 bottom-10 top-28 grid grid-cols-2 gap-8">
        <TeamPane slotId="blue" name={blueName} />
        <TeamPane slotId="red" name={redName} />
      </div>
    </div>
  )
}

function TeamPane({ slotId, name }: { slotId: TeamCamId; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'connecting' | 'live' | 'idle' | 'error'>(
    'idle',
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const viewer = createCamViewer({ slotId, video, onStatus: setStatus })
    return () => viewer.stop()
  }, [slotId])

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 ${
        slotId === 'blue' ? 'border-sky-400/50' : 'border-rose-400/50'
      } bg-black/50`}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {status !== 'live' && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          {status === 'connecting' ? 'Connecting…' : 'Waiting…'}
        </div>
      )}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 py-3 text-lg font-bold ${
          slotId === 'blue' ? 'bg-sky-900/70' : 'bg-rose-900/70'
        }`}
      >
        {name}
        <span className="ml-2 text-xs font-bold uppercase text-white/70">
          {status}
        </span>
      </div>
    </div>
  )
}
