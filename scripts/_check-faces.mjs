import fs from 'node:fs'
const src = fs.readFileSync('src/data/heroes.ts', 'utf8')
const heroes = []
const re = /\{\s*id:\s*'([^']+)',\s*name:/g
let m
while ((m = re.exec(src))) heroes.push(m[1])
const miss = heroes.filter((id) => !fs.existsSync(`public/heroes/face/${id}.png`))
console.log('count', heroes.length, 'miss', miss.length)
console.log(miss.join(', ') || '(none)')
