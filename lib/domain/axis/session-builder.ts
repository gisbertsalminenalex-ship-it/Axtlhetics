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
 * 2. **La progresión no es solo carga.** Se sube con los pesos que el usuario
 *    tiene (D-046): repeticiones hasta el techo, luego el siguiente peso y, cuando
 *    ya no hay uno mayor, una variante más exigente.
 */

import type { CareZone, ExperienceLevel, Sex, TrainingGoal } from '../profile/types'
import { loadsCareZone } from '../workouts/joints'
import type { DayKey } from '../shared/dates'
import { clamp } from '../shared/ids'
import {
  EXERCISE_CATALOG,
  exercisesAvoidingGroups,
  exercisesForFocus,
  isAvailable,
  variantOf,
} from '../workouts/catalog'
import {
  availableEquipment,
  LEGACY_EQUIPMENT,
  loadsFor,
  nextLoad,
  startingLoad,
  type UserEquipment,
} from '../workouts/equipment'
import type {
  Difficulty,
  Equipment,
  Exercise,
  ExerciseCategory,
  ExercisePhase,
  MuscleGroup,
  PlannedExercise,
  PlannedSession,
  SessionFocus,
  SessionIntensity,
  WarmupPart,
  WorkoutSession,
} from '../workouts/types'
import { FOCUS_CATEGORIES, FOCUS_MUSCLE_GROUPS, isMainExercise, SESSION_FOCUS_LABELS, usesLoad } from '../workouts/types'
import { exerciseUsage, lastPerformanceOf, type ExerciseUsage, type LastPerformance } from '../workouts/history'

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
 * Cómo es la sesión de cada objetivo (D-047). Cada sesión sirve a uno solo:
 * con varios objetivos, la semana se reparte entre ellos (`weekly-plan.ts`).
 *
 * - `repFactor` multiplica las repeticiones del catálogo, no las sustituye:
 *   una sentadilla y una flexión diamante no comparten rango.
 * - `setShift` suma series; `difficultyShift`, dificultad objetivo.
 * - `minRest`/`maxRest` acotan el descanso del catálogo.
 */
type GoalParams = {
  repFactor: number
  setShift: number
  difficultyShift: number
  minRest: number | null
  maxRest: number | null
  /** Cadencia cuando el ejercicio no trae una. */
  tempo: string | null
}

export const GOAL_PARAMS: Record<TrainingGoal, GoalParams> = {
  fuerza: { repFactor: 0.6, setShift: 1, difficultyShift: 1, minRest: 120, maxRest: null, tempo: null },
  hipertrofia: { repFactor: 1, setShift: 0, difficultyShift: 0, minRest: 60, maxRest: 90, tempo: null },
  rendimiento_deportivo: { repFactor: 0.7, setShift: 0, difficultyShift: 0, minRest: 90, maxRest: null, tempo: null },
  tecnica: { repFactor: 0.8, setShift: 1, difficultyShift: -1, minRest: null, maxRest: null, tempo: '3-1-1' },
  salud_general: { repFactor: 1, setShift: 0, difficultyShift: 0, minRest: null, maxRest: null, tempo: null },
  // Resistencia y movilidad tienen sesión propia; si una de fuerza les sirve, es fuerza general.
  resistencia: { repFactor: 1, setShift: 0, difficultyShift: 0, minRest: null, maxRest: null, tempo: null },
  movilidad: { repFactor: 1, setShift: 0, difficultyShift: 0, minRest: null, maxRest: null, tempo: null },
}

/** El objetivo de una sesión cuando solo se conocen los del perfil: uno solo, ese; si no, fuerza general. */
export function sessionGoalFrom(goals: readonly TrainingGoal[]): TrainingGoal {
  return goals.length === 1 ? goals[0] : DEFAULT_GOAL
}

/** Repeticiones (o segundos) de partida del ejercicio en una sesión de ese objetivo. */
export function baseRepsFor(exercise: Exercise, goal: TrainingGoal = DEFAULT_GOAL): number {
  // Los isométricos y los intervalos se miden en segundos: el objetivo no los recorta.
  if (exercise.work.isTimed) return exercise.work.reps
  return Math.max(5, Math.round(exercise.work.reps * GOAL_PARAMS[goal].repFactor))
}

/** Con «mujer» (D-051), los descansos de fuerza son un 15 % más cortos, nunca menos de 45 s. */
export const FEMALE_REST_FACTOR = 0.85
export const FEMALE_MIN_REST_SECONDS = 45
/** Con «mujer» (D-051), el peso de partida del tren superior es el 70 % de la referencia. */
export const FEMALE_UPPER_START_FACTOR = 0.7

/** El descanso del catálogo, acotado por el objetivo y, en fuerza, ajustado por sexo. Los intervalos no se tocan. */
export function restFor(exercise: Exercise, goal: TrainingGoal = DEFAULT_GOAL, sex: Sex | null = null): number {
  if (exercise.category === 'acondicionamiento') return exercise.work.restSeconds
  const { minRest, maxRest } = GOAL_PARAMS[goal]
  let rest = exercise.work.restSeconds
  if (minRest !== null) rest = Math.max(rest, minRest)
  if (maxRest !== null) rest = Math.min(rest, maxRest)
  if (sex === 'mujer') rest = Math.max(FEMALE_MIN_REST_SECONDS, Math.round(rest * FEMALE_REST_FACTOR))
  return rest
}

