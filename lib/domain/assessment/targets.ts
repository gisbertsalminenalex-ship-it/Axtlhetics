/**
 * Objetivos que AXIS propone tras el primer test de evolución (D-040).
 *
 * El primer test da la línea base. Con ella AXIS propone un objetivo medible
 * (D-035) por prueba: la marca del test más un 25 %, con un mínimo para que
 * se note (2 repeticiones o 10 segundos), en 8 semanas. Así el usuario llega a
 * los dos tests siguientes (cada 28 días, D-021) con algo concreto que mirar.
 *
 * Solo propone: los objetivos se añaden cuando el usuario lo confirma. Si ya
 * hay un objetivo para ese ejercicio, no se propone otro.
 */

import type { GoalTarget } from '../profile/types'
import { addDays, type DayKey } from '../shared/dates'
import type { Assessment } from './types'

/** Lo que se busca mejorar sobre la marca del test. */
export const RECOMMENDED_IMPROVEMENT = 0.25
/** Mínimos para que el objetivo se note: repeticiones y segundos. */
export const MIN_REPS_GAIN = 2
export const MIN_SECONDS_GAIN = 10
/** Plazo: 8 semanas, dos tests más (D-021). */
export const RECOMMENDED_WEEKS = 8

export type TargetDraft = {
  exerciseId: string
  target: number
  deadline: DayKey
  /** La marca del test: el punto de partida de la línea del objetivo. */
  startValue: number
  unit: 'reps' | 's'
}

/** `true` si es el primer test completado: el único con el que hay línea base y nada más. */
export function isFirstCompletedTest(assessment: Assessment, history: readonly Assessment[]): boolean {
  if (assessment.status !== 'completed') return false
  return !history.some((other) => other.id !== assessment.id && other.status === 'completed')
}

/** Los objetivos que AXIS propone con los resultados de un test. Uno por prueba, sin repetir ejercicio. */
export function recommendTargets(assessment: Assessment, existing: readonly GoalTarget[]): TargetDraft[] {
  const taken = new Set(existing.map((target) => target.exerciseId))
  const deadline = addDays(assessment.dayKey, RECOMMENDED_WEEKS * 7)
  const drafts: TargetDraft[] = []

  for (const result of assessment.results) {
    if (taken.has(result.exerciseId)) continue
    // En el remo cuenta el mejor lado: un objetivo se mide con la mejor serie (D-035).
    const base = result.values.kind === 'single' ? result.values.value : Math.max(result.values.left, result.values.right)
    const seconds = result.measure === 'seconds'
    const target = seconds
      ? roundUpTo(Math.max(base + MIN_SECONDS_GAIN, base * (1 + RECOMMENDED_IMPROVEMENT)), 5)
      : Math.ceil(Math.max(base + MIN_REPS_GAIN, base * (1 + RECOMMENDED_IMPROVEMENT)))
    drafts.push({ exerciseId: result.exerciseId, target, deadline, startValue: base, unit: seconds ? 's' : 'reps' })
    taken.add(result.exerciseId)
  }
  return drafts
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}
