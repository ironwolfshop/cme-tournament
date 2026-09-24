import { useCallback, useEffect, useState } from 'react'
import GameplayOverlayPage from './GameplayOverlayPage'
import '../styles/gameplay-preview.css'

/**
 * Shoutcaster Windows viewer — full-size BlueStacks feed + gameplay HUD overlay.
 * Open /watch/gameplay (F11 fullscreen).
 */
export default function GameplayPreviewPage() {
  const [fs, setFs] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    html.style.background = '#05070c'
    body.style.background = '#05070c'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.height = '100%'
    html.style.width = '100%'
    body.style.width = '100%'
    if (root) {
      root.style.height = '100%'
      root.style.width = '100%'
      root.style.overflow = 'hidden'
    }
    const onFs = () => setFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      html.style.overflow = ''
      body.style.overflow = ''
      html.style.height = ''
      body.style.height = ''
      html.style.width = ''
      body.style.width = ''
      if (root) {
        root.style.height = ''
        root.style.width = ''
        root.style.overflow = ''
      }
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void document.documentElement.requestFullscreen().catch(() => undefined)
  }, [])

  return (
    <div className="gpv-viewer">
      {!fs ? (
        <div className="gpv-viewer-bar">
          <div>
            <strong>Gameplay preview</strong>
            <span> · shoutcaster viewer · F11 fullscreen</span>
          </div>
          <button type="button" onClick={toggleFullscreen}>
            Fullscreen
          </button>
        </div>
      ) : null}
      <div className="gpv-viewer-body">
        <GameplayOverlayPage withGameplayFeed />
      </div>
    </div>
  )
}
