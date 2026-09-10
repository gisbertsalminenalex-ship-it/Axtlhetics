'use client'

import { AxisMark } from '@/components/axis-mark'

/**
 * Estado de carga de la aplicación mientras se leen los datos locales.
 *
 * Calmado y sin ruido: la marca de AXIS y una línea. Nada de esqueletos parpadeando.
 */
export function AppLoading() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 pb-16">
      <AxisMark className="h-7 w-7 animate-pulse text-primary" />
      <p className="mt-4 text-[13px] text-muted-foreground">Preparando tu día…</p>
    </div>
  )
}
