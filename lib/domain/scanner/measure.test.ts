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

// ---------------------------------------------------------------------------
// Medidas por zona: anchura de la silueta respecto al hueso (D-023)
// ---------------------------------------------------------------------------

/** Silueta hecha de rectángulos [x0, y0, x1, y1] en píxeles de la imagen. */
function rects(list: [number, number, number, number][], size = SIZE): Silhouette {
  return { width: size.width, height: size.height, isBody: (x, y) => list.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) }
}

// Tronco 440–560; brazos a 60 px del tronco; muslos y pantorrillas separados.
const BODY: [number, number, number, number][] = [
  [400, 580, 600, 640], // hombros
  [440, 640, 560, 1100], // tronco
  [585, 640, 645, 900], // brazo izquierdo de la persona (derecha de la imagen): 61 px, centrado en su hueso
  [355, 640, 415, 900], // brazo derecho: 61 px, separado del tronco (que empieza en 440)
  [520, 1100, 600, 1450], // muslo izquierdo: 81 px
  [400, 1100, 480, 1450], // muslo derecho: 81 px
  [535, 1450, 585, 1800], // pantorrilla izquierda: 51 px
  [415, 1450, 465, 1800], // pantorrilla derecha: 51 px
  [600, 900, 660, 1150], // antebrazo izquierdo: 61 px
  [340, 900, 400, 1150], // antebrazo derecho: 61 px
]
const ZONES = {
  ...FRONT,
  leftShoulder: [600, 600], rightShoulder: [400, 600],
  leftElbow: [630, 900], rightElbow: [370, 900],
  leftWrist: [630, 1150], rightWrist: [370, 1150],
  leftHip: [560, 1100], rightHip: [440, 1100],
  leftKnee: [560, 1450], rightKnee: [440, 1450],
  leftAnkle: [560, 1800], rightAnkle: [440, 1800],
} as const

const near = (actual: number | null, expected: number, margin: number, what: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < margin, `${what}: ${actual} frente a ${expected}`)

test('área media por zona: la silueta cortada a lo largo del hueso, dividida por su longitud', () => {
  const m = measureFront(pose(ZONES), SIZE, rects(BODY))
  // Muslo: ~81 px de ancho sobre 350 px de hueso ≈ 0,23.
  near(value(m.thighMean), 81 / 350, 0.01, 'muslo')
  // Pantorrilla: ~51 / 350 ≈ 0,15.
  near(value(m.calfMean), 51 / 350, 0.01, 'pantorrilla')
  // Antebrazo: ~61 / 250 ≈ 0,24.
  near(value(m.forearmMean), 61 / 250, 0.01, 'antebrazo')
  assert.ok(value(m.upperArmMean) !== null, 'el brazo separado se mide')
  // Una zona de anchura constante no tiene «bulto»: máximo ≈ media.
  near(value(m.thighPeak), value(m.thighMean)!, 0.01, 'muslo sin bulto')
})

test('el contorno máximo recoge el «bulto» de la zona', () => {
  // Pantorrilla izquierda con un abultamiento de 71 px en su parte central.
  const bulge = rects([...BODY, [525, 1580, 595, 1640]])
  const m = measureFront(pose(ZONES), SIZE, bulge)
  // Media de los dos lados: (71 + 51) / 2 sobre 350.
  near(value(m.calfPeak), (71 + 51) / 2 / 350, 0.01, 'contorno máximo')
  assert.ok(value(m.calfPeak)! > value(m.calfMean)!, 'el máximo supera a la media')
})

test('un pliegue en el centro del hueso apenas mueve el área media, a diferencia de un solo corte', () => {
  // Pliegue de 121 px justo en el punto medio de los dos muslos (y = 1275).
  const fold = rects([...BODY, [500, 1270, 620, 1280], [380, 1270, 500, 1280]])
  const m = measureFront(pose(ZONES), SIZE, fold)
  // Un solo corte en el medio leería ~121 / 350 ≈ 0,35; la media de once se queda cerca de 0,23.
  near(value(m.thighMean), 81 / 350, 0.015, 'muslo con pliegue')
})

test('una zona pegada a otra no se mide: se descarta en vez de dar un valor falso', () => {
  // Piernas juntas: un solo bloque desde 400 hasta 600.
  const together: [number, number, number, number][] = [...BODY.filter((r) => r[1] !== 1100), [400, 1100, 600, 1450]]
  const m = measureFront(pose(ZONES), SIZE, rects(together))
  assert.deepEqual(m.thighMean, { value: null, reason: 'no_silhouette' })
  assert.deepEqual(m.thighPeak, { value: null, reason: 'no_silhouette' })
})

test('cintura respecto a la cadera: la cintura más estrecha frente a la cadera más ancha', () => {
  // Tronco de 121 px y pelvis de 161 px, sin piernas pegadas.
  const torso: [number, number, number, number][] = [[400, 580, 600, 640], [440, 640, 560, 1100], [420, 1060, 580, 1180]]
  near(value(measureFront(pose(ZONES), SIZE, rects(torso)).waistToHip), 121 / 161, 0.01, 'cintura / cadera')
  // Las manos pegadas a la cadera la ensanchan: fuera de rango, no se mide.
  const hands = rects([...torso, [340, 1120, 660, 1140]])
  assert.deepEqual(measureFront(pose(ZONES), SIZE, hands).waistToHip, { value: null, reason: 'no_silhouette' })
})

test('la distancia a la cámara no cambia la anchura relativa', () => {
  const closeUp = measureFront(pose(ZONES), SIZE, rects(BODY))
  // La misma persona a la mitad de tamaño en la misma foto.
  const half = (p: readonly [number, number]) => [500 + (p[0] - 500) / 2, 1000 + (p[1] - 1000) / 2] as const
  const far = measureFront(
    pose(Object.fromEntries(Object.entries(ZONES).map(([k, p]) => [k, half(p as readonly [number, number])])) as typeof ZONES),
    SIZE,
    rects(BODY.map(([x0, y0, x1, y1]) => [500 + (x0 - 500) / 2, 1000 + (y0 - 1000) / 2, 500 + (x1 - 500) / 2, 1000 + (y1 - 1000) / 2])),
  )
  near(value(far.thighMean), value(closeUp.thighMean)!, 0.02, 'muslo lejos')
})

test('sin silueta, las zonas no se rellenan', () => {
  const m = measureFront(pose(ZONES), SIZE)
  for (const key of ['upperArmMean', 'upperArmPeak', 'forearmMean', 'thighMean', 'calfPeak', 'shoulderToTorso', 'waistToHip']) assert.deepEqual(m[key], { value: null, reason: 'no_silhouette' }, key)
})
