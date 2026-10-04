/**
 * El test de evolución mientras se hace (D-021).
 *
 * Funciones puras e inmutables, como la sesión en curso: la interfaz solo guarda
 * lo que devuelven. El orden es fijo: prueba → resultado → descanso → siguiente.
 * Registrar la cuarta prueba completa el test.
 */

import type { DayKey } from '../shared/dates'
import { createId } from '../shared/ids'
import { extendRestWindow, REST_EXTENSION_SECONDS, restRemaining, startRestWindow, type RestState } from '../shared/rest'
import {
  ASSESSMENT_PROTOCOL,
  ASSESSMENT_PROTOCOL_VERSION,
  ASSESSMENT_REST_SECONDS,
  exerciseIdFor,
  isPushUpVariant,
  isValidAssessmentValue,
  type AssessmentTest,
} from './protocol'
import { isAssessment, type Assessment, type AssessmentValue } from './types'

export type AssessmentSide = 'left' | 'right'

export function startAssessment(options: {
  dayKey: DayKey
  pushUpVariantId: string
  now?: Date
  id?: string
}): Assessment | null {
  if (!isPushUpVariant(options.pushUpVariantId)) return null
  const now = options.now ?? new Date()
  return {
    id: options.id ?? createId(),
    protocolVersion: ASSESSMENT_PROTOCOL_VERSION,
    dayKey: options.dayKey,
    startedAt: now.toISOString(),
    endedAt: null,
    status: 'in_progress',
    pushUpVariantId: options.pushUpVariantId,
    results: [],
    pendingLeft: null,
    rest: null,
  }
}

/** La prueba que toca. `null` si el test ya no está en curso. */
export function currentTest(assessment: Assessment): AssessmentTest | null {
  if (assessment.status !== 'in_progress') return null
  return ASSESSMENT_PROTOCOL[assessment.results.length] ?? null
}

/** En una prueba por lados, el lado que toca registrar. */
export function currentSide(assessment: Assessment): AssessmentSide | null {
  const test = currentTest(assessment)
  if (!test?.perSide) return null
  return assessment.pendingLeft === null ? 'left' : 'right'
}

/**
 * Registra el resultado de la prueba (o del lado) que toca.
 *
 * Tras una prueba que no es la última arranca el descanso; entre los dos lados
 * de una misma prueba, no. Un valor no válido no cambia nada.
 */
export function recordResult(assessment: Assessment, value: number, now: Date = new Date()): Assessment {
  const test = currentTest(assessment)
  if (!test || !isValidAssessmentValue(value, test.measure)) return assessment

  if (test.perSide && assessment.pendingLeft === null) {
    return { ...assessment, pendingLeft: value, rest: null }
  }

  const values: AssessmentValue =
    test.perSide && assessment.pendingLeft !== null
      ? { kind: 'sides', left: assessment.pendingLeft, right: value }
      : { kind: 'single', value }

  const results = [
    ...assessment.results,
    {
      testKey: test.key,
      exerciseId: exerciseIdFor(test, assessment.pushUpVariantId),
      measure: test.measure,
      loadKg: test.loadKg,
      values,
      recordedAt: now.toISOString(),
    },
  ]

  const finished = results.length === ASSESSMENT_PROTOCOL.length
  return {
    ...assessment,
    results,
    pendingLeft: null,
    status: finished ? 'completed' : 'in_progress',
    endedAt: finished ? now.toISOString() : null,
    rest: finished ? null : startRestWindow(ASSESSMENT_REST_SECONDS, now),
  }
}

/** Vuelve al lado izquierdo para corregirlo. */
export function undoLeftSide(assessment: Assessment): Assessment {
  if (assessment.status !== 'in_progress' || assessment.pendingLeft === null) return assessment
  return { ...assessment, pendingLeft: null }
}

// ---------------------------------------------------------------------------
// Descanso: el mismo de D-019, con 2 minutos, «+15 s» y «Saltar»
// ---------------------------------------------------------------------------

export function assessmentRestState(assessment: Assessment, now: Date = new Date()): RestState | null {
  return assessment.status === 'in_progress' ? restRemaining(assessment.rest, now) : null
}

export function skipAssessmentRest(assessment: Assessment): Assessment {
  return assessment.rest ? { ...assessment, rest: null } : assessment
}

export function extendAssessmentRest(
  assessment: Assessment,
  seconds: number = REST_EXTENSION_SECONDS,
  now: Date = new Date(),
): Assessment {
  if (assessment.status !== 'in_progress' || !assessment.rest) return assessment
  const rest = extendRestWindow(assessment.rest, seconds, now)
  return rest ? { ...assessment, rest } : assessment
}

