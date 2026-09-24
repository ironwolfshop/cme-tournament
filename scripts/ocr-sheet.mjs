import Tesseract from 'tesseract.js'
import { writeFileSync } from 'node:fs'

const img =
  'C:/Users/ahila/.cursor/projects/c-Users-ahila-Downloads-WEBPAGE-OBS/assets/c__Users_ahila_AppData_Roaming_Cursor_User_workspaceStorage_9ebedc4aed16912134523bf70ea59695_images_image-6b5d34c5-1fa5-4a4c-9114-db5fbb226a09.png'

const { data } = await Tesseract.recognize(img, 'eng')
writeFileSync('scripts/_sheet-ocr.txt', data.text, 'utf8')
console.log(data.text)
