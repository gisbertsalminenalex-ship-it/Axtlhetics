/**
 * Entrenamientos: lo que AXIS planifica y lo que el usuario hace realmente.
 *
 * La distinción es deliberada y estructural:
 *
 * - `PlannedSession` es la sesión **propuesta**.
 * - `WorkoutSession` es la sesión **realizada**, y es lo que se guarda en el historial.
 *
 * Una sesión realizada guarda además una instantánea de la propuesta que la originó y
 * las diferencias respecto a ella, para que el historial refleje lo que pasó de verdad.
 */

import { TRAINING_GOAL_ORDER, type TrainingGoal } from '../profile/types'
import type { DayKey } from '../shared/dates'
import {
  isArrayOf,
  isDayKey,
  isFiniteNumber,
  isIsoDate,
  isNullableNumber,
  isNullableString,
  isOneOf,
  isRecord,
} from '../shared/guards'

export type MuscleGroup =
  | 'pecho'
  | 'espalda'
  | 'hombros'
  | 'brazos'
  | 'core'
  | 'piernas'
  | 'gluteos'

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  hombros: 'Hombros',
  brazos: 'Brazos',
  core: 'Core',
  piernas: 'Piernas',
  gluteos: 'Glúteos',
}

/** Tipo de sesión. Determina qué grupos musculares entran en juego. */
export type SessionFocus =
  | 'tren_superior'
  | 'tren_inferior'
  | 'cuerpo_completo'
  | 'core_movilidad'
  /** Intervalos de resistencia (D-047). */
  | 'acondicionamiento'

export const SESSION_FOCUS_LABELS: Record<SessionFocus, string> = {
  tren_superior: 'Tren superior',
  tren_inferior: 'Tren inferior',
  cuerpo_completo: 'Cuerpo completo',
  core_movilidad: 'Core y movilidad',
  acondicionamiento: 'Acondicionamiento',
}

export const FOCUS_MUSCLE_GROUPS: Record<SessionFocus, MuscleGroup[]> = {
  tren_superior: ['pecho', 'espalda', 'hombros', 'brazos'],
  tren_inferior: ['piernas', 'gluteos'],
  cuerpo_completo: ['pecho', 'espalda', 'piernas', 'core'],
  core_movilidad: ['core'],
  acondicionamiento: ['piernas', 'core'],
}

export type SessionIntensity = 'ligera' | 'moderada' | 'alta'

/**
 * Lo que un ejercicio necesita. `superficie_elevada` no es material: es cualquier
 * superficie estable del entorno (una silla, un sofá, un escalón).
 *
 * Con pesas (D-046): `pesa` se cumple con cualquier peso, mancuerna o
 * kettlebell; `par_pesas`, con un par del mismo peso; `kettlebell`, solo con una
 * kettlebell. Qué tiene cada usuario lo dice su perfil (`workouts/equipment.ts`).
 */
export type Equipment =
  | 'ninguno'
  | 'superficie_elevada'
  | 'pesa'
  | 'par_pesas'
  | 'kettlebell'
  | 'barra_dominadas'
  | 'gomas'
  | 'banco'

/** Lo que pide carga externa: es lo que progresa en kg. */
export const LOAD_EQUIPMENT: readonly Equipment[] = ['pesa', 'par_pesas', 'kettlebell']

/**
 * Patrón de movimiento. Es lo que AXIS usa para equilibrar una sesión.
 *
 * `movilidad` (D-020) no carga: moviliza. Existía el objetivo «Mejorar
 * movilidad» y el foco «Core y movilidad», pero ningún ejercicio que lo fuera.
 */
export type ExerciseCategory =
  | 'empuje'
  | 'tiron'
  | 'piernas'
  | 'core'
  | 'movilidad'
  | 'pliometria'
  /** Por tiempo, para intervalos (D-047): solo en las sesiones de acondicionamiento. */
  | 'acondicionamiento'

export const FOCUS_CATEGORIES: Record<SessionFocus, ExerciseCategory[]> = {
  tren_superior: ['empuje', 'tiron'],
  tren_inferior: ['piernas'],
  cuerpo_completo: ['empuje', 'tiron', 'piernas', 'core'],
  core_movilidad: ['core', 'movilidad'],
  acondicionamiento: ['acondicionamiento'],
}

/** 1 = muy accesible, 5 = exigente. Ordena progresiones y regresiones. */
export type Difficulty = 1 | 2 | 3 | 4 | 5

export type StimulusType = 'fuerza' | 'resistencia' | 'estabilidad' | 'movilidad'

/** Parámetros de trabajo por defecto del ejercicio. */
export type WorkParams = {
  sets: number
  /** Repeticiones, o segundos cuando `isTimed` es `true`. */
  reps: number
  restSeconds: number
  /** Los isométricos (plancha) se miden en segundos, no en repeticiones. */
  isTimed: boolean
  /** Cadencia sugerida, cuando aporta algo. `3-1-1` = bajada, pausa, subida. */
  tempo: string | null
}

