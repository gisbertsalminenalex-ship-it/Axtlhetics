/**
 * Migraciones de datos guardados.
 *
 * Viven fuera de IndexedDB a propósito: son transformaciones puras sobre registros,
 * así que pueden probarse sin navegador y se usan en dos sitios — durante la subida
 * de versión y como red de seguridad al leer.
 *
 * Regla: una migración **nunca pierde información**. Si no sabe qué hacer con un
 * registro, lo deja como está.
 */

import type { TrainingGoal } from '../domain/profile/types'

/** Objetivo con el que se rellena un perfil que no declaraba ninguno. */
export const FALLBACK_GOAL: TrainingGoal = 'salud_general'

/**
 * Forma de un perfil guardado por una versión anterior del esquema.
 *
 * Deliberadamente laxa: lo que hay en disco pudo escribirlo cualquier versión, así
 * que no se puede asumir que encaje con `UserProfile`. Solo importan las dos claves
 * que esta migración toca.
 */
export type StoredProfile = {
  /** v1 guardaba un único objetivo en `goal`. */
  goal?: unknown
  goals?: unknown
  /** v2 guardaba los deportes como texto libre en el perfil. */
  sports?: unknown
  [key: string]: unknown
}

/**
 * v1 → v2: el perfil pasa de un objetivo único (`goal`) a varios (`goals`).
 *
 * - Si ya tiene `goals` con contenido, se devuelve **tal cual**: no se sobrescribe.
 * - Si tiene `goal`, se convierte en `[goal]` y se retira la clave antigua.
 * - Si no tiene ninguno, se rellena con el objetivo de reserva.
 * - Cualquier otro campo del perfil se conserva intacto.
 */
export function upgradeProfileRecord<T extends StoredProfile>(stored: T): T {
  const withoutSports = dropLegacySports(stored)

  if (Array.isArray(withoutSports.goals) && withoutSports.goals.length > 0) {
    return withoutSports
  }

  const legacy = typeof withoutSports.goal === 'string' ? (withoutSports.goal as TrainingGoal) : null
  const { goal: _legacyGoal, ...rest } = withoutSports

  return { ...rest, goals: [legacy ?? FALLBACK_GOAL] } as unknown as T
}

/**
 * v2 → v3: `sports` (texto libre) desaparece del perfil.
 *
 * Los deportes pasan a vivir como actividades del calendario, que ya tienen día e
 * intensidad y que AXIS sí usa para decidir. Un nombre suelto en una lista no
 * aportaba nada y creaba una segunda fuente de verdad sobre lo mismo.
 *
 * Los nombres antiguos **no se convierten en actividades automáticamente**: sin día
 * ni intensidad sería inventar. Se devuelven aparte para que la aplicación pueda
 * ofrecer al usuario completarlos.
 */
export function extractLegacySports(stored: StoredProfile): string[] {
  if (!Array.isArray(stored.sports)) return []
  return stored.sports.filter((sport): sport is string => typeof sport === 'string' && sport.length > 0)
}

export function dropLegacySports<T extends StoredProfile>(stored: T): T {
  if (!('sports' in stored)) return stored
  const { sports: _legacySports, ...rest } = stored
  return rest as unknown as T
}

/** `true` si el registro necesita alguna migración de perfil. */
export function needsProfileUpgrade(stored: StoredProfile): boolean {
  const goalsPending = !Array.isArray(stored.goals) || stored.goals.length === 0
  return goalsPending || 'sports' in stored
}
