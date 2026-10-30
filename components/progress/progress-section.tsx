'use client'

import { useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { StrengthChart } from '@/components/progress/strength-chart'
import { BodySection } from '@/components/progress/body-section'
import { LevelSection } from '@/components/progress/level-section'
import { TargetRecommendations } from '@/components/assessment/target-recommendations'
import { isFirstCompletedTest } from '@/lib/domain/assessment/targets'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { safeDivide } from '@/lib/domain/shared/ids'
import { EXERCISE_CATALOG, findExercise } from '@/lib/domain/workouts/catalog'
import { exerciseHistory, oneRepMaxHistory, trainedExercises, weeklySetTotals } from '@/lib/domain/workouts/progress'
import { TARGET_STATUS_LABELS, targetProgress } from '@/lib/domain/workouts/targets'
import { useAxtlhetics } from '@/lib/state/store'
import { EmptyNote } from '@/components/section-header'
import { cn } from '@/lib/utils'

/**
 * Tu progreso (D-036, en Entrenamiento desde D-040): cómo avanzas hacia tus
 * objetivos.
 *
 * Tres bloques, sin tarjetas salvo donde agrupan: los objetivos medibles
 * (D-035), la mejor serie de cada ejercicio en el tiempo y las series de cada
 * semana. El volumen por músculo ya está en «Esta semana», justo encima. Todo
 * sale del historial local; nada se calcula fuera del dominio.
 */
export function ProgressSection() {
  const { profile, sessions, today, assessments } = useAxtlhetics()
  const targets = profile?.targets ?? []
  const exercises = trainedExercises(sessions, EXERCISE_CATALOG)
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const chosen = exercises.find((exercise) => exercise.id === exerciseId) ?? exercises[0] ?? null
  const weeks = weeklySetTotals(sessions, today, EXERCISE_CATALOG)
  // Si ya hubo un primer test y aún no hay objetivos, sus propuestas siguen a mano (D-040).
  const firstTest = assessments.assessments.find((assessment) => isFirstCompletedTest(assessment, assessments.assessments)) ?? null

  return (
    <>
      {/* Un capítulo propio dentro de Entrenamiento: título grande y su entradilla (D-075). */}
      <div className="mt-14 border-t border-border pt-8">
        <h2 className="text-title font-bold">Tu progreso</h2>
        <p className="mt-1.5 text-callout text-muted-foreground">Cómo avanzas hacia lo que buscas.</p>
      </div>

      {/* Tu nivel (D-071) */}
      <LevelSection />

      {/* Objetivos medibles (D-035) */}
      <p className="mt-9 mb-3 text-subhead font-semibold">Tus objetivos</p>
      {targets.length === 0 ? (
        firstTest ? (
          <TargetRecommendations assessment={firstTest} />
        ) : (
          <EmptyNote>Haz tu primer test de evolución y te propongo objetivos, o añade uno en tu perfil.</EmptyNote>
        )
      ) : (
        <ul className="space-y-5">
          {targets.map((target) => {
            const progress = targetProgress(target, sessions, today, assessments.assessments)
            const exercise = findExercise(target.exerciseId)
            const unit = exercise?.work.isTimed ? 's' : 'reps'
            const done = Math.min(safeDivide(progress.current, target.target, 0), 1)
            const expected = Math.min(safeDivide(progress.expected, target.target, 0), 1)
            const behind = progress.status === 'behind' || progress.status === 'expired'
            return (
              <li key={target.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-callout font-semibold">
                    {exercise?.name ?? 'Ejercicio retirado'} · {target.target} {unit}
                  </span>
                  <span className={cn('text-caption font-medium', behind ? 'text-foreground' : 'text-primary')}>
                    {TARGET_STATUS_LABELS[progress.status]}
                  </span>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-track" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(done * 100)}%` }} />
                  {/* Dónde tocaría estar hoy según la línea del objetivo. */}
                  {progress.status !== 'achieved' && (
                    <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${Math.round(expected * 100)}% - 1px)` }} />
                  )}
                </div>
                <p className="mt-1.5 text-caption tabular-nums text-muted-foreground">
                  Llevas {progress.current} {unit} · hoy tocaría {progress.expected.toLocaleString('es-ES')} · hasta el{' '}
                  {formatShortDate(target.deadline).toLowerCase()}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {/* Fuerza por ejercicio */}
      <p className="mt-9 mb-3 text-subhead font-semibold">Tu fuerza</p>
      {chosen ? (
        <>
          <div className="relative">
            <select
              value={chosen.id}
              onChange={(event) => setExerciseId(event.target.value)}
              aria-label="Ejercicio"
              className="h-12 w-full appearance-none rounded-2xl bg-surface px-4 pr-10 text-callout font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-muted-nontext"
            />
          </div>
          <StrengthChart points={exerciseHistory(chosen.id, sessions)} unit={chosen.work.isTimed ? 's' : 'reps'} />
          {/* Con carga, también lo que levantarías a una repetición (D-056): una estimación, nunca un test. */}
          <StrengthChart points={oneRepMaxHistory(chosen.id, sessions)} unit="kg" title="1RM estimado" />
        </>
      ) : (
        <EmptyNote>Completa un entrenamiento y aquí verás cómo mejora cada ejercicio.</EmptyNote>
      )}

      {/* Series por semana */}
      <p className="mt-9 mb-3 text-subhead font-semibold">Series por semana</p>
      <WeekBars weeks={weeks} />

      {/* Peso y medidas (D-060). */}
      <BodySection />
    </>
  )
}

/** Barras de las últimas semanas, en el mismo lenguaje que el gráfico del Historial (D-003). */
function WeekBars({ weeks }: { weeks: ReturnType<typeof weeklySetTotals> }) {
  const max = Math.max(...weeks.map((week) => week.sets))
  const [selected, setSelected] = useState(weeks.length - 1)
  const shown = weeks[selected]
  // Sin una sola serie, un gráfico vacío no dice nada: basta la frase.
  if (max === 0) return <EmptyNote>Todavía no hay series registradas.</EmptyNote>

  return (
    <figure className="rounded-2xl border border-border p-4">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-footnote font-medium">Últimas {weeks.length} semanas</span>
        <span className="text-caption tabular-nums text-muted-foreground">
          Semana del {formatShortDate(shown.weekStart).toLowerCase()} · {shown.sets} series
        </span>
      </figcaption>
      <div className="mt-4 flex h-28 items-end gap-1.5 border-b border-border" role="img" aria-label={`Series por semana: ${weeks.map((week) => week.sets).join(', ')}`}>
        {weeks.map((week, index) => (
          <button
            key={week.weekStart}
            type="button"
            onClick={() => setSelected(index)}
            aria-label={`Semana del ${formatShortDate(week.weekStart).toLowerCase()}: ${week.sets} series`}
            className="flex h-full flex-1 items-end"
          >
            {week.sets > 0 && (
              <span
                className={cn('ax-bar block w-full rounded-t-full', index === selected ? 'bg-primary' : 'bg-primary/25')}
                // Altura mínima para que la punta redonda se vea entera en una semana floja.
                style={{ height: `max(12px, ${safeDivide(week.sets, max, 0) * 100}%)`, '--ax-index': index } as CSSProperties}
              />
            )}
          </button>
        ))}
      </div>
    </figure>
  )
}
