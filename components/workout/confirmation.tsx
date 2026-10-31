'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Confirmación de una acción que no se puede deshacer: salir o saltar. La
 * comparten el entrenamiento y el test de evolución.
 *
 * Mismo criterio que el borrado de datos en Perfil: la confirmación es parte de
 * la pantalla, no un `confirm()` del navegador, que bloquea la página entera.
 * Dice exactamente qué pasa, porque es lo que hace falta saber para decidir. La
 * acción segura es la principal; la otra, texto.
 */
export function Confirmation({
  title,
  body,
  stayLabel,
  leaveLabel,
  leaveTone,
  onStay,
  onLeave,
}: {
  title: string
  body: ReactNode
  stayLabel: string
  leaveLabel: string
  leaveTone: 'error' | 'muted'
  onStay: () => void
  onLeave: () => void
}) {
  return (
    /*
      Misma composición que una pregunta del onboarding: titular grande arriba y
      la acción debajo. No se centra en vertical porque el contenedor de pantalla
      de `page.tsx` no impone altura, así que un `min-h-full` aquí no resolvería.
    */
    <div className="ax-enter px-5 pt-12 pb-8">
      <h1 className="text-title-lg font-extrabold text-balance">
        {title}
      </h1>
      <p className="mt-3 text-callout text-muted-foreground text-pretty">
        {body}
      </p>

      <div className="mt-10">
        <button
          type="button"
          onClick={onStay}
          className="ax-press h-[52px] w-full rounded-full bg-primary text-callout font-bold text-primary-foreground shadow-action"
        >
          {stayLabel}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className={cn(
            'ax-press mt-2 min-h-11 w-full text-footnote font-semibold',
            leaveTone === 'error' ? 'text-error' : 'text-muted-foreground',
          )}
        >
          {leaveLabel}
        </button>
      </div>
    </div>
  )
}
