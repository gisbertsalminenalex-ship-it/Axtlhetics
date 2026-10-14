/**
 * Pose inicial y final de cada ejercicio del catálogo (D-024).
 *
 * Son datos: cambiar cómo se ve un ejercicio es cambiar sus números aquí. Un
 * test comprueba que todos los ejercicios del catálogo tienen figura y que
 * ninguna se sale del lienzo. Las de mantener una posición (plancha, sentadilla
 * en pared, estiramientos que no se mueven) tienen una sola pose.
 *
 * Convenciones en `skeleton.ts`: 0° = abajo, 90° = derecha, 180° = arriba.
 */

import { BONES, along, angleOf, type FigureSpec, type Keyframe, type LimbSpec, type Point } from './skeleton'

// ---------------------------------------------------------------------------
// Posiciones de partida que comparten varios ejercicios
// ---------------------------------------------------------------------------

/** De pie: la cadera a esta altura deja los pies en el suelo. */
const STAND_HIP_Y = 114
const straight: LimbSpec = { a: 0, b: 0 }
const hanging: LimbSpec = { a: 2, b: 2 }

/** Cuerpo en línea desde los tobillos con este ángulo (plancha, flexiones). */
function line(ankle: Point, angle: number): { hip: Point; shoulder: Point; leg: LimbSpec; torso: number } {
  const hip = along(ankle, angle, BONES.thigh + BONES.shin)
  return { hip, shoulder: along(hip, angle, BONES.torso), leg: { a: angle - 180, b: angle - 180 }, torso: angle }
}

/** Ángulo de un brazo estirado del hombro a un punto. */
const reach = (from: Point, to: Point): LimbSpec => {
  const a = angleOf(from, to)
  return { a, b: a }
}

// Flexiones en el suelo: los pies de puntillas y las manos bajo los hombros.
const PUSH_ANKLE: Point = [36, 186]
const PUSH_TOP = line(PUSH_ANKLE, 109)
const PUSH_HAND = along(PUSH_TOP.shoulder, 3, 53.5)
const PUSH_BOTTOM = line(PUSH_ANKLE, 94.4)
const pushUp = (top: ReturnType<typeof line>, bottom: ReturnType<typeof line>, hand: Point): FigureSpec['frames'] => [
  { hip: top.hip, torso: top.torso, leg: top.leg, arm: { to: hand, bend: 1 }, foot: 20 },
  { hip: bottom.hip, torso: bottom.torso, leg: bottom.leg, arm: { to: hand, bend: 1 }, foot: 20 },
]

/** Boca arriba con la cabeza a la derecha (mira hacia arriba: `faces: −1`). */
const SUPINE_Y = 184

/** A cuatro patas: manos bajo los hombros y rodillas bajo la cadera. */
const QUAD_HIP: Point = [86, 150]
const QUAD_TORSO = 99
const QUAD_KNEELING: LimbSpec = { a: 0, b: -90 }

// Bisagra con la mano libre apoyada en una caja (remo, patada de tríceps).
const HINGE_HIP: Point = [96, STAND_HIP_Y]
const HINGE_TORSO = 112
const HINGE_BOX = { kind: 'box', x: 160, y: 142, w: 46, h: 55 } as const
const HINGE_SUPPORT: LimbSpec = { to: [176, 141], bend: -1 }
const HINGE_LEGS: LimbSpec = { a: 12, b: -6 }

// ---------------------------------------------------------------------------
// Los 43 ejercicios
// ---------------------------------------------------------------------------

const incline = (() => {
  const ankle: Point = [44, 186]
  const top = line(ankle, 118)
  const hand = along(top.shoulder, 4, 53.5)
  return { frames: pushUp(top, line(ankle, 106), hand), props: [{ kind: 'box', x: 150, y: hand[1] + 2, w: 50, h: 197 - hand[1] - 2 }] } satisfies FigureSpec
})()

const floorPushUp: FigureSpec = { frames: pushUp(PUSH_TOP, PUSH_BOTTOM, PUSH_HAND) }

