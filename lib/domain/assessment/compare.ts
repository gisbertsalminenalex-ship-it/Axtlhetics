/**
 * Comparar un test con el anterior compatible (D-021).
 *
 * Solo se compara lo idéntico: mismo protocolo, prueba, ejercicio (la variante,
 * en flexiones), medida y carga. Lo demás es línea base. La diferencia es
 * exacta: no hay margen de tolerancia ni porcentajes.
 */

import { ASSESSMENT_PROTOCOL, type AssessmentMeasure, type AssessmentTest } from './protocol'
import { completedAssessments } from './assessment'
import type { Assessment, AssessmentResult, AssessmentValue } from './types'

/**
 * - `up` / `down` / `same`: en una prueba de un valor, el signo de la diferencia.
 *   Por lados, `up` exige que suban los dos y `down` que bajen los dos.
 * - `mixed`: por lados, cualquier otra combinación: uno sube y el otro baja, o
 *   uno cambia y el otro se queda igual. No cuenta como mejora: mejorar exige que
 *   mejoren los dos lados.
 */
export type AssessmentTrend = 'up' | 'down' | 'same' | 'mixed'

export type AssessmentDelta =
  | { kind: 'baseline' }
  | { kind: 'single'; diff: number; trend: AssessmentTrend }
  | { kind: 'sides'; left: number; right: number; trend: AssessmentTrend }

export type TestComparison = {
  test: AssessmentTest
  result: AssessmentResult
  /** El resultado anterior compatible. `null` si es línea base. */
  previous: AssessmentResult | null
  delta: AssessmentDelta
  /** La mejor marca en test de esta prueba y variante, incluido este. */
  best: AssessmentValue
}

function compatible(a: AssessmentResult, b: AssessmentResult): boolean {
  return a.testKey === b.testKey && a.exerciseId === b.exerciseId && a.measure === b.measure && a.loadKg === b.loadKg
}

function sign(diff: number): AssessmentTrend {
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'
}

function sidesTrend(left: number, right: number): AssessmentTrend {
  if (left > 0 && right > 0) return 'up'
  if (left < 0 && right < 0) return 'down'
  if (left === 0 && right === 0) return 'same'
  return 'mixed'
}

function deltaOf(current: AssessmentValue, previous: AssessmentValue): AssessmentDelta {
  if (current.kind === 'single' && previous.kind === 'single') {
    const diff = current.value - previous.value
    return { kind: 'single', diff, trend: sign(diff) }
  }
  if (current.kind === 'sides' && previous.kind === 'sides') {
    const left = current.left - previous.left
    const right = current.right - previous.right
    return { kind: 'sides', left, right, trend: sidesTrend(left, right) }
  }
  return { kind: 'baseline' }
}

function bestOf(values: readonly AssessmentValue[]): AssessmentValue {
  const [first, ...rest] = values
  return rest.reduce<AssessmentValue>((best, value) => {
    if (best.kind === 'single' && value.kind === 'single') {
      return value.value > best.value ? value : best
    }
    if (best.kind === 'sides' && value.kind === 'sides') {
      // Cada lado por separado: la mejor marca de cada brazo.
      return { kind: 'sides', left: Math.max(best.left, value.left), right: Math.max(best.right, value.right) }
    }
    return best
  }, first)
}

/**
 * Compara un test completado con los completados anteriores.
 *
 * Por cada prueba busca el resultado compatible más reciente anterior a este
 * test: si se cambió de variante de flexiones, esa prueba es línea base y las
 * otras tres siguen comparándose. Un test no completado no se compara.
 */
export function compareAssessment(
  assessment: Assessment,
  history: readonly Assessment[],
): TestComparison[] | null {
  if (assessment.status !== 'completed') return null

  const completed = completedAssessments(history).filter(
    (other) => other.id !== assessment.id && other.protocolVersion === assessment.protocolVersion,
  )
  const earlier = completed.filter(
    (other) =>
      other.dayKey < assessment.dayKey ||
      (other.dayKey === assessment.dayKey && other.startedAt < assessment.startedAt),
  )

  return ASSESSMENT_PROTOCOL.map((test, index) => {
    const result = assessment.results[index]
    const previous =
      earlier.flatMap((other) => other.results.filter((candidate) => compatible(candidate, result)))[0] ?? null
    const upToHere = [...earlier.flatMap((other) => other.results.filter((r) => compatible(r, result))), result]
    return {
      test,
      result,
      previous,
      delta: previous ? deltaOf(result.values, previous.values) : { kind: 'baseline' },
      best: bestOf(upToHere.map((r) => r.values)),
    }
  })
}

// ---------------------------------------------------------------------------
// Cómo se escribe
// ---------------------------------------------------------------------------

const MINUS = '−'

const UNIT: Record<AssessmentMeasure, string> = { reps: 'reps', seconds: 's' }

function signed(value: number, unit = ''): string {
  const suffix = unit ? ` ${unit}` : ''
  if (value > 0) return `+${value}${suffix}`
  if (value < 0) return `${MINUS}${Math.abs(value)}${suffix}`
  return `0${suffix}`
}

/** «14 reps», «68 s», «12 / 11 reps». */
export function formatAssessmentValue(value: AssessmentValue, measure: AssessmentMeasure): string {
  const unit = UNIT[measure]
  return value.kind === 'single' ? `${value.value} ${unit}` : `${value.left} / ${value.right} ${unit}`
}

/**
 * «+3 reps», «−8 s», «No cambio», «Línea base», «Mixto · +2 / −1».
 * La unidad acompaña a las pruebas de un valor; por lados se leen los dos números.
 */
export function formatAssessmentDelta(delta: AssessmentDelta, measure: AssessmentMeasure): string {
  if (delta.kind === 'baseline') return 'Línea base'
  if (delta.trend === 'same') return 'No cambio'
  if (delta.kind === 'single') return signed(delta.diff, UNIT[measure])
  const pair = `${signed(delta.left)} / ${signed(delta.right)}`
  return delta.trend === 'mixed' ? `Mixto · ${pair}` : pair
}
