// Ideiglenes: az 1405 utáni zenék linkjeinek ellenőrzése (oEmbed: a videó valódi címe)
import { writeFileSync } from 'node:fs'
const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = { meta: {}, rows: [] }
const res = await fetch(`${base}/rest/v1/songs?select=card_number,artists,title,year,url,source_type&card_number=gte.1405&order=card_number`, { headers: H })
out.meta.http = res.status
const songs = res.ok ? await res.json() : []
const all = await fetch(`${base}/rest/v1/songs?select=card_number&order=card_number.desc&limit=1`, { headers: { ...H, Prefer: 'count=exact' } })
out.meta.total = all.headers.get('content-range')
out.meta.max = (await all.json())?.[0]?.card_number
const ytId = (u) => (u || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/)?.[1]
for (const s of songs) {
  let endpoint
  if ((s.url || '').includes('soundcloud.com')) endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(s.url)}`
  else {
    const id = ytId(s.url)
    if (!id) { out.rows.push({ ...s, status: 'bad-url' }); continue }
    endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`
  }
  let row = { ...s, status: 'error' }
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(10000) })
      if (r.ok) { const d = await r.json(); row = { ...s, status: 'ok', vtitle: d.title, vauthor: d.author_name }; break }
      if ([400, 401, 403, 404].includes(r.status)) { row = { ...s, status: 'http-' + r.status }; break }
    } catch {}
    await sleep(1500 * (a + 1))
  }
  out.rows.push(row)
  await sleep(150)
}
writeFileSync('link-check/new-result.json', JSON.stringify(out, null, 1))
console.log(out.meta, out.rows.length)
