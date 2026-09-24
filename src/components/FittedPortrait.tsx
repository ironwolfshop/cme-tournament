import { fitPortrait, type PortraitFrame } from '../lib/portraitFit'
import { usePortraitMetrics } from '../lib/usePortraitMetrics'
import '../styles/fitted-portrait.css'

/**
 * Photo box that scales/positions the image so the head lands at
 * `frame.headTop` with `frame.headHeight` — same look for close-ups and full-body shots.
 * Sized in px from `frame`; the image is placed in % so parent transforms scale cleanly.
 */
export function FittedPortrait({
  src,
  frame,
  className = '',
  flip = false,
}: {
  src: string
  frame: PortraitFrame
  className?: string
  flip?: boolean
}) {
  const metrics = usePortraitMetrics(src)
  const fit = metrics ? fitPortrait(metrics, frame) : null
  const pw = (v: number) => `${(v / frame.width) * 100}%`
  const ph = (v: number) => `${(v / frame.height) * 100}%`

  return (
    <div
      className={`fitted-portrait${metrics && !metrics.cutout ? ' is-framed' : ''}${
        className ? ` ${className}` : ''
      }`}
      style={{ width: `${frame.width}px`, height: `${frame.height}px` }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className={fit ? 'is-ready' : ''}
          style={
            fit
              ? {
                  left: pw(fit.left),
                  top: ph(fit.top),
                  width: pw(fit.width),
                  height: ph(fit.height),
                  transform: flip ? 'scaleX(-1)' : undefined,
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
