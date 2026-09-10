/**
 * Construcción del contexto de AXIS.
 *
 * Reúne en una sola estructura todo lo que el motor puede mirar. Vive en el dominio
 * para que los tests puedan fabricar un contexto sin pasar por la persistencia.
 */

import type { ScheduledActivity, UserProfile } from '../profile/types'
import { computeRecoveryScore } from '../recovery/score'
import type { RecoveryInputs, RecoveryScore } from '../recovery/types'
import { todayKey, type DayKey } from '../shared/dates'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import type { Exercise, WorkoutSession } from '../workouts/types'
import type { AxisContext } from './types'

export type AxisContextInput = {
  profile: UserProfile | null
  recoveryInputs: RecoveryInputs | null
  /** Sesiones recientes, de la más nueva a la más antigua. */
  recentSessions: readonly WorkoutSession[]
  activities: readonly ScheduledActivity[]
  catalog?: readonly Exercise[]
  /** Momento de la decisión. Inyectable para que los tests sean deterministas. */
  now?: Date
  /** Score ya calculado. Si no se pasa, se calcula a partir de `recoveryInputs`. */
  recoveryScore?: RecoveryScore | null
}

export function buildAxisContext(input: AxisContextInput): AxisContext {
  const now = input.now ?? new Date()
  const dayKey: DayKey = todayKey(now)

  const recoveryScore =
    input.recoveryScore !== undefined
      ? input.recoveryScore
      : input.recoveryInputs
        ? computeRecoveryScore(input.recoveryInputs, { age: input.profile?.age })
        : null

  return {
    dayKey,
    minuteOfDay: now.getHours() * 60 + now.getMinutes(),
    profile: input.profile,
    recoveryInputs: input.recoveryInputs,
    recoveryScore,
    recentSessions: input.recentSessions,
    activities: input.activities,
    catalog: input.catalog ?? EXERCISE_CATALOG,
  }
}
