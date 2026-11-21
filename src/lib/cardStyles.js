import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// A kártya-előlap stílusok egyszer töltődnek be, utána memóriából mennek.
// Ha valahol (pl. a Műhelyben) új színvilág születik, élőben frissül mindenkinél.
let cache = null
let inflight = null
const listeners = new Set()
let subscribed = false

const notify = () => listeners.forEach((fn) => fn(cache))

async function fetchAll() {
  const { data } = await supabase.from('card_styles').select()
  cache = Object.fromEntries((data ?? []).map((s) => [s.id, s]))
  notify()
  return cache
}

export function loadCardStyles() {
  if (cache) return Promise.resolve(cache)
  if (!inflight) inflight = fetchAll()
  return inflight
}

function subscribeOnce() {
  if (subscribed) return
  subscribed = true
  supabase
    .channel('card-styles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'card_styles' }, () => fetchAll())
    .subscribe()
}

// Mentés után azonnal beírjuk a helyi tárba (nem várunk az élő értesítésre)
export function putStyle(style) {
  cache = { ...(cache ?? {}), [style.id]: style }
  notify()
}
export function dropStyle(id) {
  if (!cache) return
  const { [id]: _, ...rest } = cache
  cache = rest
  notify()
}

export function useCardStyles() {
  const [styles, setStyles] = useState(cache)
  useEffect(() => {
    listeners.add(setStyles)
    subscribeOnce()
    if (!cache) loadCardStyles()
    else setStyles(cache)
    return () => listeners.delete(setStyles)
  }, [])
  return styles
}

/* ---------- színvilág-leírás (spec) <-> CSS háttér ---------- */

export const DIRECTIONS = [
  { angle: 315, arrow: '↖', label: 'jobb lentről bal fel' },
  { angle: 0, arrow: '↑', label: 'lentről fel' },
  { angle: 45, arrow: '↗', label: 'bal lentről jobb fel' },
  { angle: 270, arrow: '←', label: 'jobbról balra' },
  null, // közép: a szög-csúszka helye
  { angle: 90, arrow: '→', label: 'balról jobbra' },
  { angle: 225, arrow: '↙', label: 'jobb fentről bal le' },
  { angle: 180, arrow: '↓', label: 'fentről le' },
  { angle: 135, arrow: '↘', label: 'bal fentről jobb le' },
]

export const RADIAL_ORIGINS = [
  { at: 'center', label: 'Középről' },
  { at: 'top left', label: 'Bal felső sarokból' },
  { at: 'top right', label: 'Jobb felső sarokból' },
  { at: 'bottom left', label: 'Bal alsó sarokból' },
  { at: 'bottom right', label: 'Jobb alsó sarokból' },
]

const hex = (c) => (c || '#000000').toLowerCase()

export function specToBg(spec) {
  const stops = [...spec.stops].sort((a, b) => a.pos - b.pos)
  if (spec.type === 'solid') return hex(stops[0].color)
  const list = stops.map((s) => `${hex(s.color)} ${Math.round(s.pos)}%`).join(', ')
  if (spec.type === 'radial') return `radial-gradient(circle at ${spec.at || 'center'}, ${list})`
  return `linear-gradient(${Math.round(spec.angle)}deg, ${list})`
}

// Egy gyári (vagy régebbi) CSS háttérből szerkeszthető leírás
export function bgToSpec(bg, text) {
  const base = { type: 'linear', angle: 135, at: 'center', text: hex(text) }
  const m = (bg || '').match(/^(linear|radial)-gradient\((.*)\)$/)
  if (!m) return { ...base, type: 'solid', stops: [{ color: hex(bg), pos: 0 }, { color: '#ffffff', pos: 100 }] }
  const parts = m[2].split(',').map((p) => p.trim())
  let angle = 180, at = 'center'
  if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift())
  else if (/^circle/.test(parts[0])) at = parts.shift().replace(/^circle\s+at\s+/, '')
  const raw = parts.map((p) => {
    const [color, pos] = p.split(/\s+/)
    return { color: hex(color), pos: pos ? parseFloat(pos) : null }
  })
  const stops = raw.map((s, i) => ({ ...s, pos: s.pos ?? (raw.length === 1 ? 0 : (i / (raw.length - 1)) * 100) }))
  return { ...base, type: m[1], angle, at, stops }
}

// Melyik szövegszín olvasható jobban: fekete vagy fehér?
export function autoTextColor(spec) {
  const lum = (c) => {
    const n = hex(c).slice(1)
    const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const stops = spec.type === 'solid' ? [spec.stops[0]] : spec.stops
  const avg = stops.reduce((s, x) => s + lum(x.color), 0) / stops.length
  return avg > 0.179 ? '#000000' : '#ffffff' // a két kontraszt itt egyenlő
}
