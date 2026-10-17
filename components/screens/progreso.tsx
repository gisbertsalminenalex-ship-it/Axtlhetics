'use client'

import { useState, type CSSProperties } from 'react'
import { StrengthChart } from '@/components/progress/strength-chart'
import { WeeklyVolume } from '@/components/weekly-volume'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { safeDivide } from '@/lib/domain/shared/ids'
import { EXERCISE_CATALOG, findExercise } from '@/lib/domain/workouts/catalog'
import { exerciseHistory, trainedExercises, weeklySetTotals } from '@/lib/domain/workouts/progress'
import { TARGET_STATUS_LABELS, targetProgress } from '@/lib/domain/workouts/targets'
import { weeklyVolume } from '@/lib/domain/workouts/weekly-volume'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * Progreso (D-036): cómo avanzas hacia tus objetivos.
 *
 * Tres bloques, sin tarjetas salvo donde agrupan: los objetivos medibles
 * (D-035), la mejor serie de cada ejercicio en el tiempo y las series de cada
 * semana. Todo sale del historial local; nada se calcula fuera del dominio.
 */
export function ProgresoScreen() {
  const { profile, sessions, today } = useAxtlhetics()
  const targets = profile?.targets ?? []
  const exercises = trainedExercises(sessions, EXERCISE_CATALOG)
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const chosen = exercises.find((exercise) => exercise.id === exerciseId) ?? exercises[0] ?? null
  const weeks = weeklySetTotals(sessions, today, EXERCISE_CATALOG)
  const volumes = weeklyVolume(sessions, today, EXERCISE_CATALOG, profile?.experience ?? 'intermedio')

  return (
    <div className="px-6 pb-10">
      <header className="pt-2 pb-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Progreso</h1>
      </header>
      <p className="text-[15px] text-muted-foreground">Cómo avanzas hacia tus objetivos.</p>

      {/* Objetivos medibles (D-035) */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Tus objetivos</h3>
      {targets.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
          Añade un objetivo medible en tu perfil: un ejercicio, una cifra y una fecha.
        </p>
      ) : (
        <ul className="mt-4 space-y-5">
          {targets.map((target) => {
            const progress = targetProgress(target, sessions, today)
            const exercise = findExercise(target.exerciseId)
            const unit = exercise?.work.isTimed ? 's' : 'reps'
            const done = Math.min(safeDivide(progress.current, target.target, 0), 1)
            const expected = Math.min(safeDivide(progress.expected, target.target, 0), 1)
            const behind = progress.status === 'behind' || progress.status === 'expired'
            return (
              <li key={target.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold">
                    {exercise?.name ?? 'Ejercicio retirado'} · {target.target} {unit}
                  </span>
                  <span className={cn('text-[12.5px] font-medium', behind ? 'text-foreground' : 'text-primary')}>
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
                <p className="mt-1.5 text-[12.5px] tabular-nums text-muted-foreground">
                  Llevas {progress.current} {unit} · hoy tocaría {progress.expected.toLocaleString('es-ES')} · hasta el{' '}
                  {formatShortDate(target.deadline).toLowerCase()}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {/* Fuerza por ejercicio */}
      <h3 className="mt-9 text-[15px] font-semibold tracking-[-0.01em]">Tu fuerza</h3>
      {chosen ? (
        <>
          <select
            value={chosen.id}
            onChange={(event) => setExerciseId(event.target.value)}
            aria-label="Ejercicio"
            className="mt-3 h-11 w-full rounded-2xl border border-border bg-background px-3 text-[15px] font-semibold outline-none"
          >
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
          <StrengthChart points={exerciseHistory(chosen.id, sessions)} unit={chosen.work.isTimed ? 's' : 'reps'} />
        </>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
          Completa un entrenamiento y aquí verás cómo mejora cada ejercicio.
        </p>
      )}

      {/* Series por semana */}
      <h3 className="mt-9 text-[15px] font-semibold tracking-[-0.01em]">Series por semana</h3>
      <WeekBars weeks={weeks} />
      <WeeklyVolume volumes={volumes} className="mt-6" />
    </div>
  )
}

/** Barras de las últimas semanas, en el mismo lenguaje que el gráfico del Historial (D-003). */
function WeekBars({ weeks }: { weeks: ReturnType<typeof weeklySetTotals> }) {
  const max = Math.max(...weeks.map((week) => week.sets))
  const [selected, setSelected] = useState(weeks.length - 1)
  const shown = weeks[selected]

  return (
    <figure className="mt-4">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">Últimas {weeks.length} semanas</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          Semana del {formatShortDate(shown.weekStart).toLowerCase()} · {shown.sets} series
        </span>
      </figcaption>
      <div className="mt-2.5 flex h-28 items-end gap-[2px] border-b border-border" role="img" aria-label={`Series por semana: ${weeks.map((week) => week.sets).join(', ')}`}>
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
                className={cn('ax-bar block w-full rounded-t-[4px]', index === selected ? 'bg-primary' : 'bg-primary/55')}
                style={{ height: `${Math.max(4, safeDivide(week.sets, max, 0) * 100)}%`, '--ax-index': index } as CSSProperties}
              />
            )}
          </button>
        ))}
      </div>
      {max === 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">Todavía no hay series registradas.</p>}
    </figure>
  )
}
