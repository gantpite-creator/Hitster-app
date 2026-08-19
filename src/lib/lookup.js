import { supabase } from './supabase.js'

// YouTube videó-azonosító kinyerése bármilyen formátumú linkből
export function youtubeId(url) {
  const m = (url || '').match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/
  )
  return m ? m[1] : null
}

// Beolvasott QR-tartalom -> zene az adatbázisból
export async function findSongByScan(text) {
  const t = (text || '').trim()
  if (!t) return null

  // 1) pontos egyezés (a QR-ben lévő link betűre ugyanaz, mint a DB-ben)
  const { data: exact } = await supabase.from('songs').select().eq('url', t).maybeSingle()
  if (exact) return exact

  // 2) YouTube: videó-azonosító alapján (paraméterektől függetlenül)
  const id = youtubeId(t)
  if (id) {
    const { data: rows } = await supabase.from('songs').select().like('url', `%${id}%`)
    if (rows?.length) return rows[0]
  }

  // 3) SoundCloud: útvonal alapján
  if (t.includes('soundcloud.com')) {
    const path = t.split('?')[0].replace(/^https?:\/\//, '')
    const { data: rows } = await supabase.from('songs').select().like('url', `%${path}%`)
    if (rows?.length) return rows[0]
  }
  return null
}
