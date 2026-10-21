'use client'

import { AxisMark } from '@/components/axis-mark'
import { describeImprovement, type WeeklyReview } from '@/lib/domain/axis/weekly-review'
import { formatKg } from '@/lib/domain/workouts/history'

/**
 * La revisión de la semana pasada (D-059), en Entrenamiento: lo hecho, lo que
 * mejoró, cómo descansaste y qué hace AXIS con esta semana. Sin tarjeta: texto,
 * una lista y la voz de AXIS, como el resto de la pantalla.
 */
export function WeeklyReviewSection({ review }: { review: WeeklyReview | null }) {
  if (!review) return null

  const rest = [
    review.averageSleepHours !== null ? `dormiste ${review.averageSleepHours.toLocaleString('es-ES')} h de media` : null,
    review.averageRecovery !== null ? `recuperación media ${review.averageRecovery}/100` : null,
    review.weight ? `peso medio ${formatKg(review.weight.averageKg)} kg${review.weight.changeKg ? ` (${review.weight.changeKg > 0 ? '+' : '−'}${formatKg(Math.abs(review.weight.changeKg))})` : ''}` : null,
    review.protein ? `proteína ${review.protein.yes} de ${review.protein.answered} días` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="weekly-review">
      <h3 id="weekly-review" className="mt-9 text-[15px] font-semibold tracking-[-0.01em]">
        La semana pasada
      </h3>
      <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
        {review.sessions} de {review.planned} {review.planned === 1 ? 'sesión' : 'sesiones'}
        {rest.length > 0 ? ` · ${rest.join(' · ')}` : ''}
      </p>

      {review.improvements.length > 0 && (
        <>
          <p className="mt-4 text-[13px] font-medium text-muted-foreground">Mejoraste</p>
          <ul className="mt-1.5 space-y-1">
            {review.improvements.map((item) => (
              <li key={item.exerciseId} className="text-[14.5px] font-medium tabular-nums">
                {describeImprovement(item)}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[13px] font-medium text-muted-foreground">Esta semana</p>
      <ul className="mt-1.5 space-y-2">
        {review.next.map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-pretty">
            <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
