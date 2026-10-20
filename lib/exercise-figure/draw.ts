/**
 * De un esqueleto a la lista de formas que se dibujan (D-024). Sin colores: cada
 * forma lleva un tono con nombre, y quien dibuja lo traduce a los tokens del
 * Design System.
 */

import { BONES, CANVAS, FLOOR_Y, along, angleOf, type FigureSpec, type Limb, type Point, type Skeleton } from './skeleton'

export type Tone = 'body' | 'bodyFar' | 'muscle' | 'muscleSoft' | 'prop' | 'floor' | 'ink'

export type Shape =
  | { kind: 'line'; a: Point; b: Point; width: number; tone: Tone }
  | { kind: 'circle'; c: Point; r: number; tone: Tone }
  | { kind: 'curve'; a: Point; control: Point; b: Point; width: number; tone: Tone }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone: Tone }

/** Zonas que se pueden marcar sobre la figura. */
export type Overlay = 'chest' | 'back' | 'core' | 'glutes' | 'shoulder' | 'upperArm' | 'thigh' | 'shin'

/** 1 = músculo principal (azul), 2 = secundario (azul suave). */
export type MuscleMap = Partial<Record<Overlay, 1 | 2>>

const WIDTH = { torso: 22, torsoFront: 26, neck: 8, upperArm: 10, forearm: 8, thigh: 14, shin: 10, foot: 6 } as const

const unit = (a: Point, b: Point): Point => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
}
/** Normal a la izquierda del sentido a→b. */
const normal = (a: Point, b: Point): Point => {
  const [x, y] = unit(a, b)
  return [-y, x]
}
const at = (a: Point, b: Point, t: number, offset: number): Point => {
  const n = normal(a, b)
  return [a[0] + (b[0] - a[0]) * t + n[0] * offset, a[1] + (b[1] - a[1]) * t + n[1] * offset]
}

const tone = (level: 1 | 2): Tone => (level === 1 ? 'muscle' : 'muscleSoft')

/** Un músculo sobre un hueso: el tramo t0–t1, desplazado `offset` hacia la izquierda del sentido a→b. */
function band(a: Point, b: Point, t0: number, t1: number, offset: number, width: number, level: 1 | 2): Shape {
  return { kind: 'line', a: at(a, b, t0, offset), b: at(a, b, t1, offset), width, tone: tone(level) }
}

function limbShapes(limb: Limb, upper: number, lower: number, color: Tone): Shape[] {
  const shapes: Shape[] = [
    { kind: 'line', a: limb.root, b: limb.joint, width: upper, tone: color },
    { kind: 'line', a: limb.joint, b: limb.end, width: lower, tone: color },
  ]
  if (limb.tip) shapes.push({ kind: 'line', a: limb.end, b: limb.tip, width: WIDTH.foot, tone: color })
  return shapes
}

/** Una kettlebell: el asa en la mano y la bola colgando en la dirección del antebrazo. */
function kettlebellShapes(hand: Point, along_: number): Shape[] {
  const center = along(hand, along_, 10)
  return [
    { kind: 'line', a: hand, b: along(hand, along_, 4), width: 3.5, tone: 'ink' },
    { kind: 'circle', c: center, r: 7.5, tone: 'ink' },
  ]
}

function weightShapes(at: Point, across: number): Shape[] {
  // Una pesa vista de lado: el mango y los dos discos, perpendicular al antebrazo.
  const a = along(at, across, 9)
  const b = along(at, across + 180, 9)
  return [
    { kind: 'line', a, b, width: 3.5, tone: 'ink' },
    { kind: 'line', a, b: along(a, across + 180, 3), width: 9, tone: 'ink' },
    { kind: 'line', a: b, b: along(b, across, 3), width: 9, tone: 'ink' },
  ]
}

