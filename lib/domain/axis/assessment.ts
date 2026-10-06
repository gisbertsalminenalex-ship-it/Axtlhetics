/**
 * Lo que AXIS sabe de los tests de evolución (D-021).
 *
 * AXIS no lee el almacén ni compara resultados: recibe los tests como datos del
 * contexto y aquí se traducen a lo poco que necesita saber. Si hoy hubo test,
 * si hay uno a medias y si el siguiente está disponible y, si no, por qué.
 *
 * La regla de disponibilidad no vive aquí: es del dominio del test
 * (`assessmentAvailability`). Este módulo solo le pasa los hechos del día que AXIS
 * ya conoce. La comparación tampoco: AXIS no la necesita para decidir.
 */

import { completedAssessments, lastCompletedAssessment } from '../assessment/assessment'
import {
  assessmentAvailability,
  type AssessmentBlock,
  type AssessmentAvailability,
} from '../assessment/availability'
import { ASSESSMENT_INTERVAL_DAYS } from '../assessment/protocol'
import type { Assessment } from '../assessment/types'
import { addDays, type DayKey } from '../shared/dates'
import type { AxisContext, AxisDecision, AxisFacts } from './types'
import { isTrainingRecommendation } from './types'

/** Los tests de un día, por estado. */
export type AssessmentDayFacts = {
  assessmentCompletedToday: boolean
  /** Uno empezado hoy y sin terminar: se reanuda, no se repite. */
  assessmentInProgressToday: boolean
  assessmentInterruptedToday: boolean
}

export function assessmentDayFacts(
  assessments: readonly Assessment[],
  dayKey: DayKey,
): AssessmentDayFacts {
  const today = assessments.filter((assessment) => assessment.dayKey === dayKey)
  return {
    assessmentCompletedToday: today.some((assessment) => assessment.status === 'completed'),
    assessmentInProgressToday: today.some((assessment) => assessment.status === 'in_progress'),
    assessmentInterruptedToday: today.some((assessment) => assessment.status === 'interrupted'),
  }
}

/**
 * `true` si hoy hubo un test completado o interrumpido: actividad física del día
 * para AXIS (D-021). Un test que no llegó a registrar nada no se guarda, así que
 * no puede contar.
 */
export function hadAssessmentActivity(facts: AssessmentDayFacts): boolean {
  return facts.assessmentCompletedToday || facts.assessmentInterruptedToday
}

/** Lo mismo, directamente desde el contexto, para quien no tiene los hechos a mano. */
export function assessmentActivityOn(context: AxisContext): boolean {
  return hadAssessmentActivity(assessmentDayFacts(context.assessments ?? [], context.dayKey))
}

export type AxisAssessmentStatus = {
  /** `available`, `in_progress` (se reanuda) o `unavailable`. */
  status: AssessmentAvailability['status']
  /** Por qué no está disponible, en orden. Vacío si lo está. */
  reasons: AssessmentBlock[]
  /** Día del último test completado, o `null` si nunca se ha completado ninguno. */
  lastCompletedDay: DayKey | null
  /** Primer día en que se cumplen los 28 días desde ese test, o `null` sin test anterior. */
  nextEligibleDay: DayKey | null
  completedCount: number
}

/**
 * La disponibilidad del test hoy, con los hechos que AXIS ya conoce.
 *
 * - **Descanso**: es la decisión del motor (`decision.primary`), no la elección del
 *   usuario. Si el usuario eligió descansar sobre una propuesta de entrenar, eso
 *   no bloquea el test (D-021, decisión 6).
 * - **Deporte exigente hoy**: cuenta aunque ya haya terminado. Uno cancelado hoy no.
 * - **Recuperación sin datos**: no está disponible. Sin datos no se sabe si es baja,
 *   y el test es un esfuerzo máximo: no se asume nada.
 */
export function assessmentStatusFor(
  context: AxisContext,
  facts: AxisFacts,
  decision: AxisDecision,
): AxisAssessmentStatus {
  const assessments = context.assessments ?? []
  const score = context.recoveryScore
  const availability = assessmentAvailability({
    today: context.dayKey,
    assessments,
    trainedToday: facts.trainedToday,
    recoveryBand: score && score.status === 'ok' ? score.band : null,
    demandingActivityToday: facts.todayActivities.some((activity) => activity.intensity === 'alta'),
    demandingActivityTomorrow: facts.tomorrowActivities.some((activity) => activity.intensity === 'alta'),
    axisRecommendsRest: !isTrainingRecommendation(decision.primary.type),
  })

  const last = lastCompletedAssessment(assessments)
  return {
    status: availability.status,
    reasons: availability.status === 'unavailable' ? availability.blocks : [],
    lastCompletedDay: last?.dayKey ?? null,
    nextEligibleDay: last ? addDays(last.dayKey, ASSESSMENT_INTERVAL_DAYS) : null,
    completedCount: completedAssessments(assessments).length,
  }
}