/** Minutos que se asume que ocupa un ejercicio completo. */
const MINUTES_PER_EXERCISE = 10
const MIN_EXERCISES = 3
const MAX_EXERCISES = 6

/** En acondicionamiento (D-047): rondas de 30 s más 30 s de descanso, unos 4 minutos; como mucho 6, unos 24 minutos de intervalos. */
const CONDITIONING_MINUTES_PER_EXERCISE = 4
const MAX_CONDITIONING_EXERCISES = 6

/** Cuánto sube cada progresión por repeticiones. */
export const REP_PROGRESSION_STEP = 2
/** En isométricos se progresa en segundos. */
export const HOLD_PROGRESSION_STEP = 5

/** Esfuerzo de la sesión (D-019) a partir del cual no se sube: «al límite» (D-031). */
export const AT_LIMIT_EFFORT = 5
/** Esfuerzo hasta el que el paso se dobla: «muy fácil» y «fácil» (D-031). */
export const EASY_EFFORT = 2

/**
 * Techo de repeticiones antes de considerar el ejercicio dominado. A partir de ahí
 * la progresión deja de ser «más repeticiones» y pasa a ser «variante más difícil».
 */
export const REP_PROGRESSION_CAP_FACTOR = 1.6

export type SessionBuildOptions = {
  focus: SessionFocus
  intensity: SessionIntensity
  availableMinutes: number
  /** Los objetivos del perfil: con movilidad, el calentamiento lleva un ejercicio más (D-047). */
  goals: readonly TrainingGoal[]
  /** El objetivo al que sirve esta sesión (D-047). Por defecto, `sessionGoalFrom(goals)`. */
  goal?: TrainingGoal
  experience: ExperienceLevel
  /** Grupos que la sesión debe evitar, por ejemplo por una actividad fija cercana. */
  avoidMuscleGroups?: readonly MuscleGroup[]
  catalog?: readonly Exercise[]
  /**
   * El material del usuario (D-046): qué ejercicios caben y con qué kilos. Por
   * defecto, el de un perfil anterior: una pesa de 5 kg.
   */
  gear?: UserEquipment
  /** Historial reciente, de la sesión más nueva a la más antigua. */
  history?: readonly WorkoutSession[]
  /**
   * Hoy. Solo lo usa la rotación para que la señal de un ejercicio saltado
   * caduque (D-020). Sin él, la señal no caduca.
   */
  today?: DayKey
  /** Semana de descarga (D-031): una serie menos, sin subir ni pasar a una variante más difícil. */
  deload?: boolean
  /**
   * El usuario juega a un deporte de salto o de cambio de dirección (D-033):
   * equilibrio en el calentamiento y, en las sesiones de piernas de intensidad
   * normal, un ejercicio de salto al empezar.
   */
  jumpSport?: boolean
  /**
   * Ejercicios de objetivos medibles abiertos (D-035): si son de la zona y se
   * pueden hacer hoy, entran en la sesión en lugar del último elegido.
   */
  priorityExerciseIds?: readonly string[]
  /**
   * Ejercicios que no gustan, dichos o deducidos de los saltos (D-037): fuera
   * de la sesión mientras queden suficientes alternativas.
   */
  dislikedExerciseIds?: readonly string[]
  /** Correctivos del escaneo (D-041): se añaden al calentamiento de las sesiones de fuerza, como mucho dos. */
  warmupExtras?: readonly string[]
  /** Con diferencia entre lados, al menos un ejercicio a una mano o una pierna (D-041). */
  preferUnilateral?: boolean
  /** Zonas a cuidar (D-051): nada que las cargue entra en la sesión. */
  careZones?: readonly CareZone[]
  /** Sexo (D-051): ajusta descansos y peso de partida del tren superior. */
  sex?: Sex | null
}

// ---------------------------------------------------------------------------
// Calentamiento y vuelta a la calma (D-032)
// ---------------------------------------------------------------------------

/**
 * El calentamiento, en tres partes (D-045, decidido por Alex):
 *
 * 1. **Activación**: jumping jacks y escaladores, un minuto cada uno.
 * 2. **Movilidad articular**: dos minutos libres (`JOINT_MOBILITY`), más lo que
 *    se prescribe a cada uno: equilibrio si salta y correctivos del escaneo.
 * 3. **Series de aproximación**: 5 repeticiones suaves de los primeros
 *    ejercicios del entreno (`approachSets`).
 *
 * La sesión de movilidad no lleva calentamiento: ya lo es. Desde D-045 tampoco
 * hay vuelta a la calma.
 */
export const ACTIVATION_EXERCISES: readonly string[] = ['jumping-jacks', 'escaladores']

/** Cuántos ejercicios del entreno llevan serie de aproximación, y de cuántas repeticiones. */
export const APPROACH_EXERCISES = 3
export const APPROACH_REPS = 5

