/**
 * Días fuertes (D-048).
 *
 * Un día fuerte es un día de entrenamiento normal en el que todo acompaña: buena
 * recuperación, nada exigente cerca y margen en la semana. Ese día la sesión va
 * a intensidad alta: una serie más y una variante un punto más difícil. El
 * usuario siempre puede elegir la versión normal.
 */

import type { ExperienceLevel, TrainingGoal } from '../profile/types'
import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import type { WorkoutSession } from '../workouts/types'
import type { AxisFacts } from './types'

/**
 * Cuántos días fuertes caben en una semana, según la experiencia. Es el único
 * sitio donde vive: cuando haya niveles, se conectarán aquí.
 */
export const HARD_DAYS_PER_WEEK: Record<ExperienceLevel, number> = {
  principiante: 0,
  intermedio: 1,
  avanzado: 2,
}

/** Recuperación mínima para un día fuerte: por encima de la banda «buena» (75). */
export const HARD_DAY_MIN_RECOVERY = 80
/** Fatiga muscular máxima, si está registrada (1–5). */
export const HARD_DAY_MAX_FATIGUE = 3

/** Días fuertes completados esta semana, de lunes a hoy. */
export function hardDaysThisWeek(sessions: readonly WorkoutSession[], today: DayKey): number {
  const monday = startOfWeek(today)
  return sessions.filter(
    (session) =>
      session.status === 'completed' && session.intensity === 'alta' && session.dayKey >= monday && session.dayKey <= today,
  ).length
}

export type HardDayInput = {
  facts: AxisFacts
  /** La regla que decidió el día: solo un día normal por buena recuperación puede ser fuerte. */
  rule: string
  goal: TrainingGoal
  experience: ExperienceLevel
  deload: boolean
  sessions: readonly WorkoutSession[]
  today: DayKey
}

export function isHardDay(input: HardDayInput): boolean {
  const { facts, rule, goal, experience, deload, sessions, today } = input
  if (rule !== 'good_recovery') return false
  if (goal === 'movilidad') return false
  if (deload) return false
  if (facts.recoveryValue === null || facts.recoveryValue < HARD_DAY_MIN_RECOVERY) return false
  if (facts.fatigueLevel !== null && facts.fatigueLevel > HARD_DAY_MAX_FATIGUE) return false
  if (facts.trainingLoadBand === 'alta') return false

  // Nada exigente hoy ni mañana: llegar fundido a un partido es peor que no apretar hoy.
  const demanding = (activity: { intensity: string }) => activity.intensity !== 'baja'
  if (facts.todayActivities.some(demanding) || facts.tomorrowActivities.some(demanding)) return false

  // Nunca dos seguidos.
  const yesterday = addDays(today, -1)
  if (sessions.some((session) => session.status === 'completed' && session.dayKey === yesterday && session.intensity === 'alta')) {
    return false
  }

  return hardDaysThisWeek(sessions, today) < (HARD_DAYS_PER_WEEK[experience] ?? 0)
}