export function figureShapes(spec: FigureSpec, s: Skeleton, muscles: MuscleMap): Shape[] {
  const faces = spec.faces ?? 1
  const front = spec.view === 'front'
  const farTone: Tone = front ? 'body' : 'bodyFar'
  const shapes: Shape[] = [{ kind: 'line', a: [8, FLOOR_Y], b: [CANVAS.width - 8, FLOOR_Y], width: 1.5, tone: 'floor' }]

  for (const prop of spec.props ?? []) {
    if (prop.kind === 'box') shapes.push({ kind: 'rect', x: prop.x, y: prop.y, w: prop.w, h: prop.h, tone: 'prop' })
    else shapes.push({ kind: 'rect', x: prop.x, y: 12, w: 6, h: FLOOR_Y - 12, tone: 'prop' })
  }

  // La goma, detrás del cuerpo: del anclaje a las manos (D-046).
  if (spec.band) {
    const hands = spec.band.both ? [s.farArm.end, s.arm.end] : [s.arm.end]
    for (const hand of hands) shapes.push({ kind: 'line', a: spec.band.from, b: hand, width: 2, tone: 'ink' })
  }

  // Lo que queda detrás.
  shapes.push(...limbShapes(s.farLeg, WIDTH.thigh, WIDTH.shin, farTone))
  shapes.push(...limbShapes(s.farArm, WIDTH.upperArm, WIDTH.forearm, farTone))

  // Tronco (curvo si la espalda se redondea o se hunde), cuello y cabeza.
  const frontSide = normal(s.hip, s.shoulder).map((v) => v * faces) as unknown as Point
  const mid: Point = [(s.hip[0] + s.shoulder[0]) / 2, (s.hip[1] + s.shoulder[1]) / 2]
  const control: Point = [mid[0] - frontSide[0] * s.arch * 2, mid[1] - frontSide[1] * s.arch * 2]
  const torsoWidth = front ? WIDTH.torsoFront : WIDTH.torso
  shapes.push({ kind: 'curve', a: s.hip, control, b: s.shoulder, width: torsoWidth, tone: 'body' })
  shapes.push({ kind: 'line', a: s.shoulder, b: s.neck, width: WIDTH.neck, tone: 'body' })
  shapes.push({ kind: 'circle', c: s.head, r: BONES.headRadius, tone: 'body' })

  // Músculos del tronco. De lado, el pecho y el abdomen van delante y la espalda y
  // los glúteos detrás; de frente, el pecho y el abdomen van centrados, y la
  // espalda y los glúteos no se ven.
  const off = (forward: number) => (front ? 0 : forward * faces)
  if (muscles.back && !front) shapes.push(band(s.hip, s.shoulder, 0.4, 0.88, off(-5), 10, muscles.back))
  if (muscles.glutes && !front) shapes.push(band(s.hip, s.shoulder, -0.08, 0.14, off(-6), 12, muscles.glutes))
  if (muscles.core) shapes.push(band(s.hip, s.shoulder, 0.12, 0.5, off(5), front ? 12 : 9, muscles.core))
  if (muscles.chest) shapes.push(band(s.hip, s.shoulder, 0.64, 0.9, off(5), front ? 20 : 10, muscles.chest))

  // Lo que queda delante.
  shapes.push(...limbShapes(s.leg, WIDTH.thigh, WIDTH.shin, 'body'))
  shapes.push(...limbShapes(s.arm, WIDTH.upperArm, WIDTH.forearm, 'body'))

  // Músculos de brazos y piernas, en los dos lados.
  for (const leg of [s.farLeg, s.leg]) {
    if (muscles.thigh) shapes.push(band(leg.root, leg.joint, 0.15, 0.85, 0, 8, muscles.thigh))
    if (muscles.shin) shapes.push(band(leg.joint, leg.end, 0.1, 0.6, 0, 6, muscles.shin))
  }
  for (const arm of [s.farArm, s.arm]) {
    if (muscles.upperArm) shapes.push(band(arm.root, arm.joint, 0.2, 0.85, 0, 6, muscles.upperArm))
    if (muscles.shoulder) shapes.push({ kind: 'circle', c: arm.root, r: 6.5, tone: tone(muscles.shoulder) })
  }

  // La pesa va en la mano cercana; si se sujeta con las dos, las dos manos llegan al mismo sitio.
  // Con un par, también en la lejana; la kettlebell cuelga de la mano (D-046).
  if (spec.weight === 'kettlebell') shapes.push(...kettlebellShapes(s.arm.end, angleOf(s.arm.joint, s.arm.end)))
  else if (spec.weight) {
    if (spec.weight === 'pair') shapes.push(...weightShapes(s.farArm.end, angleOf(s.farArm.joint, s.farArm.end) + 90))
    shapes.push(...weightShapes(s.arm.end, angleOf(s.arm.joint, s.arm.end) + 90))
  }
  return shapes
}
