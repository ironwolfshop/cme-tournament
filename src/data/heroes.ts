import { SPLASH_BY_HERO_NAME, splashUrl } from './splashMap'

export type Hero = {
  id: string
  name: string
  role: string
  /** Official MLBB numeric id used for CDN portraits */
  gameId: number
}

/** Bump when re-downloading portraits so grids pick up new files (cache bust). */
export const HERO_ASSET_VERSION = 'hirara-20260923'

/** Local default-skin splash (downloaded via scripts/download-*-portraits.mjs). */
export function heroLocalSplashUrl(heroId: string): string {
  return `/heroes/${heroId}.png?v=${HERO_ASSET_VERSION}`
}

/** Local face-cropped portrait used in the hero selection pool. */
export function heroLocalFaceUrl(heroId: string): string {
  return `/heroes/face/${heroId}.png?v=${HERO_ASSET_VERSION}`
}

/** Small icon portraits from Moonton CDN (may 403 in some regions). */
export function heroPortraitUrl(gameId: number): string {
  return `https://akmweb.youngjoygame.com/web/svnres/img/mlbb/homepage/100x100/${gameId}.jpg`
}

export function heroLoadingUrl(gameId: number): string {
  return `https://akmweb.youngjoygame.com/web/svnres/img/mlbb/hero_loading/${gameId}.jpg`
}

/** Full default-skin splash art from local cache or Sparkies Splash. */
export function heroSplashUrl(heroName: string): string | null {
  const ref = SPLASH_BY_HERO_NAME[heroName]
  if (!ref) return null
  return splashUrl(ref.folder, ref.file)
}

