/**
 * Evaluación inicial (D-058): las preguntas de salud y la historia de
 * entrenamiento que un entrenador hace antes de la primera sesión.
 *
 * La salud se cuenta con palabras (D-064): «no tengo ningún problema» o lo que
 * el usuario escriba, que AXIS lee (`health-note.ts`) y convierte en señales
 * —las siete situaciones del PAR-Q+ general— y en zonas a cuidar. AXIS no
 * diagnostica nada: una señal solo pide que lo vea un médico y, mientras tanto,
 * AXIS no aprieta (sin días fuertes). La historia de entrenamiento decide si las
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

/** Cómo se nombra cada señal al contarle al usuario lo que AXIS ha entendido. */
export const HEALTH_QUESTION_LABELS: Record<HealthQuestion, string> = {
  corazon: 'corazón o tensión arterial',
  dolor_pecho: 'dolor en el pecho',
  mareos: 'mareos o pérdidas de conocimiento',
  enfermedad_cronica: 'una enfermedad crónica',
  medicacion: 'medicación',
  huesos_articulaciones: 'una lesión de huesos, articulaciones o músculos',
  supervision: 'ejercicio con supervisión',
}

export const HEALTH_QUESTION_ORDER = Object.keys(HEALTH_QUESTION_LABELS) as HealthQuestion[]

/** Lo más largo que se acepta como nota de salud. */
export const MAX_HEALTH_NOTE_LENGTH = 600

export type HealthScreen = {
  /** Las señales que AXIS leyó (antes de D-064, las preguntas contestadas con «sí»). Vacío: ninguna. */
  flags: HealthQuestion[]
  /** El usuario dice que un médico le ha dado el visto bueno. */
  cleared: boolean
  /** Lo que el usuario escribió (D-064). Ausente: «no tengo ningún problema», o un perfil anterior. */
  note?: string
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
    typeof value.cleared === 'boolean' &&
    (value.note === undefined || (typeof value.note === 'string' && value.note.length <= MAX_HEALTH_NOTE_LENGTH))
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
    { key: 'salud', label: 'Salud', detail: 'Lo que AXIS debe saber antes de apretar.', done: profile?.health !== undefined },
    { key: 'historia', label: 'Historia', detail: 'Cuánto llevas y si vienes de un parón.', done: profile?.background !== undefined },
    { key: 'test', label: 'Test de evolución', detail: 'Tu punto de partida de fuerza y resistencia.', done: completedTests > 0 },
    { key: 'escaneo', label: 'Escaneo corporal', detail: 'Tus medidas y fotos de partida.', done: scans > 0 },
  ]
}
