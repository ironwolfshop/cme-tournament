export type Item = {
  id: string
  name: string
  color: string
}

/** Common MLBB items — colored tiles (no CDN dependency). */
export const ITEMS: Item[] = [
  { id: 'boots', name: 'Swift Boots', color: '#3b82f6' },
  { id: 'arcane', name: 'Arcane Boots', color: '#6366f1' },
  { id: 'tough', name: 'Tough Boots', color: '#64748b' },
  { id: 'warrior', name: 'Warrior Boots', color: '#b45309' },
  { id: 'rapacious', name: 'Rapacious', color: '#eab308' },
  { id: 'corrosion', name: 'Corrosion Scythe', color: '#84cc16' },
  { id: 'berserker', name: "Berserker's Fury", color: '#ef4444' },
  { id: 'haas', name: "Haas's Claws", color: '#f43f5e' },
  { id: 'sea', name: 'Sea Halberd', color: '#06b6d4' },
  { id: 'blade', name: 'Blade of Despair', color: '#7c3aed' },
  { id: 'endless', name: 'Endless Battle', color: '#dc2626' },
  { id: 'hunter', name: 'Hunter Strike', color: '#f97316' },
  { id: 'waraxe', name: 'War Axe', color: '#a16207' },
  { id: 'bloodlust', name: 'Bloodlust Axe', color: '#b91c1c' },
  { id: 'oracle', name: 'Oracle', color: '#22d3ee' },
  { id: 'athena', name: "Athena's Shield", color: '#38bdf8' },
  { id: 'antique', name: 'Antique Cuirass', color: '#78716c' },
  { id: 'dominance', name: 'Dominance Ice', color: '#67e8f9' },
  { id: 'immortality', name: 'Immortality', color: '#fbbf24' },
  { id: 'winter', name: 'Winter Crown', color: '#a5f3fc' },
  { id: 'genius', name: 'Genius Wand', color: '#c084fc' },
  { id: 'lightning', name: 'Lightning Truncheon', color: '#818cf8' },
  { id: 'holy', name: 'Holy Crystal', color: '#e879f9' },
  { id: 'divine', name: 'Divine Glaive', color: '#d946ef' },
  { id: 'clock', name: 'Clock of Destiny', color: '#f472b6' },
  { id: 'fleeting', name: 'Fleeting Time', color: '#fb7185' },
  { id: 'concentrated', name: 'Concentrated Energy', color: '#4ade80' },
  { id: 'necklace', name: 'Necklace of Durance', color: '#a3e635' },
  { id: 'queen', name: "Queen's Wings", color: '#facc15' },
  { id: 'brute', name: 'Brute Force', color: '#ea580c' },
]

export function getItem(id: string | null | undefined): Item | undefined {
  if (!id) return undefined
  return ITEMS.find((i) => i.id === id)
}
