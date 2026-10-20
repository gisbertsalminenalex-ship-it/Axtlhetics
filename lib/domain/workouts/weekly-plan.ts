/**
 * El reparto de la semana entre los objetivos (D-047).
 *
 * Cada sesión sirve a **un** objetivo. Las sesiones de la semana son los días
 * disponibles del perfil, y se reparten así:
 *
 * - Movilidad, con otros objetivos: una sesión (con 2 días o más). Sola, la
 *   mitad, y el resto de fuerza general.
 * - Resistencia sola: el 60 % de acondicionamiento y el resto de fuerza general.
 * - El resto, a partes iguales entre los demás objetivos. Lo que no se reparte
 *   exacto —y quién se queda sin sesión si hay menos días que objetivos— rota
 *   cada semana. Ningún objetivo manda sobre otro.
 *
 * Cuál toca hoy lo decide `goalForToday`: el que más sesiones tiene pendientes.
 */

import {
  normalizeGoals,
  TRAINING_GOAL_ORDER,
  type TrainingGoal,
} from '../profile/types'
import { daysBetween, startOfWeek, type DayKey } from '../shared/dates'
import type { SessionFocus, WorkoutSession } from './types'

/** El objetivo de las sesiones que no son de ninguno de los del usuario. */
export const GENERAL_GOAL: TrainingGoal = 'salud_general'

/** Parte de la semana para movilidad cuando es el único objetivo. */
export const MOBILITY_SHARE_ALONE = 0.5
/** Parte de la semana para acondicionamiento cuando la resistencia es el único objetivo. */
export const CONDITIONING_SHARE_ALONE = 0.6

/** Cómo se nombra cada objetivo dentro de una frase: «2 de fuerza». */
export const GOAL_NOUNS: Record<TrainingGoal, string> = {
  fuerza: 'fuerza',
  hipertrofia: 'masa muscular',
  resistencia: 'resistencia',
  rendimiento_deportivo: 'rendimiento',
  movilidad: 'movilidad',
  tecnica: 'técnica',
  salud_general: 'fuerza general',
}

export type GoalQuota = { goal: TrainingGoal; sessions: number }

export type GoalProgress = GoalQuota & {
  /** Sesiones completadas esta semana que sirvieron a este objetivo. */
  done: number
}

/** Los objetivos que no se entrenan con una sesión de fuerza. */
const NON_STRENGTH: readonly TrainingGoal[] = ['resistencia', 'movilidad']

export function isStrengthGoal(goal: TrainingGoal): boolean {
  return !NON_STRENGTH.includes(goal)
}

/** El foco propio del objetivo, o `null` si se entrena con un foco de fuerza. */
export function focusForGoal(goal: TrainingGoal): SessionFocus | null {
  if (goal === 'resistencia') return 'acondicionamiento'
  if (goal === 'movilidad') return 'core_movilidad'
  return null
}

/** Un lunes fijo: cuenta las semanas para que el reparto rote. */
const WEEK_ZERO: DayKey = '2024-01-01'

/** Número de la semana de `today`, para rotar lo que no se reparte exacto. */
export function weekIndexOf(today: DayKey): number {
  return Math.floor(daysBetween(WEEK_ZERO, startOfWeek(today)) / 7)
}

/** Cuántas sesiones le tocan a cada objetivo esta semana. Sin ceros. */
export function weeklyQuota(
  goals: readonly TrainingGoal[],
  trainingDays: number,
  weekIndex = 0,
): GoalQuota[] {
  const days = Math.max(0, Math.min(7, Math.round(trainingDays)))
  const chosen = normalizeGoals(goals)
  const own = chosen.length > 0 ? chosen : [GENERAL_GOAL]
  if (days === 0) return []

  const withGeneral = (goal: TrainingGoal, share: number): GoalQuota[] => {
    const sessions = Math.ceil(days * share)
    return [
      { goal, sessions },
      { goal: GENERAL_GOAL, sessions: days - sessions },
    ].filter((quota) => quota.sessions > 0)
  }
  if (own.length === 1 && own[0] === 'movilidad') return withGeneral('movilidad', MOBILITY_SHARE_ALONE)
  if (own.length === 1 && own[0] === 'resistencia') return withGeneral('resistencia', CONDITIONING_SHARE_ALONE)

  const mobility = own.includes('movilidad') && days >= 2 ? 1 : 0
  const others = own.filter((goal) => goal !== 'movilidad')
  const rest = days - mobility
  const base = Math.floor(rest / others.length)
  const extra = rest % others.length
  // Lo que no se reparte exacto empieza cada semana por un objetivo distinto.
  const start = ((weekIndex % others.length) + others.length) % others.length
  const rotated = [...others.slice(start), ...others.slice(0, start)]

  const quota = new Map<TrainingGoal, number>(others.map((goal) => [goal, base]))
  rotated.slice(0, extra).forEach((goal) => quota.set(goal, (quota.get(goal) ?? 0) + 1))
  if (mobility > 0) quota.set('movilidad', mobility)

  return TRAINING_GOAL_ORDER.filter((goal) => (quota.get(goal) ?? 0) > 0).map((goal) => ({
    goal,
    sessions: quota.get(goal)!,
  }))
}

