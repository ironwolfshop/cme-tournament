import { useEffect } from 'react'
import type { GameEvent } from '../../store/gameplayStore'

type Props = {
  event: GameEvent | null
  onHide: () => void
}

export default function EventBanner({ event, onHide }: Props) {
  useEffect(() => {
    if (!event?.visible) return
    const t = window.setTimeout(onHide, 4200)
    return () => window.clearTimeout(t)
  }, [event?.id, event?.visible, onHide])

  if (!event?.visible) return null

  const color = event.side === 'blue' ? 'var(--blue)' : 'var(--red)'

  return (
    <div className="event-call" role="status">
      <small style={{ color }}>{event.teamTag}</small>
      <b>{event.title}</b>
      <span>{event.playerName}</span>
    </div>
  )
}
