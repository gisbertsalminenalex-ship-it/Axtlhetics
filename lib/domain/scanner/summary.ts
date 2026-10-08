/**
 * Resumen del escáner corporal (D-023): todas las fotos juntas → categorías,
 * índice de equilibrio 0–100, puntos fuertes, áreas de mejora y pasos de acción.
 *
 * Determinista y honesto: cada frase sale de una medida o de un dato registrado.
 * - Simetría, proporciones y postura/movilidad salen de las fotos.
 * - El desarrollo muscular sale del rendimiento real (tests de evolución), no de
 *   la foto: la cámara no ve cuánto músculo hay.
 * - La composición corporal no se mide con fotos: solo aparece si el usuario da
 *   un dato real.
 * Lo que no tiene datos fiables sale como «datos insuficientes». Nunca se rellena.
 * Sin diagnósticos: se describe lo medido («la rodilla izquierda se va hacia
 * dentro»), nunca un nombre clínico.
 */

import { completedAssessments } from '../assessment/assessment'
import { compareAssessment, type AssessmentTrend } from '../assessment/compare'
import type { Assessment } from '../assessment/types'
import type { Measurements, ScanPose } from './measure'
import {
  IMPROVE_UNTIL,
  LIMB_LENGTH_PHOTO_CHECK_PCT,
  POSTURE_SCALES,
  SCAN_INDEX_WEIGHTS,
  STABILITY_TOLERANCE,
  STRENGTH_FROM,
  SYMMETRY_SCALES,
  type Scale,
} from './scales'

export type PoseShots = Partial<Record<ScanPose, readonly Measurements[]>>

export type CategoryKey = 'symmetry' | 'proportion' | 'postureMobility' | 'muscleDevelopment' | 'composition'

export type ScanCategory = {
  key: CategoryKey
  title: string
  /** 0–100, o `null` sin datos suficientes o cuando la categoría no se puntúa. */
  score: number | null
  /** Si cuenta para el índice de equilibrio. */
  inIndex: boolean
  /** Una frase con lo esencial. */
  summary: string
  /** Lo medido, una línea por medida. */
  details: string[]
}

export type ScanAction = { text: string; exerciseIds: string[] }

export type ScanSummary = {
  index: number | null
  overview: string
  categories: ScanCategory[]
  strengths: string[]
  improvements: string[]
  actions: ScanAction[]
  /** Avisos sobre las fotos (inestables, giradas, una sola foto). */
  photoNotes: string[]
}

// ---------------------------------------------------------------------------
// Combinar las fotos de cada pose
// ---------------------------------------------------------------------------

