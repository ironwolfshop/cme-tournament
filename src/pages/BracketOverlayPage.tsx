import { useEffect, useRef } from 'react'
import BracketBoard from '../components/bracket/BracketBoard'
import { initBracketSync, useBracketStore } from '../store/bracketStore'

export default function BracketOverlayPage() {
  const store = useBracketStore()
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initBracketSync()
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const box = shell.getBoundingClientRect()
      const stage = shell.querySelector('.stage') as HTMLElement | null
      if (!stage || !box.width || !box.height) return
      stage.style.setProperty('--scale', String(Math.min(box.width / 1920, box.height / 1080)))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="overlay-root cme-br presentation-mode">
      <main className="workspace">
        <div className="stage-shell" ref={shellRef}>
          <div className="stage">
            <BracketBoard state={store} />
          </div>
        </div>
      </main>
    </div>
  )
}
