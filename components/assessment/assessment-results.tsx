'use client'

import type { SummaryRow } from '@/lib/domain/assessment/summary'

/**
 * Los cuatro resultados de un test con su comparación (D-021). Lo comparten el
 * resumen al terminar y el detalle del historial.
 *
 * Filas sobre el fondo, separadas por líneas: no hay una tarjeta por prueba. La
 * diferencia va en texto neutro, sin verde ni rojo: un resultado peor es un
 * dato, no un fracaso. Todo viene ya escrito del dominio.
 */
export function AssessmentResults({ rows, showPrevious = false }: { rows: SummaryRow[]; showPrevious?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key} className="py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-callout font-semibold tracking-[-0.01em]">{row.name}</span>
            <span className="text-headline font-bold tracking-[-0.01em] tabular-nums">{row.value}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 text-footnote text-muted-foreground tabular-nums">
            {/* Cada dato entero en su línea: un «12 / 12 reps» nunca se parte. */}
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-1">
              {showPrevious && row.previous && (
                <span className="whitespace-nowrap">Antes {row.previous} ·</span>
              )}
              <span className="whitespace-nowrap">Mejor en test: {row.best}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-foreground">
              {row.trend === null ? row.delta : `${row.delta}${showPrevious ? '' : ' vs anterior'}`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
