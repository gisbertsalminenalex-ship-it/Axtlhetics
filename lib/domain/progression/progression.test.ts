/**
 * Tu nivel y lo que se dice al terminar una sesión (D-071).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { addDays } from '../shared/dates'
import { progression, sessionAward } from './progression'
import { session } from './test-fixtures'
import type { XpInput } from './xp'

const MONDAY = '2026-10-05'

function input(partial: Partial<XpInput>): XpInput {
  return { sessions: [], assessments: [], scans: [], measurements: [], plannedDaysPerWeek: 4, ...partial }
}

test('sin historial: nivel 1, Arranque', () => {
  const progress = progression(input({}))
  assert.equal(progress.level, 1)
  assert.equal(progress.rankLabel, 'Arranque')
  assert.deepEqual(progress.levelsReached, [])
})

test('la sesión que cumple la semana lo dice con hechos y sube de nivel', () => {
  const sessions = [0, 1, 3, 5].map((day) => session(addDays(MONDAY, day), { id: `s${day}` }))
  const progress = progression(input({ sessions }))
  // 4 × 100 + 150 = 550: nivel 2.
  assert.equal(progress.totalXp, 550)
  assert.deepEqual(progress.levelsReached, [{ level: 2, dayKey: addDays(MONDAY, 5) }])

  const award = sessionAward('s5', progress, 4)
  assert.deepEqual(award.events.map((event) => event.kind), ['session', 'week'])
  assert.equal(award.xp, 250)
  assert.equal(award.levelBefore, 1)
  assert.equal(award.levelAfter, 2)
  assert.deepEqual(award.facts, ['Has completado las cuatro sesiones previstas esta semana.', 'Subes al nivel 2.'])
})

test('una sesión normal no trae cumplidos: solo sus XP', () => {
  const progress = progression(input({ sessions: [session(MONDAY, { id: 'a' })] }))
  const award = sessionAward('a', progress, 4)
  assert.equal(award.xp, 100)
  assert.deepEqual(award.facts, [])
  assert.equal(award.newRank, null)
})

test('una segunda sesión el mismo día no gana nada', () => {
  const sessions = [session(MONDAY, { id: 'a', time: '08:00:00' }), session(MONDAY, { id: 'b', time: '19:00:00' })]
  assert.deepEqual(sessionAward('b', progression(input({ sessions })), 4).events, [])
})