// ---------------------------------------------------------------------------
// Salir y reanudar
// ---------------------------------------------------------------------------

/** `true` si ya se registró algo: una prueba o un lado. */
function hasProgress(assessment: Assessment): boolean {
  return assessment.results.length > 0 || assessment.pendingLeft !== null
}

export type InterruptOutcome =
  | { kind: 'interrupted'; assessment: Assessment }
  /** No se registró nada: no queda rastro, igual que un entrenamiento sin series. */
  | { kind: 'discard' }

/**
 * Salir a mitad, ya confirmado. El test queda interrumpido: se guarda, cuenta
 * como actividad del día y nunca entra en una comparación.
 */
export function interruptAssessment(assessment: Assessment, now: Date = new Date()): InterruptOutcome {
  if (assessment.status !== 'in_progress') return { kind: 'interrupted', assessment }
  if (!hasProgress(assessment)) return { kind: 'discard' }
  return {
    kind: 'interrupted',
    assessment: { ...assessment, status: 'interrupted', endedAt: now.toISOString(), rest: null },
  }
}

export type StoredAssessmentOutcome =
  /** Del mismo día: se sigue donde se dejó. */
  | { kind: 'resume'; assessment: Assessment }
  /** De otro día con algo registrado: queda como interrumpido (o completado). */
  | { kind: 'archive'; assessment: Assessment }
  /** De otro día sin nada registrado, o con una forma que no se entiende. */
  | { kind: 'discard' }

/**
 * Qué hacer con un test que quedó en curso al cerrar la aplicación.
 *
 * El mismo día se reanuda. Otro día ya no: se aplica la regla de salir a mitad.
 * El instante de cierre es el del último resultado registrado, que es un dato
 * real; «ahora» inventaría un test de horas o días.
 */
export function reconcileStoredAssessment(stored: unknown, options: { today: DayKey }): StoredAssessmentOutcome {
  if (!isAssessment(stored) || stored.status !== 'in_progress') return { kind: 'discard' }
  if (stored.dayKey === options.today) return { kind: 'resume', assessment: stored }
  if (!hasProgress(stored)) return { kind: 'discard' }

  const last = stored.results[stored.results.length - 1]
  const outcome = interruptAssessment(stored, new Date(last?.recordedAt ?? stored.startedAt))
  return outcome.kind === 'interrupted' ? { kind: 'archive', assessment: outcome.assessment } : { kind: 'discard' }
}

// ---------------------------------------------------------------------------
// Consultas sobre el historial de tests
// ---------------------------------------------------------------------------

/** Del más reciente al más antiguo. No modifica la lista recibida. */
export function sortAssessments(assessments: readonly Assessment[]): Assessment[] {
  return [...assessments].sort((a, b) =>
    a.dayKey === b.dayKey ? b.startedAt.localeCompare(a.startedAt) : b.dayKey.localeCompare(a.dayKey),
  )
}

export function completedAssessments(assessments: readonly Assessment[]): Assessment[] {
  return sortAssessments(assessments).filter((assessment) => assessment.status === 'completed')
}

export function lastCompletedAssessment(assessments: readonly Assessment[]): Assessment | null {
  return completedAssessments(assessments)[0] ?? null
}

/** El test en curso de hoy, si lo hay. */
export function inProgressAssessment(assessments: readonly Assessment[], today: DayKey): Assessment | null {
  return (
    sortAssessments(assessments).find(
      (assessment) => assessment.status === 'in_progress' && assessment.dayKey === today,
    ) ?? null
  )
}

/**
 * `true` si ese día hubo esfuerzo de test: uno completado, uno interrumpido o uno
 * en curso con algo registrado. Es el hecho que AXIS trata como «ya has
 * entrenado hoy».
 */
export function hadAssessmentEffortOn(assessments: readonly Assessment[], day: DayKey): boolean {
  return assessments.some(
    (assessment) =>
      assessment.dayKey === day && (assessment.status !== 'in_progress' || hasProgress(assessment)),
  )
}

/**
 * La variante de flexiones del próximo test: la del último test completado, que
 * queda fijada; si no hay ninguno, `null` y se elige en la introducción.
 */
export function fixedPushUpVariant(assessments: readonly Assessment[]): string | null {
  return lastCompletedAssessment(assessments)?.pushUpVariantId ?? null
}
