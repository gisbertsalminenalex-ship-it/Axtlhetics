/**
 * Cuándo se puede hacer el test de evolución (D-021).
 *
 * El test es un esfuerzo máximo, así que solo se ofrece un día en el que nada lo
 * desaconseja. Las condiciones llegan ya resueltas como datos: este módulo no
 * sabe de AXIS, de IndexedDB ni de la interfaz.
 */

import type { RecoveryBand } from '../recovery/types'
import { daysBetween, type DayKey } from '../shared/dates'
import { hadAssessmentEffortOn, inProgressAssessment, lastCompletedAssessment } from './assessment'
import { ASSESSMENT_INTERVAL_DAYS } from './protocol'
import type { Assessment } from './types'

export type AvailabilityInput = {
  today: DayKey
  assessments: readonly Assessment[]
  /** Hoy ya hay un entrenamiento registrado. */
  trainedToday: boolean
  /** Banda de recuperación de hoy. `null` con «datos insuficientes». */
  recoveryBand: RecoveryBand | null
  /** Deporte de intensidad alta hoy, haya terminado o no. */
  demandingActivityToday: boolean
  demandingActivityTomorrow: boolean
  /** El veredicto de AXIS para hoy es descansar. */
  axisRecommendsRest: boolean
}

/** Por qué no está disponible. Sirve para probar cada regla por separado. */
export type AssessmentBlock =
  | 'too_soon'
  | 'assessment_today'
  | 'trained_today'
  | 'recovery_unknown'
  | 'recovery_low'
  | 'demanding_activity_today'
  | 'demanding_activity_tomorrow'
  | 'axis_rest'

export type AssessmentAvailability =
  | { status: 'available' }
  /** Hay uno a medias hoy: se reanuda, aunque las condiciones hayan cambiado. */
  | { status: 'in_progress'; assessment: Assessment }
  | { status: 'unavailable'; blocks: AssessmentBlock[] }

export function assessmentAvailability(input: AvailabilityInput): AssessmentAvailability {
  const ongoing = inProgressAssessment(input.assessments, input.today)
  if (ongoing) return { status: 'in_progress', assessment: ongoing }

  const blocks: AssessmentBlock[] = []

  const last = lastCompletedAssessment(input.assessments)
  if (last && daysBetween(last.dayKey, input.today) < ASSESSMENT_INTERVAL_DAYS) blocks.push('too_soon')
  if (hadAssessmentEffortOn(input.assessments, input.today)) blocks.push('assessment_today')
  if (input.trainedToday) blocks.push('trained_today')
  if (input.recoveryBand === null) blocks.push('recovery_unknown')
  else if (input.recoveryBand === 'low') blocks.push('recovery_low')
  if (input.demandingActivityToday) blocks.push('demanding_activity_today')
  if (input.demandingActivityTomorrow) blocks.push('demanding_activity_tomorrow')
  if (input.axisRecommendsRest) blocks.push('axis_rest')

  return blocks.length === 0 ? { status: 'available' } : { status: 'unavailable', blocks }
}