/**
 * A qué objetivo sirvió una sesión. Las anteriores a D-047 no lo guardan: se
 * deduce del foco cuando se puede (movilidad, acondicionamiento), y si no, no
 * cuenta para nadie.
 */
export function goalOfSession(session: Pick<WorkoutSession, 'goal' | 'focus'>): TrainingGoal | null {
  if (session.goal) return session.goal
  if (session.focus === 'core_movilidad') return 'movilidad'
  if (session.focus === 'acondicionamiento') return 'resistencia'
  return null
}

/** Lo hecho esta semana (de lunes a hoy) frente a lo que toca. */
export function weekProgress(
  quota: readonly GoalQuota[],
  sessions: readonly WorkoutSession[],
  today: DayKey,
): GoalProgress[] {
  const monday = startOfWeek(today)
  const thisWeek = sessions.filter(
    (session) => session.status === 'completed' && session.dayKey >= monday && session.dayKey <= today,
  )
  return quota.map((item) => ({
    ...item,
    done: thisWeek.filter((session) => goalOfSession(session) === item.goal).length,
  }))
}

/** El último día en que se hizo una sesión de ese objetivo, o `''` si nunca. */
function lastDayOf(goal: TrainingGoal, sessions: readonly WorkoutSession[]): DayKey {
  let latest = ''
  for (const session of sessions) {
    if (session.status !== 'completed' || goalOfSession(session) !== goal) continue
    if (session.dayKey > latest) latest = session.dayKey
  }
  return latest
}

export type GoalChoiceOptions = {
  /** Día suave: si la movilidad está pendiente, es su día. */
  light?: boolean
  /** Objetivos que hoy no caben, por ejemplo resistencia si hay que evitar piernas. */
  exclude?: readonly TrainingGoal[]
}

/**
 * El objetivo de hoy: el que más sesiones tiene pendientes esta semana; a
 * igualdad, el que hace más tiempo que no se trabaja, y después el orden fijo.
 * Con todo cumplido, el que hace más tiempo que no se trabaja.
 */
export function goalForToday(
  progress: readonly GoalProgress[],
  sessions: readonly WorkoutSession[],
  options: GoalChoiceOptions = {},
): TrainingGoal {
  const exclude = options.exclude ?? []
  const candidates = progress.filter((item) => !exclude.includes(item.goal))
  if (candidates.length === 0) return GENERAL_GOAL

  const pending = candidates.filter((item) => item.done < item.sessions)
  if (options.light && pending.some((item) => item.goal === 'movilidad')) return 'movilidad'

  const pool = pending.length > 0 ? pending : candidates
  const ranked = pool
    .map((item) => ({ ...item, remaining: item.sessions - item.done, last: lastDayOf(item.goal, sessions) }))
    .sort(
      (a, b) =>
        b.remaining - a.remaining ||
        (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) ||
        TRAINING_GOAL_ORDER.indexOf(a.goal) - TRAINING_GOAL_ORDER.indexOf(b.goal),
    )
  return ranked[0].goal
}

/** «2 de fuerza, 1 de resistencia y 1 de movilidad». */
export function describeQuota(quota: readonly GoalQuota[]): string {
  const parts = quota.map((item) => `${item.sessions} de ${GOAL_NOUNS[item.goal]}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}
