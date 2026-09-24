import { useDraftStore } from '../store/draftStore'
import {
  formatSeriesLabel,
  useGameplayStore,
  type GameplayState,
} from '../store/gameplayStore'
import { useTournamentStore } from '../store/tournamentStore'

/** Sync BoX game label into Draft + tournament title. Never updates the bracket. */
export function syncSeriesToDraft(state?: GameplayState) {
  const g = state ?? useGameplayStore.getState()
  const label = formatSeriesLabel(g)
  useGameplayStore.getState().setMatchInfo(label)
  useDraftStore.getState().setMatchLabel(label)

  const tourney = useTournamentStore.getState()
  const active = tourney.getActive()
  const base =
    active.matchTitle
      .replace(/\bBo\s*\d+\b/gi, '')
      .replace(/\bGAME\s*\d+\b/gi, '')
      .replace(/\b\d+\s*[–-]\s*\d+\b/g, '')
      .replace(/\s*[·•|-]\s*/g, ' · ')
      .replace(/(^·\s*)|(\s*·$)/g, '')
      .trim() ||
    active.name ||
    'MATCH'
  tourney.setMatchTitle(`${base} · GAME ${g.currentGame}`.slice(0, 64))
}
