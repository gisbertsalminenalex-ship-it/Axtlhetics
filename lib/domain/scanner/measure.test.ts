/**
 * Medidas del escáner (D-023) con geometría conocida: cada caso fija los puntos
 * para que el resultado esperado se pueda calcular a mano.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  angleAt,
  bodyWidthAt,
  LM,
  measureArmsUp,
  measureFront,
  measureSide,
  measureSquatFront,
  measureSquatSide,
  stabilityOf,
  type ScanLandmark,
  type Silhouette,
} from './measure'

/** Foto vertical: los ángulos se calculan en píxeles, no en 0–1. */
const SIZE = { width: 1000, height: 2000 }

/** Convierte píxeles en puntos normalizados, visibles salvo que se diga otra cosa. */
type Coords = readonly [number, number] | readonly [number, number, number]

function pose(points: Partial<Record<keyof typeof LM, Coords>>): ScanLandmark[] {
  const out: ScanLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }))
  for (const [name, p] of Object.entries(points)) {
    const [x, y, visibility = 0.99] = p as readonly number[]
    out[LM[name as keyof typeof LM]] = { x: x / SIZE.width, y: y / SIZE.height, visibility }
  }
  return out
}

const value = (m: { value: number | null }) => m.value

// De frente: la persona mira a la cámara, su lado izquierdo sale a la derecha.
const FRONT = {
  leftShoulder: [600, 600],
  rightShoulder: [400, 600],
  leftElbow: [620, 900],
  rightElbow: [380, 900],
  leftWrist: [630, 1150],
  rightWrist: [370, 1150],
  leftHip: [560, 1100],
  rightHip: [440, 1100],
  leftKnee: [560, 1450],
  rightKnee: [440, 1450],
  leftAnkle: [560, 1800],
  rightAnkle: [440, 1800],
} as const

test('ángulo en un vértice', () => {
  assert.equal(Math.round(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })), 90)
  assert.equal(Math.round(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })), 180)
})

test('de frente, con todo nivelado y simétrico, las medidas dan cero', () => {
  const m = measureFront(pose(FRONT), SIZE)
  assert.equal(value(m.shoulderTiltDeg), 0)
  assert.equal(value(m.hipTiltDeg), 0)
  assert.equal(value(m.armAsymmetryPct), 0)
  assert.equal(value(m.legAsymmetryPct), 0)
  // Pierna 700 px, tronco 500 px.
  assert.equal(value(m.legToTorso), 1.4)
})

test('hombro izquierdo más alto da una inclinación positiva, en píxeles reales', () => {
  // 200 px de anchura entre hombros y 20 px más alto el izquierdo → atan(20/200) ≈ 5,7°.
  const m = measureFront(pose({ ...FRONT, leftShoulder: [600, 580] }), SIZE)
  assert.equal(value(m.shoulderTiltDeg), 5.7)
  const lower = measureFront(pose({ ...FRONT, leftShoulder: [600, 620] }), SIZE)
  assert.equal(value(lower.shoulderTiltDeg), -5.7)
})

test('un brazo más largo se ve en la asimetría con su signo', () => {
  // Brazo izquierdo: 300 + 100 = 400; derecho: 300 + 100 → se alarga el izquierdo a 440.
  const m = measureFront(pose({ ...FRONT, leftElbow: [600, 900], leftWrist: [600, 1040], rightElbow: [400, 900], rightWrist: [400, 1000] }), SIZE)
  // izquierdo 300 + 140 = 440, derecho 300 + 100 = 400 → (40 / 420) × 100 ≈ 9,5 %.
  assert.equal(value(m.armAsymmetryPct), 9.5)
})

test('un punto poco visible o fuera de la foto no se rellena', () => {
  const hidden = measureFront(pose({ ...FRONT, leftWrist: [630, 1150, 0.2] }), SIZE)
  assert.deepEqual(hidden.armAsymmetryPct, { value: null, reason: 'not_visible' })
  assert.notEqual(value(hidden.shoulderTiltDeg), null, 'lo que no depende de la muñeca sí se mide')

  const cut = measureFront(pose({ ...FRONT, leftAnkle: [560, 1999] }), SIZE)
  assert.deepEqual(cut.legAsymmetryPct, { value: null, reason: 'out_of_frame' })
})

test('la «V» sale de la silueta: hombros 300 px, cintura 200 px → 1,5', () => {
  // Silueta en coordenadas de imagen: tronco de 200 px de ancho y 300 px a la
  // altura de los hombros (deltoides).
  const mask: Silhouette = {
    width: SIZE.width,
    height: SIZE.height,
    isBody: (x, y) => (y >= 580 && y <= 640 ? x >= 350 && x <= 649 : y > 640 && y <= 1100 ? x >= 400 && x <= 599 : false),
  }
  assert.equal(bodyWidthAt(mask, 500, 600), 300)
  assert.equal(value(measureFront(pose(FRONT), SIZE, mask).shoulderToWaist), 1.5)
  assert.deepEqual(measureFront(pose(FRONT), SIZE).shoulderToWaist, { value: null, reason: 'no_silhouette' })
})

