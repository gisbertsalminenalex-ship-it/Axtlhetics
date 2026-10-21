/**
 * Bloques (D-057): en qué semana del bloque se está y qué principales se fijan.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSession, withAnchors } from '../axis/session-builder'
import { addDays } from '../shared/dates'
import { blockAnchors, currentBlock, describeBlock } from './blocks'
import { EXERCISE_CATALOG, findExercise } from './catalog'
import type { UserEquipment } from './equipment'
import type { SessionFocus, WorkoutSession } from './types'
import { isMainExercise } from './types'

// Miércoles 21 de octubre de 2026; el lunes de su semana es el 19.
const TODAY = '2026-10-21'
const MONDAY = '2026-10-19'

function session(dayKey: string, options: { focus?: SessionFocus; ids?: string[]; deload?: boolean } = {}): WorkoutSession {
  const { focus = 'tren_superior', ids = ['flexiones', 'remo-unilateral'], deload = false } = options
  return {
    id: `${dayKey}-${focus}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus,
    title: '',
    intensity: 'moderada',
    muscleGroups: [],
    exercises: [
      { exerciseId: 'jumping-jacks', name: '', sets: [{ reps: 60, weightKg: null, completed: true }], phase: 'calentamiento' },
      ...ids.map((exerciseId) => ({ exerciseId, name: '', sets: [{ reps: 10, weightKg: null, completed: true }] })),
    ],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: null,
    proposal: { proposalId: 'p', type: 'TRAINING', headline: '', reason: '', focus, intensity: 'moderada', ...(deload ? { deload: true } : {}) },
    modifications: [],
    notes: null,
  }
}

/** Dos sesiones por semana, las `weeks` semanas anteriores a la de hoy. */
function weeksBefore(weeks: number): WorkoutSession[] {
  return Array.from({ length: weeks }, (_, i) => addDays(MONDAY, -7 * (i + 1))).flatMap((monday) => [
    session(monday),
    session(addDays(monday, 2)),
  ])
}

test('la semana del bloque cuenta las semanas entrenadas seguidas; la descarga es la quinta', () => {
  assert.deepEqual(currentBlock([], TODAY), { start: MONDAY, week: 1, deload: false })
  assert.deepEqual(currentBlock(weeksBefore(2), TODAY), { start: addDays(MONDAY, -14), week: 3, deload: false })
  assert.deepEqual(currentBlock(weeksBefore(4), TODAY), { start: addDays(MONDAY, -28), week: 5, deload: true })
  // Una semana sin entrenar cierra el bloque.
  const withGap = weeksBefore(3).filter((item) => item.dayKey < addDays(MONDAY, -7))
  assert.equal(currentBlock(withGap, TODAY).week, 1)
  // Tras la descarga, bloque nuevo.
  const afterDeload = [session(addDays(MONDAY, -7), { deload: true }), ...weeksBefore(4).filter((item) => item.dayKey < addDays(MONDAY, -7))]
  assert.equal(currentBlock(afterDeload, TODAY).week, 1)
})

test('quien entrena una vez por semana no descarga, pero cada cinco semanas empieza bloque', () => {
  const once = Array.from({ length: 5 }, (_, i) => session(addDays(MONDAY, -7 * (i + 1))))
  assert.deepEqual(currentBlock(once, TODAY), { start: MONDAY, week: 1, deload: false })
  assert.equal(describeBlock(currentBlock(once.slice(0, 4), TODAY)), 'Semana 5 del bloque: la que viene empieza uno nuevo.')
})

test('los principales salen de la primera sesión de la zona en el bloque, sin calentamiento ni core', () => {
  const history = [
    session(addDays(MONDAY, -5), { ids: ['flexiones-diamante', 'remo-unilateral', 'plancha'] }),
    session(addDays(MONDAY, -12), { ids: ['flexiones', 'dominadas'] }), // el bloque empezó aquí
    session(addDays(MONDAY, -10), { focus: 'tren_inferior', ids: ['sentadilla'] }),
  ]
  const anchors = blockAnchors(history, TODAY, 'tren_superior', EXERCISE_CATALOG)
  assert.deepEqual(anchors, ['flexiones', 'dominadas'])
  assert.deepEqual(blockAnchors(history, TODAY, 'core_movilidad', EXERCISE_CATALOG), [])
  // En un bloque nuevo, sin sesiones aún: los elige la sesión como siempre.
  assert.deepEqual(blockAnchors([], TODAY, 'tren_superior', EXERCISE_CATALOG), [])
})

test('withAnchors: los principales primero, en el hueco de su patrón', () => {
  const ex = (id: string) => findExercise(id)!
  const selected = [ex('flexiones-diamante'), ex('remo-unilateral'), ex('flexion-pica')]
  const result = withAnchors(selected, [ex('flexiones'), ex('remo-unilateral')]).map((item) => item.id)
  assert.equal(result.length, 3)
  assert.deepEqual(result.slice(0, 2), ['flexiones', 'remo-unilateral'])
})

test('la sesión abre con los principales del bloque mientras se pueden hacer', () => {
  const gear: UserEquipment = { items: ['barra_dominadas'], weights: [{ kind: 'mancuerna', kg: 8, pair: false }] }
  const base = {
    focus: 'tren_superior' as const,
    intensity: 'moderada' as const,
    availableMinutes: 45,
    goals: ['hipertrofia' as const],
    experience: 'intermedio' as const,
    gear,
    today: TODAY,
  }
  const main = (anchorExerciseIds: string[]) =>
    buildSession({ ...base, anchorExerciseIds }).exercises.filter(isMainExercise).map((item) => item.exerciseId)
  // Cada principal en su variante del día: hoy las flexiones salen en su versión más accesible.
  const [first, second] = main(['remo-unilateral', 'flexiones'])
  assert.equal(first, 'remo-unilateral')
  assert.equal(findExercise(second)?.family, 'flexion')
  // Sin barra de dominadas hoy, ese principal no entra y la sesión se completa igual.
  const without = buildSession({ ...base, gear: { ...gear, items: [] }, anchorExerciseIds: ['dominadas', 'flexiones'] })
  const ids = without.exercises.filter(isMainExercise).map((item) => item.exerciseId)
  assert.ok(!ids.includes('dominadas'))
  assert.equal(findExercise(ids[0])?.family, 'flexion')
})
