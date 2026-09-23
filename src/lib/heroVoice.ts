/** Soft, slow female announcer for hero reveal callouts. */

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([])
  }
  if (voicesReady) return voicesReady

  voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const grab = () => synth.getVoices()
    const existing = grab()
    if (existing.length) {
      resolve(existing)
      return
    }
    const onChange = () => {
      const list = grab()
      if (!list.length) return
      synth.removeEventListener('voiceschanged', onChange)
      resolve(list)
    }
    synth.addEventListener('voiceschanged', onChange)
    window.setTimeout(() => {
      synth.removeEventListener('voiceschanged', onChange)
      resolve(grab())
    }, 1200)
  })

  return voicesReady
}

/** Prefer soft natural/neural voices; penalize classic robotic SAPI voices. */
const PREFERRED_VOICES = [
  /microsoft jenny.*neural/i,
  /microsoft aria.*neural/i,
  /microsoft michelle.*neural/i,
  /microsoft ana.*neural/i,
  /microsoft sara.*neural/i,
  /google us english.*female/i,
  /google uk english female/i,
  /microsoft jenny/i,
  /microsoft aria/i,
  /samantha/i,
  /karen/i,
  /moira/i,
  /tessa/i,
  /fiona/i,
  /victoria/i,
]

const FEMALE_HINTS =
  /female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|linda|helen|catherine|aria|jenny|natasha|sonia|eva|anna|emma|sarah|michelle|ana|sara/i

const MALE_HINTS =
  /male|david|mark|daniel|george|james|thomas|ravi|ryan|andrew|brian|christopher|eric|steffan|tony|guy\b/i

const ROBOTIC_PENALTY =
  /zira|microsoft zira|microsoft helena|microsoft hazel|microsoft susan|microsoft linda|desktop|sapi/i

function scoreFemaleVoice(v: SpeechSynthesisVoice): number {
  let score = 0
  const label = `${v.name} ${v.lang}`

  if (/^en(-|_)/i.test(v.lang) || /^en$/i.test(v.lang)) score += 30
  if (/en-US/i.test(v.lang)) score += 10
  if (/en-GB|en-AU|en-IE/i.test(v.lang)) score += 6

  PREFERRED_VOICES.forEach((re, i) => {
    if (re.test(label)) score += 120 - i * 4
  })

  if (/neural|natural|online \(natural\)|premium/i.test(label)) score += 55
  if (FEMALE_HINTS.test(label)) score += 35
  if (MALE_HINTS.test(label) && !FEMALE_HINTS.test(label)) score -= 80
  if (ROBOTIC_PENALTY.test(label)) score -= 70
  if (v.localService === false) score += 15
  if (v.default) score += 1

  return score
}

async function pickFemaleVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices()
  if (!voices.length) return null

  const ranked = [...voices].sort(
    (a, b) => scoreFemaleVoice(b) - scoreFemaleVoice(a),
  )
  return ranked[0] ?? null
}

/** Soft pronunciation — spaces only, no hyphens (hyphens sound robotic). */
export function pronounceHeroName(name: string): string {
  const map: Record<string, string> = {
    'Lapu-Lapu': 'Lapu Lapu',
    'Yi Sun-shin': 'Yi Sun shin',
    "Chang'e": 'Chang eh',
    Zhask: 'Zask',
    'X.Borg': 'Ex Borg',
    LuoYi: 'Luo Yi',
    YuZhong: 'Yu Zhong',
    Yin: 'Yeen',
    Baxia: 'Bak sia',
    Gatotkaca: 'Gatot Kaca',
    Kadita: 'Ka dee ta',
    Phoveus: 'Fo vee us',
    Aulus: 'Ow lus',
    Valentina: 'Valentina',
    Novaria: 'No var ia',
    Zhuxin: 'Zoo shin',
    Kalea: 'Ka lay ah',
    Guinevere: 'Gwin eh veer',
    Benedetta: 'Ben eh det ta',
    Beatrix: 'Bee atrix',
    Mathilda: 'Ma til da',
  }
  return map[name] ?? name.replace(/-/g, ' ').replace(/\./g, ' ')
}

export type HeroCalloutOptions = {
  /** If true, softly say "Banned" then the name */
  banned?: boolean
  rate?: number
  pitch?: number
  volume?: number
}

function speakOnce(
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: { rate: number; pitch: number; volume: number },
): Promise<void> {
  const synth = window.speechSynthesis
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = voice?.lang || 'en-US'
  if (voice) utter.voice = voice
  utter.rate = opts.rate
  utter.pitch = opts.pitch
  utter.volume = opts.volume

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    utter.onend = done
    utter.onerror = done
    try {
      synth.speak(utter)
    } catch {
      done()
    }
    // Safety if onend never fires
    window.setTimeout(done, Math.max(2500, text.length * 220))
  })
}

function pause(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/**
 * Slow, soft female callout — name only (ML style).
 * Enable Browser Source audio in OBS.
 */
export async function speakHeroCallout(
  heroName: string,
  options: HeroCalloutOptions = {},
): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return

  const spoken = pronounceHeroName(heroName.trim())
  if (!spoken) return

  const synth = window.speechSynthesis
  synth.cancel()
  await pause(80)

  const voice = await pickFemaleVoice()

  // Slow + natural pitch (avoid chipmunk / auctioneer feel)
  const rate = options.rate ?? 0.68
  const pitch = options.pitch ?? 1.02
  const volume = options.volume ?? 1
  const voiceOpts = { rate, pitch, volume }

  if (options.banned) {
    await speakOnce('Banned.', voice, { ...voiceOpts, rate: Math.min(rate, 0.64) })
    await pause(380)
  }

  // Slight trailing ellipsis helps some engines linger on the last syllable
  await speakOnce(`${spoken}.`, voice, voiceOpts)
}

export function stopHeroCallout() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/** Warm up voices early so the first pick isn't silent / robotic fallback. */
export function warmupHeroVoice() {
  void loadVoices().then((voices) => {
    if (!voices.length || !window.speechSynthesis) return
    // Prime the engine with a silent utterance so the first real callout is smoother
    const warm = new SpeechSynthesisUtterance(' ')
    warm.volume = 0
    warm.rate = 1
    try {
      window.speechSynthesis.speak(warm)
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  })
}
