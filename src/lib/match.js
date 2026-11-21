// Méltányos tipp-összevetés – ugyanaz a szabály minden csapatnak.
//
// Amit NEM számítunk eltérésnek:
//   - kis- és nagybetű                  "P.I.M.P."  = "pimp"
//   - ékezet                            "Szívtipró" = "szivtipro"
//   - szóköz, írásjel, aposztróf, pont  "Don't Stop" = "dont stop" = "dontstop"
//   - "&", "+", "and", "és" egymás közt "Salt & Pepper" = "salt and pepper"
//   - zárójeles/ft. kiegészítés         "Not Tonight (Ladies Night remix)" = "Not Tonight"
//   - kezdő "The"                       "The Weeknd" = "Weeknd"
//   - P!nk, Ke$ha stb.                  "P!nk" = "pink"
// Elgépelés-tűrés a helyes válasz hosszától függ (írásjelek nélkül számolva):
//   1–4 karakter: pontos egyezés kell · 5–8: 1 hiba · 9–14: 2 hiba · 15+: 3 hiba
// Előadónál elég egyetlen közreműködőt eltalálni.

export const strip = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Összehasonlítható "tömör" alak: csak betű és szám marad
export function compact(s) {
  return strip(s)
    .replace(/(?<=[a-z])!(?=[a-z])/g, 'i') // P!nk -> pink
    .replace(/(?<=[a-z])\$(?=[a-z])/g, 's') // Ke$ha -> kesha
    .replace(/[&+]/g, ' and ')
    .replace(/\bes\b/g, ' and ') // "és" (ékezet nélkül "es") = "and"
    .replace(/[^a-z0-9]+/g, '')
}

const dropThe = (s) => s.replace(/^\s*the\s+/i, '')

// Egy cím elfogadható alakjai: teljes, zárójel nélkül, " - " előtti rész, ft. nélkül
export function titleVariants(title) {
  const t = (title || '').trim()
  const out = new Set([
    t,
    t.replace(/\s*[([][^)\]]*[)\]]/g, ''),
    t.split(/\s+[-–]\s+/)[0],
    t.replace(/\s*\b(feat\.?|ft\.?|featuring)\s.*$/i, ''),
  ])
  for (const v of [...out]) out.add(dropThe(v))
  return [...out].map(compact).filter(Boolean)
}

// Előadólista szétbontása: vessző, &, +, x, feat/ft, vs, és, and
export function artistVariants(artists) {
  const a = (artists || '').trim()
  const parts = a
    .split(/,|&|\+|\s(?:x|feat\.?|ft\.?|featuring|vs\.?|és|and)\s/i)
    .map((p) => p.trim())
  const out = new Set([a, ...parts])
  for (const v of [...out]) out.add(dropThe(v))
  return [...out].map(compact).filter((v) => v.length >= 2)
}

function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[n]
}

export function typoTolerance(len) {
  if (len <= 4) return 0
  if (len <= 8) return 1
  if (len <= 14) return 2
  return 3
}

function anyClose(guesses, answers) {
  return answers.some((ans) =>
    guesses.some((g) => levenshtein(g, ans) <= typoTolerance(ans.length))
  )
}

export function titleMatches(guess, title) {
  if (!compact(guess)) return false
  return anyClose(titleVariants(guess), titleVariants(title))
}

export function artistMatches(guess, artists) {
  if (!compact(guess)) return false
  const g = [compact(guess), compact(dropThe(guess))].filter(Boolean)
  return anyClose(g, artistVariants(artists))
}
