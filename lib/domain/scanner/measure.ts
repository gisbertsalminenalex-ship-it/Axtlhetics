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

import { CORE_LINE, MAX_TORSO_WIDTH_RATIO, NAVY } from './scales'

export type ScanLandmark = { x: number; y: number; visibility?: number }

export type ImageSize = { width: number; height: number }

/** Índices del modelo de pose de MediaPipe (33 puntos). */
export const LM = {
  nose: 0,
  mouthLeft: 9,
  mouthRight: 10,
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

export type ScanPose = 'front' | 'side' | 'squat_side' | 'squat_front' | 'arms_up' | 'flex'

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
  const run = bodyRunAt(mask, x, y)
  return run ? run.right - run.left + 1 : 0
}

/** Primer y último píxel del tramo de cuerpo que contiene x en la fila y, en píxeles de la silueta. */
function bodyRunAt(mask: Silhouette, x: number, y: number): { left: number; right: number } | null {
  const row = Math.round(y)
  const cx = Math.round(x)
  if (row < 0 || row >= mask.height || cx < 0 || cx >= mask.width) return null
  if (!mask.isBody(cx, row)) return null
  let left = cx
  while (left > 0 && mask.isBody(left - 1, row)) left--
  let right = cx
  while (right < mask.width - 1 && mask.isBody(right + 1, row)) right++
  return { left, right }
}

/**
 * Relación hombros/cintura a partir de la silueta. Los hombros, en la fila de
 * los puntos de hombro; la cintura, la fila más estrecha del tronco entre el 50 %
 * y el 90 % del camino de hombros a caderas. Exige brazos separados del cuerpo:
 * si tocan el tronco, la «cintura» los incluiría y la medida no vale.
 */
function shoulderToWaist(points: Point[], size: ImageSize, mask: Silhouette): number | null {
  const [ls, rs] = points
  const shoulders = midpoint(ls, rs)
  const shoulderWidth = bodyWidthAt(mask, shoulders.x * (mask.width / size.width), shoulders.y * (mask.height / size.height))
  const waist = torsoWidth(points, size, mask, 0.5, 0.9, Math.min)
  if (shoulderWidth === 0 || waist === null) return null
  // La anchura de hombros en la silueta incluye los deltoides; por debajo de 1 es
  // que algo no cuadra (brazos pegados, silueta rota).
  const ratio = shoulderWidth / waist
  return ratio >= 1 ? ratio : null
}

/** Fuera de este rango, la «cadera» incluye las manos o la silueta está rota. */
const WAIST_TO_HIP_RANGE = { min: 0.55, max: 1.15 }

/**
 * Cintura respecto a la cadera (D-023, enmienda del 2026-10-13): la cintura,
 * como en la «V»; la cadera, la fila más ancha desde los puntos de cadera hasta
 * un 15 % de tronco por debajo. Es forma en la foto, no grasa.
 */
function waistToHip(points: Point[], size: ImageSize, mask: Silhouette): number | null {
  const waist = torsoWidth(points, size, mask, 0.5, 0.9, Math.min)
  const hips = torsoWidth(points, size, mask, 1, 1.15, Math.max)
  if (waist === null || hips === null) return null
  const ratio = waist / hips
  return ratio >= WAIST_TO_HIP_RANGE.min && ratio <= WAIST_TO_HIP_RANGE.max ? ratio : null
}

/**
 * Anchura de la silueta a lo largo del eje del tronco, entre `from` y `to`
 * (0 = hombros, 1 = caderas), quedándose con la menor o la mayor según `pick`.
 * En píxeles de la silueta; `null` si ninguna fila es cuerpo.
 */
function torsoWidth(
  points: Point[],
  size: ImageSize,
  mask: Silhouette,
  from: number,
  to: number,
  pick: (a: number, b: number) => number,
): number | null {
  const [ls, rs, lh, rh] = points
  const shoulders = midpoint(ls, rs)
  const hips = midpoint(lh, rh)
  // La silueta puede tener otro tamaño que la imagen: se escala.
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  let found: number | null = null
  for (let t = from; t <= to + 1e-9; t += 0.02) {
    const p = { x: shoulders.x + (hips.x - shoulders.x) * t, y: shoulders.y + (hips.y - shoulders.y) * t }
    const width = bodyWidthAt(mask, p.x * sx, p.y * sy)
    if (width > 0) found = found === null ? width : pick(found, width)
  }
  return found
}

