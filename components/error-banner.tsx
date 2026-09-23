'use client'

import { AlertTriangle, X } from 'lucide-react'

/**
 * Aviso de que algo no se ha podido guardar en este dispositivo.
 *
 * Es el `Error State` que el Design System §23 ya preveía, en su única forma:
 * un aviso por encima de la pantalla que esté abierta. Vive aquí y no dentro de
 * cada pantalla porque el fallo no es de ninguna en concreto —puede venir del
 * perfil, de la recuperación, de una actividad o del entrenamiento— y repetirlo
 * en cinco sitios sería la misma caja cinco veces.
 *
 * Por qué existe: AXTHLETICS es local-first y, cuando el navegador no deja
 * escribir, la aplicación **sigue funcionando** con los datos en memoria. Sin
 * este aviso el usuario entrena una hora, cierra, y al volver no hay nada. Lo
 * que no se puede guardar se dice.
 *
 * No se va solo. Un dato perdido no es una notificación de paso: se queda hasta
 * que se lee.
 */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="ax-enter pointer-events-auto flex items-start gap-3 rounded-2xl border border-error/30 bg-background px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-error" strokeWidth={2} />
      <p className="flex-1 text-[13.5px] leading-relaxed text-foreground text-pretty">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar aviso"
        className="ax-press -mr-2 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <X className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
      </button>
    </div>
  )
}
