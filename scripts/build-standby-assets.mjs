// Builds the standby scene assets in public/standby/ from pre-cut PNGs.
// Heroes: official MLBB splash art (github.com/Sparkies01/Splash), background removed.
// Ships / sea / sky: public-domain & CC0 photos from Wikimedia Commons (see public/standby/CREDITS.txt).
// Usage: node scripts/build-standby-assets.mjs <heroCutDir> <maritimeDir>
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const [heroDir, seaDir] = process.argv.slice(2)
if (!heroDir || !seaDir) {
  console.error('Usage: node scripts/build-standby-assets.mjs <heroCutDir> <maritimeDir>')
  process.exit(1)
}

const OUT = 'public/standby'
fs.mkdirSync(OUT, { recursive: true })

async function cutout(src, out, { height, flip = false }) {
  let img = sharp(await sharp(src).trim({ threshold: 10 }).png().toBuffer())
  if (flip) img = img.flop()
  await img.resize({ height, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 95 }).toFile(out)
  const m = await sharp(out).metadata()
  console.log('wrote', out, m.width, m.height)
}

/** Photo band + its mirror side by side, so a 50% translate loops seamlessly. */
async function mirroredTile(src, out, { top, height, width = 1920, outHeight }) {
  const scaled = await sharp(src).resize({ width }).toBuffer()
  const cropped = await sharp(scaled).extract({ left: 0, top, width, height }).toBuffer()
  const band = await sharp(cropped).resize(width, outHeight ?? height, { fit: 'fill' }).toBuffer()
  const mirror = await sharp(band).flop().toBuffer()
  const h = outHeight ?? height
  await sharp({ create: { width: width * 2, height: h, channels: 3, background: '#000' } })
    .composite([
      { input: band, left: 0, top: 0 },
      { input: mirror, left: width, top: 0 },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(out)
  console.log('wrote', out, width * 2, h)
}

const h = (n) => path.join(heroDir, `${n}.cut.png`)
const s = (n) => path.join(seaDir, n)

await cutout(h('kad-ocean'), `${OUT}/hero-kadita.webp`, { height: 1000, flip: true })
await cutout(h('yss-fleet'), `${OUT}/hero-yi-sun-shin.webp`, { height: 1000, flip: true })
await cutout(h('bane-seas'), `${OUT}/hero-bane.webp`, { height: 1000 })
await cutout(h('claude-pirate'), `${OUT}/hero-claude.webp`, { height: 1000 })
await cutout(h('kimmy-seas'), `${OUT}/hero-kimmy.webp`, { height: 900 })
await cutout(h('ruby-pirate'), `${OUT}/hero-ruby.webp`, { height: 900 })
await cutout(h('natan-tidal'), `${OUT}/hero-natan.webp`, { height: 900, flip: true })
await cutout(h('yz-sealord'), `${OUT}/hero-yuzhong.webp`, { height: 900 })

await mirroredTile(s('eagle-sail.jpg'), `${OUT}/sea-tile.jpg`, { top: 1010, height: 264, outHeight: 260 })
await mirroredTile(s('ddg-howard.jpg'), `${OUT}/sky-tile.jpg`, { top: 0, height: 540, outHeight: 760 })
