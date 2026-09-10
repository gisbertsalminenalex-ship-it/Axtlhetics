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

import type { DayKey } from '../shared/dates'

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

export const SESSION_FOCUS_LABELS: Record<SessionFocus, string> = {
  tren_superior: 'Tren superior',
  tren_inferior: 'Tren inferior',
  cuerpo_completo: 'Cuerpo completo',
  core_movilidad: 'Core y movilidad',
}

export const FOCUS_MUSCLE_GROUPS: Record<SessionFocus, MuscleGroup[]> = {
  tren_superior: ['pecho', 'espalda', 'hombros', 'brazos'],
  tren_inferior: ['piernas', 'gluteos'],
  cuerpo_completo: ['pecho', 'espalda', 'piernas', 'core'],
  core_movilidad: ['core'],
}

export type SessionIntensity = 'ligera' | 'moderada' | 'alta'

/**
 * Equipamiento. `superficie_elevada` no es material: es cualquier superficie estable
 * del entorno (una silla, un sofá, un escalón).
 */
export type Equipment = 'ninguno' | 'pesa' | 'superficie_elevada'

/** Patrón de movimiento. Es lo que AXIS usa para equilibrar una sesión. */
export type ExerciseCategory = 'empuje' | 'tiron' | 'piernas' | 'core'

export const FOCUS_CATEGORIES: Record<SessionFocus, ExerciseCategory[]> = {
  tren_superior: ['empuje', 'tiron'],
  tren_inferior: ['piernas'],
  cuerpo_completo: ['empuje', 'tiron', 'piernas', 'core'],
  core_movilidad: ['core'],
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
}

/** `true` si el ejercicio admite progresión por carga externa. */
export function usesLoad(exercise: Exercise): boolean {
  return exercise.equipment.includes('pesa')
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
}

// ---------------------------------------------------------------------------
// Sesión realizada
// ---------------------------------------------------------------------------

export type CompletedSet = {
  reps: number
  weightKg: number | null
  completed: boolean
}

export type PerformedExercise = {
  exerciseId: string
  name: string
  sets: CompletedSet[]
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
}

export type WorkoutSessionStatus = 'completed' | 'abandoned'

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
  /** Cómo se sintió el usuario, 1–5. `null` si no lo indicó. */
  perceivedEffort: number | null
  proposal: ProposalSnapshot | null
  modifications: SessionModification[]
  notes: string | null
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