const decline = (() => {
  const ankle: Point = [40, 140]
  const top = line(ankle, 88.7)
  const hand = along(top.shoulder, 3, 53.5)
  return { frames: pushUp(top, line(ankle, 74.2), hand), props: [{ kind: 'box', x: 14, y: 150, w: 46, h: 47 }] } satisfies FigureSpec
})()

/** Brazos con la pesa al hombro, de pie. */
const standing = (arm: LimbSpec, extra: Partial<Keyframe> = {}): Keyframe => ({
  hip: [118, STAND_HIP_Y],
  torso: 180,
  arm,
  farArm: hanging,
  leg: straight,
  ...extra,
})

const curl: FigureSpec = { frames: [standing({ a: -4, b: 0 }), standing({ a: 3, b: 155 })], weight: true }

const supine = (extra: Partial<Keyframe> & Pick<Keyframe, 'arm'>): Keyframe => ({
  hip: [92, SUPINE_Y],
  torso: 90,
  head: 90,
  farArm: { a: -86, b: -86 },
  leg: { to: [58, 190], bend: 1 },
  foot: -90,
  ...extra,
})

const prone = (extra: Partial<Keyframe> = {}): Keyframe => ({
  hip: [96, 186],
  torso: 90,
  head: 90,
  arm: { a: 90, b: 90 },
  leg: { a: -90, b: -90 },
  foot: -95,
  ...extra,
})

const quadruped = (extra: Partial<Keyframe> = {}): Keyframe => ({
  hip: QUAD_HIP,
  torso: QUAD_TORSO,
  head: 95,
  arm: { a: 2, b: 2 },
  leg: QUAD_KNEELING,
  foot: -95,
  ...extra,
})

const squat = (torsoBottom: number, arms: [LimbSpec, LimbSpec]): FigureSpec['frames'] => [
  { hip: [118, STAND_HIP_Y], torso: 180, arm: arms[0], leg: { to: [118, 194], bend: -1 }, foot: 90 },
  { hip: [101, 153], torso: torsoBottom, head: torsoBottom + 4, arm: arms[1], leg: { to: [118, 194], bend: -1 }, foot: 90 },
]

const lunge: FigureSpec = {
  frames: [
    { hip: [116, 121], torso: 180, arm: hanging, leg: { to: [148, 194], bend: -1 }, farLeg: { to: [84, 186], bend: -1 }, foot: 90, farFoot: 50 },
    { hip: [112, 150], torso: 180, arm: hanging, leg: { to: [148, 194], bend: -1 }, farLeg: { to: [84, 186], bend: -1 }, foot: 90, farFoot: 50 },
  ],
}

const calfRaise = (extra: Partial<Keyframe> = {}): FigureSpec['frames'] => [
  { hip: [118, STAND_HIP_Y], torso: 180, arm: hanging, leg: straight, foot: 90, ...extra },
  { hip: [118, STAND_HIP_Y - 8], torso: 180, arm: hanging, leg: straight, foot: 38, ...extra },
]

