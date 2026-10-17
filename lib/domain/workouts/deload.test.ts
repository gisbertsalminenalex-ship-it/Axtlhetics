import assert from 'node:assert/strict'
import test from 'node:test'

import { addDays, type DayKey } from '../shared/dates'
import { DELOAD_AFTER_WEEKS, isDeloadWeek, LOADED_WEEK_MIN_SESSIONS } from './deload'
import type { WorkoutSession } from './types'

/** Lunes 2026-10-12. */
const MONDAY: DayKey = '2026-10-12'

function session(dayKey: DayKey, partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

/** `count` sesiones en la semana que empieza `weeksBack` semanas antes de MONDAY. */
function week(weeksBack: number, count = LOADED_WEEK_MIN_SESSIONS, partial: Partial<WorkoutSession> = {}): WorkoutSession[] {
  const monday = addDays(MONDAY, -7 * weeksBack)
  return Array.from({ length: count }, (_, i) => session(addDays(monday, i * 2), partial))
}

const LOADED = Array.from({ length: DELOAD_AFTER_WEEKS }, (_, i) => week(i + 1)).flat()

test('D-031: tras cuatro semanas cargadas seguidas, esta es de descarga, cualquier día', () => {
  assert.equal(isDeloadWeek(LOADED, MONDAY), true)
  assert.equal(isDeloadWeek(LOADED, addDays(MONDAY, 6)), true, 'el domingo, igual que el lunes')
})

test('D-031: una semana floja en medio corta la cuenta', () => {
  const history = [...week(1), ...week(2), ...week(3, 1), ...week(4)]
  assert.equal(isDeloadWeek(history, MONDAY), false)
})

test('D-031: no se encadenan dos descargas: la semana de descarga cuenta como floja', () => {
  const deloadProposal = { proposalId: 'p', type: 'TRAINING', headline: '', reason: '', focus: null, intensity: null, deload: true }
  const history = [...week(1, 2, { proposal: deloadProposal }), ...week(2), ...week(3), ...week(4), ...week(5)]
  assert.equal(isDeloadWeek(history, MONDAY), false)
})

test('D-031: las sesiones abandonadas no cargan la semana', () => {
  const history = [...week(1, 2, { status: 'abandoned' }), ...week(2), ...week(3), ...week(4)]
  assert.equal(isDeloadWeek(history, MONDAY), false)
})
