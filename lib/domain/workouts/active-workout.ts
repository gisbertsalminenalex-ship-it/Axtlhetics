/**
 * Sesión en curso.
 *
 * Modela el entrenamiento mientras ocurre y lo convierte en una `WorkoutSession`
 * al terminar. Son funciones puras e inmutables: la interfaz solo guarda el estado
 * que devuelven, sin lógica propia.
 *
 * La sesión en curso se persiste tal cual en cada cambio, y al arrancar se
 * decide qué hacer con lo guardado (`reconcileStoredWorkout`). Cerrar la
 * aplicación a media sesión ya no la pierde.
 */

import type { AxisProposal } from '../axis/types'
import { todayKey, type DayKey } from '../shared/dates'
import { createId, clamp } from '../shared/ids'
import {
  extendRestWindow,
  REST_EXTENSION_SECONDS,
  restRemaining,
  startRestWindow,
  type RestState,
  type RestWindow,
} from '../shared/rest'
import type {
  CompletedSet,
  ExercisePhase,
  PerformedExercise,
  PlannedSession,
  ProposalSnapshot,
  SessionModification,
  WorkoutSession,
  WorkoutSessionStatus,
  WarmupPart,
} from './types'
import { isExercisePhase, isMainExercise, isRepsInReserve, isWarmupPart, usesLoad, volumeOfSession } from './types'
import type { RepsInReserve } from './types'
import { findExercise } from './catalog'
import { nextSetAfter, targetReserveFor } from './strength'

/** Escalón del selector de carga, en kg. */
export const WEIGHT_STEP_KG = 0.5
export const MAX_WEIGHT_KG = 400
export const MAX_REPS = 50
/** Los ejercicios de tiempo llegan más lejos: la movilidad articular dura hasta 3 minutos (enmienda de D-045). */
export const MAX_SECONDS = 300

export type ActiveExerciseEntry = {
  exerciseId: string
  name: string
  imageUrl: string | null
  targetSets: number
  targetReps: number
  restSeconds: number
  /** Los isométricos se miden en segundos, no en repeticiones. */
  isTimed: boolean
  /** Se ejecuta un lado cada vez. */
  unilateral: boolean
  /** Repeticiones que se registrarán en la siguiente serie. */
  reps: number
  /** Carga que se registrará en la siguiente serie. `null` si el ejercicio no la usa. */
  weightKg: number | null
  /** Series ya completadas. */
  sets: CompletedSet[]
  /** Calentamiento o vuelta a la calma (D-032). Ausente en el entrenamiento. */
  phase?: ExercisePhase
  /** La parte del calentamiento (D-045). */
  warmupPart?: WarmupPart
  /** Cuántas quedaban en la última serie (D-052). */
  reserve?: RepsInReserve
  /**
   * Los pesos del usuario que sirven para este ejercicio, de menor a mayor
   * (D-046). Es lo que permite bajar o subir de peso a mitad del ejercicio
   * (D-055). Ausente en lo guardado antes y en los ejercicios sin carga.
   */
  loads?: number[]
}

export type ActiveWorkout = {
  id: string
  dayKey: DayKey
  startedAt: string
  proposal: ProposalSnapshot
  plan: PlannedSession
  entries: ActiveExerciseEntry[]
  /** Índice del ejercicio en curso. Igual a `entries.length` cuando ya no queda ninguno. */
  exerciseIndex: number
  modifications: SessionModification[]
  /**
   * El descanso en curso, si lo hay (D-019). Arranca solo al completar una serie
   * y se guarda como instantes, no como una cuenta atrás: así, al recargar,
   * sigue donde iba. Ausente en las sesiones guardadas antes de D-019.
   */
  rest?: RestWindow | null
  /**
   * Dónde se registró la última serie, para poder deshacerla (D-019). Solo la
   * última: deshacer no es un historial, es corregir un toque por error.
   */
  lastSet?: { exerciseIndex: number } | null
  /**
   * El cronómetro de un ejercicio por tiempo en marcha (D-054): dos instantes,
   * como el descanso, para que al recargar siga donde iba. Ausente o `null` si
   * no hay ninguno.
   */
  work?: WorkWindow | null
}

