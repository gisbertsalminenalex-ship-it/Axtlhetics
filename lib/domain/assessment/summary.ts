/**
 * Lo que se enseña de un test de evolución (D-021): el resumen al terminar y su
 * fila en el historial.
 *
 * Solo compone lo que ya calcula `compare.ts` —diferencias, mejores marcas y
 * cómo se escriben— con los nombres del catálogo. La interfaz lo pinta tal cual:
 * no compara ni redondea nada por su cuenta.
 */

import { findExercise } from '../workouts/catalog'
import { completedAssessments, sortAssessments } from './assessment'
import {
  compareAssessment,
  formatAssessmentDelta,
  formatAssessmentValue,
  type AssessmentTrend,
  type TestComparison,
} from './compare'
import type { AssessmentTestKey } from './protocol'
import type { Assessment, AssessmentStatus } from './types'

export type SummaryRow = {
  key: AssessmentTestKey
  /** Nombre de la prueba; en flexiones, la variante («Flexiones inclinadas»). */
  name: string
  /** «14 reps», «68 s», «12 / 11 reps». */
  value: string
  /** «+3 reps», «−8 s», «No cambio», «Mixto · +2 / 0», «Línea base». */
  delta: string
  /** `null` en la primera medición de esta prueba y variante. */
  trend: AssessmentTrend | null
  /** La mejor marca en test, incluido este. */
  best: string
  /** El resultado anterior con el que se compara, o `null` si es línea base. */
  previous: string | null
}

export type AssessmentSummary = {
  rows: SummaryRow[]
  /** Ninguna prueba tenía con qué compararse: es la primera referencia. */
  isFirst: boolean
  comparisons: TestComparison[]
}

function nameOf(comparison: TestComparison): string {
  if (comparison.test.key !== 'push') return comparison.test.name
  return findExercise(comparison.result.exerciseId)?.name ?? comparison.test.name
}

/** El resumen de un test completado frente a los anteriores. `null` si no está completado. */
export function summarizeAssessment(
  assessment: Assessment,
  history: readonly Assessment[],
): AssessmentSummary | null {
  const comparisons = compareAssessment(assessment, history)
  if (!comparisons) return null

  const rows = comparisons.map((comparison) => {
    const measure = comparison.result.measure
    return {
      key: comparison.test.key,
      name: nameOf(comparison),
      value: formatAssessmentValue(comparison.result.values, measure),
      delta: formatAssessmentDelta(comparison.delta, measure),
      trend: comparison.delta.kind === 'baseline' ? null : comparison.delta.trend,
      best: formatAssessmentValue(comparison.best, measure),
      previous: comparison.previous ? formatAssessmentValue(comparison.previous.values, measure) : null,
    }
  })

  return {
    rows,
    isFirst: comparisons.every((comparison) => comparison.delta.kind === 'baseline'),
    comparisons,
  }
}

export type HistoryEntry = {
  id: string
  dayKey: string
  status: Exclude<AssessmentStatus, 'in_progress'>
  /** Pruebas registradas, de 4. */
  testsDone: number
  /** El resumen completo, solo de los completados. */
  summary: AssessmentSummary | null
}

/**
 * Los tests del historial, del más reciente al más antiguo. Los interrumpidos
 * aparecen, pero sin comparación: nunca entran en una (D-021).
 */
export function assessmentHistory(assessments: readonly Assessment[]): HistoryEntry[] {
  const completed = completedAssessments(assessments)
  return sortAssessments(assessments)
    .filter((assessment) => assessment.status !== 'in_progress')
    .map((assessment) => ({
      id: assessment.id,
      dayKey: assessment.dayKey,
      status: assessment.status as HistoryEntry['status'],
      testsDone: assessment.results.length,
      summary: assessment.status === 'completed' ? summarizeAssessment(assessment, completed) : null,
    }))
}