/** Minutos de la activación y de cada serie de aproximación: salen del tiempo disponible. */
const ACTIVATION_MINUTES = 2
const APPROACH_MINUTES = 1

/**
 * La movilidad articular es un solo paso libre (enmienda de D-045): el usuario
 * mueve cada articulación a su aire, empezando por lo que va a entrenar. No
 * hace falta prescribirle ejercicios concretos.
 */
export const JOINT_MOBILITY = 'movilidad-articular'
export const JOINT_MOBILITY_SECONDS = 120
/** Con el objetivo de movilidad, un minuto más (D-047). */
export const JOINT_MOBILITY_GOAL_SECONDS = 180

/** La sesión de movilidad no lleva calentamiento: ya lo es. */
function warmsUpFor(focus: SessionFocus): boolean {
  return focus !== 'core_movilidad'
}

/**
 * La selección con los ejercicios prioritarios dentro (D-035). Cada uno que sea
 * de la zona, esté permitido hoy y no esté ya, sustituye al último elegido que
 * no sea prioritario; si comparte familia con otro elegido, sustituye a ese,
 * para no juntar dos variantes del mismo patrón (D-020.1).
 */
function withPriority(
  selected: readonly Exercise[],
  pool: readonly Exercise[],
  priorityIds: readonly string[],
): Exercise[] {
  const result = [...selected]
  for (const id of priorityIds) {
    if (result.some((exercise) => exercise.id === id)) continue
    const wanted = pool.find((exercise) => exercise.id === id)
    if (!wanted) continue
    const sameFamily = wanted.family ? result.findIndex((exercise) => exercise.family === wanted.family) : -1
    let slot = sameFamily
    if (slot < 0) {
      for (let i = result.length - 1; i >= 0; i--) {
        if (!priorityIds.includes(result[i].id)) {
          slot = i
          break
        }
      }
    }
    if (slot >= 0) result[slot] = wanted
  }
  return result
}

/**
 * Si no hay ningún ejercicio unilateral, el primero unilateral de la zona
 * sustituye al último elegido que no sea un objetivo (D-041).
 */
function withUnilateral(selected: readonly Exercise[], pool: readonly Exercise[], keep: readonly string[]): Exercise[] {
  if (selected.some((exercise) => exercise.unilateral)) return [...selected]
  const one = pool.find((exercise) => exercise.unilateral && !selected.some((other) => other.id === exercise.id))
  if (!one) return [...selected]
  const result = [...selected]
  for (let i = result.length - 1; i >= 0; i--) {
    if (!keep.includes(result[i].id)) {
      result[i] = one
      break
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Deportes de salto (D-033)
// ---------------------------------------------------------------------------

/** El calentamiento de quien salta lleva equilibrio: prevención de tobillo y rodilla. */
export const JUMP_SPORT_WARMUP = 'equilibrio-una-pierna'

/** Las sesiones que cargan piernas: donde entra el salto. */
export const JUMP_FOCUSES: readonly SessionFocus[] = ['tren_inferior', 'cuerpo_completo']

/**
 * El ejercicio de salto de hoy: el menos usado recientemente, para que roten;
 * entre los que empatan, el de dificultad más cercana a la de la sesión.
 */
function jumpExerciseFor(
  catalog: readonly Exercise[],
  equipment: readonly Equipment[],
  target: Difficulty,
  usage: ReadonlyMap<string, ExerciseUsage>,
  disliked: readonly string[] = [],
  careZones: readonly CareZone[] = [],
): Exercise | null {
  const jumps = catalog.filter(
    (exercise) => exercise.category === 'pliometria' && isAvailable(exercise, equipment) && !loadsCareZone(exercise.id, careZones),
  )
  const liked = jumps.filter((exercise) => !disliked.includes(exercise.id))
  const candidates = liked.length > 0 ? liked : jumps
  if (candidates.length === 0) return null
  const lastUse = (exercise: Exercise) => usage.get(exercise.id)?.lastUse ?? ''
  return [...candidates].sort(
    (a, b) =>
      lastUse(a).localeCompare(lastUse(b)) ||
      Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
      a.id.localeCompare(b.id),
  )[0]
}

/** Correctivos del escaneo que caben en el calentamiento (D-041). */
const MAX_WARMUP_EXTRAS = 2

/** Minutos que ocupa cada ejercicio de calentamiento o vuelta a la calma: salen del tiempo disponible. */
export const PHASE_EXERCISE_MINUTES = 2

/**
 * Los ejercicios de una fase, tal como se proponen: una serie, las
 * repeticiones o segundos del catálogo, sin carga, sin descanso y sin
 * progresión. Un id que el catálogo no tenga se omite.
 */
function phaseExercises(
  ids: readonly string[],
  phase: ExercisePhase,
  catalog: readonly Exercise[],
  warmupPart?: WarmupPart,
): PlannedExercise[] {
  return ids
    .map((id) => catalog.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => exercise !== undefined)
    .map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      sets: 1,
      reps: exercise.work.reps,
      isTimed: exercise.work.isTimed,
      suggestedWeightKg: null,
      restSeconds: 0,
      unilateral: exercise.unilateral,
      tempo: null,
      imageUrl: exercise.imageUrl,
      phase,
      ...(warmupPart ? { warmupPart } : {}),
    }))
}