export const FIGURES: Readonly<Record<string, FigureSpec>> = {
  // --- Empuje ----------------------------------------------------------------
  'flexiones-inclinadas': incline,
  'flexiones-negativas': floorPushUp,
  flexiones: floorPushUp,
  'flexiones-diamante': floorPushUp,
  'flexiones-declinadas': decline,
  'flexion-pica': {
    frames: [
      { hip: [105, 114], torso: 55, arm: { to: [165, 196], bend: 1 }, leg: reach([105, 114], [70, 186]), foot: 20 },
      { hip: [105, 114], torso: 33, arm: { to: [165, 196], bend: 1 }, leg: reach([105, 114], [70, 186]), foot: 20 },
    ],
  },
  'press-hombro-unilateral': { frames: [standing({ a: 25, b: 165 }), standing({ a: 174, b: 178 })], weight: true },
  'extension-triceps-unilateral': { frames: [standing({ a: 172, b: -35 }), standing({ a: 172, b: 178 })], weight: true },
  'press-suelo-unilateral': {
    faces: -1,
    weight: true,
    frames: [supine({ arm: { a: -80, b: 180 } }), supine({ arm: { a: 180, b: 180 } })],
  },
  'patada-triceps-unilateral': {
    weight: true,
    props: [HINGE_BOX],
    frames: [
      { hip: HINGE_HIP, torso: HINGE_TORSO, head: 105, arm: { a: HINGE_TORSO - 180, b: 0 }, farArm: HINGE_SUPPORT, leg: HINGE_LEGS },
      { hip: HINGE_HIP, torso: HINGE_TORSO, head: 105, arm: { a: HINGE_TORSO - 180, b: HINGE_TORSO - 180 }, farArm: HINGE_SUPPORT, leg: HINGE_LEGS },
    ],
  },

  // --- Tirón -----------------------------------------------------------------
  superman: {
    frames: [prone(), prone({ torso: 99, head: 105, arm: { a: 104, b: 104 }, leg: { a: -99, b: -99 }, foot: -104 })],
  },
  'remo-unilateral': {
    weight: true,
    props: [HINGE_BOX],
    frames: [
      { hip: HINGE_HIP, torso: HINGE_TORSO, head: 105, arm: { a: 0, b: 0 }, farArm: HINGE_SUPPORT, leg: HINGE_LEGS },
      { hip: HINGE_HIP, torso: HINGE_TORSO, head: 105, arm: { a: -100, b: 0 }, farArm: HINGE_SUPPORT, leg: HINGE_LEGS },
    ],
  },
  'remo-renegado': {
    weight: true,
    frames: [
      { hip: PUSH_TOP.hip, torso: PUSH_TOP.torso, leg: PUSH_TOP.leg, arm: reach(PUSH_TOP.shoulder, PUSH_HAND), foot: 20 },
      { hip: PUSH_TOP.hip, torso: PUSH_TOP.torso, leg: PUSH_TOP.leg, arm: { a: -160, b: 20 }, farArm: reach(PUSH_TOP.shoulder, PUSH_HAND), foot: 20 },
    ],
  },
  'curl-biceps-unilateral': curl,
  'curl-martillo-unilateral': curl,
  'ytw-boca-abajo': {
    frames: [prone({ head: 92 }), prone({ torso: 95, head: 100, arm: { a: 110, b: 110 } })],
  },
  'pullover-con-pesa': {
    faces: -1,
    weight: true,
    frames: [supine({ arm: { a: 180, b: 180 }, farArm: { a: 180, b: 180 } }), supine({ arm: { a: 118, b: 118 }, farArm: { a: 118, b: 118 } })],
  },

  // --- Piernas ---------------------------------------------------------------
  sentadilla: { frames: squat(142, [{ a: 90, b: 90 }, { a: 100, b: 100 }]) },
  'sentadilla-con-pesa': { weight: true, frames: squat(155, [{ a: 25, b: 160 }, { a: 25, b: 160 }]) },
  zancadas: lunge,
  'zancada-atras': lunge,
  'zancada-bulgara': {
    props: [{ kind: 'box', x: 30, y: 152, w: 40, h: 45 }],
    frames: [
      { hip: [118, 121], torso: 180, arm: hanging, leg: { to: [150, 194], bend: -1 }, farLeg: { to: [56, 148], bend: -1 }, foot: 90, farFoot: -90 },
      { hip: [114, 150], torso: 180, arm: hanging, leg: { to: [150, 194], bend: -1 }, farLeg: { to: [56, 148], bend: -1 }, foot: 90, farFoot: -90 },
    ],
  },
  'peso-muerto-unilateral': {
    weight: true,
    frames: [
      { hip: [118, STAND_HIP_Y], torso: 180, arm: straight, farArm: hanging, leg: { to: [118, 194], bend: -1 }, farLeg: { a: -3, b: -3 }, foot: 90 },
      { hip: [110, 118], torso: 96, head: 100, arm: straight, farArm: straight, leg: { to: [118, 194], bend: -1 }, farLeg: { a: -84, b: -84 }, foot: 90, farFoot: 0 },
    ],
  },
  'puente-gluteos': {
    faces: -1,
    frames: [
      { hip: [106, SUPINE_Y], torso: 90, head: 90, arm: { a: -88, b: -88 }, leg: { to: [64, 190], bend: 1 }, foot: -90 },
      { hip: [112, 160], torso: 61, head: 90, arm: { a: -88, b: -88 }, leg: { to: [64, 190], bend: 1 }, foot: -90 },
    ],
  },
  'elevacion-gemelos': { frames: calfRaise() },
  'elevacion-gemelos-una-pierna': {
    props: [{ kind: 'wall', x: 176 }],
    frames: calfRaise({ farLeg: { a: -5, b: -70 }, farArm: { a: 85, b: 85 } }),
  },
  'sentadilla-isometrica-pared': {
    props: [{ kind: 'wall', x: 66 }],
    frames: [{ hip: [86, 154], torso: 180, arm: { a: 10, b: 10 }, leg: { a: 90, b: 0 }, foot: 90 }],
  },
  'subida-escalon': {
    props: [{ kind: 'box', x: 122, y: 172, w: 56, h: 25 }],
    frames: [
      { hip: [112, 124], torso: 172, head: 176, arm: hanging, leg: { to: [146, 166], bend: -1 }, farLeg: { to: [100, 194], bend: -1 }, foot: 90, farFoot: 90 },
      { hip: [142, 88], torso: 174, head: 178, arm: hanging, leg: { to: [146, 166], bend: -1 }, farLeg: { to: [150, 148], bend: -1 }, foot: 90, farFoot: 60 },
    ],
  },
  'puente-talones-silla': {
    faces: -1,
    props: [{ kind: 'box', x: 30, y: 150, w: 42, h: 47 }],
    frames: [
      { hip: [118, SUPINE_Y], torso: 90, head: 90, arm: { a: -88, b: -88 }, leg: { to: [56, 146], bend: 1 }, foot: 180 },
      { hip: [118, 162], torso: 62.5, head: 90, arm: { a: -88, b: -88 }, leg: { to: [56, 146], bend: 1 }, foot: 180 },
    ],
  },
  'hip-thrust-con-pesa': {
    faces: -1,
    weight: true,
    props: [{ kind: 'box', x: 150, y: 150, w: 50, h: 47 }],
    frames: [
      { hip: [116, 178], torso: 125, head: 115, arm: { to: [120, 166], bend: -1 }, leg: { to: [76, 194], bend: 1 }, foot: -90 },
      { hip: [108, 140], torso: 90, head: 95, arm: { to: [112, 128], bend: -1 }, leg: { to: [76, 194], bend: 1 }, foot: -90 },
    ],
  },
  'zancada-lateral': {
    view: 'front',
    frames: [
      { hip: [120, 124], torso: 180, arm: { a: 12, b: 8 }, farArm: { a: -12, b: -8 }, leg: { to: [164, 194], bend: -1 }, farLeg: { to: [76, 194], bend: 1 }, foot: 70, farFoot: -70 },
      { hip: [142, 150], torso: 180, arm: { a: 12, b: 8 }, farArm: { a: -12, b: -8 }, leg: { to: [164, 194], bend: -1 }, farLeg: { to: [76, 194], bend: 1 }, foot: 70, farFoot: -70 },
    ],
  },

  // --- Core ------------------------------------------------------------------
  'dead-bug': {
    faces: -1,
    frames: [
      { hip: [96, SUPINE_Y], torso: 90, head: 90, arm: { a: 180, b: 180 }, farArm: { a: 180, b: 180 }, leg: { a: 180, b: -90 }, farLeg: { a: 180, b: -90 } },
      { hip: [96, SUPINE_Y], torso: 90, head: 90, arm: { a: 112, b: 112 }, farArm: { a: 180, b: 180 }, leg: { a: 180, b: -90 }, farLeg: { a: -98, b: -98 } },
    ],
  },
  'bird-dog': {
    frames: [quadruped(), quadruped({ arm: { a: 94, b: 94 }, farArm: { a: 2, b: 2 }, farLeg: { a: -95, b: -95 }, farFoot: -95 })],
  },
  plancha: (() => {
    const body = line([40, 186], 99.6)
    return { frames: [{ hip: body.hip, torso: body.torso, leg: body.leg, arm: { a: 0, b: 90 }, foot: 20 }] } satisfies FigureSpec
  })(),
  'plancha-lateral': (() => {
    const body = line([40, 188], 100.5)
    return { frames: [{ hip: body.hip, torso: body.torso, leg: body.leg, arm: { a: 0, b: 90 }, farArm: { a: 180, b: 180 }, foot: 60 }] } satisfies FigureSpec
  })(),
  'hollow-hold': {
    faces: -1,
    frames: [{ hip: [104, 186], torso: 100, head: 108, arm: { a: 116, b: 116 }, leg: { a: -106, b: -106 } }],
  },
  'plancha-toque-hombro': {
    frames: [
      { hip: PUSH_TOP.hip, torso: PUSH_TOP.torso, leg: PUSH_TOP.leg, arm: reach(PUSH_TOP.shoulder, PUSH_HAND), foot: 20 },
      { hip: PUSH_TOP.hip, torso: PUSH_TOP.torso, leg: PUSH_TOP.leg, arm: { a: -20, b: 150 }, farArm: reach(PUSH_TOP.shoulder, PUSH_HAND), foot: 20 },
    ],
  },

  // --- Movilidad -------------------------------------------------------------
  'gato-camello': { frames: [quadruped({ arch: 8, head: 50 }), quadruped({ arch: -5, head: 125 })] },
  'rotacion-toracica': {
    frames: [quadruped({ arm: { a: 10, b: 160 }, farArm: { a: 2, b: 2 } }), quadruped({ head: 120, arm: { a: 175, b: 30 }, farArm: { a: 2, b: 2 } })],
  },
  'estiramiento-flexor-cadera': {
    frames: [{ hip: [108, 152], torso: 180, arm: { a: -15, b: 40 }, leg: { to: [150, 194], bend: -1 }, farLeg: { a: -25, b: -90 }, foot: 90, farFoot: -90 }],
  },
  'estiramiento-isquiotibiales': {
    frames: [
      { hip: [112, STAND_HIP_Y], torso: 180, arm: { a: 8, b: 8 }, leg: { a: 16, b: 16 }, farLeg: { a: -6, b: 4 }, foot: 150, farFoot: 90 },
      { hip: [106, STAND_HIP_Y], torso: 125, head: 135, arm: { a: 10, b: 10 }, leg: { a: 16, b: 16 }, farLeg: { a: -6, b: 4 }, foot: 150, farFoot: 90 },
    ],
  },
  'tobillo-pared': {
    props: [{ kind: 'wall', x: 192 }],
    frames: [
      { hip: [132, 150], torso: 180, arm: { a: 80, b: 85 }, leg: { to: [176, 194], bend: -1 }, farLeg: { a: -20, b: -90 }, foot: 90, farFoot: -90 },
      { hip: [140, 152], torso: 180, arm: { a: 80, b: 85 }, leg: { to: [176, 194], bend: -1 }, farLeg: { a: -20, b: -90 }, foot: 90, farFoot: -90 },
    ],
  },
  'angeles-pared': {
    view: 'front',
    frames: [
      { hip: [120, STAND_HIP_Y], torso: 180, arm: { a: 90, b: 180 }, farArm: { a: -90, b: 180 }, leg: { a: 3, b: 3 }, farLeg: { a: -3, b: -3 }, foot: 70, farFoot: -70 },
      { hip: [120, STAND_HIP_Y], torso: 180, arm: { a: 150, b: 160 }, farArm: { a: -150, b: -160 }, leg: { a: 3, b: 3 }, farLeg: { a: -3, b: -3 }, foot: 70, farFoot: -70 },
    ],
  },
}

export function figureFor(exerciseId: string): FigureSpec | null {
  return FIGURES[exerciseId] ?? null
}
