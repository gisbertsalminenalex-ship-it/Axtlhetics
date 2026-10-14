/**
 * Grasa estimada con la fórmula de la Marina (D-023, enmienda del 2026-10-14):
 * valores calculados a mano con la fórmula publicada.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { ellipsePerimeter, estimateBodyFat, navyBodyFat, type StableReader } from './body-fat'

const near = (actual: number | null | undefined, expected: number, margin: number, what: string) =>
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < margin, `${what}: ${actual} frente a ${expected}`)

test('el perímetro de una elipse con los dos diámetros iguales es el de un círculo', () => {
  near(ellipsePerimeter(10, 10), Math.PI * 10, 1e-9, 'círculo')
  // Una elipse 30 × 20 cm: ≈ 79,3 cm.
  near(ellipsePerimeter(30, 20), 79.33, 0.01, 'elipse')
})

test('fórmula de la Marina: hombre de 178 cm, cuello 38 y cintura 85 → ≈ 16,4 %', () => {
  near(navyBodyFat('hombre', { neck: 38, waist: 85, height: 178 }), 16.4, 0.1, 'hombre')
})

test('fórmula de la Marina: mujer de 165 cm, cuello 33, cintura 70 y cadera 95 → ≈ 24,3 %', () => {
  near(navyBodyFat('mujer', { neck: 33, waist: 70, hip: 95, height: 165 }), 24.3, 0.1, 'mujer')
})

test('perímetros sin sentido o un resultado fuera de rango no dan estimación', () => {
  assert.equal(navyBodyFat('hombre', { neck: 40, waist: 38, height: 178 }), null, 'cintura menor que el cuello')
  assert.equal(navyBodyFat('mujer', { neck: 33, waist: 70, height: 165 }), null, 'mujer sin cadera')
  assert.equal(navyBodyFat('hombre', { neck: 38, waist: 400, height: 178 }), null, 'fuera del rango creíble')
})

/** Un lector de medidas con valores fijos por pose. */
const reader =
  (values: Record<string, Record<string, number>>): StableReader =>
  (pose, key) =>
    values[pose]?.[key] ?? null

test('la estimación pasa la foto a centímetros con la altura y une frente y perfil en elipses', () => {
  // 178 cm. Cuello: 12 cm de ancho y 12 de fondo → círculo de 37,7 cm. Cintura: 30 × 24 cm.
  const h = 178
  const read = reader({
    front: { neckWidthH: 12 / h, waistWidthH: 30 / h },
    side: { neckDepthH: 12 / h, waistDepthH: 24 / h },
  })
  const result = estimateBodyFat(read, 'hombre', h)
  assert.ok(result.ok)
  near(result.estimate.neckCm, Math.PI * 12, 0.1, 'cuello')
  near(result.estimate.waistCm, ellipsePerimeter(30, 24), 0.1, 'cintura')
  near(result.estimate.pct, navyBodyFat('hombre', { neck: Math.PI * 12, waist: ellipsePerimeter(30, 24), height: h })!, 0.1, 'grasa')
  assert.equal(result.estimate.marginPct, 4)
  assert.equal(result.estimate.hipCm, null)
})

test('sin sexo, sin altura o sin una de las dos fotos no se estima, y se dice qué falta', () => {
  const full = reader({
    front: { neckWidthH: 0.07, waistWidthH: 0.17, waistNarrowWidthH: 0.16, hipWidthH: 0.2 },
    side: { neckDepthH: 0.07, waistDepthH: 0.13, waistNarrowDepthH: 0.12, hipDepthH: 0.13 },
  })
  assert.deepEqual(estimateBodyFat(full, null, 178), { ok: false, missing: 'no_sex' })
  assert.deepEqual(estimateBodyFat(full, 'hombre', null), { ok: false, missing: 'no_height' })
  assert.deepEqual(estimateBodyFat(reader({ side: { neckDepthH: 0.07, waistDepthH: 0.13 } }), 'hombre', 178), { ok: false, missing: 'no_front' })
  assert.deepEqual(estimateBodyFat(reader({ front: { neckWidthH: 0.07, waistWidthH: 0.17 } }), 'hombre', 178), { ok: false, missing: 'no_side' })
  // Las mujeres usan la cintura más estrecha y la cadera.
  const woman = estimateBodyFat(full, 'mujer', 165)
  assert.ok(woman.ok && woman.estimate.hipCm !== null)
})
