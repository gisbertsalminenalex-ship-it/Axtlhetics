/**
 * El punto de partida y la revisión del mes (D-067).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { goalEvolution, goalMeasures, monthlyCheckDue, needsBaseline } from './goal-measures'
import type { BodyMeasurement } from './measurements'

const record = (dayKey: string, weightKg: number | null, perimeters: BodyMeasurement['perimeters'] = {}): BodyMeasurement => ({
  dayKey,
  weightKg,
  perimeters,
  updatedAt: `${dayKey}T08:00:00.000Z`,
})

test('cada objetivo pide lo suyo, y varios se juntan sin repetir', () => {
  assert.deepEqual(goalMeasures(['hipertrofia']), { weight: true, perimeters: ['pecho', 'brazo', 'muslo'], test: false })
  assert.deepEqual(goalMeasures(['salud_general']), { weight: true, perimeters: ['cintura'], test: false })
  assert.deepEqual(goalMeasures(['fuerza']), { weight: false, perimeters: [], test: true })
  assert.deepEqual(goalMeasures(['hipertrofia', 'salud_general', 'resistencia']), {
    weight: true,
    perimeters: ['cintura', 'pecho', 'brazo', 'muslo'],
    test: true,
  })
  assert.equal(needsBaseline(goalMeasures(['movilidad', 'tecnica'])), false)
})

test('la revisión toca a los 28 días de la última cinta de esas zonas', () => {
  const records = [record('2026-10-01', 70, { brazo: 30, pecho: 92, muslo: 52 })]
  const due = (today: string) => monthlyCheckDue({ goals: ['hipertrofia'], records, assessments: [], today })
  assert.equal(due('2026-10-28'), null)
  assert.deepEqual(due('2026-10-29'), { perimeters: ['pecho', 'brazo', 'muslo'], weight: true, test: false })
  // Medir la cintura no cuenta para quien quiere masa muscular.
  const waistOnly = [record('2026-10-20', null, { cintura: 80 })]
  assert.ok(monthlyCheckDue({ goals: ['hipertrofia'], records: waistOnly, assessments: [], today: '2026-10-21' }))
})

test('la evolución: el primer día, el mes anterior y ahora', () => {
  const records = [
    record('2026-08-01', 70, { brazo: 30 }),
    record('2026-08-29', 70.5, { brazo: 30.5 }),
    record('2026-09-26', 71.2, { brazo: 31.5 }),
  ]
  const [weight, arm] = goalEvolution(['hipertrofia'], records)
  assert.deepEqual(weight.first, { dayKey: '2026-08-01', value: 70 })
  assert.deepEqual(weight.previous, { dayKey: '2026-08-29', value: 70.5 })
  assert.deepEqual(weight.latest, { dayKey: '2026-09-26', value: 71.2 })
  assert.equal(arm.label, 'Brazo')
  assert.deepEqual([arm.first.value, arm.previous?.value, arm.latest.value], [30, 30.5, 31.5])
  // Con una sola medida no hay evolución que enseñar.
  assert.deepEqual(goalEvolution(['hipertrofia'], [records[0]]), [])
})
