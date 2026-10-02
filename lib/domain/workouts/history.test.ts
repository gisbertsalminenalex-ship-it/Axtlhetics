/**
 * Lo que dicen las sesiones anteriores (D-019): la última vez, cómo se dice una
 * serie y los récords. Todo frente a datos registrados; nada se supone.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatKg,
  formatSets,
  lastPerformanceOf,
  lastPerformedExercise,
  personalRecords,
} from './history'
import type { CompletedSet, PerformedExercise, WorkoutSession } from './types'

let nextId = 0

function set(reps: number, weightKg: number | null = null): CompletedSet {
  return { reps, weightKg, completed: true }
}

function exercise(
  exerciseId: string,
  sets: CompletedSet[],
  target?: { sets: number; reps: number },
): PerformedExercise {
  return {
    exerciseId,
    name: exerciseId === 'remo' ? 'Remo unilateral' : 'Flexiones',
    sets,
    ...(target ? { targetSets: target.sets, targetReps: target.reps } : {}),
  }
}

function session(
  exercises: PerformedExercise[],
  partial: Partial<WorkoutSession> = {},
): WorkoutSession {
  nextId += 1
  return {
    id: `s-${nextId}`,
    dayKey: '2026-09-07',
    startedAt: '2026-09-07T18:00:00.000Z',
    completedAt: '2026-09-07T18:40:00.000Z',
    durationSeconds: 2400,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda'],
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

// ---------------------------------------------------------------------------
// La última vez
// ---------------------------------------------------------------------------

test('la última vez es la sesión completada más reciente que tiene el ejercicio', () => {
  const recent = session([exercise('remo', [set(10, 5)])])
  const older = session([exercise('remo', [set(8, 4)])])
  assert.equal(lastPerformedExercise('remo', [recent, older])?.sets[0].weightKg, 5)
})

test('una sesión interrumpida no cuenta como la última vez', () => {
  const abandoned = session([exercise('remo', [set(4, 5)])], { status: 'abandoned' })
  const completed = session([exercise('remo', [set(10, 4.5)])])
  assert.equal(lastPerformedExercise('remo', [abandoned, completed])?.sets[0].weightKg, 4.5)
})

test('sin registro del ejercicio no hay última vez', () => {
  assert.equal(lastPerformedExercise('remo', [session([exercise('flexiones', [set(10)])])]), null)
  assert.equal(lastPerformanceOf('remo', []), null)
})

test('la progresión no da por hecho un ejercicio con menos series de las previstas', () => {
  const history = [session([exercise('remo', [set(10, 5), set(10, 5)], { sets: 3, reps: 10 })])]
  assert.equal(lastPerformanceOf('remo', history)?.allSetsCompleted, false)
})

test('la progresión no da por hecho un ejercicio con reps por debajo de lo previsto', () => {
  const history = [session([exercise('remo', [set(10, 5), set(10, 5), set(7, 5)], { sets: 3, reps: 10 })])]
  assert.equal(lastPerformanceOf('remo', history)?.allSetsCompleted, false)
})

test('lo previsto, entero, sí cuenta como hecho', () => {
  const history = [session([exercise('remo', [set(10, 5), set(11, 5), set(10, 5)], { sets: 3, reps: 10 })])]
  assert.equal(lastPerformanceOf('remo', history)?.allSetsCompleted, true)
})

test('sin objetivo guardado —sesiones anteriores a D-019— se juzga como antes', () => {
  const legacy = [session([exercise('remo', [set(10, 5), set(10, 5)])])]
  assert.equal(lastPerformanceOf('remo', legacy)?.allSetsCompleted, true)
})

// ---------------------------------------------------------------------------
// Cómo se dice una serie
// ---------------------------------------------------------------------------

test('series iguales se resumen; distintas se dicen todas', () => {
  assert.equal(formatSets([set(10, 5), set(10, 5), set(10, 5)], { isTimed: false }), '3 × 10 · 5 kg')
  assert.equal(formatSets([set(10, 5), set(8, 5), set(6, 5)], { isTimed: false }), '10, 8, 6 · 5 kg')
})

test('sin carga no hay kg, y los isométricos van en segundos', () => {
  assert.equal(formatSets([set(12), set(12)], { isTimed: false }), '2 × 12')
  assert.equal(formatSets([set(30), set(30)], { isTimed: true }), '2 × 30 s')
})

test('el medio kilo se dice con coma, y la carga es la máxima usada', () => {
  assert.equal(formatKg(4.5), '4,5')
  assert.equal(formatSets([set(10, 4), set(8, 4.5)], { isTimed: false }), '10, 8 · 4,5 kg')
})

// ---------------------------------------------------------------------------
// Récords personales
// ---------------------------------------------------------------------------

test('subir el peso por encima del mejor registrado es un récord de peso', () => {
  const before = session([exercise('remo', [set(10, 4.5)])])
  const today = session([exercise('remo', [set(8, 5)])])
  assert.deepEqual(personalRecords(today, [today, before]), [
    { exerciseId: 'remo', name: 'Remo unilateral', kind: 'weight', value: 5, previous: 4.5 },
  ])
})

test('con el mismo peso, más repeticiones es un récord de repeticiones', () => {
  const before = session([exercise('remo', [set(10, 5)])])
  const today = session([exercise('remo', [set(12, 5)])])
  assert.deepEqual(personalRecords(today, [before]), [
    { exerciseId: 'remo', name: 'Remo unilateral', kind: 'reps', value: 12, previous: 10 },
  ])
})

test('sin carga, más repeticiones es un récord', () => {
  const before = session([exercise('flexiones', [set(15)])])
  const today = session([exercise('flexiones', [set(16)])])
  assert.equal(personalRecords(today, [before])[0]?.kind, 'reps')
})

test('la primera vez no es un récord: no hay con qué comparar', () => {
  const today = session([exercise('remo', [set(10, 5)])])
  assert.deepEqual(personalRecords(today, [today]), [])
})

test('igualar o quedarse por debajo no es un récord', () => {
  const before = session([exercise('remo', [set(10, 5)])])
  assert.deepEqual(personalRecords(session([exercise('remo', [set(10, 5)])]), [before]), [])
  assert.deepEqual(personalRecords(session([exercise('remo', [set(12, 4)])]), [before]), [])
})

test('una sesión interrumpida no fija la marca a batir', () => {
  const abandoned = session([exercise('remo', [set(10, 5)])], { status: 'abandoned' })
  const completed = session([exercise('remo', [set(10, 4)])])
  const today = session([exercise('remo', [set(10, 4.5)])])
  assert.deepEqual(
    personalRecords(today, [abandoned, completed]).map((record) => record.previous),
    [4],
  )
})
