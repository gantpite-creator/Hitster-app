// Ékezet- és kisbetű-független, elgépelés-toleráns összehasonlítás a tippekhez

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // ékezetek le
    .replace(/[^a-z0-9]+/g, ' ')     // írásjelek ki
    .trim()

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

function close(a, b) {
  if (!a || !b) return false
  const tol = Math.max(1, Math.floor(Math.max(a.length, b.length) / 5))
  return levenshtein(a, b) <= tol
}

export function titleMatches(guess, title) {
  const g = normalize(guess)
  if (!g) return false
  return close(g, normalize(title))
}

// Elég EGY előadót eltalálni a (vesszővel elválasztott) listából
export function artistMatches(guess, artists) {
  const g = normalize(guess)
  if (!g) return false
  const list = (artists || '').split(',').map(normalize).filter(Boolean)
  return list.some((a) => close(g, a)) || close(g, normalize(artists))
}
