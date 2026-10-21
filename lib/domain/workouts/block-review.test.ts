/**
 * El cierre del bloque (D-062).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { completed, SAMPLE_VALUES } from '../assessment/test-fixtures'
import { proactiveNote } from '../axis/proactive'
import { addDays } from '../shared/dates'
import { blockReview, describeAnchor } from './block-review'
import { EXERCISE_CATALOG } from './catalog'
import type { CompletedSet, WorkoutSession } from './types'

// Lunes 19 de octubre de 2026: las cuatro semanas anteriores, cargadas.
const MONDAY = '2026-10-19'

function session(dayKey: string, remoKg: number, flexiones: number, deload = false): WorkoutSession {
  const sets = (reps: number, weightKg: number | null): CompletedSet[] => [{ reps, weightKg, completed: true, reserve: 'una_dos' }]
  return {
    id: dayKey,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: '',
    intensity: 'moderada',
    muscleGroups: ['espalda'],
    exercises: [
      { exerciseId: 'remo-unilateral', name: '', sets: sets(12, remoKg) },
      { exerciseId: 'flexiones', name: '', sets: sets(flexiones, null) },
    ],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: 3,
    proposal: { proposalId: 'p', type: 'TRAINING', headline: '', reason: '', focus: 'tren_superior', intensity: 'moderada', ...(deload ? { deload: true } : {}) },
    modifications: [],
    notes: null,
  }
}

/** Dos sesiones por semana las cuatro semanas anteriores al lunes, subiendo poco a poco. */
const LOADED = [4, 3, 2, 1].flatMap((back, i) => {
  const monday = addDays(MONDAY, -7 * back)
  return [session(monday, 8 + i, 10 + i), session(addDays(monday, 2), 8 + i, 10 + i)]
})

test('durante la descarga: cómo avanzaron los principales del bloque', () => {
  const review = blockReview({ history: LOADED, assessments: [], today: addDays(MONDAY, 2), catalog: EXERCISE_CATALOG })!
  assert.equal(review.status, 'closing')
  assert.equal(review.start, addDays(MONDAY, -28))
  assert.deepEqual(review.anchors.map(describeAnchor), [
    'Remo unilateral con pesa: 1RM estimado 11,5 → 16 kg',
    'Flexiones: 10 → 13 reps',
  ])
  assert.equal(review.test, null)
})

test('la primera semana del siguiente: el anterior, con el test hecho al cerrarlo', () => {
  const nextMonday = addDays(MONDAY, 7)
  const history = [session(MONDAY, 11, 13, true), ...LOADED]
  const assessments = [
    completed(addDays(MONDAY, -30)),
    completed(addDays(MONDAY, 3), { ...SAMPLE_VALUES, push: 14 }),
  ]
  const review = blockReview({ history, assessments, today: addDays(nextMonday, 1), catalog: EXERCISE_CATALOG })!
  assert.equal(review.status, 'closed')
  assert.equal(review.end, addDays(nextMonday, -1))
  assert.equal(review.test?.dayKey, addDays(MONDAY, 3))
  assert.ok(review.test!.rows.some((row) => row.delta === '+3 reps'))
})

test('a mitad de bloque, o tras un bloque corto, no hay cierre', () => {
  assert.equal(blockReview({ history: LOADED.slice(-4), assessments: [], today: addDays(MONDAY, 2), catalog: EXERCISE_CATALOG }), null)
  assert.equal(blockReview({ history: [], assessments: [], today: MONDAY, catalog: EXERCISE_CATALOG }), null)
})

test('la nota del primer día de descarga (el martes, sin sesiones aún) invita a repetir el test si no se hizo', () => {
  const note = (assessments: ReturnType<typeof completed>[]) =>
    proactiveNote({
      dayKey: addDays(MONDAY, 1),
      profile: null,
      sessions: LOADED,
      catalog: EXERCISE_CATALOG,
      discomfortsYesterday: [],
      recoveryRegistered: true,
      assessments,
    })
  assert.match(note([])!.text, /repetir el test de evolución/)
  assert.doesNotMatch(note([completed(addDays(MONDAY, -10))])!.text, /repetir el test/)
})
