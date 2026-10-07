'use client'

import { cn } from '@/lib/utils'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * El test que quedó abierto de otro día se ha cerrado (D-021, regla de
 * `reconcileStoredAssessment`). Una línea, con la misma forma que el motivo de
 * «hoy no» de la entrada al test: sin modal, sin color de error. Se va al
 * empezar otro test.
 */
export function StaleTestNotice({ className }: { className?: string }) {
  const { assessments } = useAxtlhetics()
  if (!assessments.staleTestClosed) return null

  return (
    <p role="status" className={cn('text-[13px] leading-snug text-muted-foreground text-pretty', className)}>
      <span className="font-semibold text-foreground">Test de evolución:</span> el que dejaste a medias se cerró
      sin completar y no se comparará con los demás.
    </p>
  )
}
