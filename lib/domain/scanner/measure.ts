/**
 * Medidas del escáner corporal (D-023), a partir de los 33 puntos del modelo de
 * pose y, para la «V», de la silueta.
 *
 * Funciones puras: no saben de la cámara, de MediaPipe ni del navegador. Reciben
 * puntos normalizados (0–1) y el tamaño de la imagen, y devuelven grados y
 * proporciones. Todo se calcula en píxeles: en coordenadas normalizadas una foto
 * vertical deformaría los ángulos.
 *
 * Una medida cuyos puntos no se ven bien, o caen fuera de la foto, no se calcula:
 * se devuelve como `null` con el motivo. Nunca se rellena.
 *
 * Convenciones: «izquierda» y «derecha» son las del cuerpo de la persona, no las
 * de la imagen (en una foto de frente, el lado izquierdo de la persona sale a la
 * derecha de la imagen). Las y de la imagen crecen hacia abajo.
 */

export type ScanLandmark = { x: number; y: number; visibility?: number }

export type ImageSize = { width: number; height: number }

/** Índices del modelo de pose de MediaPipe (33 puntos). */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

/** Por debajo de esta confianza el modelo no «ve» el punto con seguridad. */
export const MIN_VISIBILITY = 0.6
/** Margen dentro de la foto: un punto pegado al borde suele estar cortado. */
export const EDGE_MARGIN = 0.01

export type ScanPose = 'front' | 'side' | 'squat_side' | 'squat_front' | 'arms_up'

export type MeasureValue = { value: number } | { value: null; reason: 'not_visible' | 'out_of_frame' | 'no_silhouette' }

export type Measurements = Record<string, MeasureValue>

type Point = { x: number; y: number }

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

const toDeg = (rad: number) => (rad * 180) / Math.PI
const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals
  // `+ 0` convierte −0 en 0: una rodilla recta no se enseña como «−0°».
  return Math.round(value * factor) / factor + 0
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Ángulo en `b` del triángulo a–b–c, en grados (0–180). */
export function angleAt(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
  return toDeg(Math.acos(Math.min(1, Math.max(-1, cos))))
}

/** Inclinación de la recta a→b respecto a la horizontal, en grados (−90..90). */
function tiltFromHorizontal(a: Point, b: Point): number {
  const deg = toDeg(Math.atan2(b.y - a.y, b.x - a.x))
  // Recta sin sentido: −170° y 10° son la misma inclinación.
  if (deg > 90) return deg - 180
  if (deg < -90) return deg + 180
  return deg
}

