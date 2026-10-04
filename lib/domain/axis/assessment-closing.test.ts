/**
 * El mensaje de AXIS al terminar un test de evolución (D-021): resume los datos
 * con el veredicto primero y no interpreta más allá de ellos.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { compareAssessment } from '../assessment/compare'
import { completed, type TestValues } from '../assessment/test-fixtures'
import { assessmentClosingMessage } from './assessment-closing'
import { AXIS_PERSONALITY } from './personality'

const SEPT: TestValues = { push: 11, core: 56, legs: 62, pull: [10, 12] }

function message(oct: TestValues, previous: TestValues | null = SEPT, variants = ['flexiones', 'flexiones']) {
  const list = previous ? [completed('2026-09-05', previous, variants[0])] : []
  const current = completed('2026-10-04', oct, variants[1])
  const comparisons = compareAssessment(current, [...list, current])
  assert.ok(comparisons)
  return assessmentClosingMessage(comparisons)
}

test('el primer test lo dice tal cual', () => {
  assert.equal(
    message(SEPT, null),
    'Este es tu primer test. A partir de ahora tendremos una línea base para comparar tu evolución.',
  )
})

test('mejora en las cuatro', () => {
  assert.equal(
    message({ push: 12, core: 60, legs: 63, pull: [11, 13] }),
    'Has mejorado en las 4 pruebas respecto a tu test anterior.',
  )
})

test('mejora en algunas: cuántas de cuántas, cuáles, y qué pasa con el resto', () => {
  assert.equal(
    message({ push: 14, core: 68, legs: 54, pull: [12, 11] }),
    'Has mejorado en 2 de 4 pruebas respecto a tu test anterior: flexiones y plancha. Sentadilla en pared baja. En remo unilateral, un lado sube y el otro baja.',
  )
})

test('sin cambio exacto se dice como tal', () => {
  assert.equal(
    message({ ...SEPT, push: 13 }),
    'Has mejorado en 1 de 4 pruebas respecto a tu test anterior: flexiones. Plancha, sentadilla en pared y remo unilateral sin cambio.',
  )
})

test('ninguna mejora: se dice sin dramatizar', () => {
  assert.equal(
    message({ push: 10, core: 50, legs: 62, pull: [10, 12] }),
    'Respecto a tu test anterior, ninguna de las 4 pruebas mejora. Sentadilla en pared y remo unilateral sin cambio. Flexiones y plancha bajan.',
  )
})

test('un lado que sube con el otro igual no cuenta como mejora', () => {
  const text = message({ ...SEPT, pull: [11, 12] })
  assert.ok(text.startsWith('Respecto a tu test anterior, ninguna de las 4 pruebas mejora.'))
  assert.ok(text.includes('En remo unilateral, un lado sube y el otro se mantiene.'))
})

test('un cambio de variante de flexiones se anuncia como línea base nueva y no cuenta', () => {
  const text = message({ push: 30, core: 60, legs: 63, pull: [11, 13] }, SEPT, ['flexiones-inclinadas', 'flexiones'])
  assert.equal(
    text,
    'Has mejorado en las 3 pruebas respecto a tu test anterior. Flexiones empieza una línea base nueva.',
  )
})

test('no lleva números, porcentajes, exclamaciones ni juicios sobre el cuerpo', () => {
  const texts = [
    message({ push: 14, core: 68, legs: 54, pull: [12, 11] }),
    message({ push: 12, core: 60, legs: 63, pull: [11, 13] }),
    message({ push: 10, core: 50, legs: 60, pull: [9, 11] }),
  ]
  for (const text of texts) {
    assert.ok(!text.includes('%'), text)
    assert.ok(!/[!¡]/.test(text), text)
    assert.ok(!/más en forma|más fuerte|nivel|forma física|recuperación/i.test(text), text)
    assert.ok(!/\d+ (reps|s)\b/.test(text), text)
    for (const opener of AXIS_PERSONALITY.forbiddenOpeners) {
      assert.ok(!text.toLowerCase().startsWith(opener.toLowerCase()), text)
    }
  }
})
