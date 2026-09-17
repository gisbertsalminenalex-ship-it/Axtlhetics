/**
 * Interfaces de repositorio.
 *
 * El dominio y la interfaz hablan con estas interfaces, nunca con IndexedDB. Es la
 * costura que permite sustituir la persistencia local por una remota más adelante
 * sin reescribir la aplicación.
 */

import type { AxisDayMemory } from '../domain/axis/memory'
import type { ScheduledActivity, UserProfile } from '../domain/profile/types'
import type { RecoveryInputs } from '../domain/recovery/types'
import type { DayKey } from '../domain/shared/dates'
import type { ActiveWorkout } from '../domain/workouts/active-workout'
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
 * La memoria de AXIS, un registro por día.
 *
 * Lo decidido hoy, lo que el usuario ha contado, el hilo de la conversación y
 * dónde estaba. Se guarda en el dispositivo, como todo lo demás: no hay servidor
 * ni historial de conversaciones en ningún sitio. Los días anteriores se
 * conservan; nada aquí los lee todavía.
 */
export type AxisMemoryRepository = {
  getByDay(dayKey: DayKey): Promise<AxisDayMemory | null>
  save(memory: AxisDayMemory): Promise<void>
  clear(dayKey: DayKey): Promise<void>
}

/**
 * La sesión de entrenamiento en curso.
 *
 * Una fila como mucho: solo puede haber un entrenamiento a la vez. Se escribe
 * tal cual en cada cambio, para que cerrar la aplicación a media sesión no la
 * pierda, y se borra al terminar o abandonar. `updatedAt` es la última vez que se
 * escribió: si la sesión se queda colgada de otro día, es el único dato real
 * sobre cuándo se dejó.
 */
export type StoredActiveWorkout = {
  workout: ActiveWorkout
  updatedAt: string
}

export type ActiveWorkoutRepository = {
  get(): Promise<StoredActiveWorkout | null>
  save(stored: StoredActiveWorkout): Promise<void>
  clear(): Promise<void>
}

export type Repositories = {
  profile: UserProfileRepository
  activities: ActivityRepository
  recovery: RecoveryRepository
  workouts: WorkoutRepository
  axisMemory: AxisMemoryRepository
  activeWorkout: ActiveWorkoutRepository
}
