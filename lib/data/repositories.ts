/**
 * Interfaces de repositorio.
 *
 * El dominio y la interfaz hablan con estas interfaces, nunca con IndexedDB. Es la
 * costura que permite sustituir la persistencia local por una remota más adelante
 * sin reescribir la aplicación.
 */

import type { DayPlanOverride } from '../domain/axis/actions'
import type { ScheduledActivity, UserProfile } from '../domain/profile/types'
import type { RecoveryInputs } from '../domain/recovery/types'
import type { DayKey } from '../domain/shared/dates'
import type { WorkoutSession } from '../domain/workouts/types'

export type UserProfileRepository = {
  get(): Promise<UserProfile | null>
  save(profile: UserProfile): Promise<void>
  clear(): Promise<void>
}

export type ActivityRepository = {
  list(): Promise<ScheduledActivity[]>
  save(activity: ScheduledActivity): Promise<void>
  remove(id: string): Promise<void>
}

export type RecoveryRepository = {
  getByDay(dayKey: DayKey): Promise<RecoveryInputs | null>
  save(inputs: RecoveryInputs): Promise<void>
  /** Últimos días registrados, del más reciente al más antiguo. */
  recent(limit: number): Promise<RecoveryInputs[]>
}

export type WorkoutRepository = {
  /** Sesiones de la más reciente a la más antigua. */
  list(limit?: number): Promise<WorkoutSession[]>
  getById(id: string): Promise<WorkoutSession | null>
  save(session: WorkoutSession): Promise<void>
}

/**
 * La elección de entrenamiento del día.
 *
 * Una fila por día como mucho: o el usuario aceptó un cambio, o manda la
 * recomendación de AXIS. Nunca hay dos.
 */
export type DayPlanRepository = {
  getByDay(dayKey: DayKey): Promise<DayPlanOverride | null>
  save(override: DayPlanOverride): Promise<void>
  clear(dayKey: DayKey): Promise<void>
}

export type Repositories = {
  profile: UserProfileRepository
  activities: ActivityRepository
  recovery: RecoveryRepository
  workouts: WorkoutRepository
  dayPlan: DayPlanRepository
}
