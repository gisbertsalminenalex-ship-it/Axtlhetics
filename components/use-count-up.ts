'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Recorre un número hasta su valor final.
 *
 * Es **solo presentación**: el valor real ya está calculado en el dominio y no se
 * toca. Esto únicamente decide qué número se enseña mientras la métrica llega a su
 * sitio, y sirve a la vez para el número y para el arco del anillo, que así van
 * sincronizados sin una segunda animación.
 *
 * Con `prefers-reduced-motion` activo salta directamente al valor final.
 */
export function useCountUp(target: number | null): number {
  // Se arranca siempre en 0, no en el valor final: la métrica debe recorrer su
  // camino tanto cuando aparece por primera vez como cuando cambia después.
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)
  const shownRef = useRef(0)

  useEffect(() => {
    if (target === null) return

    const from = fromRef.current
    if (from === target) return

    const duration = metricDuration()

    // Sin animación posible o sin sentido, se enseña el valor real y punto.
    //
    // El caso de la pestaña oculta importa: ahí el navegador no ejecuta
    // `requestAnimationFrame`, así que un recorrido iniciado en segundo plano se
    // quedaría congelado en 0 y el usuario volvería a una métrica falsa.
    if (duration <= 1 || prefersReducedMotion() || document.hidden) {
      fromRef.current = target
      shownRef.current = target
      setShown(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      // Misma curva que `--ax-ease`: sale rápido y se asienta sin rebote.
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(from + (target - from) * eased)

      shownRef.current = value
      setShown(value)

      if (progress < 1) frame = requestAnimationFrame(step)
      else fromRef.current = target
    }

    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      // Si el valor cambia a mitad de recorrido, el siguiente arranca desde aquí.
      fromRef.current = shownRef.current
    }
  }, [target])

  return target === null ? 0 : shown
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const FALLBACK_METRIC_MS = 700

/**
 * Duración en milisegundos leída de `--ax-metric`, para no repetir el número fuera
 * del CSS.
 *
 * `getComputedStyle` normaliza los tiempos, así que `700ms` vuelve como `.7s`. Hay
 * que mirar la unidad: leer solo el número daría 0,7 y la animación no existiría.
 */
function metricDuration(): number {
  if (typeof document === 'undefined') return 0

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--ax-metric')
    .trim()

  const amount = Number.parseFloat(raw)
  if (!Number.isFinite(amount)) return FALLBACK_METRIC_MS

  return raw.endsWith('ms') ? amount : amount * 1000
}
