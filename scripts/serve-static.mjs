/**
 * Sirve el export estático de `out/`.
 *
 * AXTHLETICS se compila con `output: 'export'`, así que `next start` no aplica:
 * no hay servidor de Next que arrancar, solo archivos. Esto los sirve igual que
 * lo hará Netlify, y escucha en toda la red para poder abrir la app desde el
 * móvil.
 *
 *   node scripts/serve-static.mjs [carpeta] [puerto]
 *
 * Sin dependencias: solo módulos de Node.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const ROOT = resolve(process.argv[2] ?? 'out')
const PORT = Number(process.argv[3] ?? 4000)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** La IP de esta máquina en la red local, para abrir la app desde el móvil. */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])

  // Un directorio se resuelve a su index.html; una ruta sin extensión, al .html
  // que generó el export.
  const candidates = [join(ROOT, path), join(ROOT, path, 'index.html'), join(ROOT, path + '.html')]

  for (const file of candidates) {
    // Nada fuera de ROOT: resolve() ya ha aplanado cualquier "..".
    if (file !== ROOT && !file.startsWith(ROOT + sep)) continue

    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
      return
    } catch {
      // No existe: se prueba el siguiente candidato.
    }
  }

  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
  res.end(await readFile(join(ROOT, '404.html')).catch(() => 'No encontrado'))
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está ocupado. Prueba con otro:`)
    console.error(`  node scripts/serve-static.mjs out ${PORT + 1}`)
    process.exit(1)
  }
  throw error
})

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress()
  console.log(`\n  AXTHLETICS servido desde ${ROOT}\n`)
  console.log(`  En este ordenador:  http://localhost:${PORT}`)
  if (lan) console.log(`  En el móvil:        http://${lan}:${PORT}   (misma Wi-Fi)`)
  console.log('\n  Ctrl+C para parar.\n')
})
