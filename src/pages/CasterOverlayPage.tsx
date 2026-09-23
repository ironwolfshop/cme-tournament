import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  initCasterSync,
  useCasterStore,
  type CasterPerson,
} from '../store/casterStore'
import '../styles/caster-overlay.css'

export default function CasterOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'
  const showTitle = useCasterStore((s) => s.showTitle)
  const caster1 = useCasterStore((s) => s.caster1)
  const caster2 = useCasterStore((s) => s.caster2)
  const shellRef = useRef<HTMLDivElement>(null)

  const plates = [caster1, caster2].filter((c) => c.visible)

  useEffect(() => {
    initCasterSync()
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    }
    const bg = preview ? '#0a101c' : 'transparent'
    html.style.background = bg
    body.style.background = bg
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [preview])

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const apply = () => {
      const stage = shell.querySelector('.caster-stage') as HTMLElement | null
      if (!stage) return
      const box = shell.getBoundingClientRect()
      if (!box.width || !box.height) return
      const scale = Math.min(box.width / 1920, box.height / 1080)
      const x = (box.width - 1920 * scale) / 2
      const y = (box.height - 1080 * scale) / 2
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(shell)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={`caster-shell${preview ? ' is-preview' : ''}`} ref={shellRef}>
      <div className={`overlay-root caster-ov${preview ? ' is-preview' : ''} caster-stage`}>
        {preview ? <div className="caster-ov-bg" aria-hidden /> : null}

        {plates.length > 0 ? (
          <footer className={`caster-lower${plates.length === 1 ? ' solo' : ''}`}>
            {showTitle.trim() ? (
              <div className="caster-lower-eyebrow">{showTitle.trim()}</div>
            ) : null}
            <div className="caster-lower-row">
              {plates.map((person, i) => (
                <Nameplate key={i} person={person} />
              ))}
            </div>
          </footer>
        ) : (
          <div className="caster-empty">
            Turn on Caster 1 or 2 and enter a name in Broadcast → Display
          </div>
        )}
      </div>
    </div>
  )
}

function Nameplate({ person }: { person: CasterPerson }) {
  const name = person.name.trim() || 'SET NAME'
  const unset = !person.name.trim()
  return (
    <div className={`caster-nameplate${unset ? ' unset' : ''}`}>
      <span className="caster-role">{person.role.trim() || 'Shoutcaster'}</span>
      <span className="caster-name">{name}</span>
    </div>
  )
}
