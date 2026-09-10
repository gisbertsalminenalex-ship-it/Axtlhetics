/**
 * Sesión en curso.
 *
 * Modela el entrenamiento mientras ocurre y lo convierte en una `WorkoutSession`
 * al terminar. Son funciones puras e inmutables: la interfaz solo guarda el estado
 * que devuelven, sin lógica propia.
 *
 * DECISIÓN MÍNIMA: la sesión en curso vive en memoria. Si se cierra la aplicación a
 * media sesión, se pierde. Persistirla es una mejora posterior y no cambia el modelo.
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
