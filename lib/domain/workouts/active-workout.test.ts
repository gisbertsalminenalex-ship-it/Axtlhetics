import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import {
  adjustReps,
  adjustWeight,
  completedSetsTotal,
  completeSet,
  currentEntry,
  currentSetNumber,
  currentVolumeKg,
  isFinished,
  MAX_REPS,
  skipExercise,
  startWorkout,
  toWorkoutSession,
  WEIGHT_STEP_KG,
} from './active-workout'
import type { PlannedSession } from './types'

const plan: PlannedSession = {
  focus: 'tren_superior',
  title: 'Fuerza · Tren superior',
  intensity: 'moderada',
  estimatedMinutes: 45,
  muscleGroups: ['pecho', 'espalda'],
  exercises: [
    {
      exerciseId: 'press-banca',
      name: 'Press banca',
      sets: 2,
      reps: 8,
      isTimed: false,
      suggestedWeightKg: 80,
      restSeconds: 90,
      unilateral: false,
      tempo: null,
      imageUrl: null,
    },
    {
      exerciseId: 'remo-barra',
      name: 'Remo con barra',
      sets: 2,
      reps: 10,
      isTimed: false,
      suggestedWeightKg: null,
      restSeconds: 90,
      unilateral: false,
      tempo: null,
      imageUrl: null,
    },
  ],
}

const proposal: AxisProposal = {
  id: 'proposal-1',
  dayKey: '2026-09-08',
  createdAt: '2026-09-08T10:00:00.000Z',
  type: 'TRAINING',
  headline: 'Entrena tren superior con intensidad moderada.',
  reason: 'Tu recuperación es buena.',
  session: plan,
  factors: [],
  label: 'Recomendada',
}

const START = new Date(2026, 8, 8, 18, 0, 0)

function fresh() {
  const workout = startWorkout(proposal, START)
  assert.ok(workout)
  return workout!
}

test('una propuesta sin sesión no arranca un entrenamiento', () => {
  const restProposal: AxisProposal = { ...proposal, type: 'RECOVERY', session: null }
  assert.equal(startWorkout(restProposal, START), null)
})

test('el entrenamiento arranca en el primer ejercicio con la carga sugerida', () => {
  const workout = fresh()
  const entry = currentEntry(workout)
  assert.equal(entry?.name, 'Press banca')
  assert.equal(entry?.weightKg, 80)
  assert.equal(currentSetNumber(workout), 1)
  assert.equal(isFinished(workout), false)
})

test('completar todas las series de un ejercicio pasa al siguiente', () => {
  let workout = fresh()
  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.name, 'Press banca', 'aún queda una serie')
  assert.equal(currentSetNumber(workout), 2)

  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.name, 'Remo con barra')
})

test('al terminar el último ejercicio la sesión queda finalizada', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  assert.equal(isFinished(workout), true)
  assert.equal(currentEntry(workout), null)
  assert.equal(completedSetsTotal(workout), 4)
})

test('completar una serie más allá del final no rompe nada', () => {
  let workout = fresh()
  for (let i = 0; i < 6; i += 1) workout = completeSet(workout)
  assert.equal(completedSetsTotal(workout), 4)
})

test('el selector de carga sube y baja en escalones y no cruza el cero', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 1)
  assert.equal(currentEntry(workout)?.weightKg, 80 + WEIGHT_STEP_KG)

  for (let i = 0; i < 100; i += 1) workout = adjustWeight(workout, -1)
  assert.equal(currentEntry(workout)?.weightKg, 0)
})

test('un ejercicio sin carga sugerida empieza en nulo y sube desde cero', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.weightKg, null)

  workout = adjustWeight(workout, 1)
  assert.equal(currentEntry(workout)?.weightKg, WEIGHT_STEP_KG)
})

test('las repeticiones se mantienen dentro de un rango razonable', () => {
  let workout = fresh()
  for (let i = 0; i < 100; i += 1) workout = adjustReps(workout, -1)
  assert.equal(currentEntry(workout)?.reps, 1)

  for (let i = 0; i < 100; i += 1) workout = adjustReps(workout, 1)
  assert.equal(currentEntry(workout)?.reps, MAX_REPS)
})

test('se registra lo que realmente se hizo, no lo que se propuso', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 2) // 85 kg
  workout = adjustReps(workout, -2) // 6 reps
  workout = completeSet(workout)

  const entry = workout.entries[0]
  assert.deepEqual(entry.sets[0], { reps: 6, weightKg: 85, completed: true })
  assert.equal(currentVolumeKg(workout), 6 * 85)
})

test('saltar un ejercicio queda registrado como modificación', () => {
  let workout = fresh()
  workout = skipExercise(workout)
  assert.equal(currentEntry(workout)?.name, 'Remo con barra')
  assert.equal(workout.modifications.length, 1)
  assert.equal(workout.modifications[0].kind, 'exercise_skipped')
})

test('la sesión guardada conserva la propuesta que la originó', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)

  const saved = toWorkoutSession(workout, {
    status: 'completed',
    perceivedEffort: 4,
    completedAt: new Date(2026, 8, 8, 19, 0, 0),
  })

  assert.equal(saved.proposal?.proposalId, 'proposal-1')
  assert.equal(saved.proposal?.headline, proposal.headline)
  assert.equal(saved.status, 'completed')
  assert.equal(saved.durationSeconds, 3600)
  assert.equal(saved.perceivedEffort, 4)
  assert.equal(saved.totalVolumeKg, 2 * 8 * 80)
})

test('una sesión incompleta se guarda como acortada, no como completa a medias', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)

  const saved = toWorkoutSession(workout, { status: 'completed' })
  assert.equal(saved.exercises.length, 1)
  assert.ok(saved.modifications.some((item) => item.kind === 'session_shortened'))
})

test('abandonar la sesión queda marcado en el registro', () => {
  const workout = fresh()
  const saved = toWorkoutSession(workout, { status: 'abandoned' })
  assert.equal(saved.status, 'abandoned')
  assert.ok(saved.modifications.some((item) => item.kind === 'session_abandoned'))
  assert.equal(saved.totalVolumeKg, 0)
})

test('la duración nunca es negativa aunque el reloj vaya hacia atrás', () => {
  const workout = fresh()
  const saved = toWorkoutSession(workout, {
    status: 'completed',
    completedAt: new Date(2026, 8, 8, 17, 0, 0),
  })
  assert.ok(saved.durationSeconds >= 0)
})