/** Un cronómetro de trabajo: de qué ejercicio, cuándo empezó y cuándo acaba. */
export type WorkWindow = RestWindow & { exerciseIndex: number }

export type WorkState = {
  remainingSeconds: number
  totalSeconds: number
  /** Segundos hechos hasta ahora, sin pasar del total. */
  elapsedSeconds: number
  /** `true` cuando ya llegó a cero. */
  finished: boolean
}

export function snapshotOf(proposal: AxisProposal): ProposalSnapshot {
  return {
    proposalId: proposal.id,
    type: proposal.type,
    headline: proposal.headline,
    reason: proposal.reason,
    focus: proposal.session?.focus ?? null,
    intensity: proposal.session?.intensity ?? null,
    ...(proposal.session?.deload ? { deload: true } : {}),
  }
}

export function startWorkout(
  proposal: AxisProposal,
  now: Date = new Date(),
  /** Los pesos del usuario para cada ejercicio (D-055). */
  loadsOf: (exerciseId: string) => number[] = () => [],
): ActiveWorkout | null {
  if (!proposal.session) return null

  return {
    id: createId(),
    dayKey: todayKey(now),
    startedAt: now.toISOString(),
    proposal: snapshotOf(proposal),
    plan: proposal.session,
    entries: proposal.session.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      imageUrl: exercise.imageUrl,
      targetSets: exercise.sets,
      targetReps: exercise.reps,
      restSeconds: exercise.restSeconds,
      isTimed: exercise.isTimed,
      unilateral: exercise.unilateral,
      reps: exercise.reps,
      weightKg: exercise.suggestedWeightKg,
      sets: [],
      ...(exercise.phase ? { phase: exercise.phase } : {}),
      ...(exercise.warmupPart ? { warmupPart: exercise.warmupPart } : {}),
      ...withLoads(exercise.suggestedWeightKg === null ? [] : loadsOf(exercise.exerciseId)),
    })),
    exerciseIndex: 0,
    modifications: [],
  }
}

function withLoads(loads: number[]): { loads?: number[] } {
  return loads.length > 0 ? { loads } : {}
}

export function currentEntry(workout: ActiveWorkout): ActiveExerciseEntry | null {
  return workout.entries[workout.exerciseIndex] ?? null
}

export function nextEntry(workout: ActiveWorkout): ActiveExerciseEntry | null {
  return workout.entries[workout.exerciseIndex + 1] ?? null
}

export function isFinished(workout: ActiveWorkout): boolean {
  return workout.exerciseIndex >= workout.entries.length
}

/** Serie en curso dentro del ejercicio actual, empezando en 1. */
export function currentSetNumber(workout: ActiveWorkout): number {
  const entry = currentEntry(workout)
  if (!entry) return 0
  return Math.min(entry.sets.length + 1, entry.targetSets)
}

function replaceEntry(
  workout: ActiveWorkout,
  index: number,
  update: (entry: ActiveExerciseEntry) => ActiveExerciseEntry,
): ActiveWorkout {
  return {
    ...workout,
    entries: workout.entries.map((entry, i) => (i === index ? update(entry) : entry)),
  }
}

/**
 * `true` si al ejercicio se le pueden poner kilos: lleva pesa en el catálogo o
 * ya trae una carga. A una flexión o a una plancha no: no hay selector de kg.
 */
export function takesWeight(entry: Pick<ActiveExerciseEntry, 'exerciseId' | 'weightKg'>): boolean {
  if (entry.weightKg !== null) return true
  const exercise = findExercise(entry.exerciseId)
  return exercise !== null && usesLoad(exercise)
}

export function adjustWeight(workout: ActiveWorkout, delta: number): ActiveWorkout {
  return replaceEntry(workout, workout.exerciseIndex, (entry) =>
    takesWeight(entry)
      ? { ...entry, weightKg: clamp((entry.weightKg ?? 0) + delta * WEIGHT_STEP_KG, 0, MAX_WEIGHT_KG) }
      : entry,
  )
}

