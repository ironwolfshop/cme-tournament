const PATHS: Record<string, string> = {
  swords:
    '<path d="m16 3 5 0 0 5-13 13-5-5L16 3Z"/><path d="m5 3-2 2 16 16 2-2L5 3Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bracket: '<path d="M3 4h5v5H3m0 6h5v5H3m5-13h5v10H8m5-5h8m0-3v6"/>',
  undo: '<path d="M3 8h11a7 7 0 0 1 0 14M3 8l5-5M3 8l5 5"/>',
  rotate: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  play: '<path d="m9 5 10 7-10 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m13 6 5 5"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  settings:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  monitor:
    '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  users:
    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/>',
  camera:
    '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 4 14 4 14 0V7M5 12v5c0 4 14 4 14 0v-5"/>',
  tower:
    '<path d="M5 3v6l3 3-2 9h12l-2-9 3-3V3h-4v4h-2V3H9v4H7V3H5Z"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  trophy:
    '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v5m-4 2h8"/>',
  teams:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m-1-9H4v15h15v-5"/>',
  refresh: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  link: '<path d="m10 13 4-4m-7 5-1 1a4 4 0 0 0 6 6l3-3a4 4 0 0 0 0-6"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
}

export function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.plus }}
    />
  )
}

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Icon name="swords" />
      </div>
      <div>
        <b className="brand-name">CME TOURNAMENT</b>
        <small className="brand-sub">MOBILE LEGENDS: BANG BANG</small>
      </div>
    </div>
  )
}
