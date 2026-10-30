'use client'

import type { ReactNode } from 'react'
import { CountdownRing } from '@/components/workout/countdown-ring'
import { REST_EXTENSION_SECONDS, type RestState } from '@/lib/domain/shared/rest'

/**
 * Descanso (D-019, Design System «Rest Timer»). Lo comparten el entrenamiento y
 * el test de evolución (D-021).
 *
 * La cuenta atrás es la protagonista; debajo, lo que viene, para llegar
 * preparado. La acción principal es saltarlo; ampliar queda como texto. Al
 * llegar a cero la pantalla vuelve sola: el estado se calcula del reloj.
 */
export function RestTimer({
  rest,
  nextName,
  nextLabel = 'Después',
  nextDetail,
  onSkip,
  onExtend,
  children,
}: {
  rest: RestState
  /** Lo que viene después: el ejercicio o la prueba. */
  nextName: string
  /** Cómo se presenta lo que viene. «Después» en el entrenamiento; el test dice «Siguiente prueba». */
  nextLabel?: string
  nextDetail?: string
  onSkip: () => void
  onExtend: () => void
  /** Acciones secundarias propias de cada flujo, como deshacer la última serie. */
  children?: ReactNode
}) {
  return (
    <section className="ax-enter" aria-label="Descanso">
      <p className="mt-7 text-overline font-semibold tracking-[0.16em] text-primary">DESCANSO</p>

      <CountdownRing remainingSeconds={rest.remainingSeconds} totalSeconds={rest.totalSeconds} />

      <p className="mt-6 text-footnote text-muted-foreground">{nextLabel}</p>
      <p className="mt-0.5 text-headline font-semibold">{nextName}</p>
      {nextDetail && <p className="mt-0.5 text-subhead text-muted-foreground tabular-nums">{nextDetail}</p>}

      <button
        type="button"
        onClick={onSkip}
        className="ax-press mt-6 flex h-14 w-full items-center justify-center rounded-full bg-primary text-callout font-semibold text-primary-foreground"
      >
        Saltar descanso
      </button>
      <button
        type="button"
        onClick={onExtend}
        className="ax-press mt-2 min-h-11 w-full text-footnote font-semibold text-primary tabular-nums"
      >
        + {REST_EXTENSION_SECONDS} s
      </button>

      {children}
    </section>
  )
}