export type Exercise = {
  id: string
  name: string
  category: ExerciseCategory
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  /** Todo lo que hace falta para ejecutarlo. Vacío nunca: al menos `ninguno`. */
  equipment: Equipment[]
  /** Se ejecuta un lado cada vez. Con una sola pesa, es la forma de cargar bien. */
  unilateral: boolean
  difficulty: Difficulty
  /** Variante más exigente, si existe. */
  progressionId: string | null
  /** Variante más accesible, si existe. */
  regressionId: string | null
  stimulus: StimulusType
  instructions: string
  work: WorkParams
  imageUrl: string | null
  /**
   * Variantes del mismo patrón: dos ejercicios con la misma familia son casi lo
   * mismo («Zancadas» y «Zancada atrás») y AXIS evita juntarlos en una sesión si
   * hay alternativas (D-020.1). Sin familia, el ejercicio no comparte nada con
   * nadie. Es solo del catálogo: las sesiones guardadas no la llevan.
   */
  family?: string
  /** Solo para la activación del calentamiento (D-045): nunca se elige como entrenamiento. */
  warmupOnly?: boolean
  /**
   * Con carga (D-046): los kg de partida de un principiante, por mano. AXIS
   * empieza por el peso más pesado del usuario que no la pase.
   */
  startLoadKg?: number
}

/** `true` si el ejercicio admite progresión por carga externa. */
export function usesLoad(exercise: Pick<Exercise, 'equipment'>): boolean {
  return exercise.equipment.some((item) => LOAD_EQUIPMENT.includes(item))
}

/**
 * El calentamiento y la vuelta a la calma (D-032): ejercicios de movilidad que
 * abren y cierran la sesión. Preparan y relajan; no son el entrenamiento, así
 * que no progresan ni cuentan para la rotación, los récords o los saltados.
 */
export type ExercisePhase = 'calentamiento' | 'vuelta_calma'

export const EXERCISE_PHASE_LABELS: Record<ExercisePhase, string> = {
  calentamiento: 'Calentamiento',
  vuelta_calma: 'Vuelta a la calma',
}

export function isExercisePhase(value: unknown): value is ExercisePhase {
  return value === 'calentamiento' || value === 'vuelta_calma'
}

/**
 * Las tres partes del calentamiento (D-045): activar el cuerpo, mover las
 * articulaciones y unas pocas repeticiones suaves de lo que se va a entrenar.
 */
export type WarmupPart = 'activacion' | 'movilidad' | 'aproximacion'

export const WARMUP_PART_LABELS: Record<WarmupPart, string> = {
  activacion: 'Activación',
  movilidad: 'Movilidad articular',
  aproximacion: 'Series de aproximación',
}

export function isWarmupPart(value: unknown): value is WarmupPart {
  return value === 'activacion' || value === 'movilidad' || value === 'aproximacion'
}

/** «Calentamiento · Activación», o solo la fase en las sesiones de antes de D-045. */
export function phaseLabel(item: { phase?: ExercisePhase; warmupPart?: WarmupPart }): string | null {
  if (!item.phase) return null
  const phase = EXERCISE_PHASE_LABELS[item.phase]
  return item.warmupPart ? `${phase} · ${WARMUP_PART_LABELS[item.warmupPart]}` : phase
}

/** `true` si el ejercicio es parte del entrenamiento y no del calentamiento o la vuelta a la calma. */
export function isMainExercise(exercise: { phase?: ExercisePhase }): boolean {
  return exercise.phase === undefined
}

/** Un ejercicio tal y como AXIS lo propone. */
export type PlannedExercise = {
  exerciseId: string
  name: string
  sets: number
  /** Repeticiones, o segundos si `isTimed`. */
  reps: number
  isTimed: boolean
  /** Carga sugerida. `null` en los ejercicios de peso corporal. */
  suggestedWeightKg: number | null
  restSeconds: number
  unilateral: boolean
  tempo: string | null
  imageUrl: string | null
  /** Ausente en el entrenamiento; presente en el calentamiento y la vuelta a la calma (D-032). */
  phase?: ExercisePhase
  /** La parte del calentamiento (D-045). */
  warmupPart?: WarmupPart
}

/** Una sesión concreta y estructurada, no un titular. */
export type PlannedSession = {
  focus: SessionFocus
  /** Título mostrado en la interfaz: `Fuerza · Tren superior`. */
  title: string
  intensity: SessionIntensity
  estimatedMinutes: number
  muscleGroups: MuscleGroup[]
  exercises: PlannedExercise[]
  /** `true` en una semana de descarga (D-031): una serie menos y sin subir. */
  deload?: boolean
  /** El objetivo al que sirve la sesión (D-047). Ausente en las anteriores. */
  goal?: TrainingGoal
}