/** Inclinación de la recta a→b respecto a la vertical, en grados (0–90). */
function leanFromVertical(a: Point, b: Point): number {
  return toDeg(Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

// ---------------------------------------------------------------------------
// Acceso a los puntos con control de calidad
// ---------------------------------------------------------------------------

type Lookup = { ok: true; points: Point[] } | { ok: false; reason: 'not_visible' | 'out_of_frame' }

function pick(landmarks: readonly ScanLandmark[], size: ImageSize, indices: readonly number[]): Lookup {
  const points: Point[] = []
  for (const index of indices) {
    const lm = landmarks[index]
    if (!lm || (lm.visibility ?? 0) < MIN_VISIBILITY) return { ok: false, reason: 'not_visible' }
    if (lm.x < EDGE_MARGIN || lm.x > 1 - EDGE_MARGIN || lm.y < EDGE_MARGIN || lm.y > 1 - EDGE_MARGIN) {
      return { ok: false, reason: 'out_of_frame' }
    }
    points.push({ x: lm.x * size.width, y: lm.y * size.height })
  }
  return { ok: true, points }
}

function measure(lookup: Lookup, compute: (points: Point[]) => number, decimals = 1): MeasureValue {
  return lookup.ok ? { value: round(compute(lookup.points), decimals) } : { value: null, reason: lookup.reason }
}

/** El lado de perfil que mejor se ve: el que está de cara a la cámara. */
function visibleSide(landmarks: readonly ScanLandmark[], left: readonly number[], right: readonly number[]): 'left' | 'right' {
  const score = (indices: readonly number[]) => indices.reduce((sum, i) => sum + (landmarks[i]?.visibility ?? 0), 0)
  return score(left) >= score(right) ? 'left' : 'right'
}

// ---------------------------------------------------------------------------
// Silueta (para la «V»)
// ---------------------------------------------------------------------------

/** Máscara binaria de la persona: `true` donde hay cuerpo. Fila a fila, de arriba abajo. */
export type Silhouette = { width: number; height: number; isBody: (x: number, y: number) => boolean }

/** Anchura del tramo de cuerpo que contiene x en la fila y. 0 si x no es cuerpo. */
export function bodyWidthAt(mask: Silhouette, x: number, y: number): number {
  const row = Math.round(y)
  let cx = Math.round(x)
  if (row < 0 || row >= mask.height || cx < 0 || cx >= mask.width) return 0
  if (!mask.isBody(cx, row)) return 0
  let left = cx
  while (left > 0 && mask.isBody(left - 1, row)) left--
  let right = cx
  while (right < mask.width - 1 && mask.isBody(right + 1, row)) right++
  return right - left + 1
}

/**
 * Relación hombros/cintura a partir de la silueta. Los hombros, en la fila de
 * los puntos de hombro; la cintura, la fila más estrecha del tronco entre el 50 %
 * y el 90 % del camino de hombros a caderas. Exige brazos separados del cuerpo:
 * si tocan el tronco, la «cintura» los incluiría y la medida no vale.
 */
function shoulderToWaist(points: Point[], size: ImageSize, mask: Silhouette): number | null {
  const [ls, rs, lh, rh] = points
  const shoulders = midpoint(ls, rs)
  const hips = midpoint(lh, rh)
  // La silueta puede tener otro tamaño que la imagen: se escala.
  const sx = (p: number) => p * (mask.width / size.width)
  const sy = (p: number) => p * (mask.height / size.height)
  const shoulderWidth = bodyWidthAt(mask, sx(shoulders.x), sy(shoulders.y))
  if (shoulderWidth === 0) return null
  let waist = Infinity
  for (let t = 0.5; t <= 0.9; t += 0.02) {
    const p = { x: shoulders.x + (hips.x - shoulders.x) * t, y: shoulders.y + (hips.y - shoulders.y) * t }
    const width = bodyWidthAt(mask, sx(p.x), sy(p.y))
    if (width > 0) waist = Math.min(waist, width)
  }
  if (!Number.isFinite(waist)) return null
  // La anchura de hombros en la silueta incluye los deltoides; por debajo de 1 es
  // que algo no cuadra (brazos pegados, silueta rota).
  const ratio = shoulderWidth / waist
  return ratio >= 1 ? ratio : null
}

/**
 * Anchura de la silueta atravesando un hueso por su punto medio, en
 * perpendicular a él, dividida por la longitud del hueso: el «volumen relativo»
 * de esa zona en la foto (D-023, enmienda de medidas por zona).
 *
 * Normalizar por el propio hueso elimina la distancia a la cámara. Se camina
 * desde el centro del hueso hacia los dos lados mientras haya cuerpo; si se
 * llega al tope sin salir (brazo pegado al tronco, piernas juntas), la zona está
 * fundida con otra y no se mide: `null`.
 */
function relativeWidth(a: Point, b: Point, size: ImageSize, mask: Silhouette, maxRatio: number): number | null {
  const length = distance(a, b)
  if (length < 1) return null
  const mid = midpoint(a, b)
  // Normal unitaria al hueso, en píxeles de la imagen.
  const nx = -(b.y - a.y) / length
  const ny = (b.x - a.x) / length
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  const cap = length * maxRatio
  const inBody = (d: number) => {
    const x = Math.round((mid.x + nx * d) * sx)
    const y = Math.round((mid.y + ny * d) * sy)
    return x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.isBody(x, y)
  }
  if (!inBody(0)) return null
  const step = Math.max(1, length / 200)
  let left = 0
  while (inBody(left + step)) {
    left += step
    if (left > cap) return null
  }
  let right = 0
  while (inBody(-(right + step))) {
    right += step
    if (right > cap) return null
  }
  // El hueso va por dentro de la zona: si un lado se extiende mucho más que el
  // otro, la silueta sigue por otra parte del cuerpo (piernas juntas, brazo
  // pegado) y la anchura no es de esta zona.
  if (Math.max(left, right) > 2.5 * Math.max(Math.min(left, right), step)) return null
  return (left + right + step) / length
}

// ---------------------------------------------------------------------------
// Medidas por pose
// ---------------------------------------------------------------------------

/**
 * De frente, de pie, brazos un poco separados del cuerpo.
 *
 * - `shoulderTiltDeg` / `hipTiltDeg`: positivo si el lado izquierdo de la persona
 *   está más alto que el derecho.
 * - `armAsymmetryPct` / `legAsymmetryPct`: (izquierda − derecha) / media × 100.
 * - `legToTorso`: longitud media de pierna / longitud del tronco.
 * - `shoulderToWaist`: la «V», si hay silueta.
 */
export function measureFront(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  const shoulders = pick(landmarks, size, [LM.leftShoulder, LM.rightShoulder])
  const hips = pick(landmarks, size, [LM.leftHip, LM.rightHip])
  const arms = pick(landmarks, size, [LM.leftShoulder, LM.leftElbow, LM.leftWrist, LM.rightShoulder, LM.rightElbow, LM.rightWrist])
  const legs = pick(landmarks, size, [LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.rightHip, LM.rightKnee, LM.rightAnkle])
  const torsoAndLegs = pick(landmarks, size, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.leftAnkle, LM.rightKnee, LM.rightAnkle])
  const vShape = pick(landmarks, size, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip])

  // La persona mira a la cámara: su hombro izquierdo está a la derecha de la imagen.
  // «Izquierdo más alto» = y menor = positivo.
  const sideTilt = ([left, right]: Point[]) => toDeg(Math.atan2(right.y - left.y, Math.abs(left.x - right.x)))

  let vRatio: MeasureValue = { value: null, reason: 'no_silhouette' }
  if (!vShape.ok) vRatio = { value: null, reason: vShape.reason }
  else if (mask) {
    const ratio = shoulderToWaist(vShape.points, size, mask)
    vRatio = ratio === null ? { value: null, reason: 'no_silhouette' } : { value: round(ratio, 2) }
  }

  return {
    shoulderTiltDeg: measure(shoulders, sideTilt),
    hipTiltDeg: measure(hips, sideTilt),
    armAsymmetryPct: measure(arms, ([ls, le, lw, rs, re, rw]) => {
      const left = distance(ls, le) + distance(le, lw)
      const right = distance(rs, re) + distance(re, rw)
      return ((left - right) / ((left + right) / 2)) * 100
    }),
    legAsymmetryPct: measure(legs, ([lh, lk, la, rh, rk, ra]) => {
      const left = distance(lh, lk) + distance(lk, la)
      const right = distance(rh, rk) + distance(rk, ra)
      return ((left - right) / ((left + right) / 2)) * 100
    }),
    legToTorso: measure(
      torsoAndLegs,
      ([ls, rs, lh, rh, lk, la, rk, ra]) => {
        const torso = distance(midpoint(ls, rs), midpoint(lh, rh))
        const leg = (distance(lh, lk) + distance(lk, la) + distance(rh, rk) + distance(rk, ra)) / 2
        return leg / torso
      },
      2,
    ),
    shoulderToWaist: vRatio,
    ...zoneWidths(landmarks, size, mask),
  }
}