export function adjustReps(workout: ActiveWorkout, delta: number): ActiveWorkout {
  return replaceEntry(workout, workout.exerciseIndex, (entry) => ({
    ...entry,
    reps: clamp(entry.reps + delta, 1, entry.isTimed ? MAX_SECONDS : MAX_REPS),
  }))
}

/**
 * Registra la serie actual. Cuando se completan todas las series previstas de un
 * ejercicio, avanza al siguiente.
 *
 * Si queda algo por hacer, arranca el descanso del ejercicio que se acaba de
 * trabajar (D-019). Tras la última serie de la sesión no hay descanso: la
 * sesión termina.
 */
export function completeSet(workout: ActiveWorkout, now: Date = new Date()): ActiveWorkout {
  const entry = currentEntry(workout)
  if (!entry) return workout

  const set: CompletedSet = {
    reps: entry.reps,
    weightKg: entry.weightKg,
    completed: true,
  }

  const updated = replaceEntry(workout, workout.exerciseIndex, (current) => ({
    ...current,
    sets: [...current.sets, set],
  }))

  const finishedExercise = entry.sets.length + 1 >= entry.targetSets
  const exerciseIndex = finishedExercise ? updated.exerciseIndex + 1 : updated.exerciseIndex
  const somethingLeft = exerciseIndex < updated.entries.length

  return {
    ...updated,
    exerciseIndex,
    rest:
      somethingLeft && entry.restSeconds > 0 ? startRestWindow(entry.restSeconds, now) : null,
    work: null,
    lastSet: { exerciseIndex: workout.exerciseIndex },
  }
}

/**
 * El ejercicio por el que preguntar «¿cuántas te quedaban?»: el de la serie
 * recién hecha, en cada serie (D-055) y no solo en la última (D-052), si es del
 * entrenamiento y por repeticiones. `null` si no toca preguntar.
 */
export function reserveQuestionFor(workout: ActiveWorkout): number | null {
  const index = workout.lastSet?.exerciseIndex
  if (index === undefined || index === null) return null
  const entry = workout.entries[index]
  if (!entry || entry.phase || entry.isTimed || entry.sets.length === 0) return null
  // Solo justo después: la serie del ejercicio en curso, o la última del que se acaba de terminar.
  if (index === workout.exerciseIndex) return index
  return index === workout.exerciseIndex - 1 && entry.sets.length >= entry.targetSets ? index : null
}

/** La reserva que se busca en cada serie de esta sesión (D-055). */
export function targetReserveOf(workout: ActiveWorkout): RepsInReserve {
  return targetReserveFor(workout.plan)
}

/**
 * Apunta cuántas quedaban en la serie recién hecha (D-055). En la última del
 * ejercicio queda además como la reserva del ejercicio, la que lee la
 * progresión (D-052). Si quedan series, la siguiente se ajusta: más ligera si
 * quedaban menos de las buscadas, más pesada si quedaban más.
 */
export function setReserve(workout: ActiveWorkout, index: number, reserve: RepsInReserve): ActiveWorkout {
  const entry = workout.entries[index]
  const done = entry?.sets[entry.sets.length - 1]
  if (!entry || !done) return workout

  const target = targetReserveOf(workout)
  const finished = entry.sets.length >= entry.targetSets
  return replaceEntry(workout, index, (current) => {
    const sets = [...current.sets.slice(0, -1), { ...done, reserve }]
    if (finished) return { ...current, sets, reserve }
    const next = nextSetAfter(done, reserve, target, {
      loads: current.loads ?? [],
      targetReps: current.targetReps,
      maxReps: MAX_REPS,
    })
    return { ...current, sets, reps: next.reps, weightKg: next.weightKg }
  })
}

/**
 * Lo que AXIS dice de la siguiente serie tras el ajuste (D-055), o `null` si
 * no cambió nada. Se lee comparando la serie hecha con lo que queda preparado.
 */
