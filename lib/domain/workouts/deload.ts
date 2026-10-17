/**
 * Semana de descarga (D-031).
 *
 * Tras varias semanas seguidas entrenando con regularidad, una semana más
 * suave deja que el cuerpo asimile lo acumulado: una serie menos por ejercicio
 * y sin subir. Es parte del plan, no un descanso.
 *
 * Se decide por semanas naturales (de lunes a domingo) y es determinista: el
 * mismo historial da la misma respuesta cualquier día de la semana. Una semana
 * de descarga se reconoce porque sus sesiones lo llevan en la instantánea de la
 * propuesta (`ProposalSnapshot.deload`), así que nunca se encadenan dos.
 */

import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import type { WorkoutSession } from './types'

/** Semanas cargadas seguidas tras las que toca descarga. */
export const DELOAD_AFTER_WEEKS = 4

/** Sesiones completadas para que una semana cuente como cargada. */
export const LOADED_WEEK_MIN_SESSIONS = 2

/** `true` si la semana que contiene `today` es de descarga. */
export function isDeloadWeek(history: readonly WorkoutSession[], today: DayKey): boolean {
  const monday = startOfWeek(today)
  for (let back = 1; back <= DELOAD_AFTER_WEEKS; back++) {
    const start = addDays(monday, -7 * back)
    if (!isLoadedWeek(history, start)) return false
  }
  return true
}

/**
 * Una semana cargada: al menos `LOADED_WEEK_MIN_SESSIONS` sesiones completadas
 * y ninguna de descarga. Una semana de descarga corta la cuenta.
 */
function isLoadedWeek(history: readonly WorkoutSession[], monday: DayKey): boolean {
  const end = addDays(monday, 7)
  const inWeek = history.filter(
    (session) => session.status === 'completed' && session.dayKey >= monday && session.dayKey < end,
  )
  if (inWeek.some((session) => session.proposal?.deload === true)) return false
  return inWeek.length >= LOADED_WEEK_MIN_SESSIONS
}
