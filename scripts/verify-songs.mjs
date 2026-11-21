// Linkellenőrző: minden zenénél megnézi, hogy a link tényleg arra a számra
// visz-e, ami a kártyán szerepel.  Futtatás:  npm run verify
//
// Hogyan dönt? A YouTube/SoundCloud nyilvános oEmbed-végpontjától lekéri a
// videó valódi címét és csatornáját (API-kulcs nem kell), majd ugyanazzal a
// méltányos összevetéssel, amit a játék is használ, megnézi, hogy a kártyán
// lévő cím és előadó szerepel-e benne. Az eredmény: verify-report.html

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { titleVariants, artistVariants, compact, strip } from '../src/lib/match.js'

// ---------- osztályozás (a teszt is ezt hívja) ----------
const words = (s) => strip(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2)

export function classify(song, oe) {
  const hayRaw = `${oe.title} ${oe.author_name ?? ''}`
  const hay = compact(hayRaw.replace(/vevo|\s-\s*topic/gi, ' '))
  const hayWords = new Set(words(hayRaw))

  const titleHit = titleVariants(song.title).some((v) => {
    if (v.length >= 3 && hay.includes(v)) return true
    return false
  })
  // hosszabb címeknél szavak szerinti egyezés is elég (pl. más írásmód)
  const tw = words(song.title.replace(/\s*[([][^)\]]*[)\]]/g, ''))
  const wordHit = tw.length >= 2 && tw.filter((w) => hayWords.has(w)).length / tw.length >= 0.75
  const artistHit = artistVariants(song.artists).some((v) => v.length >= 3 && hay.includes(v))

  if (titleHit || wordHit) return { level: 'ok', note: artistHit ? '' : 'a cím stimmel, az előadó nem látszik a videón' }
  if (artistHit) return { level: 'gyanus', note: 'ugyanaz az előadó, de más szám címe – valószínű csere!' }
  return { level: 'hibas', note: 'se a cím, se az előadó nem szerepel a videón' }
}

// ---------- segédek ----------
function loadEnv() {
  const env = { ...process.env }
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return env
}