export function nextSetAdvice(workout: ActiveWorkout, index: number): string | null {
  const entry = workout.entries[index]
  const done = entry?.sets[entry.sets.length - 1]
  if (!entry || !done?.reserve || entry.sets.length >= entry.targetSets) return null
  const kg = (value: number) => `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg`
  if (entry.weightKg !== null && done.weightKg !== null && entry.weightKg !== done.weightKg) {
    const verb = entry.weightKg < done.weightKg ? 'Baja' : 'Sube'
    return `${verb} a ${kg(entry.weightKg)} y ${entry.reps} repeticiones en la siguiente.`
  }
  if (entry.reps < done.reps) return `Mismo peso, ${entry.reps} repeticiones en la siguiente.`
  if (entry.reps > done.reps) return `Te sobra margen: ${entry.reps} repeticiones en la siguiente.`
  return null
}

// ---------------------------------------------------------------------------
// Cronómetro de los ejercicios por tiempo (D-054)
// ---------------------------------------------------------------------------

/** Arranca el cronómetro del ejercicio actual, si es por tiempo y no hay descanso en curso. */
export function startWork(workout: ActiveWorkout, now: Date = new Date()): ActiveWorkout {
  const entry = currentEntry(workout)
  if (!entry || !entry.isTimed || restRemaining(workout.rest, now)) return workout
  return { ...workout, rest: null, work: { ...startRestWindow(entry.reps, now), exerciseIndex: workout.exerciseIndex } }
}

/** El cronómetro en marcha en el instante `now`, o `null` si no hay ninguno del ejercicio actual. */
export function workState(workout: ActiveWorkout, now: Date = new Date()): WorkState | null {
  const work = workout.work
  if (!work || work.exerciseIndex !== workout.exerciseIndex) return null
  const startedAt = new Date(work.startedAt).getTime()
  const endsAt = new Date(work.endsAt).getTime()
  const totalSeconds = Math.max(1, Math.round((endsAt - startedAt) / 1000))
  const remainingMs = endsAt - now.getTime()
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const elapsedSeconds = Math.min(totalSeconds, Math.max(0, Math.floor((now.getTime() - startedAt) / 1000)))
  return { remainingSeconds, totalSeconds, elapsedSeconds, finished: remainingMs <= 0 }
}

/**
 * Cierra el cronómetro y registra la serie con los segundos hechos: los del
 * total si llegó a cero, los que van si se termina antes. Sin un segundo
 * hecho no registra nada.
 */
export function completeWork(workout: ActiveWorkout, now: Date = new Date()): ActiveWorkout {
  const state = workState(workout, now)
  if (!state) return workout
  const seconds = state.finished ? state.totalSeconds : state.elapsedSeconds
  if (seconds < 1) return { ...workout, work: null }
  const withSeconds = replaceEntry(workout, workout.exerciseIndex, (entry) => ({ ...entry, reps: seconds }))
  return completeSet({ ...withSeconds, work: null }, now)
}

/** Para el cronómetro sin registrar nada. */
export function cancelWork(workout: ActiveWorkout): ActiveWorkout {
  return workout.work ? { ...workout, work: null } : workout
}

/** Pasa al siguiente ejercicio dejando constancia de que se saltó. */
export function skipExercise(workout: ActiveWorkout): ActiveWorkout {
  const entry = currentEntry(workout)
  if (!entry) return workout

  // El calentamiento y la vuelta a la calma se pueden saltar sin dejar rastro:
  // no son el entrenamiento, y saltarlos no es rechazar un ejercicio (D-032).
  const skipped = entry.phase
    ? []
    : [{ kind: 'exercise_skipped' as const, detail: `${entry.name} sin completar.` }]

  return {
    ...workout,
    exerciseIndex: workout.exerciseIndex + 1,
    modifications: [...workout.modifications, ...skipped],
    // Saltar cierra lo que hubiera pendiente: ni descanso, ni cronómetro, ni serie que deshacer.
    rest: null,
    work: null,
    lastSet: null,
  }
}

// ---------------------------------------------------------------------------
// Descanso (D-019)
// ---------------------------------------------------------------------------

