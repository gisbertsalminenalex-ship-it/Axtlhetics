/**
 * Peso y medidas (D-060).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createMemoryRepositories } from '../../data/memory-repositories'
import {
  currentWeight,
  emptyMeasurement,
  isBodyMeasurement,
  latestPerimeters,
  latestWeight,
  perimeterChanges,
  perimetersDue,
  weeklyWeightChange,
  weeklyWeights,
  withPerimeters,
  withWeight,
  type BodyMeasurement,
} from './measurements'

const AT = '2026-10-21T08:00:00.000Z'

function weighIn(dayKey: string, weightKg: number): BodyMeasurement {
  return withWeight(emptyMeasurement(dayKey, AT), weightKg, AT)
}

function tape(dayKey: string, cintura: number): BodyMeasurement {
  return withPerimeters(emptyMeasurement(dayKey, AT), { cintura }, AT)
}

// Miércoles 21 de octubre; semanas desde el lunes 28 de sept.
const TODAY = '2026-10-21'

test('la media de cada semana con pesos, y el cambio por semana', () => {
  const records = [
    weighIn('2026-09-28', 71),
    weighIn('2026-09-30', 71.4),
    weighIn('2026-10-12', 70.6),
    weighIn('2026-10-19', 70.2),
    weighIn('2026-10-21', 70),
    // Un día del futuro no cuenta.
    weighIn('2026-10-23', 60),
  ]
  const weeks = weeklyWeights(records, TODAY)
  assert.deepEqual(weeks, [
    { weekStart: '2026-09-28', averageKg: 71.2, weighIns: 2 },
    { weekStart: '2026-10-12', averageKg: 70.6, weighIns: 1 },
    { weekStart: '2026-10-19', averageKg: 70.1, weighIns: 2 },
  ])
  // De 71,2 a 70,1 en 3 semanas.
  assert.equal(weeklyWeightChange(weeks), -0.37)
  assert.equal(weeklyWeightChange(weeks.slice(0, 1)), null)
})

test('el peso con el que trabajar: el último registrado o el del perfil', () => {
  assert.equal(currentWeight([], 68), 68)
  const records = [weighIn('2026-10-01', 70), tape('2026-10-10', 80)]
  assert.deepEqual(latestWeight(records), { dayKey: '2026-10-01', weightKg: 70 })
  assert.equal(currentWeight(records, 68), 70)
})

test('los perímetros: lo último de cada zona, el cambio y cuándo toca medir', () => {
  const records = [tape('2026-10-01', 82), weighIn('2026-10-10', 70), tape('2026-10-15', 80.5)]
  assert.deepEqual(latestPerimeters(records).cintura, { dayKey: '2026-10-15', cm: 80.5 })
  assert.deepEqual(perimeterChanges(records).cintura, { from: 82, to: 80.5 })
  assert.equal(perimetersDue(records, '2026-11-11'), false)
  assert.equal(perimetersDue(records, '2026-11-12'), true)
  assert.equal(perimetersDue([weighIn('2026-10-10', 70)], TODAY), true, 'nunca se midió')
})

test('apuntar peso no borra los perímetros del día, ni al revés', () => {
  const both = withWeight(tape(TODAY, 80), 70, AT)
  assert.deepEqual(both.perimeters, { cintura: 80 })
  assert.equal(withPerimeters(both, { brazo: 31 }, AT).weightKg, 70)
})

test('la forma guardada', () => {
  assert.ok(isBodyMeasurement(JSON.parse(JSON.stringify(withWeight(tape(TODAY, 80), 70, AT)))))
  assert.ok(!isBodyMeasurement({ ...weighIn(TODAY, 70), weightKg: 3 }))
  assert.ok(!isBodyMeasurement({ ...weighIn(TODAY, 70), perimeters: { oreja: 5 } }))
  assert.ok(!isBodyMeasurement({ ...weighIn(TODAY, 70), perimeters: { cintura: 900 } }))
})

test('el repositorio en memoria guarda un registro por día y viaja en la copia', async () => {
  const repositories = createMemoryRepositories()
  await repositories.measurements.save(weighIn('2026-10-20', 70))
  await repositories.measurements.save(weighIn('2026-10-19', 71))
  await repositories.measurements.save(weighIn('2026-10-20', 69.5))
  const list = await repositories.measurements.list()
  assert.deepEqual(list.map((record) => [record.dayKey, record.weightKg]), [['2026-10-19', 71], ['2026-10-20', 69.5]])
  const backup = await repositories.backup.readAll()
  assert.equal(backup.measurements.length, 2)
  await repositories.backup.replaceAll({ ...backup, measurements: [] })
  assert.deepEqual(await repositories.measurements.list(), [])
})
