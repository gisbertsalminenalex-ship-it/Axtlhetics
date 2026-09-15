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
import type {
  CompletedSet,
  PerformedExercise,
  PlannedSession,
  ProposalSnapshot,
  SessionModification,
  WorkoutSession,
  WorkoutSessionStatus,
} from './types'
import { volumeOfSession } from './types'

/** Escalón del selector de carga, en kg. */
export const WEIGHT_STEP_KG = 2.5
export const MAX_WEIGHT_KG = 400
export const MAX_REPS = 50

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
}

export function snapshotOf(proposal: AxisProposal): ProposalSnapshot {
  return {
    proposalId: proposal.id,
    type: proposal.type,
    headline: proposal.headline,
    reason: proposal.reason,
    focus: proposal.session?.focus ?? null,
    intensity: proposal.session?.intensity ?? null,
  }
}

export function startWorkout(
  proposal: AxisProposal,
  now: Date = new Date(),
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
    })),
    exerciseIndex: 0,
    modifications: [],
  }
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

export function adjustWeight(workout: ActiveWorkout, delta: number): ActiveWorkout {
  return replaceEntry(workout, workout.exerciseIndex, (entry) => ({
    ...entry,
    weightKg: clamp((entry.weightKg ?? 0) + delta * WEIGHT_STEP_KG, 0, MAX_WEIGHT_KG),
  }))
}

export function adjustReps(workout: ActiveWorkout, delta: number): ActiveWorkout {
  return replaceEntry(workout, workout.exerciseIndex, (entry) => ({
    ...entry,
    reps: clamp(entry.reps + delta, 1, MAX_REPS),
  }))
}

/**
 * Registra la serie actual. Cuando se completan todas las series previstas de un
 * ejercicio, avanza al siguiente.
 */
export function completeSet(workout: ActiveWorkout): ActiveWorkout {
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
  return finishedExercise
    ? { ...updated, exerciseIndex: updated.exerciseIndex + 1 }
    : updated
}

/** Pasa al siguiente ejercicio dejando constancia de que se saltó. */
export function skipExercise(workout: ActiveWorkout): ActiveWorkout {
  const entry = currentEntry(workout)
  if (!entry) return workout

  return {
    ...workout,
    exerciseIndex: workout.exerciseIndex + 1,
    modifications: [
      ...workout.modifications,
      { kind: 'exercise_skipped', detail: `${entry.name} sin completar.` },
    ],
  }
}

export function performedExercises(workout: ActiveWorkout): PerformedExercise[] {
  return workout.entries
    .filter((entry) => entry.sets.length > 0)
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      name: entry.name,
      sets: entry.sets,
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
    perceivedEffort?: number | null
    completedAt?: Date
  },
): WorkoutSession {
  const completedAt = options.completedAt ?? new Date()
  const exercises = performedExercises(workout)

  const modifications = [...workout.modifications]
  if (options.status === 'abandoned') {
    modifications.push({ kind: 'session_abandoned', detail: 'Sesión interrumpida antes de terminar.' })
  } else if (exercises.length < workout.entries.length) {
    modifications.push({
      kind: 'session_shortened',
      detail: `Se completaron ${exercises.length} de ${workout.entries.length} ejercicios.`,
    })
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
    perceivedEffort: options.perceivedEffort ?? null,
    proposal: workout.proposal,
    modifications,
    notes: null,
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
    typeof value.completed === 'boolean'
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
    value.sets.every(isCompletedSet)
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
  return (
    typeof value.exerciseIndex === 'number' &&
    Number.isInteger(value.exerciseIndex) &&
    value.exerciseIndex >= 0 &&
    value.exerciseIndex <= value.entries.length
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
