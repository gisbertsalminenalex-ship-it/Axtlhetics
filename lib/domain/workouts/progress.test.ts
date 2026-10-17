import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG } from './catalog'
import { exerciseHistory, trainedExercises, weeklySetTotals } from './progress'
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

// Historial como lo guarda la app: de la sesión más reciente a la más antigua.
const SESSIONS = [
  session('2026-10-14', [reps('flexiones', [12, 11]), reps('sentadilla', [15])]),
  session('2026-10-10', [reps('flexiones', [20])], { status: 'abandoned' }),
  session('2026-10-07', [reps('flexiones', [10, 9]), reps('gato-camello', [10], { phase: 'calentamiento' })]),
  session('2026-10-01', [reps('flexiones', [8])]),
]

test('D-036: la curva de un ejercicio es la mejor serie de cada sesión completada, de la más antigua a la más reciente', () => {
  assert.deepEqual(exerciseHistory('flexiones', SESSIONS), [
    { dayKey: '2026-10-01', best: 8 },
    { dayKey: '2026-10-07', best: 10 },
    { dayKey: '2026-10-14', best: 12 },
  ])
  assert.deepEqual(exerciseHistory('gato-camello', SESSIONS), [], 'el calentamiento no es una marca')
})

test('D-036: para elegir, los ejercicios hechos, del más hecho al menos, sin movilidad', () => {
  assert.deepEqual(trainedExercises(SESSIONS, EXERCISE_CATALOG).map((exercise) => exercise.id), ['flexiones', 'sentadilla'])
})

test('D-036: series por semana natural, de la más antigua a la actual', () => {
  const weeks = weeklySetTotals(SESSIONS, '2026-10-15', EXERCISE_CATALOG, 3)
  assert.deepEqual(weeks, [
    { weekStart: '2026-09-28', sets: 1 },
    { weekStart: '2026-10-05', sets: 2 },
    { weekStart: '2026-10-12', sets: 3 },
  ])
})
