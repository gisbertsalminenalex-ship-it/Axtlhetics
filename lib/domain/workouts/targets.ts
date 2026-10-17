/**
 * Progreso de los objetivos medibles (D-035).
 *
 * Un objetivo es un ejercicio, una cifra y una fecha. Se mide con la mejor
 * serie registrada del ejercicio —repeticiones, o segundos si es isométrico—
 * en sesiones completadas, y solo en el entrenamiento: el calentamiento no
 * cuenta (D-032).
 *
 * Para saber si se va bien, se traza una línea recta desde donde se estaba al
 * crearlo hasta la cifra en la fecha, y se compara con dónde se está hoy.
 */

import type { GoalTarget } from '../profile/types'
import { daysBetween, type DayKey } from '../shared/dates'
import type { WorkoutSession } from './types'
import { isMainExercise } from './types'

export type TargetStatus =
  /** Ya se ha llegado. */
  | 'achieved'
  /** Por encima de la línea, o casi. */
  | 'on_track'
  /** Por debajo de la línea. */
  | 'behind'
  /** Pasó la fecha sin llegar. */
  | 'expired'

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  achieved: 'Conseguido',
  on_track: 'Vas bien',
  behind: 'Vas por detrás',
  expired: 'Fecha pasada',
}

export type TargetProgress = {
  target: GoalTarget
  /** La mejor serie registrada hasta hoy. */
  current: number
  /** Dónde tocaría estar hoy según la línea. */
  expected: number
  status: TargetStatus
  /** Días hasta la fecha; negativo si ya pasó. */
  daysLeft: number
}

/** La mejor serie del ejercicio en sesiones completadas, o 0 si no hay ninguna. */
export function bestSetOf(exerciseId: string, sessions: readonly WorkoutSession[]): number {
  let best = 0
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    for (const performed of session.exercises) {
      if (performed.exerciseId !== exerciseId || !isMainExercise(performed)) continue
      for (const set of performed.sets) {
        if (set.completed && set.reps > best) best = set.reps
      }
    }
  }
  return best
}

/** Margen bajo la línea que todavía cuenta como ir bien: una repetición o un 10 % del camino. */
function tolerance(target: GoalTarget): number {
  return Math.max(1, (target.target - target.startValue) * 0.1)
}

export function targetProgress(
  target: GoalTarget,
  sessions: readonly WorkoutSession[],
  today: DayKey,
): TargetProgress {
  const current = bestSetOf(target.exerciseId, sessions)
  const start = target.createdAt.slice(0, 10)
  const total = Math.max(1, daysBetween(start, target.deadline))
  const elapsed = Math.min(Math.max(daysBetween(start, today), 0), total)
  const expected = Math.round((target.startValue + (target.target - target.startValue) * (elapsed / total)) * 10) / 10
  const daysLeft = daysBetween(today, target.deadline)

  const status: TargetStatus =
    current >= target.target
      ? 'achieved'
      : daysLeft < 0
        ? 'expired'
        : current >= expected - tolerance(target)
          ? 'on_track'
          : 'behind'

  return { target, current, expected, status, daysLeft }
}

/** Los objetivos que siguen abiertos: ni conseguidos ni con la fecha pasada. */
export function isOpenTarget(progress: TargetProgress): boolean {
  return progress.status === 'on_track' || progress.status === 'behind'
}
