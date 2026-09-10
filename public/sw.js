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

const CACHE_VERSION = 'axtlhetics-v1'
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
  if (new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
