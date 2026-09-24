import fs from 'node:fs'

const htmlPath = 'C:/Users/ahila/Downloads/CME-Tournament-Manager.html'
const outPath = 'src/styles/tournament-manager.css'

const html = fs.readFileSync(htmlPath, 'utf8')
const match = html.match(/<style>([\s\S]*?)<\/style>/)
if (!match) {
  console.error('No <style> block found')
  process.exit(1)
}

let css = match[1]

/** Prefix a selector list with .cme-tm (skip @ rules handled separately). */
function scopeSelectors(selectorChunk) {
  return selectorChunk
    .split(',')
    .map((raw) => {
      let s = raw.trim()
      if (!s) return s
      if (s === ':root' || s === 'body' || s === 'html') return '.cme-tm'
      if (s.startsWith(':root')) s = s.replace(/^:root/, '.cme-tm')
      if (s.startsWith('body')) s = s.replace(/^body/, '.cme-tm')
      if (s.startsWith('.presenting')) return `.cme-tm${s}`
      if (s.startsWith('.cme-tm')) return s
      // descendant / compound
      if (s.startsWith('*')) return `.cme-tm ${s}`
      return `.cme-tm ${s}`
    })
    .join(', ')
}

function scopeCss(input) {
  let i = 0
  let out = ''
  while (i < input.length) {
    if (input.startsWith('@keyframes', i) || input.startsWith('@media', i) || input.startsWith('@supports', i)) {
      const start = i
      const brace = input.indexOf('{', i)
      const header = input.slice(start, brace + 1)
      i = brace + 1
      let depth = 1
      let body = ''
      while (i < input.length && depth > 0) {
        const ch = input[i]
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) break
        }
        if (depth > 0) body += ch
        i++
      }
      i++ // closing }
      if (header.startsWith('@keyframes')) {
        out += header + body + '}'
      } else {
        out += header + scopeCss(body) + '}'
      }
      continue
    }

    // skip whitespace / comments lightly
    if (/\s/.test(input[i])) {
      out += input[i]
      i++
      continue
    }

    const brace = input.indexOf('{', i)
    if (brace === -1) {
      out += input.slice(i)
      break
    }
    const selectors = input.slice(i, brace)
    i = brace + 1
    let depth = 1
    let body = ''
    while (i < input.length && depth > 0) {
      const ch = input[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
      if (depth > 0) body += ch
      i++
    }
    i++
    out += scopeSelectors(selectors) + '{' + body + '}'
  }
  return out
}

// Special cases from prior file:
// .busy [data-action] was .cme-tm.busy
css = css.replace(/\.busy \[data-action\]/g, '.cme-tm.busy [data-action]')
css = css.replace(/\.busy button\[type=submit\]/g, '.cme-tm.busy button[type=submit]')
css = css.replace(/\.presenting /g, '.cme-tm.presenting ')
css = css.replace(/\.presenting\./g, '.cme-tm.presenting.')

const scoped = scopeCss(css)
const header = '/* Generated from CME-Tournament-Manager.html. Scoped to .cme-tm */\n'
const footer = `\n\n@keyframes spin{to{transform:rotate(360deg)}}\n`

fs.writeFileSync(outPath, header + scoped + footer)
console.log('Wrote', outPath, 'bytes', header.length + scoped.length + footer.length)
