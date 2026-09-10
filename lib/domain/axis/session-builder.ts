/**
 * Generación de sesiones estructuradas.
 *
 * AXIS no elige entre rutinas preescritas: construye la sesión a partir del foco, la
 * intensidad, el tiempo disponible, el equipamiento real y el historial.
 *
 * Dos ideas sostienen todo:
 *
 * 1. **Solo se proponen ejercicios ejecutables.** Un ejercicio que necesita material
 *    inexistente no entra en el pool, punto.
 * 2. **La progresión no es solo carga.** Con una única pesa de 5 kg no se puede subir
 *    peso indefinidamente, así que el sistema progresa por repeticiones y, cuando el
 *    ejercicio se domina, cambiando a una variante más exigente.
 */

import type { ExperienceLevel, TrainingGoal } from '../profile/types'
import { clamp } from '../shared/ids'
import {
  AVAILABLE_EQUIPMENT,
  closestToDifficulty,
  exercisesAvoidingGroups,
  exercisesForFocus,
  isAvailable,
  LOAD_STEP_KG,
  MAX_AVAILABLE_LOAD_KG,
  variantOf,
} from '../workouts/catalog'
import type {
  Difficulty,
  Equipment,
  Exercise,
  ExerciseCategory,
  MuscleGroup,
  PlannedExercise,
  PlannedSession,
  SessionFocus,
  SessionIntensity,
  WorkoutSession,
} from '../workouts/types'
import { FOCUS_CATEGORIES, FOCUS_MUSCLE_GROUPS, SESSION_FOCUS_LABELS, usesLoad } from '../workouts/types'

export const DEFAULT_GOAL: TrainingGoal = 'salud_general'
export const DEFAULT_GOALS: readonly TrainingGoal[] = [DEFAULT_GOAL]
export const DEFAULT_EXPERIENCE: ExperienceLevel = 'principiante'

/** Dificultad de partida según la experiencia declarada. */
const BASE_DIFFICULTY: Record<ExperienceLevel, Difficulty> = {
  principiante: 1,
  intermedio: 2,
  avanzado: 3,
}

/** La intensidad del día mueve la dificultad objetivo arriba o abajo. */
const DIFFICULTY_SHIFT: Record<SessionIntensity, number> = {
  ligera: -1,
  moderada: 0,
  alta: 1,
}

/** Series añadidas o quitadas respecto a las del propio ejercicio. */
const SET_SHIFT: Record<SessionIntensity, number> = {
  ligera: -1,
  moderada: 0,
  alta: 1,
}

const MIN_SETS = 2
const MAX_SETS_BY_EXPERIENCE: Record<ExperienceLevel, number> = {
  principiante: 3,
  intermedio: 4,
  avanzado: 5,
}

/**
 * Cómo estira o encoge el objetivo las repeticiones propias del ejercicio.
 * Multiplica, no sustituye: una sentadilla y una flexión diamante no comparten rango.
 */
const REP_FACTOR_BY_GOAL: Record<TrainingGoal, number> = {
  fuerza: 0.7,
  hipertrofia: 1,
  resistencia: 1.3,
  rendimiento_deportivo: 0.9,
  movilidad: 1.3,
  tecnica: 1,
  salud_general: 1,
}

/**
 * Combina varios objetivos en un único factor de repeticiones.
 *
 * Se hace con la **media** de sus factores, y esa elección es deliberada: el
 * usuario ha dicho que quiere las tres cosas a la vez, no que una mande sobre las
 * otras. Promediar trata todos los objetivos por igual y, sobre todo, **no depende
 * del orden en que se seleccionaron** — que sería una prioridad inventada.
 *
 * Con un solo objetivo el resultado es exactamente el factor de ese objetivo, así
 * que el comportamiento anterior se conserva.
 */
