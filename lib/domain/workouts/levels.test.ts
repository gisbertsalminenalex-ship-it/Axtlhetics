/**
 * El nivel de un ejercicio (D-065): cambiar de variante a mitad de sesión y que
 * AXIS parta de ella las siguientes veces.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSession } from '../axis/session-builder'
import type { AxisProposal } from '../axis/types'
import { canChangeLevel, changeExercise, completeSet, startWorkout, toWorkoutSession } from './active-workout'
import { findExercise } from './catalog'
import { availableEquipment, NO_EQUIPMENT } from './equipment'
import { chosenLevel, levelOptions } from './levels'
import { isMainExercise, type CompletedSet, type Exercise, type WorkoutSession } from './types'

const BODYWEIGHT = availableEquipment(NO_EQUIPMENT)
const exercise = (id: string) => findExercise(id) as Exercise

test('las opciones son la familia que se puede hacer, de la más accesible a la más exigente', () => {
  const options = levelOptions(exercise('flexiones-inclinadas'), { equipment: BODYWEIGHT }).map((item) => item.id)
  assert.deepEqual(options.slice(0, 2).sort(), ['flexiones-inclinadas', 'flexiones-rodillas'])
  assert.ok(options.includes('flexiones') && options.includes('flexiones-diamante'))
  assert.ok(options.indexOf('flexiones-negativas') < options.indexOf('flexiones'))
})

test('sin familia, o sin otra variante posible, no hay a qué cambiar', () => {
  assert.deepEqual(levelOptions(exercise('flexion-pica'), { equipment: BODYWEIGHT }), [])
})

test('una variante que carga una zona a cuidar no se ofrece', () => {
  const withWrist = levelOptions(exercise('flexiones'), { equipment: BODYWEIGHT, careZones: ['muneca'] })
  assert.ok(withWrist.every((item) => item.id === 'flexiones'))
})

test('el nivel elegido solo vale para su familia y si se puede hacer hoy', () => {
  const levels = { flexion: 'flexiones-rodillas' }
  assert.equal(chosenLevel(exercise('flexiones'), levels, { equipment: BODYWEIGHT })?.id, 'flexiones-rodillas')
  assert.equal(chosenLevel(exercise('sentadilla'), levels, { equipment: BODYWEIGHT }), null)
  assert.equal(chosenLevel(exercise('flexiones'), { flexion: 'sentadilla' }, { equipment: BODYWEIGHT }), null)
})

function proposalWith(exerciseId: string): AxisProposal {
  const item = exercise(exerciseId)
  return {
    id: 'p1',
    type: 'TRAINING',
    headline: 'Fuerza',
    reason: '',
    factors: [],
    session: {
      focus: 'tren_superior',
      title: 'Fuerza · Tren superior',
      intensity: 'moderada',
      estimatedMinutes: 30,
      muscleGroups: ['pecho'],
      exercises: [
        {
          exerciseId: item.id,
          name: item.name,
          sets: 3,
          reps: 10,
          isTimed: false,
          suggestedWeightKg: null,
          restSeconds: 75,
          unilateral: false,
          tempo: null,
          imageUrl: null,
        },
      ],
    },
  } as unknown as AxisProposal
}

test('cambiar de nivel sustituye el ejercicio y deja constancia', () => {
  const workout = startWorkout(proposalWith('flexiones-inclinadas'))!
  assert.equal(canChangeLevel(workout), true)

  const changed = changeExercise(workout, { exercise: exercise('flexiones-rodillas'), sets: 3, reps: 8, weightKg: null, loads: [] })
  assert.equal(changed.entries[0].exerciseId, 'flexiones-rodillas')
  assert.equal(changed.entries[0].name, 'Flexiones con rodillas')
  assert.equal(changed.entries[0].reps, 8)
  assert.deepEqual(changed.modifications, [
    { kind: 'exercise_changed', detail: 'Flexiones inclinadas → Flexiones con rodillas.' },
  ])

  // Lo hecho se guarda con el ejercicio nuevo: es lo que AXIS leerá la próxima vez.
  const session = toWorkoutSession(completeSet(changed), { status: 'completed' })
  assert.equal(session.exercises[0].exerciseId, 'flexiones-rodillas')
})

test('con una serie hecha ya no se cambia de nivel', () => {
  const started = completeSet(startWorkout(proposalWith('flexiones-inclinadas'))!)
  assert.equal(canChangeLevel(started), false)
  const same = changeExercise(started, { exercise: exercise('flexiones-rodillas'), sets: 3, reps: 8, weightKg: null, loads: [] })
  assert.equal(same, started)
})

// ---------------------------------------------------------------------------
// AXIS parte del nivel elegido
// ---------------------------------------------------------------------------

function performed(exerciseId: string, sets: CompletedSet[]): WorkoutSession {
  return {
    id: `session-${exerciseId}`,
    dayKey: '2026-10-15',
    startedAt: '2026-10-15T18:00:00.000Z',
    completedAt: '2026-10-15T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [{ exerciseId, name: exerciseId, sets }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

const pushUps = (history: WorkoutSession[], exerciseLevels: Record<string, string>) =>
  buildSession({
    focus: 'tren_superior',
    intensity: 'moderada',
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableMinutes: 60,
    gear: NO_EQUIPMENT,
    history,
    today: '2026-10-19',
    exerciseLevels,
  })
    .exercises.filter(isMainExercise)
    .filter((item) => exercise(item.exerciseId).family === 'flexion')
    .map((item) => item.exerciseId)

test('la siguiente sesión parte de la variante elegida', () => {
  const ids = pushUps([], { flexion: 'flexiones-rodillas' })
  assert.ok(ids.length > 0)
  assert.ok(ids.every((id) => id === 'flexiones-rodillas'))
})

test('dominada la variante elegida, AXIS sube a la siguiente', () => {
  const mastered = [performed('flexiones-rodillas', Array.from({ length: 3 }, () => ({ reps: 99, weightKg: null, completed: true })))]
  const ids = pushUps(mastered, { flexion: 'flexiones-rodillas' })
  // Desde D-073 la siguiente a las de rodillas es la flexión completa.
  assert.ok(ids.includes('flexiones'))
  assert.ok(!ids.includes('flexiones-rodillas'))
})