const ytId = (url) =>
  (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)?.[1]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function oembed(song) {
  let endpoint
  if (song.source_type === 'soundcloud' || (song.url || '').includes('soundcloud.com')) {
    endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(song.url)}`
  } else {
    const id = ytId(song.url)
    if (!id) return { status: 'rossz-link' }
    endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    let res
    try {
      res = await fetch(endpoint)
    } catch {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.ok) return { status: 'ok', data: await res.json() }
    if (res.status === 401 || res.status === 403) return { status: 'nem-beagyazhato' }
    if (res.status === 404 || res.status === 400) return { status: 'nem-elerheto' }
    await sleep(1500 * (attempt + 1)) // 429/5xx: türelem, aztán újra
  }
  return { status: 'halozati-hiba' }
}

async function fetchSongs(env) {
  const base = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) {
    throw new Error('Hiányzik a .env (VITE_SUPABASE_URL és VITE_SUPABASE_ANON_KEY). Lásd .env.example')
  }
  const all = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${base}/rest/v1/songs?select=card_number,artists,title,year,url,source_type&order=card_number&limit=1000&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    if (!res.ok) {
      throw new Error(
        `A Supabase nem válaszolt (${res.status}). Ha a projekt szüneteltetve van, a dashboardon nyomd meg a Restore-t.`
      )
    }
    const page = await res.json()
    all.push(...page)
    if (page.length < 1000) break
  }
  return all
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const LEVELS = {
  'nem-elerheto': { order: 0, label: 'Nem elérhető', color: '#e63946', hint: 'törölt vagy privát videó – nem fog szólni' },
  'nem-beagyazhato': { order: 1, label: 'Nem játszható az appban', color: '#e63946', hint: 'a feltöltő letiltotta a beágyazást' },
  'rossz-link': { order: 2, label: 'Rossz link', color: '#e63946', hint: 'nem ismerhető fel YouTube-azonosító' },
  hibas: { order: 3, label: 'Valószínűleg rossz szám', color: '#f77f00', hint: '' },
  duplikalt: { order: 4, label: 'Duplikált videó', color: '#f77f00', hint: '' },
  gyanus: { order: 5, label: 'Gyanús', color: '#ffd166', hint: '' },
  'halozati-hiba': { order: 6, label: 'Nem sikerült ellenőrizni', color: '#9b9ba4', hint: 'futtasd újra később' },
  ok: { order: 9, label: 'Rendben', color: '#43aa8b', hint: '' },
}

function writeReport(rows, total) {
  const problems = rows.filter((r) => r.level !== 'ok').sort((a, b) => LEVELS[a.level].order - LEVELS[b.level].order || a.card - b.card)
  const counts = {}
  rows.forEach((r) => (counts[r.level] = (counts[r.level] ?? 0) + 1))
  const tr = problems
    .map(
      (r) => `<tr>
  <td class="n">#${r.card}</td>
  <td><span class="lvl" style="--c:${LEVELS[r.level].color}">${LEVELS[r.level].label}</span><div class="note">${esc(r.note || LEVELS[r.level].hint)}</div></td>
  <td><b>${esc(r.artists)}</b> – ${esc(r.title)} <span class="dim">(${r.year})</span></td>
  <td>${r.videoTitle ? esc(r.videoTitle) + `<div class="note">${esc(r.channel)}</div>` : '<span class="dim">—</span>'}</td>
  <td><a href="${esc(r.url)}" target="_blank" rel="noopener">megnyit ↗</a></td>
</tr>`
    )
    .join('\n')
  const summary = Object.entries(counts)
    .sort((a, b) => LEVELS[a[0]].order - LEVELS[b[0]].order)
    .map(([k, v]) => `<span class="lvl" style="--c:${LEVELS[k].color}">${LEVELS[k].label}: ${v}</span>`)
    .join(' ')
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linkellenőrzés</title>
<style>
:root{--bg:#0e0e10;--surface:#1a1a1e;--line:#2c2c32;--ink:#f4f4f2;--dim:#9b9ba4}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif;padding:24px 16px}
main{max-width:1100px;margin:0 auto}
h1{margin:0 0 4px;font-size:1.5rem}
.dim,.note{color:var(--dim)} .note{font-size:.82rem;margin-top:2px}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 22px}
.lvl{display:inline-block;border:1px solid var(--c);color:var(--c);border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:700;white-space:nowrap}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;min-width:760px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--surface);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
td.n{font-weight:700;white-space:nowrap}
a{color:#00aeef}
</style></head><body><main>
<h1>Linkellenőrzés</h1>
<p class="dim">${total} zene ellenőrizve · ${new Date().toLocaleString('hu-HU')} · Javítás: Műhely → keresés a sorszámra → új link → Mentés</p>
<div class="summary">${summary}</div>
${problems.length ? `<div class="wrap"><table><thead><tr><th>Lap</th><th>Állapot</th><th>Az adatbázisban</th><th>Amit a link valójában lejátszik</th><th></th></tr></thead><tbody>${tr}</tbody></table></div>` : '<p>Minden link rendben van. 🎉</p>'}
</main></body></html>`
  writeFileSync('verify-report.html', html)

  const csv = ['sorszam;allapot;eloadok;cim;ev;video_cim;csatorna;link']
  for (const r of problems) {
    csv.push([r.card, LEVELS[r.level].label, r.artists, r.title, r.year, r.videoTitle ?? '', r.channel ?? '', r.url]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  }
  writeFileSync('verify-report.csv', '﻿' + csv.join('\n'))
}

// ---------- fő folyamat ----------
export async function main() {
  const env = loadEnv()
  console.log('Zenék letöltése az adatbázisból…')
  const songs = await fetchSongs(env)
  console.log(`${songs.length} zene. Linkek ellenőrzése (kb. 1–3 perc)…`)

  const rows = new Array(songs.length)
  let next = 0, done = 0
  const worker = async () => {
    while (next < songs.length) {
      const i = next++
      const s = songs[i]
      const r = await oembed(s)
      const row = { card: s.card_number, artists: s.artists, title: s.title, year: s.year, url: s.url }
      if (r.status === 'ok') {
        row.videoTitle = r.data.title
        row.channel = r.data.author_name
        Object.assign(row, classify(s, r.data))
      } else {
        row.level = r.status
      }
      rows[i] = row
      done++
      if (done % 50 === 0 || done === songs.length) {
        process.stdout.write(`\r  ${done}/${songs.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log('')

  // ugyanaz a videó több kártyán?
  const byVideo = new Map()
  for (const r of rows) {
    const k = ytId(r.url) ?? r.url
    if (!byVideo.has(k)) byVideo.set(k, [])
    byVideo.get(k).push(r)
  }
  for (const group of byVideo.values()) {
    if (group.length < 2) continue
    for (const r of group) {
      if (r.level === 'ok' || r.level === 'gyanus') {
        r.level = 'duplikalt'
        r.note = `ugyanez a videó a(z) ${group.filter((x) => x !== r).map((x) => '#' + x.card).join(', ')} lapon is`
      }
    }
  }

  writeReport(rows, songs.length)
  const bad = rows.filter((r) => r.level !== 'ok').length
  console.log(`Kész. ${songs.length - bad} rendben, ${bad} átnézendő.`)
  console.log('Nyisd meg a jelentést: verify-report.html  (Excelhez: verify-report.csv)')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error('\nHiba:', e.message)
    process.exit(1)
  })
}
