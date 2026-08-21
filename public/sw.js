// Minimál service worker a telepíthetőséghez:
// - navigáció: hálózat-először (a frissítések azonnal élnek)
// - statikus fájlok: gyorsítótár-először (a hash-elt nevek miatt biztonságos)
const CACHE = 'slagersor-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request)
        if (hit) return hit
        const res = await fetch(e.request)
        c.put(e.request, res.clone())
        return res
      })
    )
  }
})
