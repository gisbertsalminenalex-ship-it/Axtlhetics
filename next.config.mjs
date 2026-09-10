/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Export estático.
   *
   * AXTHLETICS es local-first: una sola ruta cliente, sin API routes, sin server
   * actions y sin datos de servidor. Todo el estado vive en IndexedDB, en el
   * dispositivo. No hay nada que renderizar en un servidor, así que `next build`
   * genera HTML/CSS/JS en `out/` y Netlify lo sirve como estáticos.
   *
   * Cuando exista el endpoint propio de IA para AXIS, ese backend NO vive aquí:
   * será un servicio aparte al que la app llame por HTTPS. Esta línea no lo
   * bloquea.
   */
  output: 'export',

  // Requisito del export estático: no hay servidor que optimice imágenes.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