/**
 * Anchura relativa de brazo, muslo y pantorrilla (media de los dos lados), y de
 * los hombros respecto al tronco. Solo con silueta; sin ella, «sin silueta».
 * Mide la forma en la foto, no qué es músculo y qué no: con ropa ancha, la ropa.
 */
function zoneWidths(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  const zone = (pairs: [number, number][], maxRatio: number): MeasureValue => {
    if (!mask) return { value: null, reason: 'no_silhouette' }
    const values: number[] = []
    for (const [from, to] of pairs) {
      const bone = pick(landmarks, size, [from, to])
      if (!bone.ok) return { value: null, reason: bone.reason }
      const width = relativeWidth(bone.points[0], bone.points[1], size, mask, maxRatio)
      if (width !== null) values.push(width)
    }
    // Basta con un lado bien medido; si ninguno, la zona está pegada a otra.
    return values.length ? { value: round(mean(values), 3) } : { value: null, reason: 'no_silhouette' }
  }
  const shoulderWidth = (): MeasureValue => {
    if (!mask) return { value: null, reason: 'no_silhouette' }
    const torso = pick(landmarks, size, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip])
    if (!torso.ok) return { value: null, reason: torso.reason }
    const [ls, rs, lh, rh] = torso.points
    const shoulders = midpoint(ls, rs)
    const width = bodyWidthAt(mask, shoulders.x * (mask.width / size.width), shoulders.y * (mask.height / size.height)) / (mask.width / size.width)
    const torsoLength = distance(shoulders, midpoint(lh, rh))
    return width > 0 && torsoLength > 0 ? { value: round(width / torsoLength, 3) } : { value: null, reason: 'no_silhouette' }
  }
  return {
    upperArmWidth: zone([[LM.leftShoulder, LM.leftElbow], [LM.rightShoulder, LM.rightElbow]], 0.45),
    thighWidth: zone([[LM.leftHip, LM.leftKnee], [LM.rightHip, LM.rightKnee]], 0.5),
    calfWidth: zone([[LM.leftKnee, LM.leftAnkle], [LM.rightKnee, LM.rightAnkle]], 0.4),
    shoulderToTorso: shoulderWidth(),
  }
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

