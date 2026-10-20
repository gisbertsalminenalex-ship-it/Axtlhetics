/**
 * El reparto de la semana entre los objetivos (D-047).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkoutSession } from './types'
import {
  describeQuota,
  goalForToday,
  goalOfSession,
  weekIndexOf,
  weeklyQuota,
  weekProgress,
  type GoalQuota,
} from './weekly-plan'

const asMap = (quota: GoalQuota[]) => Object.fromEntries(quota.map((item) => [item.goal, item.sessions]))
const total = (quota: GoalQuota[]) => quota.reduce((sum, item) => sum + item.sessions, 0)

function done(dayKey: string, partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}-${partial.goal ?? partial.focus ?? 'x'}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: [],
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

test('un solo objetivo de fuerza se queda con toda la semana', () => {
  assert.deepEqual(weeklyQuota(['fuerza'], 4), [{ goal: 'fuerza', sessions: 4 }])
})

test('los días se reparten a partes iguales, y siempre suman los días disponibles', () => {
  assert.deepEqual(asMap(weeklyQuota(['fuerza', 'resistencia'], 4)), { fuerza: 2, resistencia: 2 })
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    for (const goals of [['fuerza'], ['fuerza', 'hipertrofia'], ['fuerza', 'resistencia', 'movilidad'], ['movilidad'], ['resistencia']] as const) {
      assert.equal(total(weeklyQuota(goals, days)), days, `${goals.join('+')} con ${days} días`)
    }
  }
})

test('movilidad con otros objetivos: una sesión a la semana, con dos días o más', () => {
  assert.equal(asMap(weeklyQuota(['fuerza', 'movilidad'], 4)).movilidad, 1)
  assert.equal(asMap(weeklyQuota(['fuerza', 'movilidad'], 1)).movilidad, undefined)
})

test('movilidad sola: la mitad, y el resto fuerza general; resistencia sola: el 60 %', () => {
  assert.deepEqual(asMap(weeklyQuota(['movilidad'], 4)), { movilidad: 2, salud_general: 2 })
  assert.deepEqual(asMap(weeklyQuota(['resistencia'], 5)), { resistencia: 3, salud_general: 2 })
})

test('lo que no se reparte exacto rota cada semana: ningún objetivo manda', () => {
  const week0 = asMap(weeklyQuota(['fuerza', 'hipertrofia', 'resistencia'], 2, 0))
  const week1 = asMap(weeklyQuota(['fuerza', 'hipertrofia', 'resistencia'], 2, 1))
  assert.notDeepEqual(week0, week1)
  // En tres semanas, cada uno ha tenido sesión.
  const seen = new Set([0, 1, 2].flatMap((week) => weeklyQuota(['fuerza', 'hipertrofia', 'resistencia'], 2, week).map((item) => item.goal)))
  assert.equal(seen.size, 3)
})

test('el número de semana avanza de lunes a lunes', () => {
  assert.equal(weekIndexOf('2026-10-19'), weekIndexOf('2026-10-25'))
  assert.equal(weekIndexOf('2026-10-26'), weekIndexOf('2026-10-19') + 1)
})

test('las sesiones anteriores a D-047 cuentan por su foco cuando se puede', () => {
  assert.equal(goalOfSession({ focus: 'core_movilidad' }), 'movilidad')
  assert.equal(goalOfSession({ focus: 'acondicionamiento' }), 'resistencia')
  assert.equal(goalOfSession({ focus: 'tren_superior' }), null)
  assert.equal(goalOfSession({ focus: 'tren_superior', goal: 'fuerza' }), 'fuerza')
})

test('lo hecho se cuenta solo esta semana y solo lo completado', () => {
  const quota = weeklyQuota(['fuerza', 'resistencia'], 4)
  const progress = weekProgress(
    quota,
    [
      done('2026-10-20', { goal: 'fuerza' }),
      done('2026-10-21', { goal: 'resistencia', status: 'abandoned' }),
      done('2026-10-17', { goal: 'resistencia' }), // la semana pasada
    ],
    '2026-10-22',
  )
  assert.deepEqual(asMap(progress.map((item) => ({ goal: item.goal, sessions: item.done }))), { fuerza: 1, resistencia: 0 })
})

test('hoy toca el objetivo con más sesiones pendientes; a igualdad, el que hace más que no se trabaja', () => {
  const quota = weeklyQuota(['fuerza', 'resistencia'], 4)
  const sessions = [done('2026-10-20', { goal: 'fuerza' })]
  assert.equal(goalForToday(weekProgress(quota, sessions, '2026-10-21'), sessions), 'resistencia')

  const even = [done('2026-10-20', { goal: 'fuerza' }), done('2026-10-21', { goal: 'resistencia' })]
  assert.equal(goalForToday(weekProgress(quota, even, '2026-10-22'), even), 'fuerza', 'la fuerza se trabajó antes')
})

test('un día suave con la movilidad pendiente es de movilidad; lo excluido no toca', () => {
  const quota = weeklyQuota(['fuerza', 'resistencia', 'movilidad'], 4)
  const progress = weekProgress(quota, [], '2026-10-20')
  assert.equal(goalForToday(progress, [], { light: true }), 'movilidad')
  assert.notEqual(goalForToday(progress, [], { exclude: ['resistencia'] }), 'resistencia')
})

test('el reparto se dice en una frase', () => {
  assert.equal(describeQuota(weeklyQuota(['fuerza', 'resistencia', 'movilidad'], 4, 0)), '2 de fuerza, 1 de resistencia y 1 de movilidad')
})
