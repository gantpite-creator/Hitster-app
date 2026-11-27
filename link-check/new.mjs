// Ideiglenes, 3. kör: Macarena (#1450) linkjeinek vizsgálata
import { writeFileSync } from 'node:fs'
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' }
const get = async (u) => { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(10000) }); return { status: r.status, text: await r.text() } } catch { return { status: 0, text: '' } } }
const oembed = async (id) => {
  const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
  let d = {}; try { d = JSON.parse(r.text) } catch {}
  return { id, oembed: r.status, title: d.title, author: d.author_name }
}
const details = async (id) => {
  const r = await get(`https://www.youtube.com/watch?v=${id}&hl=en`)
  const pick = (re) => (r.text.match(re) || [])[1]
  return {
    page: r.status,
    lengthSeconds: pick(/"lengthSeconds":"(\d+)"/),
    publishDate: pick(/"publishDate":"([^"]+)"/),
    description: (pick(/"shortDescription":"((?:[^"\\]|\\.)*)"/) || '').slice(0, 600),
    musicInfo: [...r.text.matchAll(/"title":\{"simpleText":"(Song|Artist|Album|Licenses)"\},"subtitle":\{"simpleText":"([^"]+)"/g)].map((m) => m[1] + ': ' + m[2]),
  }
}
const out = { checked: [], search: [] }
for (const id of ['2zvd1JQ0EKY', 'zWaymcVmJ-A']) out.checked.push({ ...(await oembed(id)), ...(await details(id)) })
const ids = []
for (const q of ['Los del Rio Macarena original version 1993', 'Los Del Rio Macarena 1993 original spanish']) {
  const r = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`)
  for (const m of r.text.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)) if (!ids.includes(m[1])) ids.push(m[1])
}
for (const id of ids.slice(0, 10)) out.search.push(await oembed(id))
writeFileSync('link-check/new-result3.json', JSON.stringify(out, null, 1))
