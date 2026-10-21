/**
 * Evaluación inicial (D-058): las preguntas de salud y la historia de
 * entrenamiento que un entrenador hace antes de la primera sesión.
 *
 * Las preguntas de salud son las siete del PAR-Q+ general. AXIS no diagnostica
 * nada: un «sí» solo pide que lo vea un médico y, mientras tanto, AXIS no
 * aprieta (sin días fuertes). La historia de entrenamiento decide si las
 * primeras sesiones empiezan con margen.
 */

import { isArrayOf, isOneOf, isRecord } from '../shared/guards'
import type { WorkoutSession } from '../workouts/types'

export type HealthQuestion =
  | 'corazon'
  | 'dolor_pecho'
  | 'mareos'
  | 'enfermedad_cronica'
  | 'medicacion'
  | 'huesos_articulaciones'
  | 'supervision'

export const HEALTH_QUESTION_LABELS: Record<HealthQuestion, string> = {
  corazon: '¿Te ha dicho un médico que tienes un problema de corazón o de tensión arterial?',
  dolor_pecho: '¿Notas dolor en el pecho en reposo, en tu día a día o al hacer ejercicio?',
  mareos: '¿Has perdido el equilibrio por un mareo, o el conocimiento, en los últimos 12 meses?',
  enfermedad_cronica: '¿Te han diagnosticado otra enfermedad crónica?',
  medicacion: '¿Tomas medicación para una enfermedad crónica?',
  huesos_articulaciones: '¿Tienes un problema de huesos, articulaciones o músculos que pueda empeorar con el ejercicio?',
  supervision: '¿Te ha dicho un médico que solo hagas ejercicio con supervisión?',
}

export const HEALTH_QUESTION_ORDER = Object.keys(HEALTH_QUESTION_LABELS) as HealthQuestion[]

export type HealthScreen = {
  /** Las preguntas contestadas con «sí». Vacío: todas «no». */
  flags: HealthQuestion[]
  /** El usuario dice que un médico le ha dado el visto bueno. */
  cleared: boolean
}

export type TrainingHistory = 'nunca' | 'menos_6_meses' | 'hasta_2_anos' | 'mas_2_anos'

export const TRAINING_HISTORY_LABELS: Record<TrainingHistory, string> = {
  nunca: 'Nunca he entrenado',
  menos_6_meses: 'Menos de 6 meses',
  hasta_2_anos: 'De 6 meses a 2 años',
  mas_2_anos: 'Más de 2 años',
}

export type TrainingStatus = 'entrenando' | 'parado_corto' | 'parado_largo'

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  entrenando: 'Entreno ahora',
  parado_corto: 'Lo dejé hace menos de 3 meses',
  parado_largo: 'Lo dejé hace más de 3 meses',
}

export type TrainingBackground = {
  history: TrainingHistory
  /** Sin sentido si nunca ha entrenado: se guarda como `parado_largo`. */
  status: TrainingStatus
}

/** Sesiones completadas con margen para quien empieza o vuelve tras un parón. */
export const RAMP_UP_SESSIONS = 6

/** `true` si alguna respuesta de salud fue «sí» y aún no hay visto bueno del médico. */
export function needsMedicalClearance(profile: { health?: HealthScreen } | null | undefined): boolean {
  const health = profile?.health
  return health !== undefined && health.flags.length > 0 && !health.cleared
}

/**
 * `true` si toca empezar con margen: quien nunca ha entrenado, o lo dejó hace
 * más de 3 meses, en sus primeras sesiones completadas.
 */
export function isRampUp(
  profile: { background?: TrainingBackground } | null | undefined,
  sessions: readonly WorkoutSession[],
): boolean {
  const background = profile?.background
  if (!background) return false
  if (background.history !== 'nunca' && background.status !== 'parado_largo') return false
  return sessions.filter((session) => session.status === 'completed').length < RAMP_UP_SESSIONS
}

export function isHealthScreen(value: unknown): value is HealthScreen {
  return (
    isRecord(value) &&
    isArrayOf(value.flags, (item): item is HealthQuestion => isOneOf(item, HEALTH_QUESTION_ORDER)) &&
    typeof value.cleared === 'boolean'
  )
}

export function isTrainingBackground(value: unknown): value is TrainingBackground {
  return (
    isRecord(value) &&
    isOneOf(value.history, Object.keys(TRAINING_HISTORY_LABELS) as TrainingHistory[]) &&
    isOneOf(value.status, Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[])
  )
}

// ---------------------------------------------------------------------------
// La evaluación inicial, paso a paso
// ---------------------------------------------------------------------------

export type EvaluationStepKey = 'salud' | 'historia' | 'test' | 'escaneo'

export type EvaluationStep = { key: EvaluationStepKey; label: string; detail: string; done: boolean }

/**
 * Los cuatro pasos de la evaluación inicial, en el orden de un entrenador:
 * salud, historia, línea base de fuerza y resistencia (el test de evolución,
 * D-021) y medidas y fotos (el escaneo, D-023).
 */
export function evaluationSteps(input: {
  profile: { health?: HealthScreen; background?: TrainingBackground } | null
  completedTests: number
  scans: number
}): EvaluationStep[] {
  const { profile, completedTests, scans } = input
  return [
    { key: 'salud', label: 'Salud', detail: 'Siete preguntas antes de apretar.', done: profile?.health !== undefined },
    { key: 'historia', label: 'Historia', detail: 'Cuánto llevas y si vienes de un parón.', done: profile?.background !== undefined },
    { key: 'test', label: 'Test de evolución', detail: 'Tu punto de partida de fuerza y resistencia.', done: completedTests > 0 },
    { key: 'escaneo', label: 'Escaneo corporal', detail: 'Tus medidas y fotos de partida.', done: scans > 0 },
  ]
}
