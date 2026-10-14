/**
 * Comparar escaneos (D-023): medidas, no fotos, y solo lo que supera el margen.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { compareScans } from './compare'
import type { Measurements } from './measure'
import type { PoseShots } from './summary'
import type { ScanRecord } from './types'

const m = (values: Record<string, number>): Measurements => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }]))
const two = (values: Record<string, number>) => [m(values), m(values)]

function previous(shots: PoseShots, index: number | null = 70): ScanRecord {
  return {
    id: 'prev',
    dayKey: '2026-09-10',
    createdAt: '2026-09-10T18:00:00.000Z',
    protocolVersion: 1,
    selfReport: { build: null, strongZones: [], weakZones: [], priority: null },
    measurements: shots as ScanRecord['measurements'],
    result: { index, scores: { symmetry: 80, postureMobility: 60, proportion: null } },
  }
}

const BEFORE: PoseShots = {
  front: two({ shoulderTiltDeg: 6, shoulderToWaist: 1.18 }),
  side: two({ headForwardPct: 18 }),
  squat_front: two({ leftKneeInPct: 30, rightKneeInPct: 5 }),
  arms_up: two({ leftArmDeg: 160, rightArmDeg: 172, armsDiffDeg: -12 }),
}

test('lo que mejora más que su margen se dice como mejora, con los dos valores', () => {
  const now: PoseShots = {
    front: two({ shoulderTiltDeg: 1.5, shoulderToWaist: 1.18 }),
    side: two({ headForwardPct: 8 }),
    squat_front: two({ leftKneeInPct: 12, rightKneeInPct: 4 }),
    arms_up: two({ leftArmDeg: 171, rightArmDeg: 173, armsDiffDeg: -2 }),
  }
  const c = compareScans({ shots: now, index: 82, scores: { symmetry: 92, postureMobility: 78 } }, previous(BEFORE))
  const byKey = Object.fromEntries(c.changes.map((x) => [x.key, x]))
  assert.equal(byKey.shoulders.trend, 'better')
  assert.equal(byKey.shoulders.text, 'Tus hombros están más nivelados (6° → 1,5°)')
  assert.equal(byKey.head.trend, 'better')
  assert.equal(byKey.kneeInward.trend, 'better')
  assert.equal(byKey.overhead.trend, 'better')
  assert.equal(byKey.armsSides.trend, 'better')
  assert.equal(byKey.shoulderToWaist.trend, 'same')
  assert.match(c.headline, /^Tu índice ha pasado de 70 a 82 desde tu escaneo del jueves 10 de septiembre\. 5 medidas mejoran\.$/)
  assert.deepEqual(c.categories.find((x) => x.key === 'symmetry'), { key: 'symmetry', from: 80, to: 92 })
})

test('un cambio dentro del margen de medida es «sin cambio», no progreso', () => {
  const now: PoseShots = { front: two({ shoulderTiltDeg: 4.5, shoulderToWaist: 1.22 }), side: two({ headForwardPct: 15 }) }
  const c = compareScans({ shots: now, index: 70, scores: {} }, previous(BEFORE))
  assert.ok(c.changes.every((x) => x.trend === 'same'), JSON.stringify(c.changes.map((x) => [x.key, x.trend])))
  assert.match(c.headline, /Tu índice sigue en 70.*Ninguna medida cambia más que su margen de medida\./)
})

test('lo que empeora se dice como retroceso', () => {
  const now: PoseShots = { side: two({ headForwardPct: 30 }) }
  const c = compareScans({ shots: now, index: 64, scores: {} }, previous(BEFORE))
  const head = c.changes.find((x) => x.key === 'head')!
  assert.equal(head.trend, 'worse')
  assert.match(head.text, /^Llevas la cabeza más adelantada \(18 % → 30 %\)$/)
  assert.match(c.headline, /Ninguna medida mejora y 1 empeora\./)
})

test('la proporción hombros/cintura se dice tal cual, sin juzgarla', () => {
  const now: PoseShots = { front: two({ shoulderToWaist: 1.32 }) }
  const v = compareScans({ shots: now, index: null, scores: {} }, previous(BEFORE)).changes.find((x) => x.key === 'shoulderToWaist')!
  assert.equal(v.trend, 'changed')
  assert.equal(v.text, 'Hombros / cintura: de 1,18 a 1,32')
  assert.doesNotMatch(v.text, /mejor|peor|grasa|músculo/i)
})

test('solo se compara lo que existe en los dos escaneos', () => {
  const now: PoseShots = { squat_side: two({ kneeAngleDeg: 95, trunkLeanDeg: 40 }) }
  const c = compareScans({ shots: now, index: null, scores: {} }, previous(BEFORE, null))
  assert.deepEqual(c.changes, [])
  assert.match(c.headline, /^Comparado con tu escaneo del jueves 10 de septiembre. No hay medidas que se puedan comparar/)
  assert.match(c.note, /mismo montaje/)
})

test('la grasa estimada se compara con la guardada en el escaneo anterior, sin juzgarla', () => {
  const before = { ...previous(BEFORE), result: { ...previous(BEFORE).result, bodyFatPct: 18 } }
  const current = (pct: number | null) => ({ shots: BEFORE, index: 70, scores: {}, bodyFatPct: pct })
  const fat = (pct: number | null) => compareScans(current(pct), before).changes.find((c) => c.key === 'bodyFat')
  assert.equal(fat(16)?.trend, 'changed')
  assert.match(fat(16)!.text, /^Grasa estimada: de 18 % a 16 %$/)
  // Por debajo de su margen (1,5 puntos), sin cambio.
  assert.equal(fat(17)?.trend, 'same')
  // Sin estimación en uno de los dos, no se compara.
  assert.equal(fat(null), undefined)
  assert.equal(compareScans(current(16), previous(BEFORE)).changes.find((c) => c.key === 'bodyFat'), undefined)
})
