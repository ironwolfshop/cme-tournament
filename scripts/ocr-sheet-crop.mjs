import sharp from 'sharp'
import Tesseract from 'tesseract.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const src =
  'C:/Users/ahila/.cursor/projects/c-Users-ahila-Downloads-WEBPAGE-OBS/assets/c__Users_ahila_AppData_Roaming_Cursor_User_workspaceStorage_9ebedc4aed16912134523bf70ea59695_images_image-6b5d34c5-1fa5-4a4c-9114-db5fbb226a09.png'

mkdirSync('scripts/_ocr', { recursive: true })

const meta = await sharp(src).metadata()
const w = meta.width ?? 0
const h = meta.height ?? 0
console.log('size', w, h)

// Right ~38% should be photo + logo URL columns
const left = Math.floor(w * 0.58)
const cropW = w - left
await sharp(src)
  .extract({ left, top: 0, width: cropW, height: h })
  .resize({ width: cropW * 4, kernel: 'lanczos3' })
  .greyscale()
  .normalize()
  .sharpen()
  .png()
  .toFile('scripts/_ocr/urls.png')

// Left side for names/teams/roles
await sharp(src)
  .extract({ left: 0, top: 0, width: Math.floor(w * 0.62), height: h })
  .resize({ width: Math.floor(w * 0.62) * 3, kernel: 'lanczos3' })
  .greyscale()
  .normalize()
  .png()
  .toFile('scripts/_ocr/left.png')

for (const file of ['urls', 'left']) {
  const { data } = await Tesseract.recognize(`scripts/_ocr/${file}.png`, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') process.stdout.write(`\r${file} ${Math.round((m.progress || 0) * 100)}%`)
    },
  })
  console.log('\n====', file, '====')
  console.log(data.text)
  writeFileSync(`scripts/_ocr/${file}.txt`, data.text, 'utf8')
}
