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
import type { DayKey } from '../shared/dates'
import { clamp } from '../shared/ids'
import {
  AVAILABLE_EQUIPMENT,
  EXERCISE_CATALOG,
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
  ExercisePhase,
  MuscleGroup,
  PlannedExercise,
  PlannedSession,
  SessionFocus,
  SessionIntensity,
  WorkoutSession,
} from '../workouts/types'
import { FOCUS_CATEGORIES, FOCUS_MUSCLE_GROUPS, SESSION_FOCUS_LABELS, usesLoad } from '../workouts/types'
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
  goals: readonly TrainingGoal[]
  experience: ExperienceLevel
  /** Grupos que la sesión debe evitar, por ejemplo por una actividad fija cercana. */
  avoidMuscleGroups?: readonly MuscleGroup[]
  catalog?: readonly Exercise[]
  equipment?: readonly Equipment[]
  /** Historial reciente, de la sesión más nueva a la más antigua. */
  history?: readonly WorkoutSession[]
  /**
   * Hoy. Solo lo usa la rotación para que la señal de un ejercicio saltado
   * caduque (D-020). Sin él, la señal no caduca.
   */
  today?: DayKey
  /** Semana de descarga (D-031): una serie menos, sin subir ni pasar a una variante más difícil. */
  deload?: boolean
}

// ---------------------------------------------------------------------------
// Calentamiento y vuelta a la calma (D-032)
// ---------------------------------------------------------------------------

/**
 * Lo que abre la sesión, por zona: movilidad de lo que se va a cargar. Tobillo
 * y columna antes de piernas; hombro y columna torácica antes de tren superior.
 * La sesión de movilidad no lleva: ya lo es.
 */
export const WARMUP_EXERCISES: Record<SessionFocus, readonly string[]> = {
  tren_superior: ['angeles-pared', 'rotacion-toracica'],
  tren_inferior: ['tobillo-pared', 'gato-camello'],
  cuerpo_completo: ['gato-camello', 'tobillo-pared'],
  core_movilidad: [],
}

/** Lo que la cierra: estirar y soltar lo trabajado. */
export const COOLDOWN_EXERCISES: Record<SessionFocus, readonly string[]> = {
  tren_superior: ['gato-camello'],
  tren_inferior: ['estiramiento-flexor-cadera', 'estiramiento-isquiotibiales'],
  cuerpo_completo: ['estiramiento-flexor-cadera', 'estiramiento-isquiotibiales'],
  core_movilidad: [],
}

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
    }))
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

/*
 * La última ejecución vive en el dominio de entrenamientos, porque también la
 * usa la pantalla del ejercicio activo. Se reexporta para quien ya la importaba
 * de aquí. Compara contra el objetivo guardado (D-019): un ejercicio a medias no
 * cuenta como hecho y la progresión repite en vez de subir.
 */
export { lastPerformanceOf, type LastPerformance }

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
 * 2. Si la última vez fue «al límite» → también se repite: hecho, pero sin
 *    margen para subir (D-031).
 * 3. Si el ejercicio usa pesa y aún queda margen de carga → sube la carga.
 * 4. En cualquier otro caso → sube repeticiones (o segundos en los
 *    isométricos), el doble si la última vez fue fácil o muy fácil (D-031).
 *
 * En una semana de descarga (D-031) hay una serie menos y no se sube nada.
 * Nunca se sugiere una carga por encima de la pesa que existe.
 */
export function suggestWorkFor(
  exercise: Exercise,
  options: {
    intensity: SessionIntensity
    goals: readonly TrainingGoal[]
    experience: ExperienceLevel
    history?: readonly WorkoutSession[]
    deload?: boolean
  },
): SuggestedWork {
  const { intensity, goals, experience, history = [], deload = false } = options

  const maxSets = MAX_SETS_BY_EXPERIENCE[experience] ?? MAX_SETS_BY_EXPERIENCE[DEFAULT_EXPERIENCE]
  const normalSets = clamp(exercise.work.sets + SET_SHIFT[intensity], MIN_SETS, maxSets)
  const sets = deload ? Math.max(MIN_SETS, normalSets - 1) : normalSets

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

  if (!last.allSetsCompleted || deload || (last.effort !== null && last.effort >= AT_LIMIT_EFFORT)) {
    return { sets, reps: lastReps, weightKg: lastWeight }
  }

  if (loaded && lastWeight !== null && lastWeight < MAX_AVAILABLE_LOAD_KG) {
    return {
      sets,
      reps: lastReps,
      weightKg: Math.min(lastWeight + LOAD_STEP_KG, MAX_AVAILABLE_LOAD_KG),
    }
  }

  const baseStep = exercise.work.isTimed ? HOLD_PROGRESSION_STEP : REP_PROGRESSION_STEP
  const easy = last.effort !== null && last.effort <= EASY_EFFORT
  const step = easy ? baseStep * 2 : baseStep
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
    equipment = AVAILABLE_EQUIPMENT,
    history = [],
    today,
    deload = false,
  } = options

  // Cuándo se usó por última vez cada ejercicio: lo que ordena la rotación (D-020).
  const usage = exerciseUsage(history, { catalog: catalog ?? EXERCISE_CATALOG, today })

  const forFocus = exercisesForFocus(focus, catalog)
  // Filtro innegociable: nada que necesite material inexistente.
  const executable = forFocus.filter((exercise) => isAvailable(exercise, equipment))
  const allowed = exercisesAvoidingGroups(executable, avoidMuscleGroups)

  // Si evitar grupos deja la sesión demasiado corta, es mejor una sesión completa
  // que ninguna: decidir no entrenar es competencia de las reglas, no del constructor.
  const pool = allowed.length >= MIN_EXERCISES ? allowed : executable

  const target = targetDifficultyFor(experience, intensity)
  // El calentamiento y la vuelta a la calma salen del mismo tiempo (D-032).
  const phaseCatalog = catalog ?? EXERCISE_CATALOG
  const warmup = phaseExercises(WARMUP_EXERCISES[focus], 'calentamiento', phaseCatalog)
  const cooldown = phaseExercises(COOLDOWN_EXERCISES[focus], 'vuelta_calma', phaseCatalog)
  const phaseMinutes = (warmup.length + cooldown.length) * PHASE_EXERCISE_MINUTES
  const count = exerciseCountFor(availableMinutes - phaseMinutes)

  const selected = selectExercises(
    pool,
    focus,
    count,
    // En descarga no se pasa a una variante más difícil: sin historial no hay «dominado».
    (exercise) => adaptDifficulty(exercise, target, { history: deload ? [] : history, catalog, equipment }),
    target,
    usage,
  )

  const exercises: PlannedExercise[] = selected.map((exercise) => {
    const work = suggestWorkFor(exercise, { intensity, goals, experience, history, deload })
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
    exercises: [...warmup, ...exercises, ...cooldown],
    ...(deload ? { deload: true } : {}),
  }
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

/** `Fuerza · Tren superior` — el formato que ya usa la interfaz aprobada. */
export function titleFor(focus: SessionFocus, intensity: SessionIntensity): string {
  if (focus === 'core_movilidad') return `Movilidad · ${SESSION_FOCUS_LABELS[focus]}`
  const prefix = intensity === 'ligera' ? 'Sesión ligera' : 'Fuerza'
  return `${prefix} · ${SESSION_FOCUS_LABELS[focus]}`
}
