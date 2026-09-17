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

import { emptyDayMemory, type AxisDayMemory } from '../domain/axis/memory'
import type { TrainingGoal } from '../domain/profile/types'

/** Objetivo con el que se rellena un perfil que no declaraba ninguno. */
export const FALLBACK_GOAL: TrainingGoal = 'salud_general'

// ---------------------------------------------------------------------------
// v4 → v5: el plan del día deja de ser solo la sesión elegida
// ---------------------------------------------------------------------------

/**
 * En v4 cada registro de `dayPlan` era la elección de sesión, con sus campos al
 * desnudo. En v5 pasa a ser un plan del día que además guarda qué actividades
 * del calendario ha dicho el usuario que hoy no ocurren.
 *
 * Lo guardado no se pierde: la elección antigua se envuelve tal cual.
 */
export type StoredDayPlan = {
  dayKey?: unknown
  override?: unknown
  cancelledActivities?: unknown
  /** Campo de la forma antigua. Su presencia delata que hay que envolver. */
  type?: unknown
  [key: string]: unknown
}

export function needsDayPlanUpgrade(stored: StoredDayPlan): boolean {
  return !('override' in stored) || !Array.isArray(stored.cancelledActivities)
}

export function upgradeDayPlanRecord(stored: StoredDayPlan): StoredDayPlan {
  if (!needsDayPlanUpgrade(stored)) return stored

  // La forma antigua se reconoce porque lleva `type` en la raíz: era la elección.
  const wasOverride = 'type' in stored && stored.type !== undefined
  const { dayKey, ...rest } = stored

  return {
    dayKey,
    override: 'override' in stored ? stored.override : wasOverride ? { dayKey, ...rest } : null,
    cancelledActivities: Array.isArray(stored.cancelledActivities)
      ? stored.cancelledActivities
      : [],
  }
}

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

// ---------------------------------------------------------------------------
// v6 → v7: el plan del día y la conversación se funden en la memoria de AXIS
// ---------------------------------------------------------------------------

/**
 * Lo que había en `conversation` hasta v6: el hilo y el estado de sus acciones.
 * Laxo a propósito: viene del disco.
 */
export type StoredConversationRecord = {
  dayKey?: unknown
  messages?: unknown
  actionStatuses?: unknown
  updatedAt?: unknown
  [key: string]: unknown
}

/**
 * Funde el plan del día (v4/v5) y la conversación (v5) en una memoria de AXIS.
 *
 * Regla de siempre: **no se pierde nada**. Cada campo antiguo va a su sitio y los
 * nuevos —lo que el usuario contó, dónde estaba la conversación— empiezan
 * vacíos, que es lo único cierto que se sabe de ellos. Un plan con la forma v4
 * también entra: se pasa por su propia migración antes.
 *
 * Es pura e idempotente: fundir lo ya fundido devuelve lo mismo.
 */
export function mergeIntoAxisMemory(
  dayKey: string,
  plan: StoredDayPlan | null,
  conversation: StoredConversationRecord | null,
): AxisDayMemory {
  const upgradedPlan = plan ? upgradeDayPlanRecord(plan) : null

  const override =
    upgradedPlan && typeof upgradedPlan.override === 'object' && upgradedPlan.override !== null
      ? (upgradedPlan.override as AxisDayMemory['override'])
      : null

  const cancelledActivities = Array.isArray(upgradedPlan?.cancelledActivities)
    ? upgradedPlan.cancelledActivities.filter((item): item is string => typeof item === 'string')
    : []

  const messages = Array.isArray(conversation?.messages)
    ? (conversation.messages as AxisDayMemory['messages'])
    : []

  const actionStatuses =
    conversation && typeof conversation.actionStatuses === 'object' && conversation.actionStatuses !== null
      ? (conversation.actionStatuses as AxisDayMemory['actionStatuses'])
      : {}

  const updatedAt =
    typeof conversation?.updatedAt === 'string' ? conversation.updatedAt : new Date(0).toISOString()

  return {
    ...emptyDayMemory(dayKey, updatedAt),
    override,
    cancelledActivities,
    messages,
    actionStatuses,
  }
}
