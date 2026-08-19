import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// A kártya-előlap stílusok egyszer töltődnek be, utána memóriából mennek
let cache = null
let inflight = null

export function loadCardStyles() {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = supabase
      .from('card_styles')
      .select()
      .then(({ data }) => {
        cache = Object.fromEntries((data ?? []).map((s) => [s.id, s]))
        return cache
      })
  }
  return inflight
}

export function useCardStyles() {
  const [styles, setStyles] = useState(cache)
  useEffect(() => {
    if (!styles) loadCardStyles().then(setStyles)
  }, [styles])
  return styles
}
