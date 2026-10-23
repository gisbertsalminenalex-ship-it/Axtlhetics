import assert from 'node:assert/strict'
import test from 'node:test'

import { latestScan, physiquePlan, type PhysiqueInput } from './physique'
import type { ScanRecord } from './types'

/** Dos fotos iguales por pose: la mediana es ese valor y es estable. */
function shots(values: Record<string, Record<string, number>>): PhysiqueInput['measurements'] {
  return Object.fromEntries(
    Object.entries(values).map(([pose, keys]) => {
      const one = Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, { value }]))
      return [pose, [one, one]]
    }),
  )
}

function input(measurements: PhysiqueInput['measurements'], partial: Partial<PhysiqueInput['selfReport']> = {}): PhysiqueInput {
  return {
    dayKey: '2026-10-10',
    measurements,
    selfReport: { priority: null, sex: 'hombre', ...partial },
  }
}

test('D-041: una «V» por debajo de la referencia prioriza hombros y espalda, y lo dice con las cifras', () => {
  const plan = physiquePlan(input(shots({ front: { shoulderToWaist: 1.22 } })))
  assert.deepEqual(plan.priorityGroups, ['hombros', 'espalda'])
  assert.match(plan.findings[0], /la «V» de hombros a cintura \(1,22\) queda por debajo de un físico equilibrado \(1,40\)/)

  // Con la referencia de mujer (1,25), la misma foto ya no queda por debajo.
  assert.deepEqual(physiquePlan(input(shots({ front: { shoulderToWaist: 1.3 } }), { sex: 'mujer' })).priorityGroups, [])
})

test('D-041: brazos frente a muslo: por debajo, brazos; por encima, piernas', () => {
  assert.deepEqual(physiquePlan(input(shots({ front: { upperArmMean: 0.25, thighMean: 0.45 } }))).priorityGroups, ['brazos'])
  assert.deepEqual(physiquePlan(input(shots({ front: { upperArmMean: 0.45, thighMean: 0.45 } }))).priorityGroups, ['piernas', 'gluteos'])
  assert.deepEqual(physiquePlan(input(shots({ front: { upperArmMean: 0.33, thighMean: 0.45 } }))).priorityGroups, [])
})

test('D-068: las zonas que un escaneo antiguo guardó como respuesta ya no priorizan nada', () => {
  // Antes de D-068 el usuario marcaba sus zonas flojas; esos campos siguen en disco y se ignoran.
  const legacy = { ...input(shots({})), selfReport: { priority: null, build: 'media', strongZones: [], weakZones: ['espalda'] } } as unknown as PhysiqueInput
  const plan = physiquePlan(legacy)
  assert.deepEqual(plan.priorityGroups, [])
  assert.deepEqual(plan.findings, [])
})

test('D-041: postura, movilidad y simetría claras piden correctivos y trabajo unilateral; el ruido no', () => {
  const clear = physiquePlan(
    input(
      shots({
        side: { headForwardPct: 16 },
        squat_side: { kneeAngleDeg: 130 },
        squat_front: { leftKneeInPct: 25, rightKneeInPct: 4 },
        front: { shoulderTiltDeg: 7 },
      }),
    ),
  )
  assert.deepEqual(clear.warmupExtras, ['angeles-pared', 'rotacion-toracica', 'tobillo-pared', 'estiramiento-flexor-cadera', 'equilibrio-una-pierna'])
  assert.equal(clear.unilateral, true)

  const noise = physiquePlan(input(shots({ side: { headForwardPct: 8 }, squat_side: { kneeAngleDeg: 105 }, front: { shoulderTiltDeg: 3 } })))
  assert.deepEqual(noise.warmupExtras, [])
  assert.equal(noise.unilateral, false)
})

test('D-041: solo guía el escaneo más reciente de los últimos 90 días', () => {
  const record = (id: string, dayKey: string) => ({ id, dayKey }) as ScanRecord
  assert.equal(latestScan([record('a', '2026-09-01'), record('b', '2026-10-01')], '2026-10-18')?.id, 'b')
  assert.equal(latestScan([record('a', '2026-06-01')], '2026-10-18'), null)
})
