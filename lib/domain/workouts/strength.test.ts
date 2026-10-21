/**
 * Fuerza estimada (D-055, D-056): la reserva en cada serie, el ajuste de la
 * siguiente durante la sesión y la carga exacta de la próxima.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import { suggestWorkFor } from '../axis/session-builder'
import {
  completeSet,
  isActiveWorkout,
  nextSetAdvice,
  performedExercises,
  setReserve,
  startWorkout,
  undoLastSet,
} from './active-workout'
import { findExercise } from './catalog'
import type { UserEquipment } from './equipment'
import { lastPerformanceOf } from './history'
import {
  bestOneRepMax,
  epley,
  estimateOneRepMax,
  nextSetAfter,
  repsAt,
  targetReserveFor,
} from './strength'
import type { CompletedSet, PlannedSession, RepsInReserve, WorkoutSession } from './types'

test('Epley y su inversa: 8 kg × 15 hasta el fallo son 12 kg; con 12 kg cabe 1', () => {
  assert.equal(epley(8, 15), 12)
  assert.equal(repsAt(12, 8, 0), 15)
  assert.equal(repsAt(12, 8, 1), 14)
  assert.equal(repsAt(12, 12, 0), 0)
})

test('una serie estima con lo que quedaba; sin respuesta cuenta como al fallo', () => {
  assert.equal(estimateOneRepMax({ reps: 12, weightKg: 8, completed: true, reserve: 'tres_mas' }), 12)
  assert.equal(estimateOneRepMax({ reps: 15, weightKg: 8, completed: true }), 12)
  assert.equal(estimateOneRepMax({ reps: 12, weightKg: null, completed: true }), null, 'sin carga no hay 1RM')
  assert.equal(estimateOneRepMax({ reps: 25, weightKg: 5, completed: true }), null, 'más de 20 no estima')
  assert.equal(bestOneRepMax([{ reps: 10, weightKg: 8, completed: true }, { reps: 12, weightKg: 8, completed: true }]), 8 * 1.4)
})

test('la reserva buscada: 1–2 normal o fuerte, 3 o más ligera o de descarga', () => {
  assert.equal(targetReserveFor({ intensity: 'moderada' }), 'una_dos')
  assert.equal(targetReserveFor({ intensity: 'alta' }), 'una_dos')
  assert.equal(targetReserveFor({ intensity: 'ligera' }), 'tres_mas')
  assert.equal(targetReserveFor({ intensity: 'moderada', deload: true }), 'tres_mas')
})

const LOADS = [5, 8, 10, 12]
const set8x12: CompletedSet = { reps: 12, weightKg: 8, completed: true }
const options = { loads: LOADS, targetReps: 12, maxReps: 50 }

test('la siguiente serie: igual en el objetivo, más ligera con menos reserva, más pesada con más', () => {
  assert.deepEqual(nextSetAfter(set8x12, 'una_dos', 'una_dos', options), { reps: 12, weightKg: 8 })
  assert.deepEqual(nextSetAfter(set8x12, 'ninguna', 'una_dos', options), { reps: 12, weightKg: 5 })
  // 8 × (12 + 3) → 1RM 12: con 10 kg caben 5 dejando 1, demasiado lejos de 12 → 2 repeticiones más.
  assert.deepEqual(nextSetAfter(set8x12, 'tres_mas', 'una_dos', options), { reps: 14, weightKg: 8 })
  // 10 × 8 sobrado → con 11 kg caben 6 dejando 1: cerca de las 8 previstas, se sube.
  assert.deepEqual(
    nextSetAfter({ reps: 8, weightKg: 10, completed: true }, 'tres_mas', 'una_dos', { loads: [10, 11], targetReps: 8, maxReps: 50 }),
    { reps: 6, weightKg: 11 },
  )
})

test('sin otro peso, o sin carga, se ajustan las repeticiones', () => {
  const bodyweight: CompletedSet = { reps: 10, weightKg: null, completed: true }
  assert.deepEqual(nextSetAfter(bodyweight, 'ninguna', 'una_dos', options), { reps: 8, weightKg: null })
  assert.deepEqual(nextSetAfter(bodyweight, 'tres_mas', 'una_dos', options), { reps: 12, weightKg: null })
  assert.deepEqual(nextSetAfter({ reps: 12, weightKg: 5, completed: true }, 'ninguna', 'una_dos', options), {
    reps: 10,
    weightKg: 5,
  })
  // En una sesión ligera se buscan 3 o más: con 1–2, más suave.
  assert.deepEqual(nextSetAfter(bodyweight, 'una_dos', 'tres_mas', options), { reps: 8, weightKg: null })
})

const plan: PlannedSession = {
  focus: 'tren_superior',
  title: 'Fuerza · Tren superior',
  intensity: 'moderada',
  estimatedMinutes: 30,
  muscleGroups: ['espalda'],
  exercises: [
    { exerciseId: 'remo-unilateral', name: 'Remo unilateral', sets: 3, reps: 12, isTimed: false, suggestedWeightKg: 8, restSeconds: 75, unilateral: true, tempo: null, imageUrl: null },
  ],
}

const proposal: AxisProposal = {
  id: 'p',
  dayKey: '2026-10-21',
  createdAt: '2026-10-21T10:00:00.000Z',
  type: 'TRAINING',
  headline: '',
  reason: '',
  session: plan,
  factors: [],
  label: 'Recomendada',
  rule: 'good_recovery',
}

const START = new Date(2026, 9, 21, 18, 0, 0)

test('durante la sesión: la respuesta queda en la serie y prepara la siguiente, sin acumularse', () => {
  let workout = startWorkout(proposal, START, () => LOADS)!
  assert.deepEqual(workout.entries[0].loads, LOADS)
  workout = completeSet(workout, START)
  workout = setReserve(workout, 0, 'ninguna')
  assert.equal(workout.entries[0].sets[0].reserve, 'ninguna')
  assert.equal(workout.entries[0].weightKg, 5)
  assert.equal(nextSetAdvice(workout, 0), 'Baja a 5 kg y 12 repeticiones en la siguiente.')
  // Cambiar de respuesta parte de la serie hecha, no del ajuste anterior.
  workout = setReserve(workout, 0, 'una_dos')
  assert.equal(workout.entries[0].weightKg, 8)
  assert.equal(nextSetAdvice(workout, 0), null)
  assert.equal(workout.entries[0].reserve, undefined, 'la del ejercicio es la de la última serie')
  assert.ok(isActiveWorkout(JSON.parse(JSON.stringify(workout))))
})

test('en la última serie queda como la reserva del ejercicio; deshacerla la quita', () => {
  let workout = startWorkout(proposal, START, () => LOADS)!
  for (let i = 0; i < 3; i += 1) workout = completeSet(workout, START)
  workout = setReserve(workout, 0, 'tres_mas')
  assert.equal(workout.entries[0].reserve, 'tres_mas')
  assert.equal(performedExercises(workout)[0].sets[2].reserve, 'tres_mas')
  workout = undoLastSet(workout)
  assert.equal(workout.entries[0].reserve, undefined)
})

function remoSession(sets: CompletedSet[]): WorkoutSession {
  return {
    id: 's',
    dayKey: '2026-10-18',
    startedAt: '2026-10-18T18:00:00.000Z',
    completedAt: '2026-10-18T19:00:00.000Z',
    durationSeconds: 1800,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['espalda'],
    exercises: [{ exerciseId: 'remo-unilateral', name: 'Remo unilateral', sets, targetSets: sets.length, targetReps: sets[0]?.reps ?? 12 }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: null,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

const gear: UserEquipment = { items: [], weights: LOADS.map((kg) => ({ kind: 'mancuerna' as const, kg, pair: false })) }
const remo = findExercise('remo-unilateral')!
const base = { intensity: 'moderada' as const, goal: 'hipertrofia' as const, experience: 'intermedio' as const, gear }

function three(weightKg: number, reps: number, last: RepsInReserve): CompletedSet[] {
  return [
    { reps, weightKg, completed: true, reserve: 'tres_mas' },
    { reps, weightKg, completed: true, reserve: 'una_dos' },
    { reps, weightKg, completed: true, reserve: last },
  ]
}

test('la capacidad sale de la última serie contestada', () => {
  const last = lastPerformanceOf('remo-unilateral', [remoSession(three(8, 12, 'ninguna'))])!
  assert.equal(last.capacity?.repsToFailure, 12)
  assert.equal(last.reserve, 'ninguna', 'sin reserva del ejercicio, la de su última serie')
  const old = lastPerformanceOf('remo-unilateral', [remoSession([{ reps: 12, weightKg: 8, completed: true }])])!
  assert.equal(old.capacity, null)
})

test('la próxima sesión: carga y repeticiones según lo que puede (D-056)', () => {
  const work = (sets: CompletedSet[]) => {
    const { reps, weightKg } = suggestWorkFor(remo, { ...base, history: [remoSession(sets)] })
    return { reps, weightKg }
  }
  // Sobrado en la última: 1RM 12 kg, con 8 kg caben 14 dejando 1.
  assert.deepEqual(work(three(8, 12, 'tres_mas')), { reps: 14, weightKg: 8 })
  // Al fallo: caben 11 con 8 kg, uno menos, sin bajar de peso.
  assert.deepEqual(work(three(8, 12, 'ninguna')), { reps: 11, weightKg: 8 })
  // En el techo (19): el salto a 10 kg con las repeticiones que caben.
  assert.deepEqual(work(three(8, 19, 'una_dos')), { reps: 9, weightKg: 10 })
  // Muy lejos: 8 kg × 6 al fallo → el peso más ligero con el que caben las de partida, hasta el techo.
  assert.deepEqual(work(three(8, 6, 'ninguna')), { reps: 19, weightKg: 5 })
})

test('sin carga, las repeticiones hasta el fallo menos la reserva, sin saltos', () => {
  const flexiones = findExercise('flexiones')!
  const session = (last: RepsInReserve, reps = 10): WorkoutSession => ({
    ...remoSession([]),
    exercises: [
      {
        exerciseId: 'flexiones',
        name: 'Flexiones',
        sets: [{ reps, weightKg: null, completed: true, reserve: last }],
        targetSets: 1,
        targetReps: 10,
      },
    ],
  })
  const reps = (history: WorkoutSession[]) => suggestWorkFor(flexiones, { ...base, history }).reps
  assert.equal(reps([session('ninguna')]), 9)
  assert.equal(reps([session('una_dos')]), 10)
  assert.equal(reps([session('tres_mas')]), 12)
  // Nunca más de dos pasos por encima de la última vez, aunque sobrara mucho.
  assert.equal(reps([session('tres_mas', 14)]), 16)
})

test('Progreso: el 1RM estimado de cada sesión, al medio kilo, solo con carga', async () => {
  const { oneRepMaxHistory } = await import('./progress')
  const older = { ...remoSession(three(8, 12, 'ninguna')), id: 'a', dayKey: '2026-10-11' }
  const newer = remoSession(three(8, 12, 'tres_mas'))
  const points = oneRepMaxHistory('remo-unilateral', [newer, older])
  // La mejor serie de cada sesión: la primera, con 3 o más, en las dos.
  assert.deepEqual(points, [
    { dayKey: '2026-10-11', best: 12 },
    { dayKey: '2026-10-18', best: 12 },
  ])
  assert.deepEqual(oneRepMaxHistory('flexiones', [newer]), [])
})
