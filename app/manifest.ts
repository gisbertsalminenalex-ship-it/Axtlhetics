import type { MetadataRoute } from 'next'

/**
 * El manifiesto es un route handler, y con `output: 'export'` hay que declararlo
 * estático: no depende de la petición, se genera una vez en el build.
 */
export const dynamic = 'force-static'

/**
 * Manifiesto de instalación.
 *
 * Es lo que permite añadir AXTHLETICS a la pantalla de inicio y que se abra sin
 * barra de navegador. No añade funcionalidad: la app es la misma, solo cambia
 * cómo se abre.
 *
 * `display: 'standalone'` y `orientation: 'portrait'` porque toda la interfaz
 * está compuesta para una pantalla de móvil en vertical.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AXTHLETICS',
    short_name: 'AXTHLETICS',
    description: 'Entrenamiento, recuperación e historial guiados por AXIS.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // El lienzo de la app, para que la pantalla de arranque no dé un fogonazo.
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['health', 'fitness', 'lifestyle'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android recorta el icono a la forma del sistema: este lleva más margen.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
