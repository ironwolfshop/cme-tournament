type Props = {
  name: string
  bpm: number
  align?: 'left' | 'right'
}

export default function BpmWidget({ name, bpm, align = 'left' }: Props) {
  const flipped = align === 'right'
  return (
    <div
      className={`flex items-center gap-2 rounded-sm bg-white/95 px-2.5 py-1 shadow-md ${
        flipped ? 'flex-row-reverse anim-slide-right' : 'anim-slide-left'
      }`}
      style={{ animationDelay: '200ms' }}
    >
      <span className="animate-heartbeat text-rose-500">♥</span>
      <span className="font-display text-sm font-extrabold tabular-nums text-slate-900">
        {bpm} BPM
      </span>
      <span className="text-slate-400">🎧</span>
      <span className="font-display text-xs font-bold uppercase tracking-wide text-slate-700">
        {name}
      </span>
    </div>
  )
}
