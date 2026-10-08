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
  }
}

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
 * Sentadilla en el punto más bajo, de frente. Por pierna, cuánto se separa la
 * rodilla de la recta cadera–tobillo, en grados: positivo hacia dentro (hacia la
 * línea media del cuerpo), negativo hacia fuera.
 */
export function measureSquatFront(landmarks: readonly ScanLandmark[], size: ImageSize): Measurements {
  const both = pick(landmarks, size, [LM.leftHip, LM.rightHip])
  const knee = (hipId: number, kneeId: number, ankleId: number): MeasureValue => {
    const chain = pick(landmarks, size, [hipId, kneeId, ankleId, LM.leftHip, LM.rightHip])
    if (!both.ok) return { value: null, reason: both.reason }
    return measure(chain, ([hip, kneeP, ankle, lh, rh]) => {
      const deviation = 180 - angleAt(hip, kneeP, ankle)
      // ¿La rodilla queda del lado de la línea media respecto a la recta cadera–tobillo?
      const midX = (lh.x + rh.x) / 2
      const t = (kneeP.y - hip.y) / (ankle.y - hip.y || 1)
      const lineX = hip.x + (ankle.x - hip.x) * t
      const inward = Math.abs(kneeP.x - midX) < Math.abs(lineX - midX)
      return inward ? deviation : -deviation
    })
  }
  return {
    leftKneeDeg: knee(LM.leftHip, LM.leftKnee, LM.leftAnkle),
    rightKneeDeg: knee(LM.rightHip, LM.rightKnee, LM.rightAnkle),
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