// ---------------------------------------------------------------------------
// Sesión realizada
// ---------------------------------------------------------------------------

export type CompletedSet = {
  reps: number
  weightKg: number | null
  completed: boolean
  /** Cuántas quedaban en esta serie (D-055). Ausente si no se contestó o no se preguntó. */
  reserve?: RepsInReserve
}

/**
 * Cuántas repeticiones quedaban en la última serie (D-052): ninguna (al fallo),
 * una o dos, o tres o más.
 */
export type RepsInReserve = 'ninguna' | 'una_dos' | 'tres_mas'

export const REPS_IN_RESERVE_LABELS: Record<RepsInReserve, string> = {
  ninguna: '0',
  una_dos: '1–2',
  tres_mas: '3 o más',
}

export const REPS_IN_RESERVE_ORDER = Object.keys(REPS_IN_RESERVE_LABELS) as RepsInReserve[]

export function isRepsInReserve(value: unknown): value is RepsInReserve {
  return isOneOf(value, REPS_IN_RESERVE_ORDER)
}

export type PerformedExercise = {
  exerciseId: string
  name: string
  sets: CompletedSet[]
  /** Cuántas quedaban en la última serie (D-052). Ausente si no se contestó. */
  reserve?: RepsInReserve
  /**
   * Lo que estaba previsto para el ejercicio: series y repeticiones (o segundos).
   * Sin esto no se puede saber si se hizo entero, y la progresión subiría carga
   * tras un ejercicio a medias (D-019). Las sesiones anteriores no lo tienen.
   */
  targetSets?: number
  targetReps?: number
  /** Calentamiento o vuelta a la calma (D-032). Ausente en el entrenamiento y en las sesiones anteriores. */
  phase?: ExercisePhase
  /** La parte del calentamiento (D-045). */
  warmupPart?: WarmupPart
}

/**
 * `true` si el ejercicio se hizo como estaba previsto: todas las series, ninguna
 * por debajo del objetivo. Sin objetivo guardado —sesiones anteriores a D-019—
 * solo se puede mirar si cada serie quedó marcada como completada.
 */
export function metTarget(exercise: PerformedExercise): boolean {
  if (exercise.sets.length === 0) return false
  if (!exercise.sets.every((set) => set.completed)) return false
  if (exercise.targetSets !== undefined && exercise.sets.length < exercise.targetSets) return false
  if (exercise.targetReps !== undefined && exercise.sets.some((set) => set.reps < exercise.targetReps!)) {
    return false
  }
  return true
}

/**
 * Diferencias entre lo que AXIS propuso y lo que ocurrió. Se guardan como datos,
 * no como texto, para que AXIS pueda aprender de ellas más adelante.
 */
export type SessionModificationKind =
  | 'proposal_changed'
  | 'exercise_skipped'
  | 'session_shortened'
  | 'session_abandoned'

export type SessionModification = {
  kind: SessionModificationKind
  detail: string
}

/**
 * Instantánea mínima de la propuesta que originó la sesión.
 *
 * Es una copia, no una referencia: si la lógica de AXIS cambia mañana, el
 * historial sigue contando qué se recomendó aquel día. Resuelve además el
 * requisito de «rutina utilizada» del Documento Maestro (`P-002`).
 */
export type ProposalSnapshot = {
  proposalId: string
  type: string
  headline: string
  reason: string
  focus: SessionFocus | null
  intensity: SessionIntensity | null
  /**
   * `true` si la sesión era de una semana de descarga (D-031). Es lo que
   * permite reconocerla después y no encadenar dos. Ausente en las anteriores.
   */
  deload?: boolean
}

export type WorkoutSessionStatus = 'completed' | 'abandoned'

/** Escala de esfuerzo (D-019). La Carga la usa: 1 suma menos, 5 suma más. */
export const EFFORT_LEVELS = [1, 2, 3, 4, 5] as const

export const EFFORT_LABELS: Record<(typeof EFFORT_LEVELS)[number], string> = {
  1: 'Muy fácil',
  2: 'Fácil',
  3: 'Moderado',
  4: 'Duro',
  5: 'Al límite',
}

