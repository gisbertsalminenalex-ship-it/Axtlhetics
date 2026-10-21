/**
 * Bloques de entrenamiento (D-057).
 *
 * Un entrenador no cambia los ejercicios principales cada día: los fija durante
 * un bloque de semanas para que el progreso se pueda medir, y rota solo los
 * accesorios. Aquí un bloque son hasta cuatro semanas seguidas entrenando más
 * la descarga que las cierra (D-031), y sus principales son los que abrieron
 * la primera sesión de cada zona dentro del bloque.
 *
 * Todo sale del historial, sin un almacén propio: el mismo historial da el
 * mismo bloque cualquier día de la semana, y una copia de seguridad lo trae
 * consigo.
 */

import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import { DELOAD_AFTER_WEEKS, isDeloadWeek } from './deload'
import type { Exercise, SessionFocus, WorkoutSession } from './types'
import { isMainExercise } from './types'

/** Semanas de un bloque: las cargadas y la descarga que lo cierra. */
export const BLOCK_WEEKS = DELOAD_AFTER_WEEKS + 1

/**
 * Cuántos principales fija cada zona: los primeros ejercicios de la sesión,
 * uno por patrón. El core, la movilidad y los intervalos rotan siempre.
 */
export const ANCHORS_BY_FOCUS: Record<SessionFocus, number> = {
  tren_superior: 2,
  tren_inferior: 2,
  cuerpo_completo: 3,
  core_movilidad: 0,
  acondicionamiento: 0,
}

export type TrainingBlock = {
  /** Lunes de la primera semana del bloque. */
  start: DayKey
  /** Semana del bloque en que cae hoy, desde 1. */
  week: number
  /** `true` si es la semana de descarga que lo cierra. */
  deload: boolean
}

/**
 * Una semana sigue el bloque si se entrenó (al menos una sesión completada) y
 * no fue de descarga. Una semana sin entrenar o una descarga lo cierran.
 */
function continuesBlock(history: readonly WorkoutSession[], monday: DayKey): boolean {
  const end = addDays(monday, 7)
  const inWeek = history.filter(
    (session) => session.status === 'completed' && session.dayKey >= monday && session.dayKey < end,
  )
  return inWeek.length > 0 && !inWeek.some((session) => session.proposal?.deload === true)
}

/** El bloque en que cae `today`. */
export function currentBlock(history: readonly WorkoutSession[], today: DayKey): TrainingBlock {
  const monday = startOfWeek(today)
  if (isDeloadWeek(history, today)) {
    return { start: addDays(monday, -7 * DELOAD_AFTER_WEEKS), week: BLOCK_WEEKS, deload: true }
  }
  let streak = 0
  while (streak < BLOCK_WEEKS * 3 && continuesBlock(history, addDays(monday, -7 * (streak + 1)))) streak += 1
  // Quien entrena poco no llega a descargar: cada cinco semanas, bloque nuevo igualmente.
  const week = (streak % BLOCK_WEEKS) + 1
  return { start: addDays(monday, -7 * (week - 1)), week, deload: false }
}

/**
 * Los principales del bloque para una zona: los primeros ejercicios del
 * entrenamiento (sin saltos, que tienen su propio hueco, D-033) de la primera
 * sesión completada de esa zona dentro del bloque. Vacío si aún no hubo
 * ninguna: la primera los elige como siempre.
 */
export function blockAnchors(
  history: readonly WorkoutSession[],
  today: DayKey,
  focus: SessionFocus,
  catalog: readonly Exercise[],
): string[] {
  const count = ANCHORS_BY_FOCUS[focus]
  if (count === 0) return []
  const { start } = currentBlock(history, today)
  const first = history
    .filter((session) => session.status === 'completed' && session.focus === focus)
    .filter((session) => session.dayKey >= start && session.dayKey <= today)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.startedAt.localeCompare(b.startedAt))[0]
  if (!first) return []
  const category = new Map(catalog.map((exercise) => [exercise.id, exercise.category]))
  return first.exercises
    .filter((performed) => isMainExercise(performed) && performed.sets.length > 0)
    .map((performed) => performed.exerciseId)
    .filter((id) => {
      const kind = category.get(id)
      return kind !== undefined && kind !== 'pliometria' && kind !== 'core' && kind !== 'movilidad'
    })
    .slice(0, count)
}

/** El bloque en una frase, para «Esta semana». */
export function describeBlock(block: TrainingBlock): string {
  if (block.deload) return 'Semana de descarga: cierra el bloque. La que viene empieza uno nuevo.'
  if (block.week > DELOAD_AFTER_WEEKS) return `Semana ${block.week} del bloque: la que viene empieza uno nuevo.`
  return `Semana ${block.week} de ${DELOAD_AFTER_WEEKS} del bloque. Los ejercicios principales se repiten hasta la descarga para medir tu progreso.`
}
