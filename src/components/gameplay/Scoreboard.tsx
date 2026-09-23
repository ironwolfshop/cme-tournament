import {
  formatClock,
  formatGold,
  type GameplayState,
} from '../../store/gameplayStore'

type Props = {
  matchInfo: string
  gameTimeSeconds: number
  blue: GameplayState['blue']
  red: GameplayState['red']
}

export default function Scoreboard({
  matchInfo,
  gameTimeSeconds,
  blue,
  red,
}: Props) {
  const goldLead = blue.gold - red.gold

  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-40 flex items-start justify-center px-3 pt-2 anim-fade-up">
      <div className="relative flex w-full max-w-[1680px] items-stretch">
        {/* Blue team block */}
        <div className="flex flex-1 items-center gap-3 rounded-l-md bg-[rgba(8,20,48,0.82)] px-3 py-2 backdrop-blur-md border border-white/10 border-r-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 ring-2 ring-[#1e5cff]">
            {blue.logo ? (
              <img src={blue.logo} alt={blue.tag} className="h-9 w-9 object-contain" />
            ) : (
              <span className="font-display text-[10px] font-extrabold text-white">
                {blue.tag.slice(0, 4)}
              </span>
            )}
          </div>
          <div>
            <div className="font-display text-lg font-extrabold tracking-wide text-white">
              {blue.tag}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <Stat label="K" value={blue.kills} />
              <Stat label="T" value={blue.towers} />
              <span className="font-display font-bold text-amber-300">
                {formatGold(blue.gold)}
              </span>
              {goldLead > 0 && (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-display text-[10px] font-bold text-emerald-300">
                  +{formatGold(goldLead)}
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto font-display text-5xl font-extrabold leading-none text-white drop-shadow">
            {blue.seriesScore}
          </div>
        </div>

        {/* Center clock + emblem */}
        <div className="relative z-10 -mx-1 flex w-[160px] flex-col items-center justify-center bg-gradient-to-b from-[#0c1a3a] to-[#132554] px-2 py-1 shadow-xl border-y border-white/15">
          <div className="font-display text-xl font-extrabold tabular-nums tracking-wider text-white">
            {formatClock(gameTimeSeconds)}
          </div>
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-2 ring-amber-400/70">
            <span className="font-display text-[9px] font-extrabold text-amber-200">
              MPL
            </span>
          </div>
        </div>

        {/* Red team block */}
        <div className="flex flex-1 items-center gap-3 rounded-r-md bg-[rgba(8,20,48,0.82)] px-3 py-2 backdrop-blur-md border border-white/10 border-l-0">
          <div className="font-display text-5xl font-extrabold leading-none text-white drop-shadow">
            {red.seriesScore}
          </div>
          <div className="ml-auto text-right">
            <div className="font-display text-lg font-extrabold tracking-wide text-white">
              {red.tag}
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] text-slate-300">
              {goldLead < 0 && (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-display text-[10px] font-bold text-emerald-300">
                  +{formatGold(Math.abs(goldLead))}
                </span>
              )}
              <span className="font-display font-bold text-amber-300">
                {formatGold(red.gold)}
              </span>
              <Stat label="T" value={red.towers} />
              <Stat label="K" value={red.kills} />
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 ring-2 ring-[#e11d2e]">
            {red.logo ? (
              <img src={red.logo} alt={red.tag} className="h-9 w-9 object-contain" />
            ) : (
              <span className="font-display text-[10px] font-extrabold text-white">
                {red.tag.slice(0, 4)}
              </span>
            )}
          </div>
        </div>

        {/* Match info pill */}
        <div className="absolute -bottom-7 right-0 rounded bg-[rgba(8,20,48,0.85)] px-3 py-1 text-[10px] font-semibold tracking-wide text-slate-200 border border-white/10">
          {matchInfo}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-display font-bold text-white">{value}</span>
    </span>
  )
}
