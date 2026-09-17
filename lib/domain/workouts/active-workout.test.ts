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
  rule: 'good_recovery',
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

// ---------------------------------------------------------------------------
// P-014: reanudar una sesión guardada
// ---------------------------------------------------------------------------

import { hasProgress, isActiveWorkout, reconcileStoredWorkout } from './active-workout'

/** Lo que la sesión atraviesa al ir y volver del almacenamiento. */
function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test('una sesión a medias se reconoce después de pasar por el almacenamiento', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 1)
  workout = adjustReps(workout, -2)
  workout = completeSet(workout)

  const stored = roundTrip(workout)
  assert.equal(isActiveWorkout(stored), true)
  assert.deepEqual(stored, workout, 'no se pierde ni cambia ningún campo')
})

test('una sesión ya terminada también tiene una forma válida', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  assert.equal(isActiveWorkout(roundTrip(workout)), true)
})

test('un registro corrupto no se reconoce como sesión', () => {
  const workout = fresh()
  assert.equal(isActiveWorkout(null), false)
  assert.equal(isActiveWorkout('sesión'), false)
  assert.equal(isActiveWorkout({}), false)
  assert.equal(isActiveWorkout({ ...workout, entries: 'nada' }), false)
  assert.equal(isActiveWorkout({ ...workout, exerciseIndex: 99 }), false)
  assert.equal(isActiveWorkout({ ...workout, exerciseIndex: -1 }), false)
  assert.equal(isActiveWorkout({ ...workout, startedAt: 'ayer' }), false)
  assert.equal(
    isActiveWorkout({ ...workout, entries: [{ ...workout.entries[0], sets: [{ reps: 'ocho' }] }] }),
    false,
  )
})

test('la sesión de hoy se reanuda exactamente donde se dejó', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = adjustWeight(workout, 2)

  const outcome = reconcileStoredWorkout(roundTrip(workout), {
    today: '2026-09-08',
    savedAt: '2026-09-08T18:10:00.000Z',
  })
  assert.equal(outcome.kind, 'resume')
  if (outcome.kind !== 'resume') return
  assert.equal(currentEntry(outcome.workout)?.weightKg, 85)
  assert.equal(currentSetNumber(outcome.workout), 2)
  assert.equal(outcome.workout.id, workout.id)
})

test('una sesión de otro día con series hechas pasa al historial como abandonada', () => {
  let workout = fresh()
  workout = completeSet(workout)
  const savedAt = new Date(2026, 8, 8, 18, 12, 0).toISOString()

  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return

  assert.equal(outcome.session.id, workout.id, 'mismo id: no puede duplicarse')
  assert.equal(outcome.session.status, 'abandoned')
  assert.equal(outcome.session.dayKey, '2026-09-08', 'pertenece al día en que se hizo')
  assert.equal(outcome.session.exercises.length, 1)
  // La duración sale del último guardado, no de «ahora»: 12 minutos, no un día.
  assert.equal(outcome.session.durationSeconds, 12 * 60)
  assert.ok(outcome.session.modifications.some((m) => m.kind === 'session_abandoned'))
})

test('una sesión de otro día sin ninguna serie se descarta sin tocar el historial', () => {
  const outcome = reconcileStoredWorkout(roundTrip(fresh()), {
    today: '2026-09-09',
    savedAt: '2026-09-08T18:00:00.000Z',
  })
  assert.equal(outcome.kind, 'discard')
})

test('un registro que no se entiende se descarta aunque sea de hoy', () => {
  const outcome = reconcileStoredWorkout(
    { id: 'x', dayKey: '2026-09-08' },
    { today: '2026-09-08', savedAt: '2026-09-08T18:00:00.000Z' },
  )
  assert.equal(outcome.kind, 'discard')
})

test('si la fecha del último guardado no es válida, la sesión archivada no inventa duración', () => {
  let workout = fresh()
  workout = completeSet(workout)
  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt: '???' })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return
  assert.equal(outcome.session.durationSeconds, 0)
})

test('hay progreso en cuanto se completa la primera serie', () => {
  const workout = fresh()
  assert.equal(hasProgress(workout), false)
  assert.equal(hasProgress(completeSet(workout)), true)
})

test('una sesión de otro día con todo hecho se archiva como completada, no abandonada', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  const savedAt = new Date(2026, 8, 8, 18, 30, 0).toISOString()

  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return
  assert.equal(outcome.session.status, 'completed')
  assert.equal(outcome.session.durationSeconds, 30 * 60)
  assert.ok(!outcome.session.modifications.some((m) => m.kind === 'session_abandoned'))
})

test('un plan o una propuesta a medias invalidan el registro', () => {
  const workout = fresh()
  assert.equal(isActiveWorkout({ ...workout, plan: { title: 'x' } }), false)
  assert.equal(isActiveWorkout({ ...workout, proposal: { proposalId: 'p' } }), false)
})
