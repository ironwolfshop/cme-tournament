import HeroImage from '../HeroImage'
import type { PredictorEntry } from '../../store/draftStore'

type Props = {
  label: string
  entries: PredictorEntry[]
}

export default function AiPredictor({ label, entries }: Props) {
  return (
    <div className="w-[520px] overflow-hidden rounded-md border border-white/10 bg-[rgba(8,20,48,0.78)] shadow-xl backdrop-blur-md anim-slide-left">
      <div className="border-b border-white/10 px-3 py-1.5">
        <span className="font-display text-[11px] font-bold tracking-[0.18em] text-sky-200">
          {label}
        </span>
      </div>
      <div className="flex gap-1.5 px-2 py-2">
        {entries.slice(0, 10).map((entry, i) => (
          <div
            key={entry.heroId}
            className="anim-predictor-item flex w-11 flex-col items-center gap-1"
            style={{ animationDelay: `${120 + i * 45}ms` }}
          >
            <HeroImage
              heroId={entry.heroId}
              className="h-11 w-11 rounded-sm border border-white/20 transition-transform duration-300 hover:scale-110"
              showNameFallback={false}
            />
            <span className="font-display text-[9px] font-semibold text-amber-300 tabular-nums">
              {entry.percent.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
