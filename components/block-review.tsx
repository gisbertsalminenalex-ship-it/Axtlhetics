'use client'

import { blockReview, describeAnchor } from '@/lib/domain/workouts/block-review'
import { EXERCISE_CATALOG } from '@/lib/domain/workouts/catalog'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * El cierre del bloque (D-062), en Entrenamiento: durante la descarga y la
 * primera semana del siguiente. Lo que avanzaron los principales, el test de
 * evolución y qué pasa ahora. Sin tarjeta, como la revisión de la semana.
 */
export function BlockReviewSection() {
  const { sessions, assessments, today } = useAxtlhetics()
  if (assessments.status !== 'ready') return null
  const review = blockReview({ history: sessions, assessments: assessments.assessments, today, catalog: EXERCISE_CATALOG })
  if (!review) return null

  const closing = review.status === 'closing'
  return (
    <section aria-labelledby="block-review">
      <h3 id="block-review" className="mt-10 text-body font-semibold">
        {closing ? 'Cierre del bloque' : 'Tu bloque anterior'}
      </h3>
      <p className="mt-1 text-footnote text-muted-foreground">
        Del {formatShortDate(review.start).toLowerCase()} al {formatShortDate(review.end).toLowerCase()}
      </p>

      {review.anchors.length > 0 && (
        <>
          <p className="mt-4 text-caption font-semibold tracking-[0.08em] text-muted-foreground uppercase">Tus principales</p>
          <ul className="mt-1.5 space-y-1">
            {review.anchors.map((item) => (
              <li key={item.exerciseId} className="text-subhead font-medium tabular-nums">
                {describeAnchor(item)}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-caption font-semibold tracking-[0.08em] text-muted-foreground uppercase">Test de evolución</p>
      {review.test ? (
        <ul className="mt-1.5 space-y-1">
          {review.test.rows.map((row) => (
            <li key={row.key} className="text-subhead tabular-nums">
              {row.name}: {row.value} <span className="text-muted-foreground">({row.delta})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-subhead leading-snug text-pretty">
          {closing
            ? 'Repítelo esta semana: con la descarga llegas fresco y la comparación es justa.'
            : 'No lo repetiste al cerrar el bloque. Hazlo cuando esté disponible para medir lo que avanzaste.'}
        </p>
      )}

      <p className="mt-4 text-subhead leading-snug text-pretty">
        {closing
          ? 'La semana que viene empieza un bloque nuevo: elijo principales nuevos en la primera sesión de cada zona.'
          : 'Este bloque estrena principales: se fijan en tu primera sesión de cada zona y se repiten hasta la descarga.'}
      </p>
    </section>
  )
}
