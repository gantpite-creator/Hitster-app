import { useLayoutEffect, useRef } from 'react'

// Szöveg, ami mindig teljesen kifér a helyére: ha túl hosszú, a betűméret
// addig csökken, amíg el nem fér (mint a Wordben a "szöveg zsugorítása").
// A dobozt a CSS korlátozza (max-height), a betűméret alapértéke is a CSS-ből jön.
export default function FitText({ text, className, minScale = 0.4 }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const base = parseFloat(getComputedStyle(el).fontSize)
      if (!base) return
      const min = base * minScale
      let size = base
      const overflows = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
      // gyors közelítés felezéssel, aztán finomítás
      let lo = min, hi = base
      if (!overflows()) return
      for (let i = 0; i < 8; i++) {
        size = (lo + hi) / 2
        el.style.fontSize = size + 'px'
        if (overflows()) hi = size
        else lo = size
      }
      el.style.fontSize = lo + 'px'
    }
    fit()
    // a webfont betöltése után újramérünk (más szélességű a betű)
    let live = true
    document.fonts?.ready?.then(() => live && fit())
    return () => { live = false }
  }, [text])

  return <div ref={ref} className={className}>{text}</div>
}
