/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Sin export estático.
   *
   * AXTHLETICS sigue siendo local-first: una sola ruta cliente, todo el estado
   * en IndexedDB. Pero la capa de lenguaje de AXIS necesita un endpoint propio
   * del mismo origen que guarde la credencial del proveedor, y ese endpoint es
   * un route handler de Next (`app/api/axis-ai/route.ts`), que un export
   * estático no admite. Vercel prerrenderiza la página igualmente: sigue
   * llegando al navegador como HTML estático.
   */

  // No hay imágenes remotas ni nada que optimizar en servidor: se sirven tal cual.
  images: {
    unoptimized: true,
  },

  /**
   * Cabeceras. Antes vivían en netlify.toml; ahora las pone Next.
   *
   * Los datos de entrenamiento y recuperación viven en IndexedDB, atados al
   * origen: estas cabeceras protegen ese origen. Los estáticos con hash
   * (`/_next/static/*`) los cachea Vercel como inmutables por su cuenta.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Nadie puede meter la app en un iframe: evita que un tercero superponga
          // controles sobre la interfaz real.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // No filtrar la URL completa al navegar fuera.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // La app no usa cámara, micrófono, ubicación ni pagos. Se deniegan.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
      {
        // El service worker no se cachea: si el navegador se quedara con una copia
        // vieja, las versiones nuevas de la app no llegarían nunca a quien la tenga
        // instalada. El manifest, igual.
        source: '/(sw.js|manifest.webmanifest)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // La respuesta del proxy de IA depende del día y de la pregunta.
        source: '/api/axis-ai',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
