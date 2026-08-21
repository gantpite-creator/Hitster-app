// A QR-hát gyűrűinek színei – ebből kapnak a csapatok azonosító színt
export const TEAM_COLORS = [
  '#e63946', '#2d7dd2', '#f77f00', '#7b5ea7',
  '#00aeef', '#43aa8b', '#ffd166', '#ff5d8f',
]

// Egy szín komplementere (HSL-forgatás 180 fokkal), fénycsíkhoz hangolva
export function complementOf(hex) {
  if (!hex) return '#ff9838'
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  h = (h + 0.5) % 1
  const s2 = Math.max(0.65, sat)
  const l2 = Math.min(0.7, Math.max(0.55, l)) // jól látható fényerő
  const c = (1 - Math.abs(2 * l2 - 1)) * s2
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l2 - c / 2
  let rgb
  const hh = h * 6
  if (hh < 1) rgb = [c, x, 0]
  else if (hh < 2) rgb = [x, c, 0]
  else if (hh < 3) rgb = [0, c, x]
  else if (hh < 4) rgb = [0, x, c]
  else if (hh < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return '#' + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}
