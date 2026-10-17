/**
 * Volumen semanal por grupo muscular (D-034).
 *
 * Cuántas series lleva cada grupo en la semana natural (de lunes a hoy) frente
 * a un objetivo semanal según la experiencia. Es lo que permite pensar en la
 * semana y no solo en el día: AXIS prioriza la zona que más va por detrás.
 *
 * Una serie cuenta entera para los músculos principales del ejercicio y media
 * para los secundarios. Solo las series hechas de sesiones completadas o
 * interrumpidas, y solo el entrenamiento: ni el calentamiento ni la vuelta a la
 * calma (D-032) ni la movilidad, que no cargan.
 */

import type { ExperienceLevel } from '../profile/types'
import { daysBetween, startOfWeek, type DayKey } from '../shared/dates'
import type { Exercise, MuscleGroup, WorkoutSession } from './types'
import { isMainExercise } from './types'

/** Series por grupo y semana que se buscan, según la experiencia. */
export const WEEKLY_SET_TARGET: Record<ExperienceLevel, number> = {
  principiante: 8,
  intermedio: 12,
  avanzado: 16,
}

/** Los grupos que se siguen, en el orden en que se enseñan. */
export const TRACKED_GROUPS: readonly MuscleGroup[] = ['pecho', 'espalda', 'hombros', 'brazos', 'piernas', 'gluteos', 'core']

export type GroupVolume = {
  group: MuscleGroup
  /** Series de la semana, en medios: 7,5 es posible. */
  sets: number
  target: number
}

/** Series de cada grupo en la semana de `today`, hasta `today` incluido. */
export function weeklySets(
  sessions: readonly WorkoutSession[],
  today: DayKey,
  catalog: readonly Exercise[],
): Record<MuscleGroup, number> {
  const monday = startOfWeek(today)
  const totals = Object.fromEntries(TRACKED_GROUPS.map((group) => [group, 0])) as Record<MuscleGroup, number>
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))

  for (const session of sessions) {
    if (session.dayKey < monday || daysBetween(session.dayKey, today) < 0) continue
    for (const performed of session.exercises) {
      if (!isMainExercise(performed)) continue
      const exercise = byId.get(performed.exerciseId)
      if (!exercise || exercise.category === 'movilidad') continue
      const done = performed.sets.filter((set) => set.completed).length
      if (done === 0) continue
      for (const group of exercise.primaryMuscles) totals[group] += done
      for (const group of exercise.secondaryMuscles) {
        if (!exercise.primaryMuscles.includes(group)) totals[group] += done / 2
      }
    }
  }
  return totals
}

/** El volumen de la semana de cada grupo frente a su objetivo. */
export function weeklyVolume(
  sessions: readonly WorkoutSession[],
  today: DayKey,
  catalog: readonly Exercise[],
  experience: ExperienceLevel,
): GroupVolume[] {
  const sets = weeklySets(sessions, today, catalog)
  const target = WEEKLY_SET_TARGET[experience]
  return TRACKED_GROUPS.map((group) => ({ group, sets: sets[group], target }))
}

/** Lo hecho sobre el objetivo, de 0 en adelante. 1 = objetivo cumplido. */
export function fulfilmentOf(volume: GroupVolume): number {
  return volume.target > 0 ? volume.sets / volume.target : 1
}

/** El grupo que más va por detrás de su objetivo, o `null` si todos lo han cumplido. */
export function laggingGroup(volumes: readonly GroupVolume[]): GroupVolume | null {
  const behind = volumes.filter((volume) => fulfilmentOf(volume) < 1)
  if (behind.length === 0) return null
  return behind.reduce((worst, volume) => (fulfilmentOf(volume) < fulfilmentOf(worst) ? volume : worst))
}
