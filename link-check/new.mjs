// Ideiglenes, 2. kör: hivatalos alternatívák keresése két laphoz
import { writeFileSync } from 'node:fs'
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' }
const get = async (u) => { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(10000) }); return { status: r.status, text: await r.text() } } catch { return { status: 0, text: '' } } }
const queries = {
  1437: ['FIFTY FIFTY Cupid Twin Ver official', 'FIFTY FIFTY Cupid official MV'],
  1440: ['The Irish Rovers Drunken Sailor', 'Irish Rovers What Shall We Do With The Drunken Sailor'],
}
const out = {}
for (const [card, qs] of Object.entries(queries)) {
  const ids = []
  for (const q of qs) {
    let r = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`)
    let found = [...r.text.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)].map((m) => m[1])
    if (!found.length) {
      r = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q + ' site:youtube.com')}`)
      found = [...r.text.matchAll(/youtube\.com%2Fwatch%3Fv%3D([\w-]{11})|youtube\.com\/watch\?v=([\w-]{11})/g)].map((m) => m[1] || m[2])
    }
    for (const id of found.slice(0, 6)) if (!ids.includes(id)) ids.push(id)
  }
  out[card] = []
  for (const id of ids.slice(0, 10)) {
    const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
    let d = {}
    try { d = JSON.parse(r.text) } catch {}
    out[card].push({ id, oembed: r.status, title: d.title, author: d.author_name })
  }
}
writeFileSync('link-check/new-result2.json', JSON.stringify(out, null, 1))
