'use client'

import { CircularMetric } from '@/components/circular-metric'
import type { ScanComparison } from '@/lib/domain/scanner/compare'
import type { ScanSummary } from '@/lib/domain/scanner/summary'
import { findExercise } from '@/lib/domain/workouts/catalog'

/**
 * El resumen de un escaneo (D-023): índice, un párrafo por categoría, puntos
 * fuertes, áreas de mejora y pasos de acción. Lo mismo al terminar el escaneo y
 * al abrirlo desde el historial.
 *
 * El índice va en tono primario, no en los colores de estado: no es un semáforo
 * sobre el cuerpo de nadie.
 */
export function ScanSummaryView({ summary, comparison = null }: { summary: ScanSummary; comparison?: ScanComparison | null }) {
  return (
    <section>
      <div className="flex items-center gap-4">
        <CircularMetric value={summary.index ?? 0} size={96} stroke={6} tone={summary.index === null ? 'neutral' : 'primary'}>
          <span className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">{summary.index ?? '—'}</span>
          <span className="text-[11px] text-muted-foreground">/100</span>
        </CircularMetric>
        <p className="flex-1 text-[13px] leading-snug text-muted-foreground text-pretty">
          Índice de equilibrio corporal. Orientativo, no es una medida médica.
        </p>
      </div>
      <p className="mt-4 text-[15.5px] leading-relaxed text-pretty">{summary.overview}</p>

      {comparison && <ComparisonBlock comparison={comparison} />}

      <ul className="mt-6 divide-y divide-border border-y border-border">
        {summary.categories.map((category) => (
          <li key={category.key} className="py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold">{category.title}</h3>
              {category.score !== null && <span className="text-[15px] font-semibold tabular-nums">{category.score}</span>}
            </div>
            <p className="mt-1 text-[14.5px] leading-relaxed text-pretty">{category.text}</p>
            {category.details.length > 0 && (
              <details className="mt-1">
                <summary className="min-h-11 cursor-pointer py-2 text-[12.5px] font-semibold text-muted-foreground">Lo medido</summary>
                <ul className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {category.details.map((detail) => (
                    <li key={detail}>· {detail}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>

      {summary.strengths.length > 0 && (
        <>
          <h3 className="mt-7 text-[15px] font-semibold">Puntos fuertes</h3>
          <ul className="mt-2 space-y-1.5 text-[14.5px] leading-relaxed">
            {summary.strengths.map((text) => (
              <li key={text}>· {text}</li>
            ))}
          </ul>
        </>
      )}

      {summary.improvements.length > 0 && (
        <>
          <h3 className="mt-7 text-[15px] font-semibold">Áreas de mejora</h3>
          <ul className="mt-2 space-y-1.5 text-[14.5px] leading-relaxed">
            {summary.improvements.map((text) => (
              <li key={text}>· {text}</li>
            ))}
          </ul>
        </>
      )}

      {summary.actions.length > 0 && (
        <>
          <h3 className="mt-7 text-[15px] font-semibold">Pasos de acción</h3>
          <ol className="mt-2 space-y-3 text-[14.5px] leading-relaxed">
            {summary.actions.map((action, index) => (
              <li key={action.text}>
                <span className="font-semibold tabular-nums">{index + 1}.</span> {action.text}
                {action.exerciseIds.length > 0 && (
                  <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                    {action.exerciseIds.map((id) => findExercise(id)?.name ?? id).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {summary.photoNotes.length > 0 && (
        <ul className="mt-7 space-y-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {summary.photoNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

const TREND_MARK: Record<ScanComparison['changes'][number]['trend'], string> = {
  better: '↑',
  worse: '↓',
  changed: '·',
  same: '=',
}

/**
 * Cómo has cambiado desde el escaneo anterior. Solo medidas, y solo lo que
 * supera el margen de medida; lo demás, «sin cambio».
 */
function ComparisonBlock({ comparison }: { comparison: ScanComparison }) {
  const moved = comparison.changes.filter((change) => change.trend !== 'same')
  const still = comparison.changes.filter((change) => change.trend === 'same')
  return (
    <section className="mt-6 rounded-3xl bg-surface p-5">
      <h3 className="text-[15px] font-semibold">Desde tu escaneo anterior</h3>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-pretty">{comparison.headline}</p>
      {moved.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed">
          {moved.map((change) => (
            <li key={change.key} className="flex gap-2">
              <span
                aria-hidden="true"
                className={change.trend === 'better' ? 'text-success' : change.trend === 'worse' ? 'text-warning' : 'text-muted-foreground'}
              >
                {TREND_MARK[change.trend]}
              </span>
              <span>{change.text}</span>
            </li>
          ))}
        </ul>
      )}
      {still.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
          Sin cambio: {still.map((change) => change.label.toLowerCase()).join(', ')}.
        </p>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground text-pretty">{comparison.note}</p>
    </section>
  )
}