/**
 * De perfil, de pie.
 *
 * - `headForwardPct`: cuánto adelanta la oreja al hombro, en % de la longitud del
 *   tronco. Positivo = cabeza por delante del hombro. El «delante» se deduce de
 *   hacia dónde apunta la nariz.
 * - `headAngleDeg`: ángulo de la recta hombro→oreja con la horizontal; más alto,
 *   cabeza más vertical sobre el hombro.
 */
export function measureSide(landmarks: readonly ScanLandmark[], size: ImageSize): Measurements {
  const side = visibleSide(landmarks, [LM.leftEar, LM.leftShoulder, LM.leftHip], [LM.rightEar, LM.rightShoulder, LM.rightHip])
  const ids = side === 'left' ? [LM.leftEar, LM.leftShoulder, LM.leftHip, LM.nose] : [LM.rightEar, LM.rightShoulder, LM.rightHip, LM.nose]
  const head = pick(landmarks, size, ids)
  return {
    headForwardPct: measure(head, ([ear, shoulder, hip, nose]) => {
      const facing = Math.sign(nose.x - ear.x) || 1
      return (((ear.x - shoulder.x) * facing) / distance(shoulder, hip)) * 100
    }),
    headAngleDeg: measure(head, ([ear, shoulder]) => Math.abs(tiltFromHorizontal(shoulder, ear))),
  }
}

/** Sentadilla en el punto más bajo, de perfil: ángulo de rodilla (menor = más profunda) e inclinación del tronco. */
export function measureSquatSide(landmarks: readonly ScanLandmark[], size: ImageSize): Measurements {
  const side = visibleSide(landmarks, [LM.leftHip, LM.leftKnee, LM.leftAnkle], [LM.rightHip, LM.rightKnee, LM.rightAnkle])
  const ids = side === 'left'
    ? [LM.leftShoulder, LM.leftHip, LM.leftKnee, LM.leftAnkle]
    : [LM.rightShoulder, LM.rightHip, LM.rightKnee, LM.rightAnkle]
  const chain = pick(landmarks, size, ids)
  return {
    kneeAngleDeg: measure(chain, ([, hip, knee, ankle]) => angleAt(hip, knee, ankle)),
    trunkLeanDeg: measure(chain, ([shoulder, hip]) => leanFromVertical(hip, shoulder)),
  }
}

