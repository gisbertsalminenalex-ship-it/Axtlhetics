import assert from 'node:assert/strict'
import test from 'node:test'

import { detectAsymmetries, diagnoseScan, estimateBuild, zoneReadings } from './diagnosis'

/** Un lector de medidas estables a partir de un mapa «pose.clave». */
const reader = (values: Record<string, number>) => (pose: string, key: string) => values[`${pose}.${key}`] ?? null

test('D-068: ectomorfia de Heath-Carter con la altura y el peso del perfil', () => {
  // 178 cm y 55 kg: índice 46,8 → ecto 5,7. La «V» en la referencia → meso 4.
  const lean = estimateBuild({ read: reader({ 'front.shoulderToWaist': 1.4 }), sex: 'hombre', body: { heightCm: 178, weightKg: 55 } })
  assert.equal(lean?.type, 'ectomorfa')
  assert.equal(lean?.ratings.ectomorfa, 5.7)
  assert.equal(lean?.ratings.mesomorfa, 4)
  assert.equal(lean?.leaning, null)

  // Por debajo de 38,25 el componente ecto es el mínimo de la escala.
  const heavy = estimateBuild({ read: reader({}), sex: 'hombre', body: { heightCm: 170, weightKg: 95 }, bodyFatPct: 30 })
  assert.equal(heavy?.ratings.ectomorfa, 0.1)
  assert.equal(heavy?.type, 'endomorfa')
})

test('D-068: mesomorfa con una «V» marcada, y con tendencia cuando el segundo queda cerca', () => {
  const meso = estimateBuild({ read: reader({ 'front.shoulderToWaist': 1.56 }), sex: 'hombre', body: { heightCm: 175, weightKg: 75 }, bodyFatPct: 14 })
  assert.equal(meso?.type, 'mesomorfa')
  assert.equal(meso?.leaning, null)

  // Meso 4 y ecto 3,6: a menos de 0,75, se dice como tendencia.
  const close = estimateBuild({ read: reader({ 'front.shoulderToWaist': 1.4 }), sex: 'hombre', body: { heightCm: 180, weightKg: 70 } })
  assert.equal(close?.type, 'mesomorfa')
  assert.equal(close?.leaning, 'ectomorfa')
})

test('D-068: con menos de dos componentes no hay complexión', () => {
  assert.equal(estimateBuild({ read: reader({ 'front.shoulderToWaist': 1.4 }), sex: 'hombre' }), null)
  assert.equal(estimateBuild({ read: reader({}), body: { heightCm: 178, weightKg: 70 } }), null)
})

test('D-068: zonas frente a un físico equilibrado: por detrás, por delante o nada', () => {
  assert.deepEqual(zoneReadings(reader({ 'front.shoulderToWaist': 1.3 }), 'hombre')[0].weak, ['hombros', 'espalda'])
  assert.deepEqual(zoneReadings(reader({ 'front.shoulderToWaist': 1.5 }), 'hombre')[0].strong, ['hombros', 'espalda'])
  // Entre la referencia y su margen (1,40–1,47): ni fuerte ni flojo.
  assert.deepEqual(zoneReadings(reader({ 'front.shoulderToWaist': 1.42 }), 'hombre'), [])

  const armsBehind = diagnoseScan({ read: reader({ 'front.upperArmMean': 0.25, 'front.thighMean': 0.45 }) })
  assert.deepEqual(armsBehind.strongZones, ['piernas'])
  assert.deepEqual(armsBehind.weakZones, ['brazos'])
})

test('D-068: solo las asimetrías claras, con su lado', () => {
  assert.deepEqual(detectAsymmetries(reader({ 'front.shoulderTiltDeg': 7, 'front.hipTiltDeg': -6, 'arms_up.armsDiffDeg': 15 })), [
    'El hombro izquierdo queda más alto que el otro',
    'La cadera derecha queda más alta que la otra',
    'El brazo derecho sube menos que el otro',
  ])
  assert.deepEqual(detectAsymmetries(reader({ 'front.shoulderTiltDeg': 3, 'arms_up.armsDiffDeg': -8 })), [])
})