/**
 * Las series de aproximación (D-045): 5 repeticiones de los primeros ejercicios
 * del entreno. Con pesa, la misma carga, para tantearla; sin pesa, la variante
 * más fácil si la hay, para no gastar energía. Ni los de tiempo ni los saltos.
 */
function approachSets(
  main: readonly PlannedExercise[],
  catalog: readonly Exercise[],
  equipment: readonly Equipment[],
  careZones: readonly CareZone[] = [],
): PlannedExercise[] {
  const result: PlannedExercise[] = []
  for (const planned of main) {
    if (result.length >= APPROACH_EXERCISES) break
    const exercise = catalog.find((item) => item.id === planned.exerciseId)
    if (!exercise || planned.isTimed || exercise.category === 'pliometria') continue
    const easier =
      !usesLoad(exercise) && exercise.regressionId ? catalog.find((item) => item.id === exercise.regressionId) : undefined
    const used =
      easier && isAvailable(easier, equipment) && !easier.work.isTimed && !loadsCareZone(easier.id, careZones) ? easier : exercise
    result.push({
      exerciseId: used.id,
      name: used.name,
      sets: 1,
      reps: APPROACH_REPS,
      isTimed: false,
      suggestedWeightKg: usesLoad(used) ? planned.suggestedWeightKg : null,
      restSeconds: 0,
      unilateral: used.unilateral,
      tempo: null,
      imageUrl: used.imageUrl,
      phase: 'calentamiento',
      warmupPart: 'aproximacion',
    })
  }
  return result
}

export function exerciseCountFor(availableMinutes: number, focus?: SessionFocus): number {
  if (focus === 'acondicionamiento') {
    return clamp(Math.floor(availableMinutes / CONDITIONING_MINUTES_PER_EXERCISE), MIN_EXERCISES, MAX_CONDITIONING_EXERCISES)
  }
  const raw = Math.floor(availableMinutes / MINUTES_PER_EXERCISE)
  return clamp(raw, MIN_EXERCISES, MAX_EXERCISES)
}

export function targetDifficultyFor(
  experience: ExperienceLevel,
  intensity: SessionIntensity,
  goal: TrainingGoal = DEFAULT_GOAL,
): Difficulty {
  const base = BASE_DIFFICULTY[experience] ?? BASE_DIFFICULTY[DEFAULT_EXPERIENCE]
  return clamp(base + DIFFICULTY_SHIFT[intensity] + GOAL_PARAMS[goal].difficultyShift, 1, 5) as Difficulty
}

// ---------------------------------------------------------------------------
// Historial y progresión
// ---------------------------------------------------------------------------

/*
 * La última ejecución vive en el dominio de entrenamientos, porque también la
 * usa la pantalla del ejercicio activo. Se reexporta para quien ya la importaba
 * de aquí. Compara contra el objetivo guardado (D-019): un ejercicio a medias no
 * cuenta como hecho y la progresión repite en vez de subir.
 */
export { lastPerformanceOf, type LastPerformance }

/**
 * Repeticiones a partir de las cuales el ejercicio se considera dominado: 1,6 ×
 * las de partida de esa sesión (D-047). En fuerza se llega antes.
 */
export function repCapFor(exercise: Exercise, goal: TrainingGoal = DEFAULT_GOAL): number {
  return Math.round(baseRepsFor(exercise, goal) * REP_PROGRESSION_CAP_FACTOR)
}

/**
 * `true` si la última vez se completó todo, ya se está en el techo de
 * repeticiones y, con carga, no queda un peso mayor (D-046). Es la señal para
 * pasar a la variante más exigente.
 */