/** Dónde se corta cada zona: su parte central, lejos de las articulaciones. */
const ZONE_CUTS = Array.from({ length: 11 }, (_, i) => 0.25 + i * 0.05)
/** Por debajo de esta fracción de cortes válidos, la zona está pegada a otra. */
const MIN_VALID_CUTS = 0.5

/**
 * Perfil de una zona a lo largo de su hueso (D-023, enmienda del 2026-10-13).
 *
 * Se corta la silueta en perpendicular al hueso a lo largo de su parte central
 * y cada anchura se divide por la longitud del hueso, lo que elimina la
 * distancia a la cámara:
 *
 * - `mean`: anchura media, es decir, el área del segmento / longitud del hueso.
 * - `peak`: la anchura mayor, el «bulto» del contorno respecto al hueso.
 *
 * Un corte que no sale del cuerpo antes del tope, o que se extiende mucho más
 * hacia un lado que hacia el otro, atraviesa otra parte del cuerpo (brazo pegado
 * al tronco, piernas juntas) y se descarta. Con menos de la mitad de cortes
 * válidos, la zona no se mide: `null`.
 */
function zoneProfile(
  a: Point,
  b: Point,
  size: ImageSize,
  mask: Silhouette,
  maxRatio: number,
): { mean: number; peak: number; meanPx: number } | null {
  const length = distance(a, b)
  if (length < 1) return null
  const widths = ZONE_CUTS.map((t) => cutWidth({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, a, b, length, size, mask, maxRatio)).filter(
    (w): w is number => w !== null,
  )
  if (widths.length < ZONE_CUTS.length * MIN_VALID_CUTS) return null
  return { mean: mean(widths) / length, peak: Math.max(...widths) / length, meanPx: mean(widths) }
}

// ---------------------------------------------------------------------------
// Core: la silueta respecto a la recta costillas–cresta (enmienda del 2026-10-14)
// ---------------------------------------------------------------------------

/** Cortes del tronco entre las costillas y la cresta ilíaca, incluidos los extremos. */
const CORE_CUTS = Array.from({ length: 13 }, (_, i) => CORE_LINE.ribs + ((CORE_LINE.crest - CORE_LINE.ribs) * i) / 12)

/**
 * La desviación más marcada de un perfil respecto a la recta que une su primer y
 * su último valor, con signo: positiva hacia fuera, negativa hacia dentro.
 */
function lineDeviation(values: readonly number[]): number {
  const first = values[0]
  const last = values[values.length - 1]
  let extreme = 0
  for (let i = 1; i < values.length - 1; i++) {
    const deviation = values[i] - (first + ((last - first) * i) / (values.length - 1))
    if (Math.abs(deviation) > Math.abs(extreme)) extreme = deviation
  }
  return extreme
}

/** Punto de la línea hombros→caderas a la fracción `t`. */
const alongTorso = (shoulders: Point, hips: Point, t: number): Point => ({
  x: shoulders.x + (hips.x - shoulders.x) * t,
  y: shoulders.y + (hips.y - shoulders.y) * t,
})

/**
 * Si la línea de algún brazo (hombro–codo–muñeca, en píxeles de la imagen) cruza
 * la fila `y` dentro del tramo `run` (en píxeles de la silueta): el brazo está
 * pegado y la anchura del tramo lo incluye.
 */
function armInsideRun(arms: readonly (readonly Point[])[], y: number, run: { left: number; right: number }, sx: number): boolean {
  return arms.some((chain) =>
    chain.slice(1).some((b, i) => {
      const a = chain[i]
      if ((y - a.y) * (y - b.y) > 0 || a.y === b.y) return false
      const x = (a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)) * sx
      return x >= run.left && x <= run.right
    }),
  )
}

