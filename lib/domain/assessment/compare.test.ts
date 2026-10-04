/**
 * Comparar con el test anterior compatible (D-021): diferencia exacta, sin
 * margen ni porcentajes; línea base cuando no hay con qué comparar; el remo,
 * lado a lado.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { interruptAssessment, recordResult } from './assessment'
import { compareAssessment, formatAssessmentDelta, formatAssessmentValue, type TestComparison } from './compare'
import { at, completed, started, type TestValues } from './test-fixtures'
import type { Assessment } from './types'

const SEPT: TestValues = { push: 11, core: 56, legs: 62, pull: [10, 12] }
const OCT: TestValues = { push: 14, core: 68, legs: 54, pull: [12, 11] }

function byKey(comparisons: TestComparison[] | null) {
  assert.ok(comparisons)
  return Object.fromEntries(comparisons.map((comparison) => [comparison.test.key, comparison]))
}

test('el primer test es línea base en las cuatro pruebas', () => {
  const first = completed('2026-09-05', SEPT)
  const comparisons = compareAssessment(first, [first])
  assert.ok(comparisons)
  assert.deepEqual(comparisons.map((c) => c.delta), Array(4).fill({ kind: 'baseline' }))
  assert.ok(comparisons.every((c) => c.previous === null))
})

test('la diferencia es exacta y con signo; el remo, por lados', () => {
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', OCT)
  const c = byKey(compareAssessment(oct, [oct, sept]))
  assert.deepEqual(c.push.delta, { kind: 'single', diff: 3, trend: 'up' })
  assert.deepEqual(c.core.delta, { kind: 'single', diff: 12, trend: 'up' })
  assert.deepEqual(c.legs.delta, { kind: 'single', diff: -8, trend: 'down' })
  assert.deepEqual(c.pull.delta, { kind: 'sides', left: 2, right: -1, trend: 'mixed' })
})

test('«sin cambio» solo con el resultado exactamente igual: un segundo ya es diferencia', () => {
  const sept = completed('2026-09-05', SEPT)
  const same = completed('2026-10-04', { ...SEPT, core: 57 })
  const c = byKey(compareAssessment(same, [same, sept]))
  assert.deepEqual(c.push.delta, { kind: 'single', diff: 0, trend: 'same' })
  assert.deepEqual(c.core.delta, { kind: 'single', diff: 1, trend: 'up' })
  assert.deepEqual(c.pull.delta, { kind: 'sides', left: 0, right: 0, trend: 'same' })
})

test('el remo solo mejora si mejoran los dos lados', () => {
  const sept = completed('2026-09-05', SEPT)
  const trend = (pull: [number, number]) => {
    const oct = completed('2026-10-04', { ...SEPT, pull })
    return byKey(compareAssessment(oct, [sept, oct])).pull.delta
  }
  assert.equal((trend([11, 13]) as { trend: string }).trend, 'up')
  assert.equal((trend([9, 11]) as { trend: string }).trend, 'down')
  assert.equal((trend([12, 11]) as { trend: string }).trend, 'mixed')
  assert.equal((trend([12, 12]) as { trend: string }).trend, 'partial_up')
  assert.equal((trend([10, 11]) as { trend: string }).trend, 'partial_down')
})

test('se compara con el test completado más reciente anterior, no con el primero', () => {
  const aug = completed('2026-08-01', { ...SEPT, push: 5 })
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', OCT)
  const c = byKey(compareAssessment(oct, [aug, oct, sept]))
  assert.equal(c.push.previous?.recordedAt.slice(0, 10), '2026-09-05')
  assert.deepEqual(c.push.delta, { kind: 'single', diff: 3, trend: 'up' })
})

test('un test posterior no cuenta como anterior: al revisar septiembre, octubre no existe', () => {
  const aug = completed('2026-08-01', { ...SEPT, push: 5 })
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', OCT)
  const c = byKey(compareAssessment(sept, [aug, sept, oct]))
  assert.deepEqual(c.push.delta, { kind: 'single', diff: 6, trend: 'up' })
  assert.deepEqual(c.push.best, { kind: 'single', value: 11 }, 'la mejor marca tampoco mira al futuro')
})

test('un test interrumpido nunca se usa como anterior', () => {
  const sept = completed('2026-09-05', SEPT)
  const outcome = interruptAssessment(recordResult(started('2026-09-20'), 30, at('2026-09-20')), at('2026-09-20'))
  assert.equal(outcome.kind, 'interrupted')
  const interrupted = outcome.kind === 'interrupted' ? outcome.assessment : sept
  const oct = completed('2026-10-04', OCT)
  const c = byKey(compareAssessment(oct, [sept, interrupted, oct]))
  assert.deepEqual(c.push.delta, { kind: 'single', diff: 3, trend: 'up' })
})

test('un test no completado no se compara', () => {
  assert.equal(compareAssessment(started('2026-10-04'), []), null)
})

test('cambiar de variante de flexiones empieza una línea base solo en esa prueba', () => {
  const sept = completed('2026-09-05', SEPT, 'flexiones-inclinadas')
  const oct = completed('2026-10-04', OCT, 'flexiones')
  const c = byKey(compareAssessment(oct, [sept, oct]))
  assert.deepEqual(c.push.delta, { kind: 'baseline' })
  assert.equal(c.push.previous, null)
  assert.deepEqual(c.core.delta, { kind: 'single', diff: 12, trend: 'up' })
})

test('otro protocolo no se compara', () => {
  const sept: Assessment = { ...completed('2026-09-05', SEPT), protocolVersion: 0 }
  const oct = completed('2026-10-04', OCT)
  assert.ok(compareAssessment(oct, [sept, oct])?.every((c) => c.delta.kind === 'baseline'))
})

test('la mejor marca en test es la máxima de esa prueba y variante; el remo, por lado', () => {
  const aug = completed('2026-08-01', { push: 9, core: 70, legs: 40, pull: [12, 9] })
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', OCT)
  const c = byKey(compareAssessment(oct, [aug, sept, oct]))
  assert.deepEqual(c.push.best, { kind: 'single', value: 14 })
  assert.deepEqual(c.core.best, { kind: 'single', value: 70 })
  assert.deepEqual(c.legs.best, { kind: 'single', value: 62 })
  assert.deepEqual(c.pull.best, { kind: 'sides', left: 12, right: 12 })
})

test('la mejor marca no mezcla variantes de flexiones', () => {
  const sept = completed('2026-09-05', { ...SEPT, push: 30 }, 'flexiones-inclinadas')
  const oct = completed('2026-10-04', OCT, 'flexiones')
  assert.deepEqual(byKey(compareAssessment(oct, [sept, oct])).push.best, { kind: 'single', value: 14 })
})

test('valores y diferencias se escriben como en el diseño, con el signo menos real', () => {
  assert.equal(formatAssessmentValue({ kind: 'single', value: 14 }, 'reps'), '14 reps')
  assert.equal(formatAssessmentValue({ kind: 'single', value: 68 }, 'seconds'), '68 s')
  assert.equal(formatAssessmentValue({ kind: 'sides', left: 12, right: 11 }, 'reps'), '12 / 11 reps')

  assert.equal(formatAssessmentDelta({ kind: 'baseline' }, 'reps'), 'Línea base')
  assert.equal(formatAssessmentDelta({ kind: 'single', diff: 3, trend: 'up' }, 'reps'), '+3 reps')
  assert.equal(formatAssessmentDelta({ kind: 'single', diff: -8, trend: 'down' }, 'seconds'), '−8 s')
  assert.equal(formatAssessmentDelta({ kind: 'single', diff: 0, trend: 'same' }, 'reps'), 'Sin cambio')
  assert.equal(formatAssessmentDelta({ kind: 'sides', left: 2, right: -1, trend: 'mixed' }, 'reps'), 'Mixto · +2 / −1')
  assert.equal(formatAssessmentDelta({ kind: 'sides', left: 2, right: 1, trend: 'up' }, 'reps'), '+2 / +1')
  assert.equal(formatAssessmentDelta({ kind: 'sides', left: 2, right: 0, trend: 'partial_up' }, 'reps'), '+2 / 0')
  assert.equal(formatAssessmentDelta({ kind: 'sides', left: 0, right: 0, trend: 'same' }, 'reps'), 'Sin cambio')
  assert.ok(!formatAssessmentDelta({ kind: 'single', diff: -8, trend: 'down' }, 'seconds').includes('-'))
})

test('ningún texto de comparación lleva porcentajes', () => {
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', OCT)
  for (const c of compareAssessment(oct, [sept, oct]) ?? []) {
    assert.ok(!formatAssessmentDelta(c.delta, c.result.measure).includes('%'))
  }
})
