const PATHS: Record<string, string> = {
  swords:
    '<path d="m16 3 5 0 0 5-13 13-5-5L16 3Z"/><path d="m5 3-2 2 16 16 2-2L5 3Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders:
    '<path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 3v4m8 3v4M9 17v4"/>',
  bracket:
    '<path d="M3 4h5v5H3m5-3h4v12H8m-5-3h5v5H3m9-8h9m-4-4 4 4-4 4"/>',
  undo: '<path d="M3 8h11a7 7 0 0 1 0 14M3 8l5-5M3 8l5 5"/>',
  rotate: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  play: '<path d="m9 5 10 7-10 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  settings:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/>',
  camera:
    '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 4 14 4 14 0V7M5 12v5c0 4 14 4 14 0v-5"/>',
  tower:
    '<path d="M5 3v6l3 3-2 9h12l-2-9 3-3V3h-4v4h-2V3H9v4H7V3H5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  trophy:
    '<path d="M8 3h8v5c0 4-2 6-4 6s-4-2-4-6V3Z"/><path d="M8 5H4v2c0 3 2 4 5 4m7-6h4v2c0 3-2 4-5 4m-3 3v5m-4 2h8m-6-2h4"/>',
  teams:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m-1-9H4v15h15v-5"/>',
  refresh: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  link: '<path d="m10 13 4-4m-7 5-1 1a4 4 0 0 0 6 6l3-3a4 4 0 0 0 0-6"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  photo:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  upload:
    '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  gear: '<path d="m9 3-1 3-3 1-1 4 2 2v3l3 3 3-1 3 1 3-3v-3l2-2-1-4-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  dagger: '<path d="m20 4-1 5-9 9-4-4 9-9 5-1Z"/><path d="m7 15-4 4 2 2 4-4"/>',
  wand: '<path d="m4 20 10-10"/><path d="m16 3 1 2.5L19.5 7 17 8l-1 2.5L15 8l-2.5-1L15 5.5 16 3Z"/><path d="M20 13v3m-1.5-1.5h3"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z"/>',
  save: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
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