/** Los brazos que se ven, con la mano prolongada más allá de la muñeca: la mano también puede tocar la cadera. */
function visibleArms(landmarks: readonly ScanLandmark[], size: ImageSize): Point[][] {
  return [
    [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  ].flatMap((ids) => {
    const arm = pick(landmarks, size, ids)
    if (!arm.ok) return []
    const [shoulder, elbow, wrist] = arm.points
    const hand = { x: wrist.x + (wrist.x - elbow.x) * 0.4, y: wrist.y + (wrist.y - elbow.y) * 0.4 }
    return [[shoulder, elbow, wrist, hand]]
  })
}

/**
 * Altura del cuerpo en la foto, en píxeles de la imagen: de la primera a la
 * última fila con cuerpo. `null` si el cuerpo toca el borde de arriba o de abajo
 * (está cortado). Es la escala que, con la altura del perfil, pasa a centímetros.
 */
function bodyHeightPx(size: ImageSize, mask: Silhouette): number | null {
  let top = -1
  let bottom = -1
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.isBody(x, y)) {
        if (top < 0) top = y
        bottom = y
        break
      }
    }
  }
  if (top <= 0 || bottom < 0 || bottom >= mask.height - 1) return null
  return (bottom - top + 1) / (mask.height / size.height)
}

/**
 * Las anchuras de la silueta entre dos puntos, fila a fila, siguiendo la recta
 * que los une, en píxeles de la imagen. Una fila que no es cuerpo (el hueco entre
 * las piernas bajo la cadera) se salta; `null` si ninguna lo es o si un brazo cae
 * dentro de alguna.
 */
function runWidths(
  from: Point,
  to: Point,
  steps: number,
  size: ImageSize,
  mask: Silhouette,
  arms: readonly (readonly Point[])[],
): number[] | null {
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  const widths: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    const run = bodyRunAt(mask, p.x * sx, p.y * sy)
    if (!run) continue
    if (armInsideRun(arms, p.y, run, sx)) return null
    widths.push((run.right - run.left + 1) / sx)
  }
  return widths.length ? widths : null
}

/**
 * Anchuras (de frente) o profundidades (de perfil) para estimar la grasa con la
 * fórmula de la Marina (D-023, enmienda del 2026-10-14), divididas por la altura
 * del cuerpo en la foto: así no dependen de la distancia a la cámara, y la altura
 * del perfil las pasa a centímetros.
 *
 * - cuello: la parte más estrecha entre la cabeza (boca de frente, oreja de
 *   perfil) y los hombros, lejos de la mandíbula y del trapecio;
 * - cintura: a la altura del ombligo (`NAVY.navel`), y la más estrecha del tronco;
 * - cadera: la más ancha desde los puntos de cadera hasta un 15 % del tronco por debajo.
 */
function bodyFatSpans(
  prefix: 'Width' | 'Depth',
  neckLine: { top: Point; shoulders: Point },
  torso: { shoulders: Point; hips: Point },
  size: ImageSize,
  mask: Silhouette,
  arms: readonly (readonly Point[])[],
): Measurements {
  const keys = ['neck', 'waist', 'waistNarrow', 'hip'].map((k) => `${k}${prefix}H`)
  const height = bodyHeightPx(size, mask)
  if (height === null) return Object.fromEntries(keys.map((k) => [k, { value: null, reason: 'out_of_frame' }]))
  const at = (t: number) => alongTorso(torso.shoulders, torso.hips, t)
  const value = (widths: number[] | null, pickOne: (...n: number[]) => number): MeasureValue =>
    widths ? { value: round(pickOne(...widths) / height, 4) } : { value: null, reason: 'no_silhouette' }
  // El cuello no cruza los brazos: no se comprueban.
  // El cuello, del 20 % al 85 % del camino: lejos de la mandíbula y del trapecio.
  const neckAt = (t: number) => ({ x: neckLine.top.x + (neckLine.shoulders.x - neckLine.top.x) * t, y: neckLine.top.y + (neckLine.shoulders.y - neckLine.top.y) * t })
  return {
    [keys[0]]: value(runWidths(neckAt(0.2), neckAt(0.85), 13, size, mask, []), Math.min),
    [keys[1]]: value(runWidths(at(NAVY.navel), at(NAVY.navel), 0, size, mask, arms), Math.min),
    [keys[2]]: value(runWidths(at(0.5), at(0.9), 20, size, mask, arms), Math.min),
    [keys[3]]: value(runWidths(at(1), at(1.15), 15, size, mask, arms), Math.max),
  }
}