export function blendedRepFactor(goals: readonly TrainingGoal[]): number {
  const known = goals.filter((goal) => goal in REP_FACTOR_BY_GOAL)
  if (known.length === 0) return REP_FACTOR_BY_GOAL[DEFAULT_GOAL]

  const total = known.reduce((sum, goal) => sum + REP_FACTOR_BY_GOAL[goal], 0)
  return total / known.length
}

/** Minutos que se asume que ocupa un ejercicio completo. */
const MINUTES_PER_EXERCISE = 10
const MIN_EXERCISES = 3
const MAX_EXERCISES = 6

/** Cuánto sube cada progresión por repeticiones. */
export const REP_PROGRESSION_STEP = 2
/** En isométricos se progresa en segundos. */
export const HOLD_PROGRESSION_STEP = 5

/**
 * Techo de repeticiones antes de considerar el ejercicio dominado. A partir de ahí
 * la progresión deja de ser «más repeticiones» y pasa a ser «variante más difícil».
 */
export const REP_PROGRESSION_CAP_FACTOR = 1.6

export type SessionBuildOptions = {
  focus: SessionFocus
  intensity: SessionIntensity
  availableMinutes: number
  goals: readonly TrainingGoal[]
  experience: ExperienceLevel
  /** Grupos que la sesión debe evitar, por ejemplo por una actividad fija cercana. */
  avoidMuscleGroups?: readonly MuscleGroup[]
  catalog?: readonly Exercise[]
  equipment?: readonly Equipment[]
  /** Historial reciente, de la sesión más nueva a la más antigua. */
  history?: readonly WorkoutSession[]
}

export function exerciseCountFor(availableMinutes: number): number {
  const raw = Math.floor(availableMinutes / MINUTES_PER_EXERCISE)
  return clamp(raw, MIN_EXERCISES, MAX_EXERCISES)
}

export function targetDifficultyFor(
  experience: ExperienceLevel,
  intensity: SessionIntensity,
): Difficulty {
  const base = BASE_DIFFICULTY[experience] ?? BASE_DIFFICULTY[DEFAULT_EXPERIENCE]
  return clamp(base + DIFFICULTY_SHIFT[intensity], 1, 5) as Difficulty
}

// ---------------------------------------------------------------------------
// Historial y progresión
// ---------------------------------------------------------------------------

export type LastPerformance = {
  weightKg: number | null
  reps: number
  allSetsCompleted: boolean
  sets: number
}

export function lastPerformanceOf(
  exerciseId: string,
  history: readonly WorkoutSession[],
): LastPerformance | null {
  for (const session of history) {
    if (session.status !== 'completed') continue
    const performed = session.exercises.find((item) => item.exerciseId === exerciseId)
    if (!performed || performed.sets.length === 0) continue

    const weights = performed.sets
      .map((set) => set.weightKg)
      .filter((weight): weight is number => weight !== null)

    return {
      weightKg: weights.length > 0 ? Math.max(...weights) : null,
      reps: Math.max(...performed.sets.map((set) => set.reps)),
      allSetsCompleted: performed.sets.every((set) => set.completed),
      sets: performed.sets.length,
    }
  }
  return null
}

/** Repeticiones a partir de las cuales el ejercicio se considera dominado. */
export function repCapFor(exercise: Exercise): number {
  return Math.round(exercise.work.reps * REP_PROGRESSION_CAP_FACTOR)
}

/**
 * `true` si la última vez se completó todo y ya se está en el techo de repeticiones.
 * Es la señal para pasar a la variante más exigente, no para subir más el peso.
 */
export function hasMastered(
  exercise: Exercise,
  history: readonly WorkoutSession[],
): boolean {
  const last = lastPerformanceOf(exercise.id, history)
  if (!last || !last.allSetsCompleted) return false
  return last.reps >= repCapFor(exercise)
}

export type SuggestedWork = {
  sets: number
  reps: number
  weightKg: number | null
}

