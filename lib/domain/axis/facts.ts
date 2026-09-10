/**
 * Hechos derivados del contexto de AXIS.
 *
 * Separar «leer el contexto» de «decidir» mantiene las reglas legibles y hace que
 * cada hecho pueda comprobarse por separado en un test.
 */

import { isAvailableOn } from '../profile/types'
import { daysBetween, weekdayOfKey } from '../shared/dates'
import type { MuscleGroup } from '../workouts/types'
import type { ScheduledActivity } from '../profile/types'
import type { AxisContext, AxisFacts } from './types'

/** Orden de exigencia, para poder comparar intensidades. */
const INTENSITY_RANK: Record<string, number> = { baja: 0, media: 1, alta: 2 }

/** La actividad más exigente del conjunto. `null` si no hay ninguna. */
function hardest(activities: readonly ScheduledActivity[]): ScheduledActivity | null {
  return activities.reduce<ScheduledActivity | null>((best, activity) => {
    if (!best) return activity
    return (INTENSITY_RANK[activity.intensity] ?? 0) > (INTENSITY_RANK[best.intensity] ?? 0)
      ? activity
      : best
  }, null)
}

/** Cuántos días atrás mira AXIS para saber qué has trabajado hace poco. */
export const RECENT_HISTORY_DAYS = 3

/** Duración mínima con la que tiene sentido proponer una sesión. */
export const MIN_SESSION_MINUTES = 20

/** Duración usada cuando todavía no hay perfil. */
export const DEFAULT_SESSION_MINUTES = 45

/** Margen que AXIS deja libre antes de una actividad con horario fijo. */
export const ACTIVITY_BUFFER_MINUTES = 60

export function deriveFacts(context: AxisContext): AxisFacts {
  const { profile, recoveryInputs, recoveryScore, recentSessions, activities, dayKey } = context

  const recoveryValue = recoveryScore?.status === 'ok' ? recoveryScore.value : null

  const completedSessions = recentSessions.filter((session) => session.status === 'completed')
  const lastSession = completedSessions[0] ?? null

  const trainedToday = completedSessions.some((session) => session.dayKey === dayKey)
  const daysSinceLastWorkout = lastSession ? daysBetween(lastSession.dayKey, dayKey) : null

  const recentMuscleGroups: MuscleGroup[] = []
  for (const session of completedSessions) {
    if (daysBetween(session.dayKey, dayKey) > RECENT_HISTORY_DAYS) break
    for (const group of session.muscleGroups) {
      if (!recentMuscleGroups.includes(group)) recentMuscleGroups.push(group)
    }
  }

  const weekday = weekdayOfKey(dayKey)
  const isAvailableToday = profile ? isAvailableOn(profile, weekday) : true

  // Puede haber más de un deporte el mismo día. Se conservan todos y se destaca
  // el más exigente, que es el que condiciona la decisión.
  const todayActivities = activities.filter((activity) => activity.weekday === weekday)
  const tomorrowActivities = activities.filter(
    (activity) => activity.weekday === ((weekday + 1) % 7),
  )

  const todayActivity = hardest(todayActivities)
  const tomorrowActivity = hardest(tomorrowActivities)

  // Sin hora registrada no hay margen que calcular: AXIS sabe que hoy hay deporte
  // y cuánto carga, pero no cuánto falta para que empiece.
  const minutesUntilActivity =
    todayActivity && todayActivity.startMinute !== null
      ? todayActivity.startMinute - context.minuteOfDay
      : null

  const typicalMinutes = profile?.typicalSessionMinutes ?? DEFAULT_SESSION_MINUTES
  const availableMinutes = computeAvailableMinutes(typicalMinutes, minutesUntilActivity)

  return {
    recoveryValue,
    recoveryKnown: recoveryValue !== null,
    fatigueLevel: recoveryInputs?.muscleFatigue ?? null,
    energyLevel: recoveryInputs?.energy ?? null,
    stressLevel: recoveryInputs?.stress ?? null,
    sleepHours: recoveryInputs?.sleepHours ?? null,
    trainedToday,
    daysSinceLastWorkout,
    recentMuscleGroups,
    isAvailableToday,
    todayActivity,
    todayActivities: [...todayActivities],
    tomorrowActivity,
    tomorrowActivities: [...tomorrowActivities],
    minutesUntilActivity,
    availableMinutes,
  }
}

/**
 * Recorta la duración habitual si hay una actividad fija por delante.
 *
 * Si la actividad ya ha empezado o queda muy poco margen, se devuelve la duración
 * mínima: la decisión de no entrenar la toman las reglas, no este cálculo.
 */
export function computeAvailableMinutes(
  typicalMinutes: number,
  minutesUntilActivity: number | null,
): number {
  if (minutesUntilActivity === null || minutesUntilActivity < 0) {
    return Math.max(typicalMinutes, MIN_SESSION_MINUTES)
  }
  const usable = minutesUntilActivity - ACTIVITY_BUFFER_MINUTES
  if (usable <= 0) return MIN_SESSION_MINUTES
  return Math.max(MIN_SESSION_MINUTES, Math.min(typicalMinutes, usable))
}
