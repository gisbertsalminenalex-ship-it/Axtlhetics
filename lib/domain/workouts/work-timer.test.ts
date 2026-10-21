/**
 * El cronómetro de los ejercicios por tiempo (D-054).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import {
  cancelWork,
  completeSet,
  completeWork,
  currentEntry,
  isActiveWorkout,
  restState,
  skipExercise,
  startWork,
  startWorkout,
  workState,
} from './active-workout'
import type { PlannedSession } from './types'

const plan: PlannedSession = {
  focus: 'core_movilidad',
  title: 'Movilidad · Core y movilidad',
  intensity: 'ligera',
  estimatedMinutes: 10,
  muscleGroups: ['core'],
  exercises: [
    { exerciseId: 'plancha', name: 'Plancha', sets: 2, reps: 30, isTimed: true, suggestedWeightKg: null, restSeconds: 60, unilateral: false, tempo: null, imageUrl: null },
    { exerciseId: 'dead-bug', name: 'Dead bug', sets: 2, reps: 10, isTimed: false, suggestedWeightKg: null, restSeconds: 45, unilateral: false, tempo: null, imageUrl: null },
  ],
}

const proposal: AxisProposal = {
  id: 'p',
  dayKey: '2026-10-21',
  createdAt: '2026-10-21T10:00:00.000Z',
  type: 'LIGHT_TRAINING',
  headline: '',
  reason: '',
  session: plan,
  factors: [],
  label: 'Recomendada',
  rule: 'good_recovery',
}

const T0 = new Date(2026, 9, 21, 18, 0, 0)
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

test('el cronómetro arranca con los segundos del ejercicio y cuenta hacia atrás', () => {
  const workout = startWork(startWorkout(proposal, T0)!, T0)
  assert.deepEqual(workState(workout, at(10)), { remainingSeconds: 20, totalSeconds: 30, elapsedSeconds: 10, finished: false })
  assert.equal(workState(workout, at(30))?.finished, true)
})

test('al llegar a cero registra la serie con los segundos previstos y empieza el descanso', () => {
  const done = completeWork(startWork(startWorkout(proposal, T0)!, T0), at(31))
  assert.equal(done.entries[0].sets.length, 1)
  assert.equal(done.entries[0].sets[0].reps, 30)
  assert.equal(done.work, null)
  assert.ok(restState(done, at(32)), 'arranca el descanso')
})

test('«Terminar ya» registra los segundos hechos; sin un segundo, no registra nada', () => {
  const early = completeWork(startWork(startWorkout(proposal, T0)!, T0), at(18))
  assert.equal(early.entries[0].sets[0].reps, 18)
  const instant = completeWork(startWork(startWorkout(proposal, T0)!, T0), T0)
  assert.equal(instant.entries[0].sets.length, 0)
  assert.equal(instant.work, null)
})

test('«Cancelar» para el cronómetro sin registrar nada', () => {
  const cancelled = cancelWork(startWork(startWorkout(proposal, T0)!, T0))
  assert.equal(cancelled.work, null)
  assert.equal(cancelled.entries[0].sets.length, 0)
})

test('solo en ejercicios por tiempo y nunca durante un descanso', () => {
  let workout = startWorkout(proposal, T0)!
  workout = completeSet(workout, T0) // plancha 1/2 → descanso de 60 s
  assert.equal(startWork(workout, at(5)).work ?? null, null, 'en el descanso no')
  workout = skipExercise(workout) // al dead bug, por repeticiones
  assert.equal(currentEntry(workout)?.exerciseId, 'dead-bug')
  assert.equal(startWork(workout, at(100)).work ?? null, null, 'por repeticiones no')
})

test('saltar el ejercicio cierra el cronómetro, y lo guardado sigue siendo válido', () => {
  const running = startWork(startWorkout(proposal, T0)!, T0)
  assert.ok(isActiveWorkout(JSON.parse(JSON.stringify(running))), 'al recargar sigue donde iba')
  assert.equal(skipExercise(running).work, null)
  assert.equal(workState(skipExercise(running), at(5)), null)
})
