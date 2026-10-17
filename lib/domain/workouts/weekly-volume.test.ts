import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG } from './catalog'
import type { PerformedExercise, WorkoutSession } from './types'
import { fulfilmentOf, laggingGroup, WEEKLY_SET_TARGET, weeklySets, weeklyVolume } from './weekly-volume'

/** Miércoles 2026-10-14; su lunes es el 12. */
const WEDNESDAY = '2026-10-14'

function done(exerciseId: string, sets: number, partial: Partial<PerformedExercise> = {}): PerformedExercise {
  return {
    exerciseId,
    name: exerciseId,
    sets: Array.from({ length: sets }, () => ({ reps: 10, weightKg: null, completed: true })),
    ...partial,
  }
}

function session(dayKey: string, exercises: PerformedExercise[], partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_inferior',
    title: 'Fuerza · Tren inferior',
    intensity: 'moderada',
    muscleGroups: ['piernas'],
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

test('D-034: una serie cuenta entera para el principal y media para el secundario', () => {
  // Sentadilla: piernas; secundarios glúteos y core.
  const sets = weeklySets([session('2026-10-13', [done('sentadilla', 3)])], WEDNESDAY, EXERCISE_CATALOG)
  assert.equal(sets.piernas, 3)
  assert.equal(sets.gluteos, 1.5)
  assert.equal(sets.core, 1.5)
  assert.equal(sets.pecho, 0)
})

test('D-034: solo cuenta la semana natural hasta hoy, y solo el entrenamiento', () => {
  const sets = weeklySets(
    [
      session('2026-10-11', [done('sentadilla', 3)]), // domingo de la semana anterior
      session('2026-10-15', [done('sentadilla', 3)]), // mañana
      session('2026-10-12', [done('gato-camello', 2), done('tobillo-pared', 1, { phase: 'calentamiento' })]),
    ],
    WEDNESDAY,
    EXERCISE_CATALOG,
  )
  assert.equal(sets.piernas, 0)
  assert.equal(sets.espalda, 0, 'la movilidad no carga')
})

test('D-034: el objetivo depende de la experiencia, y el más atrasado es el de menos cumplido', () => {
  const volumes = weeklyVolume([session('2026-10-13', [done('sentadilla', 3), done('flexiones', 3)])], WEDNESDAY, EXERCISE_CATALOG, 'principiante')
  assert.ok(volumes.every((volume) => volume.target === WEEKLY_SET_TARGET.principiante))
  const lagging = laggingGroup(volumes)
  assert.ok(lagging)
  assert.equal(fulfilmentOf(lagging!), Math.min(...volumes.map(fulfilmentOf)))
  assert.equal(laggingGroup(volumes.map((volume) => ({ ...volume, sets: volume.target }))), null, 'todo cumplido: nada atrasado')
})