export function hasMastered(
  exercise: Exercise,
  history: readonly WorkoutSession[],
  gear: UserEquipment = LEGACY_EQUIPMENT,
  goal: TrainingGoal = DEFAULT_GOAL,
): boolean {
  const last = lastPerformanceOf(exercise.id, history)
  if (!last || !last.allSetsCompleted) return false
  if (last.reps < repCapFor(exercise, goal)) return false
  if (!usesLoad(exercise)) return true
  return nextLoad(loadsFor(exercise, gear), last.weightKg ?? 0) === null
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
 * 2. Si la última vez fue «al límite» → también se repite: hecho, pero sin
 *    margen para subir (D-031).
 * 3. Si se usó menos que el peso de partida → se vuelve al de partida.
 * 4. Si ya se está en el techo de repeticiones y hay un peso mayor → el
 *    siguiente peso, con las repeticiones de partida (doble progresión, D-046).
 * 5. En cualquier otro caso → sube repeticiones (o segundos en los
 *    isométricos), el doble si la última vez fue fácil o muy fácil (D-031).
 *
 * En una semana de descarga (D-031) hay una serie menos y no se sube nada.
 * Solo se sugieren pesos que el usuario tiene (D-046).
 */
export function suggestWorkFor(
  exercise: Exercise,
  options: {
    intensity: SessionIntensity
    /** El objetivo de la sesión (D-047). */
    goal?: TrainingGoal
    /** Los del perfil, si no se da `goal`: uno solo es el de la sesión. */
    goals?: readonly TrainingGoal[]
    experience: ExperienceLevel
    history?: readonly WorkoutSession[]
    deload?: boolean
    gear?: UserEquipment
    sex?: Sex | null
  },
): SuggestedWork {
  const { intensity, experience, history = [], deload = false, gear = LEGACY_EQUIPMENT, sex = null } = options
  const goal = options.goal ?? sessionGoalFrom(options.goals ?? DEFAULT_GOALS)

  const maxSets = MAX_SETS_BY_EXPERIENCE[experience] ?? MAX_SETS_BY_EXPERIENCE[DEFAULT_EXPERIENCE]
  // Los intervalos van por rondas: el objetivo no suma series.
  const goalSets = exercise.category === 'acondicionamiento' ? 0 : GOAL_PARAMS[goal].setShift
  const normalSets = clamp(exercise.work.sets + SET_SHIFT[intensity] + goalSets, MIN_SETS, maxSets)
  const sets = deload ? Math.max(MIN_SETS, normalSets - 1) : normalSets

  const baseReps = baseRepsFor(exercise, goal)
  const cap = repCapFor(exercise, goal)

  const loads = usesLoad(exercise) ? loadsFor(exercise, gear) : []
  const upperBody = exercise.category === 'empuje' || exercise.category === 'tiron'
  const baseWeight = startingLoad(exercise, loads, experience, sex === 'mujer' && upperBody ? FEMALE_UPPER_START_FACTOR : 1)

  const last = lastPerformanceOf(exercise.id, history)
  if (!last) {
    return { sets, reps: baseReps, weightKg: baseWeight }
  }

  const lastWeight = baseWeight === null ? null : (last.weightKg ?? baseWeight)
  // Lo hecho en una sesión de otro objetivo puede pasar del techo de esta (D-047): se parte del techo.
  const lastReps = Math.min(Math.max(baseReps, last.reps), cap)

  if (!last.allSetsCompleted || deload || (last.effort !== null && last.effort >= AT_LIMIT_EFFORT)) {
    return { sets, reps: lastReps, weightKg: lastWeight }
  }

  if (lastWeight !== null && baseWeight !== null && lastWeight < baseWeight) {
    return { sets, reps: lastReps, weightKg: baseWeight }
  }

  // En el techo y con un peso mayor a mano: se sube de peso y se vuelve a las repeticiones de partida.
  const heavier = lastWeight === null ? null : nextLoad(loads, lastWeight)
  if (heavier !== null && lastReps >= cap) {
    return { sets, reps: baseReps, weightKg: heavier }
  }

  const baseStep = exercise.work.isTimed ? HOLD_PROGRESSION_STEP : REP_PROGRESSION_STEP
  const easy = last.effort !== null && last.effort <= EASY_EFFORT
  const step = easy ? baseStep * 2 : baseStep
  return {
    sets,
    reps: Math.min(lastReps + step, cap),
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
    gear?: UserEquipment
    goal?: TrainingGoal
  } = {},
): Exercise {
  const { history = [], catalog, gear = LEGACY_EQUIPMENT, goal = DEFAULT_GOAL } = options
  const equipment = availableEquipment(gear)

  if (exercise.difficulty > target) {
    return variantOf(exercise, 'easier', catalog, equipment)
  }
  // Solo se sube de variante cuando el ejercicio actual ya se domina.
  if (exercise.difficulty < target && hasMastered(exercise, history, gear, goal)) {
    return variantOf(exercise, 'harder', catalog, equipment)
  }
  return exercise
}

/**
 * Margen de dificultad dentro del cual dos ejercicios son equivalentes para la
 * rotación (D-020): a ±1 del objetivo, gana el que lleva más tiempo sin usarse.
 * Más lejos solo entran si no queda nada dentro.
 */
export const ROTATION_DIFFICULTY_BAND = 1

/** Sin uso registrado: más antiguo que cualquier día, así que va primero. */
const NEVER_USED = ''

/**
 * Orden de los candidatos de una categoría (D-020). Determinista, por este orden:
 *
 * 1. Dentro del margen de dificultad antes que fuera.
 * 2. El que lleva más tiempo sin usarse (nunca usado, el primero). Se mira la
 *    variante que de verdad se hará, tras ajustar la dificultad.
 * 3. A igual antigüedad, el que se ha usado menos veces: si no, el primero del
 *    catálogo ganaría siempre los empates del mismo día.
 * 4. El más cercano a la dificultad objetivo.
 * 5. El orden del catálogo.
 *
 * Sin historial, 2 y 3 empatan siempre y el orden es exactamente el de antes.
 */
function rotationOrder(
  candidates: readonly Exercise[],
  target: Difficulty,
  adapt: (exercise: Exercise) => Exercise,
  usage: ReadonlyMap<string, ExerciseUsage>,
): Exercise[] {
  const keyed = candidates.map((exercise, index) => {
    const distance = Math.abs(exercise.difficulty - target)
    const used = usage.get(adapt(exercise).id)
    return {
      exercise,
      outOfBand: distance > ROTATION_DIFFICULTY_BAND ? 1 : 0,
      lastUse: used?.lastUse ?? NEVER_USED,
      uses: used?.uses ?? 0,
      distance,
      index,
    }
  })
  keyed.sort(
    (a, b) =>
      a.outOfBand - b.outOfBand ||
      compareDays(a.lastUse, b.lastUse) ||
      a.uses - b.uses ||
      a.distance - b.distance ||
      a.index - b.index,
  )
  return keyed.map((item) => item.exercise)
}

/** `DayKey` locales: se ordenan bien como texto, y «nunca» (`''`) va primero. */
function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Reparte los ejercicios entre las categorías del foco, alternando, para que una
 * sesión de tren superior no acabe siendo cuatro empujes seguidos.
 *
 * Cada candidato se ajusta a la dificultad objetivo **antes** de aceptarlo. Dos
 * candidatos distintos pueden acabar en la misma variante, así que los duplicados
 * se descartan y se sigue tirando del pool hasta completar la sesión.
 *
 * Rotación (D-020): dentro de cada categoría, el que lleva más tiempo sin usarse
 * (`rotationOrder`); y empieza la categoría que lleva más tiempo sin usarse, para
 * que en una sesión corta de cuerpo completo no se quede siempre fuera la misma.
 */
function selectExercises(
  pool: readonly Exercise[],
  focus: SessionFocus,
  count: number,
  adapt: (exercise: Exercise) => Exercise,
  target: Difficulty,
  usage: ReadonlyMap<string, ExerciseUsage>,
): Exercise[] {
  const byCategory = new Map<ExerciseCategory, Exercise[]>()
  const categoryLastUse = new Map<ExerciseCategory, DayKey>()

  for (const category of FOCUS_CATEGORIES[focus]) {
    const candidates = pool.filter((exercise) => exercise.category === category)
    byCategory.set(category, rotationOrder(candidates, target, adapt, usage))

    let latest = NEVER_USED
    for (const exercise of candidates) {
      for (const id of [exercise.id, adapt(exercise).id]) {
        const used = usage.get(id)?.lastUse ?? NEVER_USED
        if (used > latest) latest = used
      }
    }
    categoryLastUse.set(category, latest)
  }

  // Orden estable: sin historial, el del foco, como antes.
  const categories = [...FOCUS_CATEGORIES[focus]].sort((a, b) =>
    compareDays(categoryLastUse.get(a) ?? NEVER_USED, categoryLastUse.get(b) ?? NEVER_USED),
  )

  const selected: Exercise[] = []
  const taken = new Set<string>()
  const takenFamilies = new Set<string>()

  /*
   * Dos pasadas (D-020.1). La primera es la selección de siempre, pero deja para
   * después un candidato cuya familia ya está en la sesión: dos variantes de lo
   * mismo («Zancadas» y «Zancada atrás») no van juntas si hay otra cosa. Solo si
   * así no se llena la sesión, la segunda recorre el mismo orden permitiendo
   * repetir familia. Variedad preferida, no restricción: la sesión nunca sale
   * más corta que antes, y un ejercicio sin familia no se aparta nunca.
   */
  for (const allowFamilyRepeat of [false, true]) {
    // Cada pasada parte del orden de rotación entero: lo que la primera apartó
    // por la familia sigue disponible para la segunda.
    const queues = new Map(categories.map((category) => [category, [...(byCategory.get(category) ?? [])]]))

    let progressed = true
    while (selected.length < count && progressed) {
      progressed = false
      for (const category of categories) {
        if (selected.length >= count) break
        const queue = queues.get(category)!

        // Se sigue sacando de esta categoría hasta encontrar una variante nueva.
        while (queue.length > 0) {
          const adapted = adapt(queue.shift() as Exercise)
          if (taken.has(adapted.id)) continue
          if (!allowFamilyRepeat && adapted.family && takenFamilies.has(adapted.family)) continue
          taken.add(adapted.id)
          if (adapted.family) takenFamilies.add(adapted.family)
          selected.push(adapted)
          progressed = true
          break
        }
      }
    }
    if (selected.length >= count) break
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
    gear = LEGACY_EQUIPMENT,
    history = [],
    today,
    deload = false,
    jumpSport = false,
    priorityExerciseIds = [],
    dislikedExerciseIds = [],
    warmupExtras = [],
    preferUnilateral = false,
    careZones = [],
    sex = null,
  } = options

  const equipment = availableEquipment(gear)
  // Cuándo se usó por última vez cada ejercicio: lo que ordena la rotación (D-020).
  const usage = exerciseUsage(history, { catalog: catalog ?? EXERCISE_CATALOG, today })

  const forFocus = exercisesForFocus(focus, catalog)
  // Filtros innegociables: nada que necesite material inexistente ni que cargue una zona a cuidar (D-051).
  const cares = (exercise: { id: string }) => !loadsCareZone(exercise.id, careZones)
  const executable = forFocus.filter((exercise) => isAvailable(exercise, equipment) && cares(exercise))
  const allowed = exercisesAvoidingGroups(executable, avoidMuscleGroups)

  // Si evitar grupos deja la sesión demasiado corta, es mejor una sesión completa
  // que ninguna: decidir no entrenar es competencia de las reglas, no del constructor.
  const usable = allowed.length >= MIN_EXERCISES ? allowed : executable
  // Lo que no gusta se aparta si quedan suficientes; antes una sesión completa que una corta (D-037).
  const liked = usable.filter((exercise) => !dislikedExerciseIds.includes(exercise.id))
  const pool = liked.length >= MIN_EXERCISES ? liked : usable

  const goal = options.goal ?? sessionGoalFrom(goals)
  const conditioning = focus === 'acondicionamiento'
  const target = targetDifficultyFor(experience, intensity, conditioning ? DEFAULT_GOAL : goal)
  // El calentamiento y la vuelta a la calma salen del mismo tiempo (D-032).
  const phaseCatalog = catalog ?? EXERCISE_CATALOG
  const warmsUp = warmsUpFor(focus)
  // Lo que sí se prescribe: el equilibrio de quien salta (D-033) y los correctivos del escaneo (D-041).
  const targetedIds = warmsUp
    ? [...new Set([...(jumpSport ? [JUMP_SPORT_WARMUP] : []), ...warmupExtras.slice(0, MAX_WARMUP_EXTRAS)])].filter((id) =>
        cares({ id }),
      )
    : []
  const jointSeconds = goals.includes('movilidad') ? JOINT_MOBILITY_GOAL_SECONDS : JOINT_MOBILITY_SECONDS
  const activation = warmsUp
    ? phaseExercises(ACTIVATION_EXERCISES.filter((id) => cares({ id })), 'calentamiento', phaseCatalog, 'activacion')
    : []
  const joint = warmsUp
    ? phaseExercises([JOINT_MOBILITY], 'calentamiento', phaseCatalog, 'movilidad').map((item) => ({ ...item, reps: jointSeconds }))
    : []
  const targeted = phaseExercises(targetedIds, 'calentamiento', phaseCatalog, 'movilidad')
  const mobility = [...joint, ...targeted]
  // Los intervalos son por tiempo: no llevan series de aproximación (D-047).
  const approachMinutes = conditioning ? 0 : APPROACH_EXERCISES * APPROACH_MINUTES
  const phaseMinutes = warmsUp
    ? ACTIVATION_MINUTES + approachMinutes + jointSeconds / 60 + targeted.length * PHASE_EXERCISE_MINUTES
    : 0
  // Con un deporte de salto, o si la sesión es de rendimiento (D-047), un salto abre el entrenamiento y ocupa un hueco (D-033).
  const jump =
    (jumpSport || goal === 'rendimiento_deportivo') && JUMP_FOCUSES.includes(focus) && intensity === 'moderada'
      ? jumpExerciseFor(phaseCatalog, equipment, target, usage, dislikedExerciseIds, careZones)
      : null
  /** La sesión con `count` ejercicios de entrenamiento (sin contar el salto). */
  const assemble = (count: number): PlannedSession => {
    const selected = selectExercises(
      pool,
      focus,
      count,
      // En descarga no se pasa a una variante más difícil: sin historial no hay «dominado».
      (exercise) => {
        const variant = adaptDifficulty(exercise, target, { history: deload ? [] : history, catalog, gear, goal })
        // Una variante que carga una zona a cuidar no sustituye a la que no la carga (D-051).
        return cares(variant) ? variant : exercise
      },
      target,
      usage,
    )

    // Un objetivo medible gana su hueco: se entrena lo que se quiere mejorar (D-035).
    // Un objetivo lo pidió el usuario: entra aunque el ejercicio esté entre los que no gustan.
    const withGoals = withPriority(selected, usable, priorityExerciseIds)
    // Con diferencia entre lados, al menos un ejercicio a una mano o una pierna (D-041).
    const prioritized = preferUnilateral && !conditioning ? withUnilateral(withGoals, pool, priorityExerciseIds) : withGoals

    // El salto va primero: con las piernas frescas sale mejor y con menos riesgo (D-033).
    const main = jump ? [jump, ...prioritized] : prioritized

    const exercises: PlannedExercise[] = main.map((exercise) => {
      const work = suggestWorkFor(exercise, { intensity, goal, experience, history, deload, gear, sex })
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: work.sets,
        reps: work.reps,
        isTimed: exercise.work.isTimed,
        suggestedWeightKg: work.weightKg,
        restSeconds: restFor(exercise, goal, sex),
        unilateral: exercise.unilateral,
        tempo: exercise.work.tempo ?? (exercise.work.isTimed ? null : GOAL_PARAMS[goal].tempo),
        imageUrl: exercise.imageUrl,
      }
    })

    const all = [
      ...activation,
      ...mobility,
      ...(warmsUp ? approachSets(exercises, phaseCatalog, equipment, careZones) : []),
      ...exercises,
    ]
    return {
      focus,
      title: titleFor(focus, intensity, goal),
      intensity,
      // Lo que de verdad dura: series, repeticiones o segundos, descansos y cambios (D-050).
      estimatedMinutes: estimateMinutes(all),
      muscleGroups: dedupeGroups(main, focus),
      exercises: all,
      ...(deload ? { deload: true } : {}),
      goal,
    }
  }

  /*
   * Cuántos ejercicios caben (D-050): se parte de la estimación por minutos y se
   * ajusta hasta que la duración real cabe en el tiempo disponible, entre el
   * mínimo y el máximo. Una sesión de fuerza con descansos largos lleva menos
   * ejercicios que una de hipertrofia en el mismo tiempo.
   */
  const extra = jump ? 1 : 0
  const minCount = Math.max(1, MIN_EXERCISES - extra)
  const maxCount = (conditioning ? MAX_CONDITIONING_EXERCISES : MAX_EXERCISES) - extra
  let count = Math.min(maxCount, Math.max(minCount, exerciseCountFor(availableMinutes - phaseMinutes, focus) - extra))
  let session = assemble(count)
  while (session.estimatedMinutes > availableMinutes && count > minCount) {
    count -= 1
    session = assemble(count)
  }
  while (count < maxCount) {
    const bigger = assemble(count + 1)
    if (bigger.estimatedMinutes > availableMinutes) break
    count += 1
    session = bigger
  }

  // Con muy poco tiempo, antes que pasarse: dos ejercicios y, si aún no cabe, dos series (D-050).
  const floor = Math.max(1, MIN_EXERCISES_WHEN_SHORT - extra)
  while (session.estimatedMinutes > availableMinutes && count > floor) {
    count -= 1
    session = assemble(count)
  }
  if (session.estimatedMinutes > availableMinutes) {
    const compact = session.exercises.map((item) => (isMainExercise(item) ? { ...item, sets: Math.min(item.sets, MIN_SETS) } : item))
    session = { ...session, exercises: compact, estimatedMinutes: estimateMinutes(compact) }
  }
  return session
}