/**
 * Flancos, de frente: cuánto sale la silueta del tronco, por cada lado, de la
 * recta que va de las costillas a la cresta ilíaca, en % de la longitud del
 * tronco. Positivo, hacia fuera (convexo); negativo, hacia dentro.
 *
 * Con un brazo pegado al tronco, la anchura lo incluiría: si la línea de un brazo
 * (hombro–codo–muñeca) cae dentro del tramo del tronco a la altura de un corte,
 * no se mide.
 */
function flankBulge(points: Point[], size: ImageSize, mask: Silhouette, arms: readonly (readonly Point[])[]): number | null {
  const [ls, rs, lh, rh] = points
  const shoulders = midpoint(ls, rs)
  const hips = midpoint(lh, rh)
  const torsoLength = distance(shoulders, hips)
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  const widths: number[] = []
  for (const t of CORE_CUTS) {
    const p = alongTorso(shoulders, hips, t)
    const run = bodyRunAt(mask, p.x * sx, p.y * sy)
    if (!run) return null
    const width = (run.right - run.left + 1) / sx
    if (width > torsoLength * MAX_TORSO_WIDTH_RATIO) return null
    if (armInsideRun(arms, p.y, run, sx)) return null
    widths.push(width)
  }
  // La anchura recoge los dos flancos: la mitad es lo que sale cada uno.
  return (lineDeviation(widths) / 2 / torsoLength) * 100
}

/**
 * Abdomen, de perfil: cuánto sale el borde delantero de la silueta de la recta
 * costillas–cresta, en % de la longitud del tronco. Positivo, hacia fuera. El
 * «delante» se deduce de hacia dónde apunta la nariz.
 */
function bellyBulge([shoulder, hip, ear, nose]: Point[], size: ImageSize, mask: Silhouette): number | null {
  const torsoLength = distance(shoulder, hip)
  const facing = Math.sign(nose.x - ear.x) || 1
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  const fronts: number[] = []
  for (const t of CORE_CUTS) {
    const p = alongTorso(shoulder, hip, t)
    const x0 = Math.round(p.x * sx)
    const y = Math.round(p.y * sy)
    if (y < 0 || y >= mask.height || x0 < 0 || x0 >= mask.width || !mask.isBody(x0, y)) return null
    let x = x0
    while (x + facing >= 0 && x + facing < mask.width && mask.isBody(x + facing, y)) {
      x += facing
      if (Math.abs(x - x0) / sx > torsoLength * MAX_TORSO_WIDTH_RATIO) return null
    }
    fronts.push(Math.abs(x - x0) / sx)
  }
  return (lineDeviation(fronts) / torsoLength) * 100
}