export { REST_EXTENSION_SECONDS }
export type { RestState }

/** El descanso en curso en el instante `now`, o `null` si no hay ninguno o ya acabó. */
export function restState(workout: ActiveWorkout, now: Date = new Date()): RestState | null {
  return restRemaining(workout.rest, now)
}

/** Termina el descanso ahora. */
export function skipRest(workout: ActiveWorkout): ActiveWorkout {
  return workout.rest ? { ...workout, rest: null } : workout
}

/** Alarga el descanso en curso. Sin descanso, no hace nada. */
export function extendRest(
  workout: ActiveWorkout,
  seconds: number = REST_EXTENSION_SECONDS,
  now: Date = new Date(),
): ActiveWorkout {
  const rest = workout.rest ? extendRestWindow(workout.rest, seconds, now) : null
  return rest ? { ...workout, rest } : workout
}

// ---------------------------------------------------------------------------
// Deshacer la última serie (D-019)
// ---------------------------------------------------------------------------

/** `true` si hay una serie recién registrada que se puede deshacer. */
export function canUndoLastSet(workout: ActiveWorkout): boolean {
  const index = workout.lastSet?.exerciseIndex
  if (index === undefined || index === null) return false
  return (workout.entries[index]?.sets.length ?? 0) > 0
}

/**
 * Quita la última serie registrada y vuelve a ella, aunque hubiera hecho pasar
 * al siguiente ejercicio. Las repeticiones y la carga vuelven a las de esa serie,
 * para que repetirla sea un solo toque. Se cancela el descanso que había abierto.
 */
export function undoLastSet(workout: ActiveWorkout): ActiveWorkout {
  if (!canUndoLastSet(workout)) return workout
  const index = workout.lastSet!.exerciseIndex
  const entry = workout.entries[index]
  const removed = entry.sets[entry.sets.length - 1]

  const updated = replaceEntry(workout, index, (current) => {
    // La reserva del ejercicio era la de su última serie: si se deshace, se va con ella.
    const { reserve: _reserve, ...rest } = current
    return { ...rest, reps: removed.reps, weightKg: removed.weightKg, sets: current.sets.slice(0, -1) }
  })

  return { ...updated, exerciseIndex: index, rest: null, work: null, lastSet: null }
}

export function performedExercises(workout: ActiveWorkout): PerformedExercise[] {
  return workout.entries
    .filter((entry) => entry.sets.length > 0)
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      name: entry.name,
      sets: entry.sets,
      // El objetivo viaja con lo hecho: es lo que dirá si se completó (D-019).
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      ...(entry.phase ? { phase: entry.phase } : {}),
      ...(entry.warmupPart ? { warmupPart: entry.warmupPart } : {}),
      ...(entry.reserve ? { reserve: entry.reserve } : {}),
    }))
}

export function completedSetsTotal(workout: ActiveWorkout): number {
  return workout.entries.reduce((total, entry) => total + entry.sets.length, 0)
}

export function currentVolumeKg(workout: ActiveWorkout): number {
  return volumeOfSession(performedExercises(workout))
}

/**
 * Cierra la sesión y produce el registro que se guarda en el historial: lo que
 * realmente se hizo, junto con la propuesta que lo originó y las diferencias.
 */