export type WorkoutSession = {
  id: string
  /** Día local al que pertenece la sesión. La clave de ordenación del historial. */
  dayKey: DayKey
  startedAt: string
  completedAt: string | null
  durationSeconds: number
  focus: SessionFocus
  title: string
  intensity: SessionIntensity
  muscleGroups: MuscleGroup[]
  exercises: PerformedExercise[]
  /** Volumen total en kg, precalculado al cerrar la sesión. */
  totalVolumeKg: number
  status: WorkoutSessionStatus
  /**
   * Cómo se sintió el usuario, 1–5 (1 = muy mal). Es el dato que se pedía antes
   * de D-019; se conserva tal cual, pero ya no se escribe ni lo lee la Carga: no
   * es esfuerzo, y leerlo como tal invertía el cálculo.
   */
  perceivedEffort: number | null
  /**
   * Cuánto costó la sesión, 1–5 (1 = muy fácil, 5 = al límite). Es lo que usa
   * la Carga (D-019). Ausente o `null` si no se indicó.
   */
  effort?: number | null
  proposal: ProposalSnapshot | null
  modifications: SessionModification[]
  notes: string | null
  /** El objetivo al que sirvió (D-047). Ausente en las anteriores. */
  goal?: TrainingGoal
}

export function volumeOfExercise(exercise: PerformedExercise): number {
  return exercise.sets.reduce((total, set) => {
    if (!set.completed || set.weightKg === null) return total
    return total + set.reps * set.weightKg
  }, 0)
}

export function volumeOfSession(exercises: PerformedExercise[]): number {
  return exercises.reduce((total, exercise) => total + volumeOfExercise(exercise), 0)
}


// ---------------------------------------------------------------------------
// Comprobación de forma
//
// Una sesión importada de un archivo entra directa en el historial, y de ahí
// pasa a la Carga, al gráfico del Historial y a lo que AXIS da por hecho que
// entrenaste. Si algo no cuadra, no entra.
// ---------------------------------------------------------------------------

const SESSION_FOCUSES = Object.keys(SESSION_FOCUS_LABELS) as SessionFocus[]
const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]
const SESSION_INTENSITIES: readonly SessionIntensity[] = ['ligera', 'moderada', 'alta']
const SESSION_STATUSES: readonly WorkoutSessionStatus[] = ['completed', 'abandoned']

function isMuscleGroupValue(value: unknown): value is MuscleGroup {
  return isOneOf(value, MUSCLE_GROUPS)
}

function isCompletedSetValue(value: unknown): value is CompletedSet {
  return (
    isRecord(value) &&
    isFiniteNumber(value.reps) &&
    isNullableNumber(value.weightKg) &&
    typeof value.completed === 'boolean' &&
    (value.reserve === undefined || isRepsInReserve(value.reserve))
  )
}

function isOptionalCount(value: unknown): boolean {
  return value === undefined || (isFiniteNumber(value) && value >= 0)
}

function isPerformedExercise(value: unknown): value is PerformedExercise {
  return (
    isRecord(value) &&
    typeof value.exerciseId === 'string' &&
    typeof value.name === 'string' &&
    isArrayOf(value.sets, isCompletedSetValue) &&
    isOptionalCount(value.targetSets) &&
    isOptionalCount(value.targetReps) &&
    (value.phase === undefined || isExercisePhase(value.phase)) &&
    (value.warmupPart === undefined || isWarmupPart(value.warmupPart)) &&
    (value.reserve === undefined || isRepsInReserve(value.reserve))
  )
}

/** Esfuerzo 1–5, o ausente o `null` (sesiones anteriores a D-019, o sin valorar). */
export function isEffortValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5
}

function isSessionModification(value: unknown): value is SessionModification {
  return isRecord(value) && typeof value.kind === 'string' && typeof value.detail === 'string'
}

function isProposalSnapshotValue(value: unknown): value is ProposalSnapshot {
  return (
    isRecord(value) &&
    typeof value.proposalId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.headline === 'string' &&
    typeof value.reason === 'string' &&
    (value.deload === undefined || typeof value.deload === 'boolean')
  )
}

export function isWorkoutSession(value: unknown): value is WorkoutSession {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !isDayKey(value.dayKey)) return false
  if (!isIsoDate(value.startedAt)) return false
  if (value.completedAt !== null && !isIsoDate(value.completedAt)) return false
  if (!isFiniteNumber(value.durationSeconds) || value.durationSeconds < 0) return false
  if (!isOneOf(value.focus, SESSION_FOCUSES)) return false
  if (typeof value.title !== 'string') return false
  if (!isOneOf(value.intensity, SESSION_INTENSITIES)) return false
  if (!isArrayOf(value.muscleGroups, isMuscleGroupValue)) return false
  if (!isArrayOf(value.exercises, isPerformedExercise)) return false
  if (!isFiniteNumber(value.totalVolumeKg) || value.totalVolumeKg < 0) return false
  if (!isOneOf(value.status, SESSION_STATUSES)) return false
  if (!isNullableNumber(value.perceivedEffort)) return false
  if (!isEffortValue(value.effort)) return false
  if (value.proposal !== null && !isProposalSnapshotValue(value.proposal)) return false
  if (!isArrayOf(value.modifications, isSessionModification)) return false
  if (value.goal !== undefined && !isOneOf(value.goal, TRAINING_GOAL_ORDER)) return false
  return isNullableString(value.notes)
}