/**
 * Parámetros de trabajo del ejercicio para hoy.
 *
 * Progresión, en este orden:
 *
 * 1. Si la última vez no se completó todo → se repiten los mismos parámetros.
 * 2. Si el ejercicio usa pesa y aún queda margen de carga → sube la carga.
 * 3. En cualquier otro caso → sube repeticiones (o segundos en los isométricos).
 *
 * Nunca se sugiere una carga por encima de la pesa que existe.
 */
export function suggestWorkFor(
  exercise: Exercise,
  options: {
    intensity: SessionIntensity
    goals: readonly TrainingGoal[]
    experience: ExperienceLevel
    history?: readonly WorkoutSession[]
  },
): SuggestedWork {
  const { intensity, goals, experience, history = [] } = options

  const maxSets = MAX_SETS_BY_EXPERIENCE[experience] ?? MAX_SETS_BY_EXPERIENCE[DEFAULT_EXPERIENCE]
  const sets = clamp(exercise.work.sets + SET_SHIFT[intensity], MIN_SETS, maxSets)

  const repFactor = blendedRepFactor(goals)
  // Los isométricos se miden en segundos: el objetivo no debe recortarlos como si
  // fueran repeticiones.
  const baseReps = exercise.work.isTimed
    ? exercise.work.reps
    : Math.max(5, Math.round(exercise.work.reps * repFactor))

  const loaded = usesLoad(exercise)
  const baseWeight = loaded ? MAX_AVAILABLE_LOAD_KG : null

  const last = lastPerformanceOf(exercise.id, history)
  if (!last) {
    return { sets, reps: baseReps, weightKg: baseWeight }
  }

  const lastWeight = loaded ? (last.weightKg ?? baseWeight) : null
  const lastReps = Math.max(baseReps, last.reps)

  if (!last.allSetsCompleted) {
    return { sets, reps: lastReps, weightKg: lastWeight }
  }

  if (loaded && lastWeight !== null && lastWeight < MAX_AVAILABLE_LOAD_KG) {
    return {
      sets,
      reps: lastReps,
      weightKg: Math.min(lastWeight + LOAD_STEP_KG, MAX_AVAILABLE_LOAD_KG),
    }
  }

  const step = exercise.work.isTimed ? HOLD_PROGRESSION_STEP : REP_PROGRESSION_STEP
  return {
    sets,
    reps: Math.min(lastReps + step, repCapFor(exercise)),
    weightKg: lastWeight,
  }
}

// ---------------------------------------------------------------------------
// Selección de ejercicios
// ---------------------------------------------------------------------------

/**
 * Ajusta el ejercicio a la dificultad objetivo usando su propia cadena de variantes.
 *
 * Es lo que permite responder a «hoy necesitas una variante más ligera de empuje»
 * con un ejercicio concreto en lugar de con menos series.
 */
export function adaptDifficulty(
  exercise: Exercise,
  target: Difficulty,
  options: {
    history?: readonly WorkoutSession[]
    catalog?: readonly Exercise[]
    equipment?: readonly Equipment[]
  } = {},
): Exercise {
  const { history = [], catalog, equipment } = options

  if (exercise.difficulty > target) {
    return variantOf(exercise, 'easier', catalog, equipment)
  }
  // Solo se sube de variante cuando el ejercicio actual ya se domina.
  if (exercise.difficulty < target && hasMastered(exercise, history)) {
    return variantOf(exercise, 'harder', catalog, equipment)
  }
  return exercise
}

/**
 * Reparte los ejercicios entre las categorías del foco, alternando, para que una
 * sesión de tren superior no acabe siendo cuatro empujes seguidos.
 *
 * Cada candidato se ajusta a la dificultad objetivo **antes** de aceptarlo. Dos
 * candidatos distintos pueden acabar en la misma variante, así que los duplicados
 * se descartan y se sigue tirando del pool hasta completar la sesión.
 */
