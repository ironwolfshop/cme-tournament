import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { INSTITUTION_LOGOS } from '../components/cme/InstitutionLogos'
import '../styles/standby-splash.css'

const LOOP_ITEMS = [
  {
    id: 'zscmst',
    src: '/logos/zscmst.png',
    name: 'ZSCMST',
    sub: 'Zamboanga State College of Marine Sciences & Technology',
  },
  {
    id: 'cme',
    src: '/logos/cme.png',
    name: 'CME',
    sub: 'College of Maritime Education',
  },
  {
    id: 'commandant',
    src: '/logos/commandant.png',
    name: 'Commandant',
    sub: 'Office of the Commandant',
  },
] as const

/**
 * Full-screen hold splash for OBS blank scenes.
 * Opaque, looping school logos + CME FEST branding.
 * OBS Browser Source: http://localhost:5173/overlay/standby
 */
export default function StandbyOverlayPage() {
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'

  useEffect(() => {
    const bg = '#071018'
    document.documentElement.style.background = bg
    document.body.style.background = bg
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [])

  // Triple for seamless marquee
  const marquee = [...LOOP_ITEMS, ...LOOP_ITEMS, ...LOOP_ITEMS]

  return (
    <div className={`overlay-root standby-splash${preview ? ' is-preview' : ''}`}>
      <div className="sb-bg" aria-hidden>
        <div className="sb-bg-photo" />
        <div className="sb-bg-wash" />
        <div className="sb-bg-grid" />
        <div className="sb-orb sb-orb-a" />
        <div className="sb-orb sb-orb-b" />
      </div>

      <div className="sb-vignette" aria-hidden />

      <header className="sb-top">
        <div className="sb-live-pill">
          <span className="sb-live-dot" />
          LIVE ON STANDBY
        </div>
        <div className="sb-top-rule" />
        <div className="sb-seals">
          {INSTITUTION_LOGOS.map((logo) => (
            <span
              key={logo.id}
              className={`sb-seal seal-${logo.slot}`}
              title={logo.alt}
            >
              <img src={logo.src} alt={logo.alt} draggable={false} />
            </span>
          ))}
        </div>
      </header>

      <main className="sb-hero">
        <div className="sb-eyebrow">Zamboanga · Maritime · Esports</div>
        <h1 className="sb-brand">
          CME <span>FEST</span>
        </h1>
        <p className="sb-title">Mobile Legends Tournament</p>
        <div className="sb-brand-rule" aria-hidden />
        <p className="sb-hold">Please stand by · Match starting soon</p>
      </main>

      <section className="sb-carousel" aria-label="Institution logos">
        <div className="sb-carousel-fade left" aria-hidden />
        <div className="sb-carousel-fade right" aria-hidden />
        <div className="sb-carousel-track">
          {marquee.map((item, i) => (
            <article key={`${item.id}-${i}`} className="sb-card">
              <div className={`sb-card-logo${item.id === 'cme' ? ' is-cme' : ''}`}>
                <img src={item.src} alt="" draggable={false} />
              </div>
              <div className="sb-card-copy">
                <div className="sb-card-name">{item.name}</div>
                <div className="sb-card-sub">{item.sub}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="sb-footer">
        <span>CME FEST · MLBB</span>
        <span className="sb-footer-sep" />
        <span>BLANK HOLD LOOP</span>
      </footer>
    </div>
  )
}
