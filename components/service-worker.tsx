'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker que permite abrir la app sin conexión.
 *
 * No pinta nada. Solo en producción: en desarrollo, una caché por delante del
 * servidor confunde más de lo que ayuda.
 *
 * Si el registro falla no se hace nada: la app funciona igual, solo que necesita
 * conexión para arrancar.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    // Tras la carga, para no competir por ancho de banda con la propia app.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
