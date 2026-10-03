/**
 * Lo que dicen las sesiones anteriores (D-019): la última vez, cómo se dice una
 * serie y los récords. Todo frente a datos registrados; nada se supone.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import { skipExercise, startWorkout, toWorkoutSession } from './active-workout'
import {
  exerciseUsage,
  formatKg,
  formatSets,
  lastPerformanceOf,
  lastPerformedExercise,
  personalRecords,
  SKIP_PENALTY_DAYS,
  skippedExerciseNames,
} from './history'
import type { CompletedSet, Exercise, PerformedExercise, WorkoutSession } from './types'

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

// ---------------------------------------------------------------------------
// Uso de cada ejercicio para la rotación (D-020)
// ---------------------------------------------------------------------------

const CATALOG = [
  { id: 'remo', name: 'Remo unilateral' },
  { id: 'flexiones', name: 'Flexiones' },
] as unknown as readonly Exercise[]

function skippedIn(dayKey: string, names: string[], partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return session([], {
    dayKey,
    modifications: names.map((name) => ({ kind: 'exercise_skipped', detail: `${name} sin completar.` })),
    ...partial,
  })
}

test('contrato: se lee el nombre del saltado tal y como lo escribe `skipExercise`', () => {
  const proposal: AxisProposal = {
    id: 'p',
    dayKey: '2026-09-07',
    createdAt: '2026-09-07T10:00:00.000Z',
    type: 'TRAINING',
    headline: 'Entrena.',
    reason: 'Bien.',
    factors: [],
    label: 'Recomendada',
    rule: 'good_recovery',
    session: {
      focus: 'tren_superior',
      title: 'Fuerza · Tren superior',
      intensity: 'moderada',
      estimatedMinutes: 30,
      muscleGroups: ['espalda'],
      exercises: [
        {
          exerciseId: 'remo',
          name: 'Remo unilateral',
          sets: 3,
          reps: 10,
          isTimed: false,
          suggestedWeightKg: 5,
          restSeconds: 60,
          unilateral: true,
          tempo: null,
          imageUrl: null,
        },
      ],
    },
  }
  const started = startWorkout(proposal, new Date(2026, 8, 7, 18, 0))!
  const saved = toWorkoutSession(skipExercise(started), { status: 'abandoned' })
  assert.deepEqual(skippedExerciseNames(saved), ['Remo unilateral'])
})

test('un ejercicio hecho cuenta como usado ese día, también en una sesión interrumpida', () => {
  const usage = exerciseUsage(
    [
      session([exercise('remo', [set(10, 5)])], { dayKey: '2026-09-10' }),
      session([exercise('flexiones', [set(10)])], { dayKey: '2026-09-12', status: 'abandoned' }),
    ],
    { catalog: CATALOG },
  )
  assert.deepEqual(usage.get('remo'), { lastUse: '2026-09-10', uses: 1 })
  assert.deepEqual(usage.get('flexiones'), { lastUse: '2026-09-12', uses: 1 })
})

test('un ejercicio que aparece sin ninguna serie no cuenta como usado', () => {
  const usage = exerciseUsage([session([exercise('remo', [])])], { catalog: CATALOG })
  assert.equal(usage.has('remo'), false)
})

test('la última vez es el día más reciente, sin depender del orden del historial', () => {
  const older = session([exercise('remo', [set(10, 5)])], { dayKey: '2026-09-01' })
  const newer = session([exercise('remo', [set(10, 5)])], { dayKey: '2026-09-15' })
  for (const history of [[older, newer], [newer, older]]) {
    assert.deepEqual(exerciseUsage(history, { catalog: CATALOG }).get('remo'), {
      lastUse: '2026-09-15',
      uses: 2,
    })
  }
})

test('un salto reciente cuenta como uso para la rotación', () => {
  const usage = exerciseUsage([skippedIn('2026-09-19', ['Flexiones'])], {
    catalog: CATALOG,
    today: '2026-09-20',
  })
  assert.deepEqual(usage.get('flexiones'), { lastUse: '2026-09-19', uses: 1 })
})

test('un salto de hace más de SKIP_PENALTY_DAYS caduca', () => {
  const today = '2026-09-30'
  const limit = skippedIn('2026-09-16', ['Flexiones']) // justo 14 días: aún cuenta
  const expired = skippedIn('2026-09-15', ['Remo unilateral']) // 15 días: ya no
  const usage = exerciseUsage([limit, expired], { catalog: CATALOG, today })
  assert.equal(SKIP_PENALTY_DAYS, 14)
  assert.equal(usage.has('flexiones'), true)
  assert.equal(usage.has('remo'), false)
})

test('hecho y saltado en la misma sesión cuenta una sola vez', () => {
  const both = skippedIn('2026-09-19', ['Remo unilateral'], {
    exercises: [exercise('remo', [set(10, 5)])],
  })
  assert.deepEqual(exerciseUsage([both], { catalog: CATALOG }).get('remo'), {
    lastUse: '2026-09-19',
    uses: 1,
  })
})

test('un salto de un ejercicio que no está en el catálogo se ignora', () => {
  const usage = exerciseUsage([skippedIn('2026-09-19', ['Ejercicio retirado'])], { catalog: CATALOG })
  assert.equal(usage.size, 0)
})

test('saltar no cambia los récords: solo cuentan las series hechas', () => {
  const before = session([exercise('remo', [set(10, 4.5)])], { dayKey: '2026-09-01' })
  const skip = skippedIn('2026-09-10', ['Remo unilateral'])
  const today = session([exercise('remo', [set(8, 5)])], { dayKey: '2026-09-20' })
  assert.deepEqual(personalRecords(today, [skip, before]), personalRecords(today, [before]))
})