function selectExercises(
  pool: readonly Exercise[],
  focus: SessionFocus,
  count: number,
  adapt: (exercise: Exercise) => Exercise,
  target: Difficulty,
): Exercise[] {
  const categories = FOCUS_CATEGORIES[focus]
  const byCategory = new Map<ExerciseCategory, Exercise[]>()

  for (const category of categories) {
    const candidates = pool.filter((exercise) => exercise.category === category)
    byCategory.set(category, closestToDifficulty(candidates, target))
  }

  const selected: Exercise[] = []
  const taken = new Set<string>()

  const remaining = () =>
    categories.reduce((total, category) => total + (byCategory.get(category)?.length ?? 0), 0)

  while (selected.length < count && remaining() > 0) {
    for (const category of categories) {
      if (selected.length >= count) break
      const candidates = byCategory.get(category)
      if (!candidates) continue

      // Se sigue sacando de esta categoría hasta encontrar una variante nueva.
      while (candidates.length > 0) {
        const candidate = candidates.shift() as Exercise
        const adapted = adapt(candidate)
        if (taken.has(adapted.id)) continue
        taken.add(adapted.id)
        selected.push(adapted)
        break
      }
    }
  }

  return selected
}

export function buildSession(options: SessionBuildOptions): PlannedSession {
  const {
    focus,
    intensity,
    availableMinutes,
    goals,
    experience,
    avoidMuscleGroups = [],
    catalog,
    equipment = AVAILABLE_EQUIPMENT,
    history = [],
  } = options

  const forFocus = exercisesForFocus(focus, catalog)
  // Filtro innegociable: nada que necesite material inexistente.
  const executable = forFocus.filter((exercise) => isAvailable(exercise, equipment))
  const allowed = exercisesAvoidingGroups(executable, avoidMuscleGroups)

  // Si evitar grupos deja la sesión demasiado corta, es mejor una sesión completa
  // que ninguna: decidir no entrenar es competencia de las reglas, no del constructor.
  const pool = allowed.length >= MIN_EXERCISES ? allowed : executable

  const target = targetDifficultyFor(experience, intensity)
  const count = exerciseCountFor(availableMinutes)

  const selected = selectExercises(
    pool,
    focus,
    count,
    (exercise) => adaptDifficulty(exercise, target, { history, catalog, equipment }),
    target,
  )

  const exercises: PlannedExercise[] = selected.map((exercise) => {
    const work = suggestWorkFor(exercise, { intensity, goals, experience, history })
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      sets: work.sets,
      reps: work.reps,
      isTimed: exercise.work.isTimed,
      suggestedWeightKg: work.weightKg,
      restSeconds: exercise.work.restSeconds,
      unilateral: exercise.unilateral,
      tempo: exercise.work.tempo,
      imageUrl: exercise.imageUrl,
    }
  })

  return {
    focus,
    title: titleFor(focus, intensity),
    intensity,
    estimatedMinutes: Math.max(20, Math.round(availableMinutes / 5) * 5),
    muscleGroups: dedupeGroups(selected, focus),
    exercises,
  }
}

function dedupeGroups(exercises: readonly Exercise[], focus: SessionFocus): MuscleGroup[] {
  const groups: MuscleGroup[] = []
  for (const exercise of exercises) {
    for (const group of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
      if (!groups.includes(group)) groups.push(group)
    }
  }
  return groups.length > 0 ? groups : [...FOCUS_MUSCLE_GROUPS[focus]]
}

/** `Fuerza · Tren superior` — el formato que ya usa la interfaz aprobada. */
export function titleFor(focus: SessionFocus, intensity: SessionIntensity): string {
  if (focus === 'core_movilidad') return `Movilidad · ${SESSION_FOCUS_LABELS[focus]}`
  const prefix = intensity === 'ligera' ? 'Sesión ligera' : 'Fuerza'
  return `${prefix} · ${SESSION_FOCUS_LABELS[focus]}`
}
