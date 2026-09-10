/**
 * Repositorios en memoria.
 *
 * Se usan cuando IndexedDB no está disponible: renderizado en servidor, modo privado
 * de algunos navegadores o almacenamiento bloqueado. La aplicación sigue funcionando;
 * lo único que se pierde es la persistencia entre sesiones.
 */

import type { ScheduledActivity, UserProfile } from '../domain/profile/types'
import type { RecoveryInputs } from '../domain/recovery/types'
import type { DayKey } from '../domain/shared/dates'
import type { WorkoutSession } from '../domain/workouts/types'
import type { Repositories } from './repositories'

export function createMemoryRepositories(): Repositories {
  let profile: UserProfile | null = null
  const activities = new Map<string, ScheduledActivity>()
  const recovery = new Map<DayKey, RecoveryInputs>()
  const sessions = new Map<string, WorkoutSession>()

  return {
    profile: {
      async get() {
        return profile
      },
      async save(next) {
        profile = next
      },
      async clear() {
        profile = null
      },
    },
    activities: {
      async list() {
        return [...activities.values()].sort((a, b) =>
          a.weekday === b.weekday
        ? (a.startMinute ?? 0) - (b.startMinute ?? 0)
        : a.weekday - b.weekday,
        )
      },
      async save(activity) {
        activities.set(activity.id, activity)
      },
      async remove(id) {
        activities.delete(id)
      },
    },
    recovery: {
      async getByDay(dayKey) {
        return recovery.get(dayKey) ?? null
      },
      async save(inputs) {
        recovery.set(inputs.dayKey, inputs)
      },
      async recent(limit) {
        return [...recovery.values()]
          .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
          .slice(0, limit)
      },
    },
    workouts: {
      async list(limit) {
        const sorted = [...sessions.values()].sort((a, b) => {
          const byDay = b.dayKey.localeCompare(a.dayKey)
          return byDay !== 0 ? byDay : b.startedAt.localeCompare(a.startedAt)
        })
        return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
      },
      async getById(id) {
        return sessions.get(id) ?? null
      },
      async save(session) {
        sessions.set(session.id, session)
      },
    },
  }
}
