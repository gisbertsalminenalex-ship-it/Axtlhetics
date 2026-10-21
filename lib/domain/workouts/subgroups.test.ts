/**
 * Subgrupos para equilibrar piernas y brazos (D-053).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSession } from '../axis/session-builder'
import { EXERCISE_CATALOG, findExercise } from './catalog'
import { EXERCISE_SUBGROUPS, laggingSubgroups, subgroupsOf, weeklySubgroupSets } from './subgroups'
import type { WorkoutSession } from './types'
import { isMainExercise } from './types'

const TODAY = '2026-10-21' // miércoles

function session(dayKey: string, exerciseIds: string[]): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 1800,
    focus: 'tren_inferior',
    title: 'Fuerza · Tren inferior',
    intensity: 'moderada',
    muscleGroups: ['piernas'],
    exercises: exerciseIds.map((exerciseId) => ({
      exerciseId,
      name: exerciseId,
      sets: [1, 2, 3].map(() => ({ reps: 10, weightKg: null, completed: true })),
    })),
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

test('todo ejercicio de entrenamiento con piernas o brazos dice qué parte trabaja', () => {
  for (const exercise of EXERCISE_CATALOG) {
    if (exercise.category === 'movilidad') continue
    const muscles = [...exercise.primaryMuscles, ...exercise.secondaryMuscles]
    if (!muscles.includes('piernas') && !muscles.includes('brazos')) continue
    assert.ok(exercise.id in EXERCISE_SUBGROUPS, `falta ${exercise.id}`)
  }
  for (const id of Object.keys(EXERCISE_SUBGROUPS)) assert.ok(findExercise(id), `sobra ${id}`)
})

test('las series de la semana se cuentan por subgrupo: enteras si es principal, medias si es secundario', () => {
  const sets = weeklySubgroupSets([session('2026-10-20', ['sentadilla', 'flexiones'])], TODAY, EXERCISE_CATALOG)
  assert.equal(sets.cuadriceps, 3)
  assert.equal(sets.triceps, 1.5, 'en las flexiones, los brazos son secundario')
  // La semana pasada no cuenta.
  assert.equal(weeklySubgroupSets([session('2026-10-17', ['sentadilla'])], TODAY, EXERCISE_CATALOG).cuadriceps, 0)
})

test('va por detrás la parte con 2 series o más de diferencia con su pareja', () => {
  assert.deepEqual(laggingSubgroups([session('2026-10-20', ['sentadilla', 'zancadas'])], TODAY, EXERCISE_CATALOG), ['isquios'])
  assert.deepEqual(laggingSubgroups([session('2026-10-20', ['sentadilla', 'puente-gluteos'])], TODAY, EXERCISE_CATALOG), [])
})

test('con los cuádriceps por delante, la siguiente sesión de piernas trabaja la parte de atrás', () => {
  const history = [session('2026-10-20', ['sentadilla', 'zancadas', 'zancada-atras'])]
  const next = buildSession({
    focus: 'tren_inferior',
    intensity: 'moderada',
    availableMinutes: 35,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    history,
    today: TODAY,
  })
  const main = next.exercises.filter(isMainExercise)
  assert.ok(
    main.some((item) => subgroupsOf(item.exerciseId).includes('isquios')),
    main.map((item) => item.exerciseId).join(', '),
  )
})
