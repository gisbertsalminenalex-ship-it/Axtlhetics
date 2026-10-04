/**
 * El registro de un test de evolución (D-021).
 *
 * Una entidad propia, separada de `WorkoutSession`: un test no es un
 * entrenamiento y no debe llegar por descuido a la progresión, los récords, la
 * rotación ni la Carga, que leen las sesiones.
 *
 * El mismo registro sirve mientras el test está en curso y cuando termina: así
 * se reanuda tras recargar sin un segundo almacén.
 */

import type { RestWindow } from '../shared/rest'
import { isArrayOf, isDayKey, isIsoDate, isOneOf, isRecord } from '../shared/guards'
import type { DayKey } from '../shared/dates'
import {
  ASSESSMENT_PROTOCOL,
  isPushUpVariant,
  isValidAssessmentValue,
  type AssessmentMeasure,
  type AssessmentTestKey,
} from './protocol'

/**
 * - `in_progress`: se está haciendo.
 * - `completed`: las cuatro pruebas registradas. Lo único que se compara.
 * - `interrupted`: se salió a mitad. Cuenta como actividad del día, nunca como
 *   resultado comparable.
 *
 * «Disponible» y «no disponible» no se guardan: se calculan cada día.
 */
export type AssessmentStatus = 'in_progress' | 'completed' | 'interrupted'

export type AssessmentValue =
  | { kind: 'single'; value: number }
  | { kind: 'sides'; left: number; right: number }

export type AssessmentResult = {
  testKey: AssessmentTestKey
  /** El ejercicio con el que se hizo: la variante, en flexiones. */
  exerciseId: string
  measure: AssessmentMeasure
  loadKg: number | null
  values: AssessmentValue
  recordedAt: string
}

export type Assessment = {
  id: string
  protocolVersion: number
  dayKey: DayKey
  startedAt: string
  /** Cuándo se completó o se interrumpió. `null` en curso. */
  endedAt: string | null
  status: AssessmentStatus
  pushUpVariantId: string
  /** En el orden del protocolo: el siguiente por hacer es `results.length`. */
  results: AssessmentResult[]
  /** El lado izquierdo de una prueba por lados, mientras falta el derecho. */
  pendingLeft: number | null
  /** El descanso en curso entre pruebas. */
  rest: RestWindow | null
}

const STATUSES: readonly AssessmentStatus[] = ['in_progress', 'completed', 'interrupted']
const TEST_KEYS = ASSESSMENT_PROTOCOL.map((test) => test.key)
const MEASURES: readonly AssessmentMeasure[] = ['reps', 'seconds']

function isValue(value: unknown, measure: AssessmentMeasure): value is AssessmentValue {
  if (!isRecord(value)) return false
  if (value.kind === 'single') return isValidAssessmentValue(value.value, measure)
  if (value.kind === 'sides') {
    return isValidAssessmentValue(value.left, measure) && isValidAssessmentValue(value.right, measure)
  }
  return false
}

function isResult(value: unknown): value is AssessmentResult {
  return (
    isRecord(value) &&
    isOneOf(value.testKey, TEST_KEYS) &&
    typeof value.exerciseId === 'string' &&
    value.exerciseId.length > 0 &&
    isOneOf(value.measure, MEASURES) &&
    (value.loadKg === null || (typeof value.loadKg === 'number' && Number.isFinite(value.loadKg))) &&
    isValue(value.values, value.measure) &&
    isIsoDate(value.recordedAt)
  )
}

function isRest(value: unknown): value is RestWindow | null {
  return value === null || (isRecord(value) && isIsoDate(value.startedAt) && isIsoDate(value.endsAt))
}

/**
 * Comprueba un test leído de fuera (almacenamiento o copia de seguridad).
 *
 * Además de la forma, exige coherencia: los resultados siguen el orden del
 * protocolo y un test completado tiene exactamente las cuatro pruebas. Un
 * registro que no la cumple se descarta, porque compararlo daría números falsos.
 */
export function isAssessment(value: unknown): value is Assessment {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !Number.isInteger(value.protocolVersion) ||
    !isDayKey(value.dayKey) ||
    !isIsoDate(value.startedAt) ||
    !(value.endedAt === null || isIsoDate(value.endedAt)) ||
    !isOneOf(value.status, STATUSES) ||
    !isPushUpVariant(value.pushUpVariantId) ||
    !isArrayOf(value.results, isResult) ||
    !(value.pendingLeft === null || isValidAssessmentValue(value.pendingLeft, 'reps')) ||
    !isRest(value.rest)
  ) {
    return false
  }

  const results = value.results as AssessmentResult[]
  if (results.length > ASSESSMENT_PROTOCOL.length) return false
  const inOrder = results.every((result, index) => result.testKey === ASSESSMENT_PROTOCOL[index].key)
  if (!inOrder) return false

  if (value.status === 'completed') return results.length === ASSESSMENT_PROTOCOL.length
  if (value.status === 'in_progress') return value.endedAt === null
  return value.endedAt !== null
}
