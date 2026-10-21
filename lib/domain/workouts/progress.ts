/**
 * Lo que enseña la pestaña Progreso (D-036): la evolución de cada ejercicio y
 * las series de cada semana.
 *
 * Solo sesiones completadas y solo el entrenamiento: una sesión interrumpida
 * dice dónde se paró, no de qué se es capaz, y el calentamiento (D-032) no es
 * una marca.
 */

import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import type { Exercise, WorkoutSession } from './types'
import { isMainExercise } from './types'
import { bestOneRepMax, roundKg } from './strength'

export type ExercisePoint = {
  dayKey: DayKey
  /** La mejor serie de esa sesión: repeticiones, o segundos si es isométrico. */
  best: number
}

/** La mejor serie de cada sesión completada en que se hizo el ejercicio, de la más antigua a la más reciente. */
export function exerciseHistory(exerciseId: string, sessions: readonly WorkoutSession[]): ExercisePoint[] {
  const points: ExercisePoint[] = []
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const sets = session.exercises
      .filter((performed) => performed.exerciseId === exerciseId && isMainExercise(performed))
      .flatMap((performed) => performed.sets.filter((set) => set.completed))
    if (sets.length === 0) continue
    points.push({ dayKey: session.dayKey, best: Math.max(...sets.map((set) => set.reps)) })
  }
  return points.sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/**
 * El 1RM estimado de cada sesión completada con el ejercicio (D-056), al medio
 * kilo, de la más antigua a la más reciente. Solo las sesiones con carga que
 * sirva para estimar.
 */
export function oneRepMaxHistory(exerciseId: string, sessions: readonly WorkoutSession[]): ExercisePoint[] {
  const points: ExercisePoint[] = []
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const sets = session.exercises
      .filter((performed) => performed.exerciseId === exerciseId && isMainExercise(performed))
      .flatMap((performed) => performed.sets)
    const estimate = bestOneRepMax(sets)
    if (estimate !== null) points.push({ dayKey: session.dayKey, best: roundKg(estimate) })
  }
  return points.sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/** Los ejercicios con historial, del más hecho al menos, para elegir cuál ver. */
export function trainedExercises(sessions: readonly WorkoutSession[], catalog: readonly Exercise[]): Exercise[] {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const ids = new Set(
      session.exercises.filter((performed) => isMainExercise(performed) && performed.sets.some((set) => set.completed)).map((performed) => performed.exerciseId),
    )
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return catalog
    .filter((exercise) => counts.has(exercise.id) && exercise.category !== 'movilidad')
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'))
}

export type WeekSets = {
  /** Lunes de la semana. */
  weekStart: DayKey
  sets: number
}

/**
 * Series hechas en cada una de las últimas `weeks` semanas naturales, de la más
 * antigua a la actual. La movilidad no cuenta: no carga.
 */
export function weeklySetTotals(
  sessions: readonly WorkoutSession[],
  today: DayKey,
  catalog: readonly Exercise[],
  weeks = 8,
): WeekSets[] {
  const current = startOfWeek(today)
  const starts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)))
  const mobility = new Set(catalog.filter((exercise) => exercise.category === 'movilidad').map((exercise) => exercise.id))
  return starts.map((weekStart) => {
    const end = addDays(weekStart, 7)
    let sets = 0
    for (const session of sessions) {
      if (session.status !== 'completed' || session.dayKey < weekStart || session.dayKey >= end) continue
      for (const performed of session.exercises) {
        if (!isMainExercise(performed) || mobility.has(performed.exerciseId)) continue
        sets += performed.sets.filter((set) => set.completed).length
      }
    }
    return { weekStart, sets }
  })
}