export function toWorkoutSession(
  workout: ActiveWorkout,
  options: {
    status: WorkoutSessionStatus
    /** Cuánto costó, 1–5 (D-019). */
    effort?: number | null
    completedAt?: Date
  },
): WorkoutSession {
  const completedAt = options.completedAt ?? new Date()
  const exercises = performedExercises(workout)

  const modifications = [...workout.modifications]
  if (options.status === 'abandoned') {
    modifications.push({ kind: 'session_abandoned', detail: 'Sesión interrumpida antes de terminar.' })
  } else {
    // Solo cuenta el entrenamiento: saltarse la vuelta a la calma no acorta la sesión (D-032).
    const done = exercises.filter(isMainExercise).length
    const planned = workout.entries.filter(isMainExercise).length
    if (done < planned) {
      modifications.push({
        kind: 'session_shortened',
        detail: `Se completaron ${done} de ${planned} ejercicios.`,
      })
    }
  }

  const durationSeconds = Math.max(
    0,
    Math.round((completedAt.getTime() - new Date(workout.startedAt).getTime()) / 1000),
  )

  return {
    id: workout.id,
    dayKey: workout.dayKey,
    startedAt: workout.startedAt,
    completedAt: completedAt.toISOString(),
    durationSeconds,
    focus: workout.plan.focus,
    title: workout.plan.title,
    intensity: workout.plan.intensity,
    muscleGroups: workout.plan.muscleGroups,
    exercises,
    totalVolumeKg: volumeOfSession(exercises),
    status: options.status,
    // La sensación ya no se pide (D-019); el campo se conserva para lo guardado antes.
    perceivedEffort: null,
    effort: options.effort ?? null,
    proposal: workout.proposal,
    modifications,
    notes: null,
    ...(workout.plan.goal ? { goal: workout.plan.goal } : {}),
  }
}

/** Deja constancia de que el usuario cambió la propuesta antes de empezar. */
export function markProposalChanged(
  workout: ActiveWorkout,
  fromHeadline: string,
): ActiveWorkout {
  return {
    ...workout,
    modifications: [
      ...workout.modifications,
      { kind: 'proposal_changed', detail: `Se cambió la propuesta inicial: ${fromHeadline}` },
    ],
  }
}

// ---------------------------------------------------------------------------
// Reanudar una sesión guardada
// ---------------------------------------------------------------------------

