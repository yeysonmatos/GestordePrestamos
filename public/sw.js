const CACHE = 'gestor-prestamos-lovable-v3'
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/offline.html',
  '/gp-icon.png',
  '/gp-icon-512.png',
  '/gp-icon-maskable.png',
  '/apple-touch-icon.png',
  '/favicon-48.png',
]

// URLs que NUNCA se cachean: datos autenticados y APIs.
// Cachearlas puede servir datos obsoletos o de otra sesion.
const NO_CACHE_PATTERNS = [
  /^https?:\/\/[^/]*supabase\.co\//,
  /^https?:\/\/[^/]*supabase\.io\//,
  /^\/api\//,
  /\/functions\//,
  /\/auth\/v1\//,
  /\/rest\/v1\//,
  /\/storage\/v1\//,
]

function shouldSkipCache(url) {
  return NO_CACHE_PATTERNS.some((re) => re.test(url))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    )
    return
  }

  if (event.request.method !== 'GET') return
  if (shouldSkipCache(event.request.url)) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || fetchPromise
    })
  )
})
