export const INSTITUTION_LOGOS = [
  { id: 'zscmst', src: '/logos/zscmst.png', alt: 'ZSCMST', slot: 'left' as const },
  {
    id: 'cme',
    src: '/logos/cme.png',
    alt: 'College of Maritime Education',
    slot: 'center' as const,
  },
  {
    id: 'young-sailors-club',
    src: '/logos/young-sailors-club.png',
    alt: 'Young Sailors Club',
    slot: 'right' as const,
  },
] as const

/** ZSCMST (left) · CME (center, larger) · Young Sailors Club (right) */
export function InstitutionLogos({
  className = '',
  size = 'md',
  showLabels = false,
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Show short names under each seal (Match Day / presentation). */
  showLabels?: boolean
}) {
  return (
    <div
      className={`institution-logos size-${size}${showLabels ? ' with-labels' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Institution logos"
    >
      {INSTITUTION_LOGOS.map((logo) => (
        <span
          key={logo.id}
          className={`institution-seal seal-${logo.slot}`}
          title={logo.alt}
        >
          <img
            src={logo.src}
            alt={logo.alt}
            draggable={false}
            decoding="async"
            loading="eager"
          />
          {showLabels ? (
            <span className="institution-label">
              {logo.id === 'cme'
                ? 'CME'
                : logo.id === 'zscmst'
                  ? 'ZSCMST'
                  : 'Young Sailors Club'}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )
}
