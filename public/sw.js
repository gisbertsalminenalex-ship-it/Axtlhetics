/**
 * Service worker de AXTHLETICS.
 *
 * AXTHLETICS es local-first: los datos ya viven en IndexedDB, en el dispositivo.
 * Lo único que falta para funcionar sin conexión son los archivos de la propia
 * app, y de eso se encarga esto.
 *
 * Dos estrategias, según lo que se pida:
 *
 * - Navegación (el HTML): primero la red, y si no hay, lo guardado. Así una
 *   versión nueva llega en cuanto hay cobertura, en vez de quedarse anclado a la
 *   copia vieja.
 * - Estáticos de Next (`/_next/static/…`): primero lo guardado. Llevan hash en el
 *   nombre, así que un archivo con ese nombre nunca cambia de contenido.
 *
 * No hay precarga de una lista de archivos: los nombres llevan hash y cambian en
 * cada build. Se guarda lo que se va usando, que además evita descargar de golpe
 * cosas que quizá no hagan falta.
 *
 * Al subir CACHE_VERSION se borran las cachés anteriores.
 */

// v4 (D-029): los iconos tienen siempre el mismo nombre y aquí se sirven de caché; v3 trajo un logo que se retiró, así que v4 obliga a recargar los de D-029.
const CACHE_VERSION = 'axtlhetics-v4'
const OFFLINE_URL = '/'

self.addEventListener('install', (event) => {
  // Solo el documento raíz, que es la única ruta de la app.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

/** Guarda una respuesta buena. Las opacas y los errores no se guardan. */
async function store(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response
  const cache = await caches.open(CACHE_VERSION)
  await cache.put(request, response.clone())
  return response
}

/** HTML: red primero, y lo guardado como red de seguridad. */
async function networkFirst(request) {
  try {
    return await store(request, await fetch(request))
  } catch {
    const cached = await caches.match(request)
    return cached ?? (await caches.match(OFFLINE_URL)) ?? Response.error()
  }
}

/** Estáticos con hash: lo guardado primero, porque nunca cambian. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    return await store(request, await fetch(request))
  } catch {
    return Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Solo lecturas del propio origen. Nada de POST ni de terceros.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Las rutas de servidor nunca se guardan: su respuesta es de ese momento.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    // La vuelta de Google (D-076) trae un código de un solo uso: se pide a la red y no se guarda.
    event.respondWith(url.searchParams.has('code') ? fetch(request) : networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

// ---------------------------------------------------------------------------
// Avisos de entreno (D-044)
// ---------------------------------------------------------------------------

/**
 * El aviso llega sin contenido: el servidor solo dice «hoy toca». El texto se
 * compone aquí, con el nombre que ya está guardado en el móvil, para que nada
 * del usuario tenga que viajar.
 */
function profileName() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('axtlhetics')
      open.onerror = () => resolve(null)
      open.onsuccess = () => {
        const db = open.result
        try {
          const get = db.transaction('profile').objectStore('profile').get('primary')
          get.onsuccess = () => {
            db.close()
            const name = get.result && typeof get.result.name === 'string' ? get.result.name.trim() : ''
            resolve(name || null)
          }
          get.onerror = () => {
            db.close()
            resolve(null)
          }
        } catch {
          db.close()
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    profileName().then((name) =>
      self.registration.showNotification('AXTHLETICS', {
        body: `${name ? `${name}, hoy` : 'Hoy'} es día de entreno. Mira lo que te ha preparado AXIS.`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'entreno-del-dia',
        data: { url: '/' },
      }),
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) return open.focus()
      return self.clients.openWindow('/')
    }),
  )
})
