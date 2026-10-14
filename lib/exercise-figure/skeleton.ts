/**
 * Figura animada de cada ejercicio (D-024): un maniquí 2D dibujado por código.
 *
 * Geometría pura, sin React ni navegador: a partir de una pose (ángulos y puntos
 * de apoyo) calcula el esqueleto y la lista de formas que se dibujan. Así se puede
 * probar que ninguna pose se sale del lienzo ni produce `NaN`.
 *
 * Convenciones del lienzo (`CANVAS`, el suelo en `FLOOR_Y`):
 * - Ángulos en grados, medidos desde la vertical hacia abajo y girando hacia la
 *   derecha: 0 = abajo, 90 = derecha, 180 = arriba, −90 = izquierda.
 * - De pie, la figura mira a la derecha (`faces: 1`). Tumbada boca arriba con la
 *   cabeza a la derecha mira hacia arriba, que es el lado contrario: `faces: −1`.
 */

export type Point = readonly [number, number]

/** El lienzo empieza un poco por encima de 0 para que quepan los brazos estirados por encima de la cabeza. */
export const CANVAS = { x: 0, y: -12, width: 240, height: 222 } as const
export const FLOOR_Y = 197

/** Longitudes de los segmentos, en unidades del lienzo. */
export const BONES = { torso: 52, upperArm: 28, forearm: 26, thigh: 40, shin: 40, foot: 13, neck: 9, headRadius: 10 } as const

/**
 * Un brazo o una pierna: por ángulos (el del hueso de arriba y el de abajo) o
 * hasta un punto de apoyo, con el codo o la rodilla hacia un lado (`bend`: +1 a
 * la izquierda del sentido de la articulación al apoyo, −1 a la derecha).
 */
export type LimbSpec = { readonly a: number; readonly b: number } | { readonly to: Point; readonly bend: 1 | -1 }

export type Keyframe = {
  readonly hip: Point
  /** Del centro de la cadera a los hombros. */
  readonly torso: number
  /** Cuello y cabeza; por defecto, la dirección del tronco. */
  readonly head?: number
  /** Curva de la espalda: positivo la redondea (hacia la espalda), negativo la hunde. */
  readonly arch?: number
  readonly arm: LimbSpec
  readonly farArm?: LimbSpec
  readonly leg: LimbSpec
  readonly farLeg?: LimbSpec
  /** Ángulo del pie; por defecto, perpendicular a la espinilla, hacia delante. */
  readonly foot?: number
  readonly farFoot?: number
}

export type Prop = { readonly kind: 'box'; readonly x: number; readonly y: number; readonly w: number; readonly h: number } | { readonly kind: 'wall'; readonly x: number }

export type FigureSpec = {
  /** Una pose (se mantiene) o dos (va de la primera a la segunda y vuelve). */
  readonly frames: readonly [Keyframe] | readonly [Keyframe, Keyframe]
  readonly faces?: 1 | -1
  /** De frente: los dos lados se ven igual y los hombros y caderas se separan. */
  readonly view?: 'side' | 'front'
  readonly props?: readonly Prop[]
  /** Si lleva pesa: va en la mano cercana (si se sujeta con las dos, las dos manos llegan al mismo sitio). */
  readonly weight?: boolean
}

export type Limb = { root: Point; joint: Point; end: Point; tip: Point | null }

export type Skeleton = {
  hip: Point
  shoulder: Point
  head: Point
  neck: Point
  arch: number
  arm: Limb
  farArm: Limb
  leg: Limb
  farLeg: Limb
}

const RAD = Math.PI / 180
export const dir = (angle: number): Point => [Math.sin(angle * RAD), Math.cos(angle * RAD)]
export const along = (p: Point, angle: number, length: number): Point => {
  const [dx, dy] = dir(angle)
  return [p[0] + dx * length, p[1] + dy * length]
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
/** Ángulo del segmento a→b con la convención del lienzo. */
export const angleOf = (a: Point, b: Point) => Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD

/** Cinemática inversa de dos huesos: la articulación del medio, para llegar de `a` a `b`. */
export function solveJoint(a: Point, b: Point, l1: number, l2: number, bend: 1 | -1): Point {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01))
  const base = Math.atan2(dy, dx)
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const theta = base + bend * Math.acos(Math.max(-1, Math.min(1, cos)))
  return [a[0] + Math.cos(theta) * l1, a[1] + Math.sin(theta) * l1]
}

function solveLimb(root: Point, spec: LimbSpec, l1: number, l2: number): { joint: Point; end: Point } {
  if ('to' in spec) {
    const joint = solveJoint(root, spec.to, l1, l2, spec.bend)
    // Si el apoyo queda más lejos que el brazo estirado, la mano se queda donde llega.
    const reach = angleOf(joint, spec.to)
    return { joint, end: along(joint, reach, l2) }
  }
  const joint = along(root, spec.a, l1)
  return { joint, end: along(joint, spec.b, l2) }
}

