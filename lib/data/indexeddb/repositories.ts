/**
 * Implementación de los repositorios sobre IndexedDB.
 *
 * Cada método traduce entre el modelo de dominio y el almacén. Ninguna regla de
 * negocio vive aquí: esta capa solo guarda y recupera.
 */

import type { ScheduledActivity, UserProfile } from '../../domain/profile/types'
import { PRIMARY_PROFILE_ID } from '../../domain/profile/types'
import type { RecoveryInputs } from '../../domain/recovery/types'
import type { DayKey } from '../../domain/shared/dates'
import type { WorkoutSession } from '../../domain/workouts/types'
import type {
  ActivityRepository,
  Repositories,
  RecoveryRepository,
  UserProfileRepository,
  WorkoutRepository,
} from '../repositories'
import { needsProfileUpgrade, upgradeProfileRecord } from '../migrations'
import { read, STORES, write } from './db'

/**
 * Red de seguridad para perfiles anteriores a la v2 del esquema.
 *
 * La migración de IndexedDB ya reescribe los registros, pero un perfil escrito por
 * una pestaña abierta con la versión antigua podría colarse. Normalizar al leer
 * cuesta nada y evita que la aplicación se rompa por un dato viejo.
 */
function normalizeStoredProfile(stored: UserProfile | undefined): UserProfile | null {
  if (!stored) return null
  return needsProfileUpgrade(stored) ? upgradeProfileRecord(stored) : stored
}

const profileRepository: UserProfileRepository = {
  async get() {
    const stored = await read<UserProfile | undefined>(STORES.profile, (store) =>
      store.get(PRIMARY_PROFILE_ID),
    )
    return normalizeStoredProfile(stored)
  },
  async save(profile) {
    await write(STORES.profile, (store) => {
      store.put(profile)
    })
  },
  async clear() {
    await write(STORES.profile, (store) => {
      store.delete(PRIMARY_PROFILE_ID)
    })
  },
}

const activityRepository: ActivityRepository = {
  async list() {
    const stored = await read<ScheduledActivity[]>(STORES.activities, (store) => store.getAll())
    return [...stored].sort((a, b) =>
      a.weekday === b.weekday
        ? (a.startMinute ?? 0) - (b.startMinute ?? 0)
        : a.weekday - b.weekday,
    )
  },
  async save(activity) {
    await write(STORES.activities, (store) => {
      store.put(activity)
    })
  },
  async remove(id) {
    await write(STORES.activities, (store) => {
      store.delete(id)
    })
  },
}

const recoveryRepository: RecoveryRepository = {
  async getByDay(dayKey: DayKey) {
    const stored = await read<RecoveryInputs | undefined>(STORES.recovery, (store) =>
      store.get(dayKey),
    )
    return stored ?? null
  },
  async save(inputs) {
    await write(STORES.recovery, (store) => {
      store.put(inputs)
    })
  },
  async recent(limit) {
    const stored = await read<RecoveryInputs[]>(STORES.recovery, (store) => store.getAll())
    return [...stored]
      .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
      .slice(0, limit)
  },
}

const workoutRepository: WorkoutRepository = {
  async list(limit) {
    const stored = await read<WorkoutSession[]>(STORES.sessions, (store) => store.getAll())
    const sorted = [...stored].sort((a, b) => {
      const byDay = b.dayKey.localeCompare(a.dayKey)
      return byDay !== 0 ? byDay : b.startedAt.localeCompare(a.startedAt)
    })
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
  },
  async getById(id) {
    const stored = await read<WorkoutSession | undefined>(STORES.sessions, (store) =>
      store.get(id),
    )
    return stored ?? null
  },
  async save(session) {
    await write(STORES.sessions, (store) => {
      store.put(session)
    })
  },
}

export function createIndexedDbRepositories(): Repositories {
  return {
    profile: profileRepository,
    activities: activityRepository,
    recovery: recoveryRepository,
    workouts: workoutRepository,
  }
}
