/**
 * El cierre del bloque (D-062): lo que un entrenador hace al acabar cada
 * bloque. Repetir el test, comparar lo que avanzaron los principales,
 * explicarlo y empezar el siguiente.
 *
 * Se enseña durante la semana de descarga que cierra el bloque y la primera
 * semana del siguiente. Todo sale del historial y de los tests guardados.
 */

import { summarizeAssessment, type SummaryRow } from '../assessment/summary'
import type { Assessment } from '../assessment/types'
import { addDays, type DayKey } from '../shared/dates'
import { blockAnchors, currentBlock } from './blocks'
import { findExercise } from './catalog'
import { exerciseHistory, oneRepMaxHistory, type ExercisePoint } from './progress'
import type { Exercise, SessionFocus, WorkoutSession } from './types'

/** Bloques más cortos no se resumen: no hay progreso que contar. */
export const MIN_WEEKS_TO_REVIEW = 3

export type AnchorProgress = {
  exerciseId: string
  name: string
  unit: 'kg' | 'reps' | 's'
  from: number
  to: number
}

export type BlockReview = {
  /** `closing`: es la semana de descarga; `closed`: ya empezó el siguiente. */
  status: 'closing' | 'closed'
  start: DayKey
  end: DayKey
  anchors: AnchorProgress[]
  /** El test de evolución hecho en el bloque, con sus filas comparadas; `null` si no se hizo. */
  test: { dayKey: DayKey; rows: SummaryRow[] } | null
}

const STRENGTH_FOCUSES: SessionFocus[] = ['tren_superior', 'tren_inferior', 'cuerpo_completo']

export function blockReview(input: {
  history: readonly WorkoutSession[]
  assessments: readonly Assessment[]
  today: DayKey
  catalog: readonly Exercise[]
}): BlockReview | null {
  const { history, assessments, today, catalog } = input
  const block = currentBlock(history, today)

  let status: BlockReview['status']
  let start: DayKey
  let end: DayKey
  if (block.deload) {
    status = 'closing'
    start = block.start
    end = today
  } else if (block.week === 1) {
    const lastDay = addDays(block.start, -1)
    const previous = currentBlock(history, lastDay)
    if (previous.week < MIN_WEEKS_TO_REVIEW) return null
    status = 'closed'
    start = previous.start
    end = lastDay
  } else {
    return null
  }

  const ids = [...new Set(STRENGTH_FOCUSES.flatMap((focus) => blockAnchors(history, end, focus, catalog)))]
  const inRange = (points: ExercisePoint[]) => points.filter((point) => point.dayKey >= start && point.dayKey <= end)
  const anchors: AnchorProgress[] = []
  for (const exerciseId of ids) {
    const exercise = findExercise(exerciseId)
    if (!exercise) continue
    const strength = inRange(oneRepMaxHistory(exerciseId, history))
    const points = strength.length >= 2 ? strength : inRange(exerciseHistory(exerciseId, history))
    if (points.length < 2) continue
    anchors.push({
      exerciseId,
      name: exercise.name,
      unit: strength.length >= 2 ? 'kg' : exercise.work.isTimed ? 's' : 'reps',
      from: points[0].best,
      to: points[points.length - 1].best,
    })
  }

  // Ya empezado el siguiente, el test de su primera semana también cierra el anterior.
  const testEnd = status === 'closed' ? today : end
  const test = [...assessments]
    .filter((assessment) => assessment.status === 'completed' && assessment.dayKey >= start && assessment.dayKey <= testEnd)
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))[0]
  const summary = test ? summarizeAssessment(test, assessments) : null

  return { status, start, end, anchors, test: test && summary ? { dayKey: test.dayKey, rows: summary.rows } : null }
}

/** Un principal en una línea: «Remo: 1RM estimado 11,5 → 13 kg», «Flexiones: 10 → 14 reps». */
export function describeAnchor(item: AnchorProgress): string {
  const value = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  if (item.unit === 'kg') return `${item.name}: 1RM estimado ${value(item.from)} → ${value(item.to)} kg`
  return `${item.name}: ${value(item.from)} → ${value(item.to)} ${item.unit}`
}