test('la silueta a menor resolución que la foto se escala', () => {
  const half: Silhouette = {
    width: SIZE.width / 2,
    height: SIZE.height / 2,
    isBody: (x, y) => (y >= 290 && y <= 320 ? x >= 175 && x <= 324 : y > 320 && y <= 550 ? x >= 200 && x <= 299 : false),
  }
  assert.equal(value(measureFront(pose(FRONT), SIZE, half).shoulderToWaist), 1.5)
})

test('de perfil: la cabeza adelantada es positiva mire a donde mire la persona', () => {
  // Mirando a la derecha de la imagen; tronco de 500 px; oreja 50 px por delante del hombro → 10 %.
  const right = measureSide(pose({ nose: [690, 360], leftEar: [650, 400], leftShoulder: [600, 600], leftHip: [600, 1100], rightEar: [0, 0, 0.1], rightShoulder: [0, 0, 0.1], rightHip: [0, 0, 0.1] }), SIZE)
  assert.equal(value(right.headForwardPct), 10)
  // La misma postura mirando a la izquierda.
  const left = measureSide(pose({ nose: [310, 360], leftEar: [350, 400], leftShoulder: [400, 600], leftHip: [400, 1100], rightEar: [0, 0, 0.1], rightShoulder: [0, 0, 0.1], rightHip: [0, 0, 0.1] }), SIZE)
  assert.equal(value(left.headForwardPct), 10)
  // Oreja sobre el hombro: 0 % y recta vertical (90°).
  const upright = measureSide(pose({ nose: [640, 360], leftEar: [600, 400], leftShoulder: [600, 600], leftHip: [600, 1100], rightEar: [0, 0, 0.1], rightShoulder: [0, 0, 0.1], rightHip: [0, 0, 0.1] }), SIZE)
  assert.equal(value(upright.headForwardPct), 0)
  assert.equal(value(upright.headAngleDeg), 90)
})

test('sentadilla de perfil: rodilla a 90° y tronco a 45°', () => {
  const m = measureSquatSide(
    pose({ leftShoulder: [300, 1000], leftHip: [500, 1200], leftKnee: [700, 1200], leftAnkle: [700, 1400], rightHip: [0, 0, 0.1], rightKnee: [0, 0, 0.1], rightAnkle: [0, 0, 0.1] }),
    SIZE,
  )
  assert.equal(value(m.kneeAngleDeg), 90)
  assert.equal(value(m.trunkLeanDeg), 45)
})

test('sentadilla de frente: rodilla hacia dentro positiva, hacia fuera negativa, en % de la cadera', () => {
  // Cadera de 120 px de ancho; tobillos bajo las caderas.
  const base = { leftHip: [560, 1100], rightHip: [440, 1100], leftAnkle: [560, 1700], rightAnkle: [440, 1700] } as const
  // Rodillas sobre los tobillos: 0 y separación igual que los pies.
  const straight = measureSquatFront(pose({ ...base, leftKnee: [560, 1400], rightKnee: [440, 1400] }), SIZE)
  assert.equal(value(straight.leftKneeInPct), 0)
  assert.equal(value(straight.rightKneeInPct), 0)
  assert.equal(value(straight.kneeAnkleRatio), 1)
  // Izquierda 24 px hacia dentro (20 %), derecha 24 px hacia fuera (−20 %).
  const m = measureSquatFront(pose({ ...base, leftKnee: [536, 1400], rightKnee: [416, 1400] }), SIZE)
  assert.equal(value(m.leftKneeInPct), 20)
  assert.equal(value(m.rightKneeInPct), -20)
})

test('sentadilla de frente: la profundidad no cambia la medida (el muslo acortado no cuenta)', () => {
  const base = { leftHip: [560, 1100], rightHip: [440, 1100], leftAnkle: [560, 1700], rightAnkle: [440, 1700] } as const
  // Rodilla casi a la altura de la cadera (sentadilla profunda vista de frente), pero sobre el tobillo.
  const deep = measureSquatFront(pose({ ...base, leftKnee: [560, 1150], rightKnee: [440, 1150] }), SIZE)
  assert.equal(value(deep.leftKneeInPct), 0)
  assert.equal(value(deep.kneeAnkleRatio), 1)
  // Rodillas juntas: separación de rodillas la mitad que la de los tobillos.
  const together = measureSquatFront(pose({ ...base, leftKnee: [530, 1400], rightKnee: [470, 1400] }), SIZE)
  assert.equal(value(together.kneeAnkleRatio), 0.5)
})

test('brazos arriba: vertical es 180° y la diferencia entre lados tiene signo', () => {
  const m = measureArmsUp(
    pose({ leftHip: [560, 1100], leftShoulder: [560, 600], leftWrist: [560, 100], rightHip: [440, 1100], rightShoulder: [440, 600], rightWrist: [240, 254] }),
    SIZE,
  )
  assert.equal(value(m.leftArmDeg), 180)
  assert.ok((value(m.rightArmDeg) ?? 0) < 180)
  assert.equal(value(m.armsDiffDeg), Math.round((180 - (value(m.rightArmDeg) ?? 0)) * 10) / 10)
})

test('estabilidad: media, desviación típica y rango de los valores válidos', () => {
  assert.equal(stabilityOf([10]), null, 'con una sola foto no hay estabilidad que medir')
  const s = stabilityOf([10, 12, null, 14])
  assert.deepEqual(s, { count: 3, mean: 12, sd: 2, min: 10, max: 14, range: 4 })
})
