/**
 * «¿Cuántas te quedaban?» (D-052): cuándo se pregunta, qué se guarda y cómo
 * cambia la progresión del ejercicio.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import { suggestWorkFor } from '../axis/session-builder'
import { findExercise } from './catalog'
import {
  completeSet,
  isActiveWorkout,
  performedExercises,
  reserveQuestionFor,
  setReserve,
  startWorkout,
  toWorkoutSession,
} from './active-workout'
import type { CompletedSet, PlannedSession, RepsInReserve, WorkoutSession } from './types'
import { isWorkoutSession } from './types'

const plan: PlannedSession = {
  focus: 'tren_superior',
  title: 'Fuerza · Tren superior',
  intensity: 'moderada',
  estimatedMinutes: 30,
  muscleGroups: ['pecho'],
  exercises: [
    { exerciseId: 'jumping-jacks', name: 'Jumping jacks', sets: 1, reps: 60, isTimed: true, suggestedWeightKg: null, restSeconds: 0, unilateral: false, tempo: null, imageUrl: null, phase: 'calentamiento', warmupPart: 'activacion' },
    { exerciseId: 'flexiones', name: 'Flexiones', sets: 2, reps: 10, isTimed: false, suggestedWeightKg: null, restSeconds: 90, unilateral: false, tempo: null, imageUrl: null },
    { exerciseId: 'plancha', name: 'Plancha', sets: 2, reps: 30, isTimed: true, suggestedWeightKg: null, restSeconds: 60, unilateral: false, tempo: null, imageUrl: null },
    { exerciseId: 'sentadilla', name: 'Sentadilla', sets: 1, reps: 15, isTimed: false, suggestedWeightKg: null, restSeconds: 60, unilateral: false, tempo: null, imageUrl: null },
  ],
}

const proposal: AxisProposal = {
  id: 'p',
  dayKey: '2026-09-08',
  createdAt: '2026-09-08T10:00:00.000Z',
  type: 'TRAINING',
  headline: '',
  reason: '',
  session: plan,
  factors: [],
  label: 'Recomendada',
  rule: 'good_recovery',
}

const START = new Date(2026, 8, 8, 18, 0, 0)

test('se pregunta tras cada serie de un ejercicio del entrenamiento y por repeticiones (D-055)', () => {
  let workout = startWorkout(proposal, START)!
  workout = completeSet(workout, START) // calentamiento
  assert.equal(reserveQuestionFor(workout), null, 'el calentamiento no')
  workout = completeSet(workout, START) // flexiones 1/2
  assert.equal(reserveQuestionFor(workout), 1, 'también en una serie intermedia')
  workout = completeSet(workout, START) // flexiones 2/2
  assert.equal(reserveQuestionFor(workout), 1, 'sí tras la última')
  workout = completeSet(workout, START)
  workout = completeSet(workout, START) // plancha 2/2
  assert.equal(reserveQuestionFor(workout), null, 'por tiempo no')
})

test('lo contestado se guarda con el ejercicio, en el almacén y en la sesión', () => {
  let workout = startWorkout(proposal, START)!
  for (let i = 0; i < 3; i += 1) workout = completeSet(workout, START)
  workout = setReserve(workout, 1, 'tres_mas')
  assert.ok(isActiveWorkout(JSON.parse(JSON.stringify(workout))))
  assert.equal(performedExercises(workout).find((item) => item.exerciseId === 'flexiones')?.reserve, 'tres_mas')
  const session = toWorkoutSession(workout, { status: 'abandoned', completedAt: START })
  assert.ok(isWorkoutSession(JSON.parse(JSON.stringify(session))))
})

function done(reserve: RepsInReserve | undefined, effort: number | null = null): WorkoutSession {
  const sets: CompletedSet[] = [
    { reps: 10, weightKg: null, completed: true },
    { reps: 10, weightKg: null, completed: true },
    { reps: 10, weightKg: null, completed: true },
  ]
  return {
    id: 's',
    dayKey: '2026-09-05',
    startedAt: '2026-09-05T18:00:00.000Z',
    completedAt: '2026-09-05T19:00:00.000Z',
    durationSeconds: 1800,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [{ exerciseId: 'flexiones', name: 'Flexiones', sets, targetSets: 3, targetReps: 10, ...(reserve ? { reserve } : {}) }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

test('0 repite, 1–2 da el paso normal y 3 o más el doble; sin respuesta, manda el esfuerzo de la sesión', () => {
  const flexiones = findExercise('flexiones')!
  const base = { intensity: 'moderada' as const, goal: 'hipertrofia' as const, experience: 'intermedio' as const }
  const reps = (history: WorkoutSession[]) => suggestWorkFor(flexiones, { ...base, history }).reps
  assert.equal(reps([done('ninguna')]), 10)
  assert.equal(reps([done('una_dos')]), 12)
  assert.equal(reps([done('tres_mas')]), 14)
  // Lo del ejercicio manda sobre la sesión: sesión «al límite», pero este iba sobrado.
  assert.equal(reps([done('tres_mas', 5)]), 14)
  // Sin respuesta, como antes.
  assert.equal(reps([done(undefined, 5)]), 10)
  assert.equal(reps([done(undefined, 2)]), 14)
})
