export const INSTITUTION_LOGOS = [
  { id: 'zscmst', src: '/logos/zscmst.png', alt: 'ZSCMST', slot: 'left' as const },
  { id: 'cme', src: '/logos/cme.png', alt: 'College of Maritime Education', slot: 'center' as const },
  { id: 'commandant', src: '/logos/commandant.png', alt: 'Commandant', slot: 'right' as const },
] as const

/** ZSCMST (left) · CME (center, larger) · Commandant (right) */
export function InstitutionLogos({
  className = '',
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div
      className={`institution-logos size-${size}${className ? ` ${className}` : ''}`}
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
        </span>
      ))}
    </div>
  )
}