/** Anchura de la silueta en un corte perpendicular al hueso, en píxeles de la imagen. */
function cutWidth(at: Point, a: Point, b: Point, length: number, size: ImageSize, mask: Silhouette, maxRatio: number): number | null {
  // Normal unitaria al hueso, en píxeles de la imagen.
  const nx = -(b.y - a.y) / length
  const ny = (b.x - a.x) / length
  const sx = mask.width / size.width
  const sy = mask.height / size.height
  const cap = length * maxRatio
  const inBody = (d: number) => {
    const x = Math.round((at.x + nx * d) * sx)
    const y = Math.round((at.y + ny * d) * sy)
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
  // otro, la silueta sigue por otra parte del cuerpo y la anchura no es de esta zona.
  if (Math.max(left, right) > 2.5 * Math.max(Math.min(left, right), step)) return null
  return left + right + step
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
 * - `waistToHip`: cintura / cadera en la silueta.
 * - `<zona>Mean` / `<zona>Peak`: área media y contorno máximo de cada zona.
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

  const fromSilhouette = (ratioOf: (points: Point[], size: ImageSize, mask: Silhouette) => number | null): MeasureValue => {
    if (!vShape.ok) return { value: null, reason: vShape.reason }
    const ratio = mask ? ratioOf(vShape.points, size, mask) : null
    return ratio === null ? { value: null, reason: 'no_silhouette' } : { value: round(ratio, 2) }
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
    shoulderToWaist: fromSilhouette(shoulderToWaist),
    waistToHip: fromSilhouette(waistToHip),
    flankBulgePct: fromSilhouette((points, size, mask) => {
      // Solo los brazos que se ven: uno que no se ve no puede comprobarse, y no impide medir.
      const chains = [
        [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
        [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
      ].flatMap((ids) => {
        const arm = pick(landmarks, size, ids)
        return arm.ok ? [arm.points] : []
      })
      return flankBulge(points, size, mask, chains)
    }),
    ...zoneWidths(landmarks, size, mask),
    ...frontFatSpans(landmarks, size, mask),
  }
}

/** Anchuras de cuello, cintura y cadera de frente, para la grasa estimada. */
function frontFatSpans(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  const keys = ['neckWidthH', 'waistWidthH', 'waistNarrowWidthH', 'hipWidthH']
  const missing = (reason: ZoneReason): Measurements => Object.fromEntries(keys.map((k) => [k, { value: null, reason }]))
  const points = pick(landmarks, size, [LM.mouthLeft, LM.mouthRight, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip])
  if (!points.ok) return missing(points.reason)
  if (!mask) return missing('no_silhouette')
  const [ml, mr, ls, rs, lh, rh] = points.points
  const shoulders = midpoint(ls, rs)
  return bodyFatSpans('Width', { top: midpoint(ml, mr), shoulders }, { shoulders, hips: midpoint(lh, rh) }, size, mask, visibleArms(landmarks, size))
}

type ZoneReason = 'not_visible' | 'out_of_frame' | 'no_silhouette'

/**
 * Área media y contorno máximo de una zona (media de los lados medidos). Basta
 * con un lado bien medido; si ninguno, la zona está pegada a otra.
 */
function zoneMeasure(
  landmarks: readonly ScanLandmark[],
  size: ImageSize,
  mask: Silhouette | undefined,
  key: string,
  pairs: [number, number][],
  maxRatio: number,
): Measurements {
  const missing = (reason: ZoneReason): Measurements => ({
    [`${key}Mean`]: { value: null, reason },
    [`${key}Peak`]: { value: null, reason },
  })
  if (!mask) return missing('no_silhouette')
  const profiles: { mean: number; peak: number }[] = []
  for (const [from, to] of pairs) {
    const bone = pick(landmarks, size, [from, to])
    if (!bone.ok) return missing(bone.reason)
    const profile = zoneProfile(bone.points[0], bone.points[1], size, mask, maxRatio)
    if (profile) profiles.push(profile)
  }
  if (profiles.length === 0) return missing('no_silhouette')
  return {
    [`${key}Mean`]: { value: round(mean(profiles.map((p) => p.mean)), 3) },
    [`${key}Peak`]: { value: round(mean(profiles.map((p) => p.peak)), 3) },
  }
}

/** Topes de cada corte, en fracción de la longitud del hueso. */
const ZONE_MAX_RATIO = { upperArm: 0.45, forearm: 0.4, thigh: 0.5, calf: 0.4, flexArm: 0.6 } as const

/**
 * Brazo respecto a antebrazo (enmienda del 2026-10-14): anchura media del brazo
 * entre la del antebrazo, del mismo lado, en píxeles. Solo cuentan los lados con
 * las dos zonas medidas.
 */
function armToForearm(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): MeasureValue {
  if (!mask) return { value: null, reason: 'no_silhouette' }
  const ratios: number[] = []
  let reason: ZoneReason = 'no_silhouette'
  for (const ids of [[LM.leftShoulder, LM.leftElbow, LM.leftWrist], [LM.rightShoulder, LM.rightElbow, LM.rightWrist]]) {
    const arm = pick(landmarks, size, ids)
    if (!arm.ok) {
      reason = arm.reason
      continue
    }
    const [shoulder, elbow, wrist] = arm.points
    const upper = zoneProfile(shoulder, elbow, size, mask, ZONE_MAX_RATIO.upperArm)
    const fore = zoneProfile(elbow, wrist, size, mask, ZONE_MAX_RATIO.forearm)
    if (upper && fore) ratios.push(upper.meanPx / fore.meanPx)
  }
  return ratios.length ? { value: round(mean(ratios), 2) } : { value: null, reason }
}

/**
 * Área media y contorno máximo de brazo, antebrazo, muslo y pantorrilla (media
 * de los dos lados), y anchura de los hombros respecto al tronco. Solo con
 * silueta; sin ella, «sin silueta». Mide la forma en la foto, no qué es músculo
 * y qué no: con ropa ancha, la ropa.
 */
function zoneWidths(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  const zone = (key: keyof typeof ZONE_MAX_RATIO, pairs: [number, number][]) => zoneMeasure(landmarks, size, mask, key, pairs, ZONE_MAX_RATIO[key])
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
    ...zone('upperArm', [[LM.leftShoulder, LM.leftElbow], [LM.rightShoulder, LM.rightElbow]]),
    ...zone('forearm', [[LM.leftElbow, LM.leftWrist], [LM.rightElbow, LM.rightWrist]]),
    ...zone('thigh', [[LM.leftHip, LM.leftKnee], [LM.rightHip, LM.rightKnee]]),
    ...zone('calf', [[LM.leftKnee, LM.leftAnkle], [LM.rightKnee, LM.rightAnkle]]),
    shoulderToTorso: shoulderWidth(),
    armToForearm: armToForearm(landmarks, size, mask),
  }
}

/**
 * Bíceps flexionado, de frente (pose opcional, enmienda del 2026-10-14): los
 * brazos en cruz con los codos doblados y el puño hacia arriba. Área media y
 * contorno máximo del brazo respecto a su hueso, en tensión, donde el pico se ve.
 */
export function measureFlex(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  return zoneMeasure(landmarks, size, mask, 'flexArm', [[LM.leftShoulder, LM.leftElbow], [LM.rightShoulder, LM.rightElbow]], ZONE_MAX_RATIO.flexArm)
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
 * - `bellyBulgePct`: el abdomen respecto a la recta costillas–cresta, si hay silueta.
 */
export function measureSide(landmarks: readonly ScanLandmark[], size: ImageSize, mask?: Silhouette): Measurements {
  const side = visibleSide(landmarks, [LM.leftEar, LM.leftShoulder, LM.leftHip], [LM.rightEar, LM.rightShoulder, LM.rightHip])
  const ids = side === 'left' ? [LM.leftEar, LM.leftShoulder, LM.leftHip, LM.nose] : [LM.rightEar, LM.rightShoulder, LM.rightHip, LM.nose]
  const head = pick(landmarks, size, ids)
  const belly = (): MeasureValue => {
    if (!head.ok) return { value: null, reason: head.reason }
    const [ear, shoulder, hip, nose] = head.points
    const bulge = mask ? bellyBulge([shoulder, hip, ear, nose], size, mask) : null
    return bulge === null ? { value: null, reason: 'no_silhouette' } : { value: round(bulge) }
  }
  const fatSpans = (): Measurements => {
    const keys = ['neckDepthH', 'waistDepthH', 'waistNarrowDepthH', 'hipDepthH']
    if (!head.ok) return Object.fromEntries(keys.map((k) => [k, { value: null, reason: head.reason }]))
    if (!mask) return Object.fromEntries(keys.map((k) => [k, { value: null, reason: 'no_silhouette' }]))
    const [ear, shoulder, hip] = head.points
    // De perfil los brazos caen junto al tronco, dentro de su profundidad: no se comprueban.
    return bodyFatSpans('Depth', { top: ear, shoulders: shoulder }, { shoulders: shoulder, hips: hip }, size, mask, [])
  }
  return {
    bellyBulgePct: belly(),
    ...fatSpans(),
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
      return measureSide(landmarks, size, mask)
    case 'squat_side':
      return measureSquatSide(landmarks, size)
    case 'squat_front':
      return measureSquatFront(landmarks, size)
    case 'arms_up':
      return measureArmsUp(landmarks, size)
    case 'flex':
      return measureFlex(landmarks, size, mask)
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
