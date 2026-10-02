/**
 * El mensaje de AXIS al cerrar una sesión (D-019).
 *
 * Determinista, con el veredicto primero, sin cumplidos ni exclamaciones, y sin
 * afirmar nada que el sistema no haga de verdad.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { PersonalRecord } from '../workouts/history'
import type { PerformedExercise, WorkoutSession } from '../workouts/types'
import { closingMessage } from './closing'
import { AXIS_PERSONALITY } from './personality'

function done(name: string, reps: number[], target = { sets: reps.length, reps: 10 }): PerformedExercise {
  return {
    exerciseId: name.toLowerCase(),
    name,
    sets: reps.map((value) => ({ reps: value, weightKg: 5, completed: true })),
    targetSets: target.sets,
    targetReps: target.reps,
  }
}

function session(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's-1',
    dayKey: '2026-09-07',
    startedAt: '2026-09-07T18:00:00.000Z',
    completedAt: '2026-09-07T18:40:00.000Z',
    durationSeconds: 2400,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda'],
    exercises: [done('Remo', [10, 10, 10]), done('Flexiones', [10, 10, 10])],
    totalVolumeKg: 300,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

function assertAxisVoice(text: string) {
  assert.doesNotMatch(text, /!|¡/, 'sin exclamaciones')
  const opening = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  for (const forbidden of AXIS_PERSONALITY.forbiddenOpeners) {
    assert.ok(!opening.startsWith(forbidden), `no abre con «${forbidden}»`)
  }
}

test('sesión hecha entera: lo dice, y que la próxima parte de aquí', () => {
  const text = closingMessage(session())
  assert.match(text, /^Sesión completa/)
  assertAxisVoice(text)
})

test('un ejercicio por debajo de lo previsto se nombra y se dice que se repite', () => {
  const text = closingMessage(
    session({ exercises: [done('Remo', [10, 10], { sets: 3, reps: 10 }), done('Flexiones', [10, 10, 10])] }),
  )
  assert.match(text, /^Remo quedó por debajo de lo previsto/)
  assert.match(text, /repito esos parámetros en lugar de subir/)
  assert.doesNotMatch(text, /Flexiones/, 'lo que se hizo entero no se nombra')
  assertAxisVoice(text)
})

test('ejercicios saltados sin hacer nada de ellos: se dice sin inventar por qué', () => {
  const text = closingMessage(
    session({ modifications: [{ kind: 'exercise_skipped', detail: 'Plancha sin completar.' }] }),
  )
  assert.match(text, /^Te dejaste ejercicios sin hacer/)
  assertAxisVoice(text)
})

test('una sesión interrumpida dice cuántas series quedaron y que no sirve para subir', () => {
  const text = closingMessage(
    session({ status: 'abandoned', exercises: [done('Remo', [10, 8], { sets: 3, reps: 10 })] }),
  )
  assert.match(text, /^Sesión interrumpida con 2 series registradas/)
  assert.match(text, /no la uso para subir cargas/)
  assertAxisVoice(text)
})

test('una sola serie en singular', () => {
  const text = closingMessage(session({ status: 'abandoned', exercises: [done('Remo', [10])] }))
  assert.match(text, /con 1 serie registrada\./)
})

test('los récords se añaden después del veredicto, por nombre y sin repetir', () => {
  const records: PersonalRecord[] = [
    { exerciseId: 'remo', name: 'Remo', kind: 'weight', value: 5, previous: 4.5 },
    { exerciseId: 'flexiones', name: 'Flexiones', kind: 'reps', value: 12, previous: 10 },
  ]
  const text = closingMessage(session(), records)
  assert.match(text, /^Sesión completa/)
  assert.match(text, /Has superado tu mejor marca registrada en Remo y Flexiones\.$/)
})

test('sin récords no se menciona ninguna marca', () => {
  assert.doesNotMatch(closingMessage(session()), /marca/)
})

test('el mensaje no lleva cifras que no salgan de la sesión', () => {
  const text = closingMessage(session({ status: 'abandoned', exercises: [done('Remo', [10, 8, 6])] }))
  const numbers = text.match(/\d+/g) ?? []
  assert.deepEqual(numbers, ['3'])
})

test('un récord en un ejercicio sin completar se dice aparte, dejando claro que no se completó', () => {
  const records: PersonalRecord[] = [
    { exerciseId: 'remo', name: 'Remo', kind: 'reps', value: 12, previous: 10 },
    { exerciseId: 'flexiones', name: 'Flexiones', kind: 'reps', value: 12, previous: 10 },
  ]
  const text = closingMessage(
    session({ exercises: [done('Remo', [12], { sets: 3, reps: 10 }), done('Flexiones', [12, 12, 12])] }),
    records,
  )

  assert.match(text, /^Remo quedó por debajo de lo previsto/)
  assert.match(text, /Has superado tu mejor marca registrada en Flexiones\./)
  assert.match(text, /En Remo también superaste tu mejor marca, aunque sin completar lo previsto\.$/)
  assertAxisVoice(text)
})
