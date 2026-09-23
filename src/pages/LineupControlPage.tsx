import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { initDraftSync, useDraftStore } from '../store/draftStore'
import { initLineupSync, useLineupStore } from '../store/lineupStore'

export default function LineupControlPage() {
  const store = useLineupStore()
  const draft = useDraftStore()
  const side = store.editSide
  const team = store[side]

  useEffect(() => {
    initLineupSync()
    initDraftSync()
    document.documentElement.style.background = '#0b1220'
    document.body.style.background = '#0b1220'
  }, [])

  const obsOrigin = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:5173'
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5173'
    }
    return `http://${host}:5173`
  }, [])

  function onPhotoFile(index: number, file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        store.updatePlayer(side, index, { photo: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  function onLogoFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        store.updateTeam(side, { teamLogo: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="min-h-screen bg-[#0b1220] px-4 py-6 text-slate-100 font-ui">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white">
              Lineup scene
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Dual roster — blue + red, all 5 players each (vertical cards)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/control"
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
            >
              Draft
            </Link>
            <a
              href={`${obsOrigin}/overlay/lineup`}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-amber-600 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-500"
            >
              Open overlay
            </a>
          </div>
        </header>

        <section className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
          OBS Browser Source (HTTP):
          <code className="mt-2 block break-all rounded bg-black/40 px-2 py-2 text-xs text-sky-300">
            {obsOrigin}/overlay/lineup
          </code>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={store.autoRotate}
                onChange={(e) => store.setAutoRotate(e.target.checked)}
              />
              Auto sequence
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              roster
              <input
                type="number"
                min={2}
                max={60}
                value={store.rotateSeconds}
                onChange={(e) =>
                  store.setRotateSeconds(Number(e.target.value) || 20)
                }
                className="w-14 rounded border border-white/10 bg-black/40 px-2 py-1 text-center"
              />
              sec
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={store.includeSolo}
                onChange={(e) => store.setIncludeSolo(e.target.checked)}
              />
              Solo portraits
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              solo
              <input
                type="number"
                min={2}
                max={60}
                value={store.soloSeconds}
                onChange={(e) =>
                  store.setSoloSeconds(Number(e.target.value) || 5)
                }
                className="w-14 rounded border border-white/10 bg-black/40 px-2 py-1 text-center"
              />
              sec
            </label>
            <span className="mx-1 h-4 w-px bg-white/15" />
            <button
              type="button"
              onClick={() => store.loadBothFromDraft()}
              className="rounded bg-teal-700 px-3 py-1.5 text-sm hover:bg-teal-600"
            >
              Load both from draft
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="text-slate-400">Solo feature</span>
            <label className="flex items-center gap-2">
              Blue P
              <select
                value={store.soloBlueIndex}
                onChange={(e) =>
                  store.setSoloIndex('blue', Number(e.target.value))
                }
                className="rounded border border-white/10 bg-black/40 px-2 py-1"
              >
                {store.blue.players.map((p, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Red P
              <select
                value={store.soloRedIndex}
                onChange={(e) =>
                  store.setSoloIndex('red', Number(e.target.value))
                }
                className="rounded border border-white/10 bg-black/40 px-2 py-1"
              >
                {store.red.players.map((p, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">Edit team</span>
            <button
              type="button"
              onClick={() => store.setEditSide('blue')}
              className={`rounded px-3 py-1.5 text-sm font-bold ${
                side === 'blue'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              Blue ({store.blue.teamTag})
            </button>
            <button
              type="button"
              onClick={() => store.setEditSide('red')}
              className={`rounded px-3 py-1.5 text-sm font-bold ${
                side === 'red'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              Red ({store.red.teamTag})
            </button>
            <button
              type="button"
              onClick={() => store.loadFromDraft(side)}
              className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
            >
              Load this side from draft
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Team name</span>
              <input
                value={team.teamName}
                onChange={(e) =>
                  store.updateTeam(side, { teamName: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Team tag</span>
              <input
                value={team.teamTag}
                onChange={(e) =>
                  store.updateTeam(side, { teamTag: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-400">Headline</span>
              <input
                value={team.headline}
                onChange={(e) =>
                  store.updateTeam(side, { headline: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-400">Intro label</span>
              <input
                value={store.introLabel}
                onChange={(e) =>
                  store.setShared({ introLabel: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Subtitle</span>
              <input
                value={store.subtitle}
                onChange={(e) => store.setShared({ subtitle: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Top-right label</span>
              <input
                value={store.sponsorRight}
                onChange={(e) =>
                  store.setShared({ sponsorRight: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-400">Footer line</span>
              <input
                value={store.footerSponsors}
                onChange={(e) =>
                  store.setShared({ footerSponsors: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-400">Team logo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-300"
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-white">
            {side === 'blue' ? 'Blue' : 'Red'} players
          </h2>
          {team.players.map((player, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[72px_1fr_1fr]"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40 text-xs text-slate-500">
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    onPhotoFile(i, e.target.files?.[0] ?? null)
                  }
                  className="w-full text-[10px] text-slate-400"
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Name</span>
                <input
                  value={player.name}
                  onChange={(e) =>
                    store.updatePlayer(side, i, { name: e.target.value })
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Theme / role · hero id
                </span>
                <div className="flex gap-2">
                  <input
                    value={player.subtitle}
                    onChange={(e) =>
                      store.updatePlayer(side, i, { subtitle: e.target.value })
                    }
                    placeholder="role"
                    className="w-1/2 rounded-lg border border-white/10 bg-black/40 px-3 py-2"
                  />
                  <input
                    value={player.heroId}
                    onChange={(e) =>
                      store.updatePlayer(side, i, { heroId: e.target.value })
                    }
                    placeholder="hero id"
                    className="w-1/2 rounded-lg border border-white/10 bg-black/40 px-3 py-2"
                  />
                </div>
              </label>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