/** `true` si el usuario ha completado al menos una serie. */
export function hasProgress(workout: ActiveWorkout): boolean {
  return workout.entries.some((entry) => entry.sets.length > 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCompletedSet(value: unknown): value is CompletedSet {
  return (
    isRecord(value) &&
    typeof value.reps === 'number' &&
    (value.weightKg === null || typeof value.weightKg === 'number') &&
    typeof value.completed === 'boolean' &&
    (value.reserve === undefined || isRepsInReserve(value.reserve))
  )
}

function isActiveEntry(value: unknown): value is ActiveExerciseEntry {
  return (
    isRecord(value) &&
    typeof value.exerciseId === 'string' &&
    typeof value.name === 'string' &&
    (value.imageUrl === null || typeof value.imageUrl === 'string') &&
    typeof value.targetSets === 'number' &&
    typeof value.targetReps === 'number' &&
    typeof value.restSeconds === 'number' &&
    typeof value.isTimed === 'boolean' &&
    typeof value.unilateral === 'boolean' &&
    typeof value.reps === 'number' &&
    (value.weightKg === null || typeof value.weightKg === 'number') &&
    Array.isArray(value.sets) &&
    value.sets.every(isCompletedSet) &&
    (value.phase === undefined || isExercisePhase(value.phase)) &&
    (value.warmupPart === undefined || isWarmupPart(value.warmupPart)) &&
    (value.reserve === undefined || isRepsInReserve(value.reserve)) &&
    (value.loads === undefined ||
      (Array.isArray(value.loads) && value.loads.every((kg) => typeof kg === 'number' && kg > 0)))
  )
}

function isProposalSnapshot(value: unknown): value is ProposalSnapshot {
  return (
    isRecord(value) &&
    typeof value.proposalId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.headline === 'string' &&
    typeof value.reason === 'string'
  )
}

/** Solo lo que `toWorkoutSession` necesita para cerrar la sesión. */
function isPlannedSession(value: unknown): value is PlannedSession {
  return (
    isRecord(value) &&
    typeof value.focus === 'string' &&
    typeof value.title === 'string' &&
    typeof value.intensity === 'string' &&
    typeof value.estimatedMinutes === 'number' &&
    Array.isArray(value.muscleGroups) &&
    Array.isArray(value.exercises)
  )
}

/**
 * Comprueba que lo leído del almacenamiento tiene la forma de una sesión en curso.
 *
 * Lo que hay en disco pudo escribirlo cualquier versión de la aplicación. Antes
 * que reanudar algo a medias y romper la pantalla, se descarta: perder una sesión
 * corrupta es mejor que no poder abrir la app.
 */
export function isActiveWorkout(value: unknown): value is ActiveWorkout {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.dayKey !== 'string') return false
  if (typeof value.startedAt !== 'string' || Number.isNaN(Date.parse(value.startedAt))) {
    return false
  }
  if (!isProposalSnapshot(value.proposal) || !isPlannedSession(value.plan)) return false
  if (!Array.isArray(value.entries) || !value.entries.every(isActiveEntry)) return false
  if (!Array.isArray(value.modifications)) return false
  if (!isOptionalRest(value.rest)) return false
  if (!isOptionalWork(value.work, value.entries.length)) return false
  if (!isOptionalLastSet(value.lastSet, value.entries.length)) return false
  return (
    typeof value.exerciseIndex === 'number' &&
    Number.isInteger(value.exerciseIndex) &&
    value.exerciseIndex >= 0 &&
    value.exerciseIndex <= value.entries.length
  )
}

/** Ausente o `null` en lo guardado antes de D-054; si está, dos instantes y un ejercicio que existe. */
function isOptionalWork(value: unknown, entryCount: number): boolean {
  if (value === undefined || value === null) return true
  return (
    isOptionalRest(value) &&
    isRecord(value) &&
    typeof value.exerciseIndex === 'number' &&
    Number.isInteger(value.exerciseIndex) &&
    value.exerciseIndex >= 0 &&
    value.exerciseIndex < entryCount
  )
}

/** Ausente o `null` en lo guardado antes de D-019; si está, dos instantes válidos. */
function isOptionalRest(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return (
    isRecord(value) &&
    typeof value.startedAt === 'string' &&
    typeof value.endsAt === 'string' &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    !Number.isNaN(Date.parse(value.endsAt))
  )
}

function isOptionalLastSet(value: unknown, entryCount: number): boolean {
  if (value === undefined || value === null) return true
  return (
    isRecord(value) &&
    Number.isInteger(value.exerciseIndex) &&
    (value.exerciseIndex as number) >= 0 &&
    (value.exerciseIndex as number) < entryCount
  )
}

export type StoredWorkoutOutcome =
  /** Es de hoy: se sigue exactamente donde se dejó. */
  | { kind: 'resume'; workout: ActiveWorkout }
  /** Es de otro día y tenía series hechas: pasa al historial como abandonada. */
  | { kind: 'archive'; session: WorkoutSession }
  /** No sirve: de otro día sin nada hecho, o con una forma que no se entiende. */
  | { kind: 'discard' }

/**
 * Decide qué hacer con una sesión que quedó guardada al cerrar la aplicación.
 *
 * Se aplica la misma regla que al abandonar a mano: una sesión sin ninguna serie
 * no ensucia el historial, y una con series se guarda como abandonada (o como
 * completada, si ya no quedaba nada por hacer). El
 * momento de cierre es `savedAt`, la última vez que se escribió el registro, que
 * es un dato real; usar «ahora» inventaría una duración de horas o días.
 */
export function reconcileStoredWorkout(
  stored: unknown,
  options: { today: DayKey; savedAt: string },
): StoredWorkoutOutcome {
  if (!isActiveWorkout(stored)) return { kind: 'discard' }
  if (stored.dayKey === options.today) return { kind: 'resume', workout: stored }
  if (!hasProgress(stored)) return { kind: 'discard' }

  const savedAt = new Date(options.savedAt)
  const completedAt = Number.isNaN(savedAt.getTime()) ? new Date(stored.startedAt) : savedAt

  // Si ya no quedaba ningún ejercicio, la sesión se hizo entera: la app se cerró
  // entre la última serie y el resumen. Lo contrario sería registrar como
  // abandonado un entrenamiento terminado.
  return {
    kind: 'archive',
    session: toWorkoutSession(stored, {
      status: isFinished(stored) ? 'completed' : 'abandoned',
      completedAt,
    }),
  }
}
