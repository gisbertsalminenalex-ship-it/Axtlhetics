import assert from 'node:assert/strict'
import test from 'node:test'

import type { BodyMeasurement, PerimeterKey } from '../body/measurements'
import { readTape, tapeForScan, tapeText } from './coach'

const record = (dayKey: string, perimeters: Partial<Record<PerimeterKey, number>>): BodyMeasurement => ({
  dayKey,
  weightKg: null,
  perimeters,
  updatedAt: `${dayKey}T10:00:00.000Z`,
})

test('D-069: la cinta de hoy es la última de cada perímetro, sin medidas futuras ni de hace más de 60 días', () => {
  const records = [
    record('2026-06-01', { cintura: 80 }),
    record('2026-09-20', { brazo: 30, muslo: 54 }),
    record('2026-10-20', { brazo: 31 }),
    record('2026-11-01', { brazo: 40 }),
  ]
  const tape = readTape(records, '2026-10-24')!
  assert.deepEqual(tape.latest, { brazo: 31, muslo: 54 })
  // El brazo se compara con la medida de al menos 21 días antes; el muslo no tiene otra.
  assert.deepEqual(tape.changes, [{ key: 'brazo', from: 30, to: 31, days: 30 }])
  assert.equal(readTape([record('2026-06-01', { brazo: 30 })], '2026-10-24'), null)
})

test('D-069: sin cinta, se pide medir; con el punto de partida, se dice que es la referencia', () => {
  assert.match(tapeText(null, [], false).parts[0], /^La foto no ve el músculo; la cinta sí\./)
  const first = tapeText({ latest: { brazo: 31, pecho: 95 }, changes: [] }, [], false)
  assert.match(first.parts[0], /Con la cinta tengo tu punto de partida/)
  assert.deepEqual(first.details, ['Brazo: 31 cm', 'Pecho: 95 cm'])
  assert.deepEqual(first.progress, [])
})

test('D-069: un perímetro que crece con la fuerza de su zona es coherente con más músculo; sin fuerza, no se atribuye', () => {
  const tape = { latest: { brazo: 32 }, changes: [{ key: 'brazo' as const, from: 31, to: 32, days: 28 }] }
  const backed = tapeText(tape, ['empuje'], true)
  assert.match(backed.parts[0], /^Tu brazo ha crecido 1 cm y tu fuerza de empuje ha subido: es coherente con más músculo\.$/)
  assert.deepEqual(backed.strengths, ['Tu brazo crece junto con tu fuerza (+1 cm)'])
  assert.deepEqual(backed.progress, ['Brazo: 31 cm → 32 cm (+1 cm) en 28 días'])

  assert.match(tapeText(tape, [], true).parts[0], /pero tu fuerza ahí no ha subido: no puedo atribuirlo a músculo/)
  assert.match(tapeText(tape, [], false).parts[0], /Con el próximo test de evolución sabré si es músculo/)
})

test('D-069: por debajo del margen de la cinta no hay cambio; la cintura se dice sin juzgarla', () => {
  const tape = {
    latest: { brazo: 31.3, cintura: 83 },
    changes: [
      { key: 'brazo' as const, from: 31, to: 31.3, days: 28 },
      { key: 'cintura' as const, from: 80, to: 83, days: 28 },
    ],
  }
  const text = tapeText(tape, ['empuje'], true)
  assert.deepEqual(text.progress, ['Brazo: 31 cm → 31,3 cm (sin cambio) en 28 días', 'Cintura: 80 cm → 83 cm (+3 cm) en 28 días'])
  assert.deepEqual(text.parts, ['Tus perímetros no han cambiado más que el margen de la cinta desde la medida anterior.'])
  assert.doesNotMatch(text.parts.join(' '), /grasa|engord/)
})

test('D-069: sin historial (AXIS), la cinta guardada con el escaneo', () => {
  assert.deepEqual(tapeForScan({ dayKey: '2026-10-24', tape: { brazo: 31 } }), { latest: { brazo: 31 }, changes: [] })
  assert.equal(tapeForScan({ dayKey: '2026-10-24' }), null)
  assert.deepEqual(tapeForScan({ dayKey: '2026-10-24', tape: { brazo: 31 } }, [record('2026-10-24', { brazo: 33 })])?.latest, { brazo: 33 })
})