function lerpLimb(a: LimbSpec, b: LimbSpec, t: number): LimbSpec {
  if ('to' in a && 'to' in b) return { to: lerpPoint(a.to, b.to, t), bend: a.bend }
  if (!('to' in a) && !('to' in b)) return { a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) }
  throw new Error('Las dos poses de un miembro tienen que ser del mismo tipo')
}

const lerpOptional = (a: number | undefined, b: number | undefined, t: number) => (a === undefined || b === undefined ? a ?? b : lerp(a, b, t))

/** La pose intermedia en `t` (0 = primera, 1 = segunda). */
export function interpolate(a: Keyframe, b: Keyframe, t: number): Keyframe {
  return {
    hip: lerpPoint(a.hip, b.hip, t),
    torso: lerp(a.torso, b.torso, t),
    head: lerpOptional(a.head ?? a.torso, b.head ?? b.torso, t),
    arch: lerp(a.arch ?? 0, b.arch ?? 0, t),
    arm: lerpLimb(a.arm, b.arm, t),
    farArm: lerpLimb(a.farArm ?? a.arm, b.farArm ?? b.arm, t),
    leg: lerpLimb(a.leg, b.leg, t),
    farLeg: lerpLimb(a.farLeg ?? a.leg, b.farLeg ?? b.leg, t),
    foot: lerpOptional(a.foot, b.foot, t),
    farFoot: lerpOptional(a.farFoot ?? a.foot, b.farFoot ?? b.foot, t),
  }
}

/** Separación de hombros y caderas en la vista de frente. */
const FRONT_SPREAD = { shoulder: 13, hip: 7 } as const

export function solveSkeleton(pose: Keyframe, faces: 1 | -1 = 1, view: 'side' | 'front' = 'side'): Skeleton {
  const hip = pose.hip
  const shoulder = along(hip, pose.torso, BONES.torso)
  const headAngle = pose.head ?? pose.torso
  const neck = along(shoulder, headAngle, BONES.neck)
  const head = along(shoulder, headAngle, BONES.neck + BONES.headRadius)
  // De frente, cada lado sale de su hombro y de su cadera.
  const side = (p: Point, spread: number, sign: 1 | -1): Point => (view === 'front' ? [p[0] + sign * spread, p[1]] : p)
  const limb = (root: Point, spec: LimbSpec, l1: number, l2: number, footAngle?: number): Limb => {
    const { joint, end } = solveLimb(root, spec, l1, l2)
    const tip = footAngle === undefined ? null : along(end, footAngle, BONES.foot)
    return { root, joint, end, tip }
  }
  const footAngle = (legSpec: LimbSpec, root: Point, given: number | undefined) => {
    if (given !== undefined) return given
    const { joint, end } = solveLimb(root, legSpec, BONES.thigh, BONES.shin)
    return angleOf(joint, end) + 90 * faces
  }
  const nearHip = side(hip, FRONT_SPREAD.hip, 1)
  const farHip = side(hip, FRONT_SPREAD.hip, -1)
  const farLegSpec = pose.farLeg ?? pose.leg
  return {
    hip,
    shoulder,
    head,
    neck,
    arch: pose.arch ?? 0,
    arm: limb(side(shoulder, FRONT_SPREAD.shoulder, 1), pose.arm, BONES.upperArm, BONES.forearm),
    farArm: limb(side(shoulder, FRONT_SPREAD.shoulder, -1), pose.farArm ?? pose.arm, BONES.upperArm, BONES.forearm),
    leg: limb(nearHip, pose.leg, BONES.thigh, BONES.shin, footAngle(pose.leg, nearHip, pose.foot)),
    farLeg: limb(farHip, farLegSpec, BONES.thigh, BONES.shin, footAngle(farLegSpec, farHip, pose.farFoot ?? pose.foot)),
  }
}

/** Una repetición: quieto al principio, va, quieto al final, vuelve. Devuelve 0–1. */
export function cycleProgress(ms: number, cycleMs = 2800): number {
  const t = (((ms % cycleMs) + cycleMs) % cycleMs) / cycleMs
  const p = t < 0.12 ? 0 : t < 0.5 ? (t - 0.12) / 0.38 : t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38
  return 0.5 - Math.cos(Math.PI * p) / 2
}

export function poseAt(spec: FigureSpec, progress: number): Keyframe {
  const [a, b] = spec.frames
  return b ? interpolate(a, b, progress) : a
}