export const HEROES: Hero[] = [
  { id: 'miya', name: 'Miya', role: 'Marksman', gameId: 1 },
  { id: 'balmond', name: 'Balmond', role: 'Fighter', gameId: 2 },
  { id: 'saber', name: 'Saber', role: 'Assassin', gameId: 3 },
  { id: 'alice', name: 'Alice', role: 'Mage', gameId: 4 },
  { id: 'nana', name: 'Nana', role: 'Mage', gameId: 5 },
  { id: 'tigreal', name: 'Tigreal', role: 'Tank', gameId: 6 },
  { id: 'alucard', name: 'Alucard', role: 'Fighter', gameId: 7 },
  { id: 'karina', name: 'Karina', role: 'Assassin', gameId: 8 },
  { id: 'akai', name: 'Akai', role: 'Tank', gameId: 9 },
  { id: 'franco', name: 'Franco', role: 'Tank', gameId: 10 },
  { id: 'bane', name: 'Bane', role: 'Fighter', gameId: 11 },
  { id: 'bruno', name: 'Bruno', role: 'Marksman', gameId: 12 },
  { id: 'clint', name: 'Clint', role: 'Marksman', gameId: 13 },
  { id: 'rafaela', name: 'Rafaela', role: 'Support', gameId: 14 },
  { id: 'eudora', name: 'Eudora', role: 'Mage', gameId: 15 },
  { id: 'zilong', name: 'Zilong', role: 'Fighter', gameId: 16 },
  { id: 'fanny', name: 'Fanny', role: 'Assassin', gameId: 17 },
  { id: 'layla', name: 'Layla', role: 'Marksman', gameId: 18 },
  { id: 'minotaur', name: 'Minotaur', role: 'Tank', gameId: 19 },
  { id: 'lolita', name: 'Lolita', role: 'Support', gameId: 20 },
  { id: 'hayabusa', name: 'Hayabusa', role: 'Assassin', gameId: 21 },
  { id: 'freya', name: 'Freya', role: 'Fighter', gameId: 22 },
  { id: 'gord', name: 'Gord', role: 'Mage', gameId: 23 },
  { id: 'natalia', name: 'Natalia', role: 'Assassin', gameId: 24 },
  { id: 'kagura', name: 'Kagura', role: 'Mage', gameId: 25 },
  { id: 'chou', name: 'Chou', role: 'Fighter', gameId: 26 },
  { id: 'sun', name: 'Sun', role: 'Fighter', gameId: 27 },
  { id: 'alpha', name: 'Alpha', role: 'Fighter', gameId: 28 },
  { id: 'ruby', name: 'Ruby', role: 'Fighter', gameId: 29 },
  { id: 'yi-sun-shin', name: 'Yi Sun-shin', role: 'Assassin', gameId: 30 },
  { id: 'moskov', name: 'Moskov', role: 'Marksman', gameId: 31 },
  { id: 'johnson', name: 'Johnson', role: 'Tank', gameId: 32 },
  { id: 'cyclops', name: 'Cyclops', role: 'Mage', gameId: 33 },
  { id: 'estes', name: 'Estes', role: 'Support', gameId: 34 },
  { id: 'hilda', name: 'Hilda', role: 'Fighter', gameId: 35 },
  { id: 'aurora', name: 'Aurora', role: 'Mage', gameId: 36 },
  { id: 'lapu-lapu', name: 'Lapu-Lapu', role: 'Fighter', gameId: 37 },
  { id: 'vexana', name: 'Vexana', role: 'Mage', gameId: 38 },
  { id: 'roger', name: 'Roger', role: 'Fighter', gameId: 39 },
  { id: 'karrie', name: 'Karrie', role: 'Marksman', gameId: 40 },
  { id: 'gatotkaca', name: 'Gatotkaca', role: 'Tank', gameId: 41 },
  { id: 'harley', name: 'Harley', role: 'Mage', gameId: 42 },
  { id: 'irithel', name: 'Irithel', role: 'Marksman', gameId: 43 },
  { id: 'grock', name: 'Grock', role: 'Tank', gameId: 44 },
  { id: 'argus', name: 'Argus', role: 'Fighter', gameId: 45 },
  { id: 'odette', name: 'Odette', role: 'Mage', gameId: 46 },
  { id: 'lancelot', name: 'Lancelot', role: 'Assassin', gameId: 47 },
  { id: 'diggie', name: 'Diggie', role: 'Support', gameId: 48 },
  { id: 'hylos', name: 'Hylos', role: 'Tank', gameId: 49 },
  { id: 'zhask', name: 'Zhask', role: 'Mage', gameId: 50 },
  { id: 'helcurt', name: 'Helcurt', role: 'Assassin', gameId: 51 },
  { id: 'pharsa', name: 'Pharsa', role: 'Mage', gameId: 52 },
  { id: 'lesley', name: 'Lesley', role: 'Marksman', gameId: 53 },
  { id: 'jawhead', name: 'Jawhead', role: 'Fighter', gameId: 54 },
  { id: 'angela', name: 'Angela', role: 'Support', gameId: 55 },
  { id: 'gusion', name: 'Gusion', role: 'Assassin', gameId: 56 },
  { id: 'valir', name: 'Valir', role: 'Mage', gameId: 57 },
  { id: 'martis', name: 'Martis', role: 'Fighter', gameId: 58 },
  { id: 'uranus', name: 'Uranus', role: 'Tank', gameId: 59 },
  { id: 'hanabi', name: 'Hanabi', role: 'Marksman', gameId: 60 },
  { id: 'chang-e', name: "Chang'e", role: 'Mage', gameId: 61 },
  { id: 'kaja', name: 'Kaja', role: 'Support', gameId: 62 },
  { id: 'selena', name: 'Selena', role: 'Assassin', gameId: 63 },
  { id: 'aldous', name: 'Aldous', role: 'Fighter', gameId: 64 },
  { id: 'claude', name: 'Claude', role: 'Marksman', gameId: 65 },
  { id: 'vale', name: 'Vale', role: 'Mage', gameId: 66 },
  { id: 'leomord', name: 'Leomord', role: 'Fighter', gameId: 67 },
  { id: 'lunox', name: 'Lunox', role: 'Mage', gameId: 68 },
  { id: 'hanzo', name: 'Hanzo', role: 'Assassin', gameId: 69 },
  { id: 'belerick', name: 'Belerick', role: 'Tank', gameId: 70 },
  { id: 'kimmy', name: 'Kimmy', role: 'Marksman', gameId: 71 },
  { id: 'thamuz', name: 'Thamuz', role: 'Fighter', gameId: 72 },
  { id: 'harith', name: 'Harith', role: 'Mage', gameId: 73 },
  { id: 'minsitthar', name: 'Minsitthar', role: 'Fighter', gameId: 74 },
  { id: 'kadita', name: 'Kadita', role: 'Mage', gameId: 75 },
  { id: 'faramis', name: 'Faramis', role: 'Support', gameId: 76 },
  { id: 'badang', name: 'Badang', role: 'Fighter', gameId: 77 },
  { id: 'khufra', name: 'Khufra', role: 'Tank', gameId: 78 },
  { id: 'granger', name: 'Granger', role: 'Marksman', gameId: 79 },
  { id: 'guinevere', name: 'Guinevere', role: 'Fighter', gameId: 80 },
  { id: 'esmeralda', name: 'Esmeralda', role: 'Mage', gameId: 81 },
  { id: 'terizla', name: 'Terizla', role: 'Fighter', gameId: 82 },
  { id: 'x-borg', name: 'X.Borg', role: 'Fighter', gameId: 83 },
  { id: 'ling', name: 'Ling', role: 'Assassin', gameId: 84 },
  { id: 'dyrroth', name: 'Dyrroth', role: 'Fighter', gameId: 85 },
  { id: 'lylia', name: 'Lylia', role: 'Mage', gameId: 86 },
  { id: 'baxia', name: 'Baxia', role: 'Tank', gameId: 87 },
  { id: 'masha', name: 'Masha', role: 'Fighter', gameId: 88 },
  { id: 'wanwan', name: 'Wanwan', role: 'Marksman', gameId: 89 },
  { id: 'silvanna', name: 'Silvanna', role: 'Fighter', gameId: 90 },
  { id: 'cecilion', name: 'Cecilion', role: 'Mage', gameId: 91 },
  { id: 'carmilla', name: 'Carmilla', role: 'Support', gameId: 92 },
  { id: 'atlas', name: 'Atlas', role: 'Tank', gameId: 93 },
  { id: 'popol', name: 'Popol and Kupa', role: 'Marksman', gameId: 94 },
  { id: 'yu-zhong', name: 'Yu Zhong', role: 'Fighter', gameId: 95 },
  { id: 'luo-yi', name: 'Luo Yi', role: 'Mage', gameId: 96 },
  { id: 'benedetta', name: 'Benedetta', role: 'Assassin', gameId: 97 },
  { id: 'khaleed', name: 'Khaleed', role: 'Fighter', gameId: 98 },
  { id: 'barats', name: 'Barats', role: 'Tank', gameId: 99 },
  { id: 'brody', name: 'Brody', role: 'Marksman', gameId: 100 },
  { id: 'yve', name: 'Yve', role: 'Mage', gameId: 101 },
  { id: 'mathilda', name: 'Mathilda', role: 'Support', gameId: 102 },
  { id: 'paquito', name: 'Paquito', role: 'Fighter', gameId: 103 },
  { id: 'gloo', name: 'Gloo', role: 'Tank', gameId: 104 },
  { id: 'beatrix', name: 'Beatrix', role: 'Marksman', gameId: 105 },
  { id: 'phoveus', name: 'Phoveus', role: 'Fighter', gameId: 106 },
  { id: 'natan', name: 'Natan', role: 'Marksman', gameId: 107 },
  { id: 'aulus', name: 'Aulus', role: 'Fighter', gameId: 108 },
  { id: 'aamon', name: 'Aamon', role: 'Assassin', gameId: 109 },
  { id: 'valentina', name: 'Valentina', role: 'Mage', gameId: 110 },
  { id: 'edith', name: 'Edith', role: 'Marksman', gameId: 111 },
  { id: 'floryn', name: 'Floryn', role: 'Support', gameId: 112 },
  { id: 'yin', name: 'Yin', role: 'Fighter', gameId: 113 },
  { id: 'melissa', name: 'Melissa', role: 'Marksman', gameId: 114 },
  { id: 'xavier', name: 'Xavier', role: 'Mage', gameId: 115 },
  { id: 'julian', name: 'Julian', role: 'Fighter', gameId: 116 },
  { id: 'fredrinn', name: 'Fredrinn', role: 'Fighter', gameId: 117 },
  { id: 'joy', name: 'Joy', role: 'Assassin', gameId: 118 },
  { id: 'novaria', name: 'Novaria', role: 'Mage', gameId: 119 },
  { id: 'arlott', name: 'Arlott', role: 'Fighter', gameId: 120 },
  { id: 'ixia', name: 'Ixia', role: 'Marksman', gameId: 121 },
  { id: 'nolan', name: 'Nolan', role: 'Assassin', gameId: 122 },
  { id: 'cici', name: 'Cici', role: 'Fighter', gameId: 123 },
  { id: 'chip', name: 'Chip', role: 'Support', gameId: 124 },
  { id: 'zhuxin', name: 'Zhuxin', role: 'Mage', gameId: 125 },
  { id: 'suyou', name: 'Suyou', role: 'Assassin', gameId: 126 },
  { id: 'lukas', name: 'Lukas', role: 'Fighter', gameId: 127 },
  { id: 'kalea', name: 'Kalea', role: 'Support', gameId: 128 },
  { id: 'zetian', name: 'Zetian', role: 'Mage', gameId: 129 },
  { id: 'obsidia', name: 'Obsidia', role: 'Marksman', gameId: 130 },
  { id: 'sora', name: 'Sora', role: 'Fighter', gameId: 131 },
  { id: 'marcel', name: 'Marcel', role: 'Support', gameId: 132 },
  { id: 'hirara', name: 'Hirara', role: 'Assassin', gameId: 133 },
]

export const UNIQUE_HEROES = HEROES

export function getHero(id: string | null | undefined): Hero | undefined {
  if (!id) return undefined
  return HEROES.find((h) => h.id === id)
}

export function searchHeroes(query: string): Hero[] {
  const q = query.trim().toLowerCase()
  if (!q) return HEROES
  return HEROES.filter(
    (h) =>
      h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q),
  )
}