type Combined = { value: number; photos: number }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Mediana de una medida entre las fotos de una pose; `null` si no hay datos o varían demasiado. */
function combine(
  shots: PoseShots,
  pose: ScanPose,
  key: string,
  notes: Set<string>,
): Combined | null {
  const values = (shots[pose] ?? [])
    .map((m) => m[key]?.value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return null
  const range = Math.max(...values) - Math.min(...values)
  const tolerance = STABILITY_TOLERANCE[key]
  if (values.length > 1 && tolerance !== undefined && range > tolerance) {
    notes.add(`${POSE_NAMES[pose]}: algunas medidas cambian mucho entre fotos. Repite las fotos con el mismo montaje y no se tendrán en cuenta hasta entonces.`)
    return null
  }
  return { value: median(values), photos: values.length }
}

const POSE_NAMES: Record<ScanPose, string> = {
  front: 'De frente',
  side: 'De perfil',
  squat_side: 'Sentadilla de perfil',
  squat_front: 'Sentadilla de frente',
  arms_up: 'Brazos arriba',
}

// ---------------------------------------------------------------------------
// Puntuar
// ---------------------------------------------------------------------------

/** 100 hasta `good`, 0 desde `poor`, lineal entre medias. Sirve en los dos sentidos. */
export function scoreOn(value: number, scale: Scale): number {
  const { good, poor } = scale
  const t = (value - good) / (poor - good)
  return Math.round(100 * Math.min(1, Math.max(0, 1 - t)))
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length
const one = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')

type Scored = { key: string; score: number; detail: string; strength: string; improvement: string; action?: ScanAction }

const ACTIONS = {
  sideBalance: {
    text: 'Trabajo unilateral y de core para equilibrar los dos lados: AXIS te propondrá ejercicios a una pierna y a un brazo.',
    exerciseIds: ['zancada-bulgara', 'peso-muerto-unilateral', 'remo-unilateral'],
  },
  shoulderMobility: {
    text: 'Movilidad y fuerza de hombro por encima de la cabeza, sobre todo del lado más limitado.',
    exerciseIds: ['pullover-con-pesa', 'ytw-boca-abajo', 'flexion-pica'],
  },
  kneeControl: {
    text: 'Control de rodilla: sentadillas y zancadas lentas manteniendo la rodilla en línea con el pie, y glúteo.',
    exerciseIds: ['zancada-atras', 'puente-gluteos', 'sentadilla-isometrica-pared'],
  },
  squatDepth: {
    text: 'Profundidad de sentadilla: bajar poco a poco con buena técnica y trabajo de cadera y tobillo.',
    exerciseIds: ['sentadilla', 'sentadilla-isometrica-pared', 'puente-gluteos'],
  },
  upperBack: {
    text: 'Espalda alta y postura: más tirón y extensión de espalda para equilibrar el empuje.',
    exerciseIds: ['ytw-boca-abajo', 'superman', 'remo-unilateral'],
  },
} satisfies Record<string, ScanAction>

function symmetry(shots: PoseShots, notes: Set<string>): Scored[] {
  const out: Scored[] = []
  const shoulders = combine(shots, 'front', 'shoulderTiltDeg', notes)
  if (shoulders) {
    const side = shoulders.value > 0 ? 'izquierdo' : 'derecho'
    out.push({
      key: 'shoulders',
      score: scoreOn(Math.abs(shoulders.value), SYMMETRY_SCALES.shoulderTiltDeg),
      detail: `Línea de hombros: ${one(Math.abs(shoulders.value))}°${Math.abs(shoulders.value) >= 1 ? ` (el ${side} más alto)` : ''}`,
      strength: 'Hombros nivelados',
      improvement: `El hombro ${side} queda más alto que el otro (${one(Math.abs(shoulders.value))}°)`,
      action: ACTIONS.sideBalance,
    })
  }
  const hips = combine(shots, 'front', 'hipTiltDeg', notes)
  if (hips) {
    const side = hips.value > 0 ? 'izquierda' : 'derecha'
    out.push({
      key: 'hips',
      score: scoreOn(Math.abs(hips.value), SYMMETRY_SCALES.hipTiltDeg),
      detail: `Línea de caderas: ${one(Math.abs(hips.value))}°${Math.abs(hips.value) >= 1 ? ` (la ${side} más alta)` : ''}`,
      strength: 'Caderas niveladas',
      improvement: `La cadera ${side} queda más alta que la otra (${one(Math.abs(hips.value))}°)`,
      action: ACTIONS.sideBalance,
    })
  }
  const arms = combine(shots, 'arms_up', 'armsDiffDeg', notes)
  if (arms) {
    const worse = arms.value > 0 ? 'derecho' : 'izquierdo'
    out.push({
      key: 'armsSides',
      score: scoreOn(Math.abs(arms.value), SYMMETRY_SCALES.armsDiffDeg),
      detail: `Brazos arriba, diferencia entre lados: ${one(Math.abs(arms.value))}°`,
      strength: 'Los dos brazos suben igual por encima de la cabeza',
      improvement: `El brazo ${worse} sube menos que el otro (${one(Math.abs(arms.value))}°)`,
      action: ACTIONS.shoulderMobility,
    })
  }
  const left = combine(shots, 'squat_front', 'leftKneeDeg', notes)
  const right = combine(shots, 'squat_front', 'rightKneeDeg', notes)
  if (left && right) {
    const diff = left.value - right.value
    out.push({
      key: 'kneesSides',
      score: scoreOn(Math.abs(diff), SYMMETRY_SCALES.kneesDiffDeg),
      detail: `Rodillas en la sentadilla, diferencia entre lados: ${one(Math.abs(diff))}°`,
      strength: 'Las dos rodillas se comportan igual en la sentadilla',
      improvement: `En la sentadilla, una rodilla se mueve distinto que la otra (${one(Math.abs(diff))}°)`,
      action: ACTIONS.kneeControl,
    })
  }
  return out
}

function postureMobility(shots: PoseShots, notes: Set<string>): Scored[] {
  const out: Scored[] = []
  const head = combine(shots, 'side', 'headForwardPct', notes)
  if (head) {
    const forward = Math.max(0, head.value)
    out.push({
      key: 'head',
      score: scoreOn(forward, POSTURE_SCALES.headForwardPct),
      detail: `Cabeza respecto al hombro: ${forward < 1 ? 'alineada' : `${one(forward)} % del tronco por delante`}`,
      strength: 'Cabeza bien alineada sobre los hombros',
      improvement: 'La cabeza queda adelantada respecto a los hombros',
      action: ACTIONS.upperBack,
    })
  }
  const depth = combine(shots, 'squat_side', 'kneeAngleDeg', notes)
  if (depth) {
    out.push({
      key: 'squatDepth',
      score: scoreOn(depth.value, POSTURE_SCALES.squatKneeAngleDeg),
      detail: `Sentadilla, ángulo de rodilla abajo: ${Math.round(depth.value)}°`,
      strength: 'Buena profundidad de sentadilla',
      improvement: 'La sentadilla se queda alta',
      action: ACTIONS.squatDepth,
    })
  }
  const lean = combine(shots, 'squat_side', 'trunkLeanDeg', notes)
  if (lean) {
    out.push({
      key: 'trunkLean',
      score: scoreOn(lean.value, POSTURE_SCALES.trunkLeanDeg),
      detail: `Sentadilla, inclinación del tronco: ${Math.round(lean.value)}°`,
      strength: 'Tronco controlado en la sentadilla',
      improvement: 'El tronco se inclina mucho hacia delante en la sentadilla',
      action: ACTIONS.upperBack,
    })
  }
  const kneeL = combine(shots, 'squat_front', 'leftKneeDeg', notes)
  const kneeR = combine(shots, 'squat_front', 'rightKneeDeg', notes)
  if (kneeL || kneeR) {
    const inward = Math.max(kneeL ? Math.max(0, kneeL.value) : 0, kneeR ? Math.max(0, kneeR.value) : 0)
    const which = kneeL && kneeR ? (Math.max(0, kneeL.value) >= Math.max(0, kneeR.value) ? 'izquierda' : 'derecha') : kneeL ? 'izquierda' : 'derecha'
    out.push({
      key: 'kneeInward',
      score: scoreOn(inward, POSTURE_SCALES.kneeInwardDeg),
      detail: `Sentadilla de frente, rodilla hacia dentro: ${inward < 1 ? 'no' : `${one(inward)}° (la ${which})`}`,
      strength: 'Rodillas alineadas con los pies en la sentadilla',
      improvement: `En la sentadilla, la rodilla ${which} se va hacia dentro (${one(inward)}°)`,
      action: ACTIONS.kneeControl,
    })
  }
  const leftArm = combine(shots, 'arms_up', 'leftArmDeg', notes)
  const rightArm = combine(shots, 'arms_up', 'rightArmDeg', notes)
  if (leftArm && rightArm) {
    const limited = Math.min(leftArm.value, rightArm.value)
    out.push({
      key: 'overhead',
      score: scoreOn(limited, POSTURE_SCALES.armOverheadDeg),
      detail: `Brazos arriba: izquierdo ${Math.round(leftArm.value)}°, derecho ${Math.round(rightArm.value)}°`,
      strength: 'Buen rango de hombro por encima de la cabeza',
      improvement: 'Los brazos no llegan del todo arriba sin compensar',
      action: ACTIONS.shoulderMobility,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Desarrollo muscular: del rendimiento real
// ---------------------------------------------------------------------------

const AREA: Record<string, string> = { push: 'empuje', core: 'core', legs: 'piernas', pull: 'tirón' }
const TREND_TEXT: Record<AssessmentTrend, string> = { up: 'sube', down: 'baja', same: 'se mantiene', mixed: 'mixto' }

function muscleDevelopment(assessments: readonly Assessment[]): {
  category: ScanCategory
  strengths: string[]
  improvements: string[]
  actions: ScanAction[]
} {
  const done = completedAssessments(assessments)
  const base: ScanCategory = { key: 'muscleDevelopment', title: 'Desarrollo muscular', score: null, inIndex: false, summary: '', details: [] }
  if (done.length === 0) {
    return {
      category: { ...base, summary: 'Sale de tu rendimiento real, no de la foto. Haz el test de evolución para tener tu punto de partida.' },
      strengths: [],
      improvements: [],
      actions: [],
    }
  }
  const comparisons = compareAssessment(done[0], assessments) ?? []
  const baseline = comparisons.every((c) => c.delta.kind === 'baseline')
  const details = comparisons.map((c) =>
    c.delta.kind === 'baseline' ? `${capital(AREA[c.test.key])}: línea base` : `${capital(AREA[c.test.key])}: ${TREND_TEXT[c.delta.trend]} respecto al test anterior`,
  )
  if (baseline) {
    return {
      category: { ...base, summary: 'Tu primer test es la referencia. Con el próximo se verá cómo evoluciona cada zona.', details },
      strengths: [],
      improvements: [],
      actions: [],
    }
  }
  const up = comparisons.filter((c) => c.delta.kind !== 'baseline' && c.delta.trend === 'up').map((c) => AREA[c.test.key])
  const stuck = comparisons.filter((c) => c.delta.kind !== 'baseline' && (c.delta.trend === 'down' || c.delta.trend === 'same')).map((c) => AREA[c.test.key])
  return {
    category: {
      ...base,
      summary: up.length ? `Mejoras en ${list(up)} respecto a tu test anterior.` : 'Sin mejoras respecto a tu test anterior.',
      details,
    },
    strengths: up.length ? [`Tu rendimiento sube en ${list(up)}`] : [],
    improvements: stuck.length ? [`Tu rendimiento no sube en ${list(stuck)}`] : [],
    actions: stuck.length
      ? [{ text: `Más frecuencia y progresión en ${list(stuck)}: AXIS le dará prioridad en tus próximas sesiones.`, exerciseIds: [] }]
      : [],
  }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`)

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

function categoryFrom(key: CategoryKey, title: string, scored: Scored[], inIndex: boolean, empty: string): ScanCategory {
  if (scored.length === 0) return { key, title, score: null, inIndex, summary: empty, details: [] }
  const score = Math.round(mean(scored.map((s) => s.score)))
  const best = [...scored].sort((a, b) => b.score - a.score)[0]
  const worst = [...scored].sort((a, b) => a.score - b.score)[0]
  const summary =
    worst.score <= IMPROVE_UNTIL ? `${worst.improvement}.` : best.score >= STRENGTH_FROM ? `${best.strength}.` : 'Sin diferencias destacables.'
  return { key, title, score, inIndex, summary, details: scored.map((s) => s.detail) }
}

export function summarizeScan(input: { shots: PoseShots; assessments?: readonly Assessment[]; bodyFatPct?: number | null }): ScanSummary {
  const notes = new Set<string>()
  const { shots } = input

  for (const pose of Object.keys(shots) as ScanPose[]) {
    if ((shots[pose]?.length ?? 0) === 1) notes.add(`${POSE_NAMES[pose]}: con una sola foto no se puede comprobar que la medida sea estable. Mejor 3 o más.`)
  }
  // La longitud de los huesos no se entrena: una diferencia grande delata una foto girada.
  for (const key of ['armAsymmetryPct', 'legAsymmetryPct']) {
    const limb = combine(shots, 'front', key, notes)
    if (limb && Math.abs(limb.value) > LIMB_LENGTH_PHOTO_CHECK_PCT) {
      notes.add('De frente: el cuerpo parece girado respecto a la cámara. Ponte totalmente de frente para que la comparación entre lados sea fiable.')
    }
  }

  const sym = symmetry(shots, notes)
  const pm = postureMobility(shots, notes)

  const v = combine(shots, 'front', 'shoulderToWaist', notes)
  const legs = combine(shots, 'front', 'legToTorso', notes)
  const proportionDetails = [
    ...(v ? [`Hombros / cintura (la «V»): ${one(v.value)}`] : []),
    ...(legs ? [`Piernas / tronco: ${one(legs.value)}`] : []),
  ]
  const proportion: ScanCategory = {
    key: 'proportion',
    title: 'Proporciones',
    // Se puntúa frente al objetivo que declare el usuario (D-023); hasta entonces, se mide y se compara consigo mismo.
    score: null,
    inIndex: true,
    summary: proportionDetails.length
      ? 'Medidas como referencia: se valorarán frente a tu objetivo y frente a tu próximo escaneo.'
      : 'Datos insuficientes: hace falta una foto de frente con los brazos separados del cuerpo.',
    details: proportionDetails,
  }

  const development = muscleDevelopment(input.assessments ?? [])

  const composition: ScanCategory =
    typeof input.bodyFatPct === 'number'
      ? { key: 'composition', title: 'Composición corporal', score: null, inIndex: false, summary: `Grasa corporal registrada por ti: ${one(input.bodyFatPct)} %.`, details: [] }
      : { key: 'composition', title: 'Composición corporal', score: null, inIndex: false, summary: 'No se mide con fotos. Solo aparece si añades un dato real (báscula de composición o medición profesional).', details: [] }

  const categories: ScanCategory[] = [
    categoryFrom('symmetry', 'Simetría', sym, true, 'Datos insuficientes: hacen falta fotos de frente, de brazos arriba o de sentadilla de frente.'),
    proportion,
    categoryFrom('postureMobility', 'Postura y movilidad', pm, true, 'Datos insuficientes: hacen falta fotos de perfil, de sentadilla o de brazos arriba.'),
    development.category,
    composition,
  ]

  // Índice: media ponderada de lo que tiene nota. Sin simetría ni postura no hay índice.
  const weighted = categories
    .filter((c) => c.inIndex && c.score !== null)
    .map((c) => ({ score: c.score as number, weight: SCAN_INDEX_WEIGHTS[c.key as keyof typeof SCAN_INDEX_WEIGHTS] }))
  const hasCore = categories.find((c) => c.key === 'symmetry')?.score !== null && categories.find((c) => c.key === 'postureMobility')?.score !== null
  const index = hasCore
    ? Math.round(weighted.reduce((s, w) => s + w.score * w.weight, 0) / weighted.reduce((s, w) => s + w.weight, 0))
    : null

  const all = [...sym, ...pm]
  const strengths = [...all.filter((s) => s.score >= STRENGTH_FROM).map((s) => s.strength), ...development.strengths]
  const weak = all.filter((s) => s.score <= IMPROVE_UNTIL).sort((a, b) => a.score - b.score)
  const improvements = [...weak.map((s) => s.improvement), ...development.improvements]

  const actions: ScanAction[] = []
  for (const action of [...weak.map((s) => s.action).filter((a): a is ScanAction => !!a), ...development.actions]) {
    if (!actions.some((a) => a.text === action.text)) actions.push(action)
  }

  const overview =
    index === null
      ? 'Faltan fotos para calcular el índice: completa de frente, de perfil, sentadilla y brazos arriba.'
      : `Índice de equilibrio ${index}/100. ${weak.length ? `Lo que más margen tiene: ${lowerFirst(weak[0].improvement)}.` : 'Sin desequilibrios destacables en lo medido.'}`

  return { index, overview, categories, strengths, improvements, actions: actions.slice(0, 4), photoNotes: Array.from(notes) }
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
