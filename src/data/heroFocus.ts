/**
 * Face centre (percent of width, percent of height) inside each hero's Sparkies
 * splash wallpaper (`heroSplashUrl`). Measured by hand from the actual art —
 * automatic detection lands on bellies / weapons on painted splash art.
 * Only valid for the remote splash; local art and icons use detection.
 */
export const SPLASH_FACE: Record<string, readonly [number, number]> = {
  miya: [38, 23],
  balmond: [43, 12],
  saber: [42, 24],
  alice: [65, 33],
  nana: [45, 25],
  tigreal: [64, 28],
  alucard: [52, 26],
  karina: [45, 13],
  akai: [57, 31],
  franco: [47, 17],
  bane: [51, 40],
  bruno: [44, 22],
  clint: [65, 21],
  rafaela: [54, 26],
  eudora: [48, 16],
  zilong: [71, 20],
  fanny: [43, 29],
  layla: [36, 37],
  minotaur: [33, 22],
  lolita: [53, 22],
  hayabusa: [40, 18],
  freya: [50, 25],
  gord: [41, 12],
  natalia: [43, 20],
  kagura: [59, 20],
  chou: [57, 19],
  sun: [49, 12],
  alpha: [40, 30],
  ruby: [60, 38],
  'yi-sun-shin': [68, 15],
  moskov: [50, 13],
  johnson: [49, 30],
  cyclops: [62, 40],
  estes: [37, 11],
  hilda: [47, 22],
  aurora: [50, 22],
  'lapu-lapu': [42, 20],
  vexana: [62, 25],
  roger: [45, 18],
  karrie: [55, 58],
  gatotkaca: [36, 23],
  harley: [38, 39],
  irithel: [67, 17],
  grock: [47, 27],
  argus: [67, 22],
  odette: [43, 20],
  lancelot: [65, 18],
  diggie: [43, 33],
  hylos: [52, 8],
  zhask: [53, 18],
  helcurt: [47, 32],
  pharsa: [52, 20],
  lesley: [25, 25],
  jawhead: [69, 29],
  angela: [53, 23],
  gusion: [49, 15],
  valir: [42, 28],
  martis: [53, 18],
  uranus: [50, 28],
  hanabi: [63, 18],
  kaja: [40, 28],
  selena: [61, 21],
  aldous: [57, 27],
  claude: [52, 23],
  vale: [47, 17],
  leomord: [38, 20],
  lunox: [52, 36],
  hanzo: [45, 27],
  belerick: [50, 20],
  kimmy: [55, 22],
  thamuz: [48, 28],
  harith: [50, 25],
  minsitthar: [58, 20],
  kadita: [27, 21],
  faramis: [48, 22],
  badang: [59, 21],
  khufra: [36, 22],
  granger: [45, 20],
  guinevere: [36, 14],
  esmeralda: [48, 28],
  terizla: [64, 18],
  'x-borg': [35, 19],
  ling: [53, 20],
  dyrroth: [50, 21],
  lylia: [52, 40],
  baxia: [38, 14],
  masha: [43, 22],
  wanwan: [50, 22],
  silvanna: [39, 25],
  cecilion: [46, 13],
  carmilla: [44, 13],
  atlas: [38, 32],
  'popol-and-kupa': [42, 31],
  'yu-zhong': [51, 12],
  'luo-yi': [47, 16],
  benedetta: [52, 18],
  khaleed: [51, 14],
  barats: [66, 38],
  brody: [48, 19],
  yve: [58, 24],
  mathilda: [61, 15],
  paquito: [64, 17],
  gloo: [58, 26],
  beatrix: [68, 24],
  phoveus: [64, 21],
  natan: [46, 18],
  aulus: [51, 25],
  aamon: [68, 14],
  valentina: [33, 17],
  edith: [32, 30],
  floryn: [37, 33],
  yin: [56, 14],
  melissa: [47, 20],
  xavier: [55, 14],
  julian: [35, 20],
  fredrinn: [41, 11],
  joy: [45, 31],
  novaria: [61, 20],
  arlott: [38, 14],
  ixia: [32, 20],
  nolan: [55, 13],
  cici: [68, 35],
  chip: [64, 22],
  zhuxin: [70, 29],
  suyou: [48, 23],
  lukas: [52, 33],
  kalea: [62, 36],
  zetian: [61, 21],
  obsidia: [53, 27],
  sora: [50, 30],
  marcel: [42, 18],
}

export type FaceCrop = {
  left: number
  top: number
  width: number
  height: number
  /** Face position inside the frame (px) — zoom pivot so the face never drifts. */
  originX: number
  originY: number
}

/** Where the face should sit in the card, as a fraction of card height. */
const FACE_Y = 0.3

/**
 * Size + offset (px) for an image inside a `box` so the face lands centred and
 * ~30% from the top. Zooms in when the face sits near the top edge, and never
 * slides the image far enough to expose an empty edge.
 */
export function cropAroundFace(
  natural: { w: number; h: number },
  box: { w: number; h: number },
  face: { x: number; y: number },
): FaceCrop {
  const fx = Math.min(Math.max(face.x / 100, 0), 1)
  const fy = Math.min(Math.max(face.y / 100, 0.04), 0.9)
  const cover = Math.max(box.w / natural.w, box.h / natural.h)
  const zoom = Math.min(Math.max(FACE_Y / fy, (1 - FACE_Y) / (1 - fy), 1.15), 1.9)
  const width = natural.w * cover * zoom
  const height = natural.h * cover * zoom
  const left = Math.min(0, Math.max(box.w - width, box.w / 2 - fx * width))
  const top = Math.min(0, Math.max(box.h - height, box.h * FACE_Y - fy * height))
  return { left, top, width, height, originX: fx * width + left, originY: fy * height + top }
}