/** Con muy poco tiempo, una sesión puede quedarse en dos ejercicios (D-050). */
const MIN_EXERCISES_WHEN_SHORT = 2

/** Segundos que se asume que dura una repetición, con su bajada y su subida. */
export const SECONDS_PER_REP = 4
/** Cambio de un ejercicio al siguiente: colocarse, coger la pesa, leer el siguiente. */
export const TRANSITION_SECONDS = 45

/**
 * La duración real de la sesión, en minutos (D-050): por cada ejercicio, el
 * trabajo de cada serie (segundos, o repeticiones × 4 s; el doble si es a un
 * lado y luego al otro), los descansos entre series y el cambio al siguiente.
 */
export function estimateMinutes(exercises: readonly PlannedExercise[]): number {
  let seconds = 0
  for (const item of exercises) {
    const perSide = item.isTimed ? item.reps : item.reps * SECONDS_PER_REP
    const work = perSide * (item.unilateral ? 2 : 1)
    seconds += item.sets * work + Math.max(0, item.sets - 1) * item.restSeconds + TRANSITION_SECONDS
  }
  return Math.max(1, Math.round(seconds / 60))
}

/**
 * Los grupos que la sesión carga. La movilidad no cuenta (D-020): un estiramiento
 * de cadera no es haber trabajado piernas, y contarlo haría que AXIS evitara
 * piernas al día siguiente por algo que no las cargó.
 */
