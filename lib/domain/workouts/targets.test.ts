import assert from 'node:assert/strict'
import test from 'node:test'

import { isUserProfile, type GoalTarget, type UserProfile } from '../profile/types'
import { bestSetOf, isOpenTarget, targetProgress } from './targets'
import type { PerformedExercise, WorkoutSession } from './types'

function session(dayKey: string, exercises: PerformedExercise[], partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises,
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

const reps = (exerciseId: string, values: number[], partial: Partial<PerformedExercise> = {}): PerformedExercise => ({
  exerciseId,
  name: exerciseId,
  sets: values.map((value) => ({ reps: value, weightKg: null, completed: true })),
  ...partial,
})

/** 12 flexiones en 10 semanas, empezando en 6, creado el 1 de octubre. */
const TARGET: GoalTarget = {
  id: 't1',
  exerciseId: 'flexiones',
  target: 12,
  deadline: '2026-12-10',
  startValue: 6,
  createdAt: '2026-10-01T09:00:00.000Z',
}

test('D-035: la mejor serie sale de sesiones completadas y solo del entrenamiento', () => {
  const sessions = [
    session('2026-10-02', [reps('flexiones', [8, 7, 6])]),
    session('2026-10-03', [reps('flexiones', [14])], { status: 'abandoned' }),
    session('2026-10-04', [reps('flexiones', [20], { phase: 'calentamiento' })]),
  ]
  assert.equal(bestSetOf('flexiones', sessions), 8)
  assert.equal(bestSetOf('sentadilla', sessions), 0)
})

test('D-035: por la línea recta, se va bien, por detrás, conseguido o con la fecha pasada', () => {
  // A mitad de camino (5 semanas) tocaría estar en 9.
  const middle = '2026-11-05'
  assert.equal(targetProgress(TARGET, [session('2026-11-01', [reps('flexiones', [9])])], middle).status, 'on_track')
  assert.equal(targetProgress(TARGET, [session('2026-11-01', [reps('flexiones', [6])])], middle).status, 'behind')
  assert.equal(targetProgress(TARGET, [session('2026-11-01', [reps('flexiones', [12])])], middle).status, 'achieved')
  assert.equal(targetProgress(TARGET, [session('2026-11-01', [reps('flexiones', [10])])], '2026-12-11').status, 'expired')

  const progress = targetProgress(TARGET, [], middle)
  assert.equal(progress.expected, 9, "a mitad de los 70 días, a mitad de camino")
  assert.equal(progress.daysLeft, 35)
  assert.equal(isOpenTarget(progress), true)
})

test('D-035: el perfil valida sus objetivos; sin ellos sigue siendo válido', () => {
  const base: UserProfile = {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  }
  assert.equal(isUserProfile(base), true)
  assert.equal(isUserProfile({ ...base, targets: [TARGET] }), true)
  assert.equal(isUserProfile({ ...base, targets: [{ ...TARGET, target: 0 }] }), false)
  assert.equal(isUserProfile({ ...base, targets: [{ ...TARGET, deadline: 'mañana' }] }), false)
})
