type Props = {
  visible: boolean
  label: string
  image?: string
}

/** Transparent map window — place an OBS map capture behind this hole, or upload an image. */
export default function MapSlot({ visible, label, image }: Props) {
  if (!visible) return null

  return (
    <section className="map-slot" aria-label="Map placeholder">
      <div className="map-slot-frame">
        <div className="map-slot-topline">
          <span>{label || 'MAP'}</span>
          <span>LIVE</span>
        </div>
        <div className="map-slot-window">
          {image ? (
            <img src={image} alt="Map" className="map-slot-image" />
          ) : (
            <div className="map-slot-guide" aria-hidden>
              <span className="map-slot-guide-title">MAP WINDOW</span>
              <span className="map-slot-guide-note">
                Transparent — put map capture here in OBS
              </span>
            </div>
          )}
        </div>
        <div className="map-slot-footer">
          <span>MINIMAP</span>
          <span>1920 ALIGN</span>
        </div>
      </div>
    </section>
  )
}