function dedupeGroups(exercises: readonly Exercise[], focus: SessionFocus): MuscleGroup[] {
  const groups: MuscleGroup[] = []
  for (const exercise of exercises) {
    if (exercise.category === 'movilidad') continue
    for (const group of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
      if (!groups.includes(group)) groups.push(group)
    }
  }
  return groups.length > 0 ? groups : [...FOCUS_MUSCLE_GROUPS[focus]]
}

/** Cómo empieza el título de una sesión de fuerza según su objetivo (D-047). */
const GOAL_TITLE_PREFIX: Partial<Record<TrainingGoal, string>> = {
  hipertrofia: 'Hipertrofia',
  rendimiento_deportivo: 'Potencia',
  tecnica: 'Técnica',
}

/** `Fuerza · Tren superior` — el formato que ya usa la interfaz aprobada. */
export function titleFor(focus: SessionFocus, intensity: SessionIntensity, goal: TrainingGoal = DEFAULT_GOAL): string {
  if (focus === 'core_movilidad') return `Movilidad · ${SESSION_FOCUS_LABELS[focus]}`
  if (focus === 'acondicionamiento') {
    return `${intensity === 'ligera' ? 'Intervalos suaves' : 'Intervalos'} · ${SESSION_FOCUS_LABELS[focus]}`
  }
  const prefix = intensity === 'ligera' ? 'Sesión ligera' : (GOAL_TITLE_PREFIX[goal] ?? 'Fuerza')
  return `${prefix} · ${SESSION_FOCUS_LABELS[focus]}`
}