/**
 * Sentadilla en el punto más bajo, de frente.
 *
 * No se usa el ángulo de la rodilla: en una sentadilla profunda el muslo apunta
 * a la cámara y se acorta en la foto, así que ese ángulo mide sobre todo la
 * profundidad, no si la rodilla se va hacia dentro. Se usan distancias en
 * horizontal, que no dependen de lo profunda que sea la sentadilla:
 *
 * - `kneeAnkleRatio`: separación entre rodillas / separación entre tobillos.
 *   Por debajo de 1, las rodillas quedan más juntas que los pies.
 * - `leftKneeInPct` / `rightKneeInPct`: cuánto se desplaza cada rodilla hacia
 *   la línea media respecto a su tobillo, en % de la anchura de cadera.
 *   Positivo hacia dentro, negativo hacia fuera.
 */
export function measureSquatFront(landmarks: readonly ScanLandmark[], size: ImageSize): Measurements {
  const all = pick(landmarks, size, [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle])
  const inward = (knee: Point, ankle: Point, lh: Point, rh: Point) => {
    const midX = (lh.x + rh.x) / 2
    const hipWidth = Math.abs(lh.x - rh.x) || 1
    // Positivo si la rodilla está más cerca de la línea media que su tobillo.
    return ((Math.abs(ankle.x - midX) - Math.abs(knee.x - midX)) / hipWidth) * 100
  }
  return {
    kneeAnkleRatio: measure(all, ([, , lk, rk, la, ra]) => Math.abs(lk.x - rk.x) / (Math.abs(la.x - ra.x) || 1), 2),
    leftKneeInPct: measure(all, ([lh, rh, lk, , la]) => inward(lk, la, lh, rh)),
    rightKneeInPct: measure(all, ([lh, rh, , rk, , ra]) => inward(rk, ra, lh, rh)),
  }
}

/**
 * Brazos por encima de la cabeza, de frente. Ángulo entre el tronco (cadera→
 * hombro) y el brazo (hombro→muñeca) de cada lado: 180 = brazo vertical sobre
 * el hombro. `armsDiffDeg` = izquierdo − derecho.
 */
export function measureArmsUp(landmarks: readonly ScanLandmark[], size: ImageSize): Measurements {
  const left = pick(landmarks, size, [LM.leftHip, LM.leftShoulder, LM.leftWrist])
  const right = pick(landmarks, size, [LM.rightHip, LM.rightShoulder, LM.rightWrist])
  const both = pick(landmarks, size, [LM.leftHip, LM.leftShoulder, LM.leftWrist, LM.rightHip, LM.rightShoulder, LM.rightWrist])
  return {
    leftArmDeg: measure(left, ([hip, shoulder, wrist]) => angleAt(hip, shoulder, wrist)),
    rightArmDeg: measure(right, ([hip, shoulder, wrist]) => angleAt(hip, shoulder, wrist)),
    armsDiffDeg: measure(both, ([lh, ls, lw, rh, rs, rw]) => angleAt(lh, ls, lw) - angleAt(rh, rs, rw)),
  }
}

export function measurePose(pose: ScanPose, landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  switch (pose) {
    case 'front':
      return measureFront(landmarks, size, mask)
    case 'side':
      return measureSide(landmarks, size)
    case 'squat_side':
      return measureSquatSide(landmarks, size)
    case 'squat_front':
      return measureSquatFront(landmarks, size)
    case 'arms_up':
      return measureArmsUp(landmarks, size)
  }
}

// ---------------------------------------------------------------------------
// Estabilidad: varias fotos de la misma pose
// ---------------------------------------------------------------------------

export type Stability = { count: number; mean: number; sd: number; min: number; max: number; range: number }

/** Media, desviación típica y rango de los valores válidos de una medida. `null` sin al menos dos. */
export function stabilityOf(values: readonly (number | null)[]): Stability | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (valid.length < 2) return null
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length
  const variance = valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (valid.length - 1)
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  return { count: valid.length, mean: round(mean, 2), sd: round(Math.sqrt(variance), 2), min, max, range: round(max - min, 2) }
}
