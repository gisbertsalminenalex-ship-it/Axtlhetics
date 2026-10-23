/**
 * Resumen del escáner corporal (D-023): todas las fotos juntas → un resumen de
 * entrenador con índice de equilibrio, categorías, puntos fuertes, áreas de
 * mejora y pasos de acción.
 *
 * Determinista y honesto: cada frase sale de una medida o de un dato registrado.
 * - Simetría, proporciones y postura/movilidad salen de las fotos.
 * - El desarrollo muscular se estima con la fuerza y el entrenamiento reales
 *   (tests de evolución, sesiones, nivel) y con la forma de cada zona, el core y
 *   los brazos en la foto, que se dice como forma, no como músculo.
 * - La composición corporal es el % de grasa estimado con la fórmula de la Marina
 *   a partir de perímetros y altura (`body-fat.ts`, enmienda del 2026-10-14),
 *   siempre con su margen; nunca por texturas ni sombras.
 * Lo que no tiene datos fiables no se rellena.
 *
 * Voz de AXIS (`personality.ts`): primero la conclusión, sin exclamaciones, sin
 * cumplidos de apertura, sin diagnósticos y sin hablar de peso, estética o dietas.
 */

import { completedAssessments } from '../assessment/assessment'
import { compareAssessment } from '../assessment/compare'
import type { Assessment } from '../assessment/types'
import { EXPERIENCE_LABELS, type ExperienceLevel } from '../profile/types'
import { daysBetween, type DayKey } from '../shared/dates'
import { MUSCLE_GROUP_LABELS, type MuscleGroup, type WorkoutSession } from '../workouts/types'
import { estimateBodyFat, type BodyFatEstimate, type BodyFatMissing, type ScanSex } from './body-fat'
import { diagnoseScan, SOMATOTYPE_LABELS, type BuildEstimate, type ScanDiagnosis } from './diagnosis'
import type { Measurements, ScanPose } from './measure'
import { nutritionGuide } from './nutrition'
import {
  CORE_SHAPE,
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
  /** El párrafo de AXIS sobre la categoría. */
  text: string
  /** Lo medido, una línea por medida, para quien quiera el detalle. */
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
  /** El % de grasa estimado (enmienda del 2026-10-14), si se pudo estimar. */
  bodyFat: BodyFatEstimate | null
  /** Complexión, zonas que destacan, zonas a priorizar y asimetrías, deducidas de las fotos (D-068). */
  diagnosis: ScanDiagnosis
}

/** Zonas por las que se pregunta: las que un adolescente reconoce al mirarse. */
export type ScanZone = 'pecho' | 'espalda' | 'hombros' | 'brazos' | 'piernas' | 'core'
export const SCAN_ZONES: readonly ScanZone[] = ['pecho', 'espalda', 'hombros', 'brazos', 'piernas', 'core']
export const SCAN_ZONE_LABELS: Record<ScanZone, string> = {
  pecho: 'pecho',
  espalda: 'espalda',
  hombros: 'hombros',
  brazos: 'brazos',
  piernas: 'piernas',
  core: 'core',
}

export type ScanPriority = 'musculo' | 'definir' | 'fuerza' | 'equilibrio'
export const SCAN_PRIORITY_LABELS: Record<ScanPriority, string> = {
  musculo: 'ganar músculo',
  definir: 'que se note más el músculo',
  fuerza: 'ganar fuerza',
  equilibrio: 'equilibrar el cuerpo',
}

/**
 * Lo que el usuario responde antes de las fotos (D-023). Desde D-068 la
 * complexión y las zonas ya no se preguntan: las deduce `diagnosis.ts`. Los
 * escaneos anteriores pueden traer aún `build`, `strongZones` y `weakZones`:
 * se ignoran.
 */
export type ScanSelfReport = {
  priority: ScanPriority | null
  /** Solo para elegir la fórmula de la grasa estimada. Ausente en los escaneos anteriores. */
  sex?: ScanSex | null
}

export type ScanInput = {
  shots: PoseShots
  assessments?: readonly Assessment[]
  sessions?: readonly WorkoutSession[]
  experience?: ExperienceLevel | null
  bodyFatPct?: number | null
  /** Altura y edad del perfil: la altura da la escala de la grasa estimada. */
  body?: { heightCm: number; age: number; weightKg?: number } | null
  selfReport?: ScanSelfReport | null
  /** El escaneo anterior, para ver cómo han cambiado las zonas. */
  previous?: { measurements: PoseShots; dayKey: DayKey } | null
  /** Día de referencia para el historial de entrenamiento. */
  today?: DayKey
}

const PLURAL_ZONES: readonly ScanZone[] = ['hombros', 'brazos', 'piernas']
const ZONE_PRONOUN: Record<ScanZone, string> = { pecho: 'lo', espalda: 'la', hombros: 'los', brazos: 'los', piernas: 'las', core: 'lo' }

/** Ejercicios del catálogo para dar prioridad a una zona. */
const ZONE_EXERCISES: Record<ScanZone, string[]> = {
  pecho: ['flexiones', 'press-suelo-unilateral'],
  espalda: ['remo-unilateral', 'pullover-con-pesa', 'superman'],
  hombros: ['press-hombro-unilateral', 'flexion-pica'],
  brazos: ['curl-biceps-unilateral', 'extension-triceps-unilateral'],
  piernas: ['zancada-bulgara', 'sentadilla-con-pesa'],
  core: ['plancha', 'superman'],
}

/** Ventana del historial de entrenamiento que se mira. */
export const TRAINING_WINDOW_DAYS = 56

// ---------------------------------------------------------------------------
// Combinar las fotos de cada pose
// ---------------------------------------------------------------------------

const POSE_NAMES: Record<ScanPose, string> = {
  front: 'De frente',
  side: 'De perfil',
  squat_side: 'Sentadilla de perfil',
  squat_front: 'Sentadilla de frente',
  arms_up: 'Brazos arriba',
  flex: 'Bíceps flexionado',
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Mediana de una medida entre las fotos de una pose; `null` si no hay datos o varían demasiado. */
/**
 * La medida estable de una pose: la mediana de sus fotos, o `null` si no hay
 * datos o cambia más que su margen entre fotos. El mismo criterio para el
 * resumen y para la comparación entre escaneos.
 */
export function stableValue(shots: PoseShots, pose: ScanPose, key: string): number | null {
  return combine(shots, pose, key, new Set())
}

function combine(shots: PoseShots, pose: ScanPose, key: string, notes: Set<string>): number | null {
  const values = (shots[pose] ?? [])
    .map((m) => m[key]?.value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return null
  const range = Math.max(...values) - Math.min(...values)
  const tolerance = STABILITY_TOLERANCE[key]
  if (values.length > 1 && tolerance !== undefined && range > tolerance) {
    notes.add(`${POSE_NAMES[pose]}: algunas medidas cambian mucho entre fotos, así que no las he tenido en cuenta. Repítelas con el mismo montaje.`)
    return null
  }
  return median(values)
}

// ---------------------------------------------------------------------------
// Puntuar y redactar
// ---------------------------------------------------------------------------

/** 100 hasta `good`, 0 desde `poor`, lineal entre medias. Sirve en los dos sentidos. */
export function scoreOn(value: number, scale: Scale): number {
  const { good, poor } = scale
  const t = (value - good) / (poor - good)
  return Math.round(100 * Math.min(1, Math.max(0, 1 - t)))
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length
const one = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`)

/**
 * Una medida puntuada, con todo lo que AXIS dice de ella: el punto fuerte, el
 * área de mejora, por qué importa y qué hacer.
 */
type Finding = {
  score: number
  detail: string
  strength: string
  improvement: string
  why: string
  action?: ScanAction
  /** Medidas que dicen casi lo mismo (las dos de la rodilla, las dos de brazos arriba): en las listas, solo una. */
  group?: 'knees' | 'overhead'
  /** La que se queda de su grupo, si está: la que nombra el lado. */
  lead?: boolean
}

const ACTIONS = {
  sideBalance: {
    text: 'Trabajo a una pierna y a un brazo para que los dos lados trabajen por separado y se igualen.',
    exerciseIds: ['zancada-bulgara', 'peso-muerto-unilateral', 'remo-unilateral'],
  },
  shoulderMobility: {
    text: 'Movilidad y fuerza de hombro por encima de la cabeza, empezando por el lado que menos sube.',
    exerciseIds: ['pullover-con-pesa', 'ytw-boca-abajo', 'flexion-pica'],
  },
  kneeControl: {
    text: 'Control de rodilla: bajar lento en sentadillas y zancadas con la rodilla en línea con el pie, y más glúteo.',
    exerciseIds: ['zancada-atras', 'puente-gluteos', 'sentadilla-isometrica-pared'],
  },
  squatDepth: {
    text: 'Ganar profundidad en la sentadilla poco a poco, sin perder la técnica.',
    exerciseIds: ['sentadilla', 'sentadilla-isometrica-pared', 'puente-gluteos'],
  },
  upperBack: {
    text: 'Más espalda alta: tirón y extensión de espalda para que la postura no dependa de pensar en ella.',
    exerciseIds: ['ytw-boca-abajo', 'superman', 'remo-unilateral'],
  },
} satisfies Record<string, ScanAction>

function symmetryFindings(shots: PoseShots, notes: Set<string>): Finding[] {
  const out: Finding[] = []
  const shoulders = combine(shots, 'front', 'shoulderTiltDeg', notes)
  if (shoulders !== null) {
    const side = shoulders > 0 ? 'izquierdo' : 'derecho'
    out.push({
      score: scoreOn(Math.abs(shoulders), SYMMETRY_SCALES.shoulderTiltDeg),
      detail: `Línea de hombros: ${one(Math.abs(shoulders))}°${Math.abs(shoulders) >= 1 ? ` (el ${side} más alto)` : ''}`,
      strength: 'Tus hombros están nivelados',
      improvement: `El hombro ${side} queda algo más alto que el otro`,
      why: 'suele venir de que un lado trabaja más que el otro en el día a día',
      action: ACTIONS.sideBalance,
    })
  }
  const hips = combine(shots, 'front', 'hipTiltDeg', notes)
  if (hips !== null) {
    const side = hips > 0 ? 'izquierda' : 'derecha'
    out.push({
      score: scoreOn(Math.abs(hips), SYMMETRY_SCALES.hipTiltDeg),
      detail: `Línea de caderas: ${one(Math.abs(hips))}°${Math.abs(hips) >= 1 ? ` (la ${side} más alta)` : ''}`,
      strength: 'Tus caderas están niveladas',
      improvement: `La cadera ${side} queda algo más alta que la otra`,
      why: 'el trabajo a una pierna ayuda a que las dos se repartan igual el esfuerzo',
      action: ACTIONS.sideBalance,
    })
  }
  const arms = combine(shots, 'arms_up', 'armsDiffDeg', notes)
  if (arms !== null) {
    const worse = arms > 0 ? 'derecho' : 'izquierdo'
    out.push({
      score: scoreOn(Math.abs(arms), SYMMETRY_SCALES.armsDiffDeg),
      detail: `Brazos arriba, diferencia entre lados: ${one(Math.abs(arms))}°`,
      strength: 'Tus dos brazos suben igual por encima de la cabeza',
      improvement: `El brazo ${worse} sube menos que el otro (${one(Math.abs(arms))}°)`,
      why: 'un hombro que sube menos acaba compensando con la espalda en los ejercicios por encima de la cabeza',
      action: ACTIONS.shoulderMobility,
      group: 'overhead',
      lead: true,
    })
  }
  const left = combine(shots, 'squat_front', 'leftKneeInPct', notes)
  const right = combine(shots, 'squat_front', 'rightKneeInPct', notes)
  if (left !== null && right !== null) {
    const diff = Math.abs(Math.max(0, left) - Math.max(0, right))
    out.push({
      score: scoreOn(diff, SYMMETRY_SCALES.kneesDiffPct),
      detail: `Sentadilla de frente, diferencia entre rodillas: ${Math.round(diff)} % de la anchura de cadera`,
      strength: 'Tus dos rodillas se comportan igual en la sentadilla',
      improvement: 'En la sentadilla, una rodilla se mueve distinto que la otra',
      why: 'cuando un lado controla peor, el otro carga más',
      action: ACTIONS.kneeControl,
      group: 'knees',
    })
  }
  return out
}

function postureFindings(shots: PoseShots, notes: Set<string>): Finding[] {
  const out: Finding[] = []
  const head = combine(shots, 'side', 'headForwardPct', notes)
  if (head !== null) {
    const forward = Math.max(0, head)
    out.push({
      score: scoreOn(forward, POSTURE_SCALES.headForwardPct),
      detail: `Cabeza respecto al hombro: ${forward < 1 ? 'alineada' : `${one(forward)} % del tronco por delante`}`,
      strength: 'Llevas la cabeza bien alineada sobre los hombros',
      improvement: 'La cabeza queda adelantada respecto a los hombros',
      why: 'es muy habitual con el móvil y los estudios, y una espalda alta más fuerte ayuda a sostenerla',
      action: ACTIONS.upperBack,
    })
  }
  const depth = combine(shots, 'squat_side', 'kneeAngleDeg', notes)
  if (depth !== null) {
    out.push({
      score: scoreOn(depth, POSTURE_SCALES.squatKneeAngleDeg),
      detail: `Sentadilla, ángulo de rodilla abajo: ${Math.round(depth)}°`,
      strength: 'Bajas bien en la sentadilla',
      improvement: 'La sentadilla se queda algo alta',
      why: 'más recorrido significa más trabajo de piernas y glúteo en cada repetición',
      action: ACTIONS.squatDepth,
    })
  }
  const lean = combine(shots, 'squat_side', 'trunkLeanDeg', notes)
  if (lean !== null) {
    out.push({
      score: scoreOn(lean, POSTURE_SCALES.trunkLeanDeg),
      detail: `Sentadilla, inclinación del tronco: ${Math.round(lean)}°`,
      strength: 'Mantienes el tronco controlado en la sentadilla',
      improvement: 'El tronco se va bastante hacia delante en la sentadilla',
      why: 'eso pasa parte del trabajo de las piernas a la zona baja de la espalda',
      action: ACTIONS.upperBack,
    })
  }
  const left = combine(shots, 'squat_front', 'leftKneeInPct', notes)
  const right = combine(shots, 'squat_front', 'rightKneeInPct', notes)
  if (left !== null || right !== null) {
    const l = left !== null ? Math.max(0, left) : -1
    const r = right !== null ? Math.max(0, right) : -1
    const inward = Math.max(l, r, 0)
    const which = l >= r ? 'izquierda' : 'derecha'
    out.push({
      score: scoreOn(inward, POSTURE_SCALES.kneeInwardPct),
      detail: `Sentadilla de frente, rodilla hacia dentro: ${inward < 3 ? 'no' : `${Math.round(inward)} % de la anchura de cadera (la ${which})`}`,
      strength: 'Tus rodillas siguen la línea de los pies en la sentadilla',
      improvement: `En la sentadilla, la rodilla ${which} se va hacia dentro`,
      why: 'con más carga, una rodilla que se cierra trabaja peor; se corrige con control y glúteo',
      action: ACTIONS.kneeControl,
      group: 'knees',
      lead: true,
    })
  }
  const leftArm = combine(shots, 'arms_up', 'leftArmDeg', notes)
  const rightArm = combine(shots, 'arms_up', 'rightArmDeg', notes)
  if (leftArm !== null && rightArm !== null) {
    out.push({
      score: scoreOn(Math.min(leftArm, rightArm), POSTURE_SCALES.armOverheadDeg),
      detail: `Brazos arriba: izquierdo ${Math.round(leftArm)}°, derecho ${Math.round(rightArm)}°`,
      strength: 'Tienes buen rango de hombro por encima de la cabeza',
      improvement: 'Los brazos no llegan del todo arriba sin compensar',
      why: 'el rango de hombro es la base de cualquier press y de la espalda alta',
      action: ACTIONS.shoulderMobility,
      group: 'overhead',
    })
  }
  return out
}

/** El párrafo de una categoría medida: lo que está bien, lo que conviene trabajar y por qué. */
function categoryText(findings: Finding[], empty: string): string {
  if (findings.length === 0) return empty
  const good = findings.filter((f) => f.score >= STRENGTH_FROM)
  const weak = [...findings].filter((f) => f.score <= IMPROVE_UNTIL).sort((a, b) => a.score - b.score)
  const middle = findings.filter((f) => f.score > IMPROVE_UNTIL && f.score < STRENGTH_FROM)
  const parts: string[] = []
  if (weak.length === 0 && middle.length === 0) {
    parts.push(`Aquí estás bien: ${lowerFirst(list(good.map((f) => lowerFirst(f.strength))))}.`)
    parts.push('Mantenerlo es cuestión de seguir entrenando los dos lados por igual.')
  } else {
    if (good.length) parts.push(`${list(good.map((f, i) => (i === 0 ? f.strength : lowerFirst(f.strength))))}.`)
    for (const f of weak.slice(0, 2)) parts.push(`${f.improvement}: ${f.why}.`)
    if (weak.length === 0 && middle.length) parts.push(`${middle[0].improvement}, aunque por poco: ${middle[0].why}.`)
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Desarrollo muscular: fuerza y entrenamiento reales
// ---------------------------------------------------------------------------

const AREA: Record<string, string> = { push: 'empuje', core: 'core', legs: 'piernas', pull: 'tirón' }
const MAIN_GROUPS: readonly MuscleGroup[] = ['pecho', 'espalda', 'hombros', 'brazos', 'piernas', 'gluteos']

type Development = { category: ScanCategory; strengths: string[]; improvements: string[]; actions: ScanAction[] }

function muscleDevelopment(input: ScanInput, diagnosis: ScanDiagnosis): Development {
  const done = completedAssessments(input.assessments ?? [])
  const sessions = (input.sessions ?? []).filter((s) => s.status === 'completed')
  const today = input.today ?? sessions.map((s) => s.dayKey).sort().at(-1) ?? null
  const recent = today ? sessions.filter((s) => { const age = daysBetween(s.dayKey, today); return age >= 0 && age < TRAINING_WINDOW_DAYS }) : []
  const base: ScanCategory = { key: 'muscleDevelopment', title: 'Desarrollo muscular', score: null, inIndex: false, text: '', details: [] }

  const { strongZones, weakZones } = diagnosis
  const hasZones =
    strongZones.length > 0 ||
    weakZones.length > 0 ||
    ZONES_MEASURED.some((z) => z.keys.some((key) => stableValue(input.shots, 'front', key) !== null)) ||
    CORE_ARMS_KEYS.some(([pose, key]) => stableValue(input.shots, pose, key) !== null)
  let strengthUp: string[] = []

  if (done.length === 0 && recent.length === 0 && !hasZones) {
    return {
      category: {
        ...base,
        text: 'La foto no muestra cuánto músculo tienes; eso lo estimo con tu fuerza y tu entrenamiento, y todavía no tengo datos de ninguno de los dos. Haz el test de evolución y tus primeras sesiones, y en el próximo escaneo te lo podré decir.',
      },
      strengths: [],
      improvements: [],
      actions: [],
    }
  }

  const parts: string[] = []
  const details: string[] = []
  const strengths: string[] = []
  const improvements: string[] = []
  const actions: ScanAction[] = []

  // Lo que dicen los datos, dicho primero.
  const sources: string[] = []
  if (recent.length) sources.push(`${recent.length} ${recent.length === 1 ? 'sesión' : 'sesiones'} en las últimas 8 semanas`)
  if (input.experience) sources.push(`nivel ${EXPERIENCE_LABELS[input.experience].toLowerCase()}`)
  if (done.length) sources.push(done.length === 1 ? 'tu test de evolución' : `tus ${done.length} tests de evolución`)
  if (done.length || recent.length) parts.push(`Lo estimo con tu fuerza y tu entrenamiento, no con la foto: ${list(sources)}.`)

  if (done.length >= 2) {
    const comparisons = compareAssessment(done[0], input.assessments ?? []) ?? []
    const up = comparisons.filter((c) => c.delta.kind !== 'baseline' && c.delta.trend === 'up').map((c) => AREA[c.test.key])
    strengthUp = up
    const stuck = comparisons.filter((c) => c.delta.kind !== 'baseline' && (c.delta.trend === 'down' || c.delta.trend === 'same')).map((c) => AREA[c.test.key])
    for (const c of comparisons) details.push(`${AREA[c.test.key].charAt(0).toUpperCase() + AREA[c.test.key].slice(1)}: ${c.delta.kind === 'baseline' ? 'línea base' : c.delta.trend === 'up' ? 'sube' : c.delta.trend === 'down' ? 'baja' : c.delta.trend === 'same' ? 'igual' : 'mixto'}`)
    if (up.length) {
      parts.push(`Tu fuerza sube en ${list(up)}: ese músculo está respondiendo.`)
      strengths.push(`Tu fuerza sube en ${list(up)}`)
    }
    if (stuck.length) {
      parts.push(`En ${list(stuck)} no hay progreso respecto al test anterior, y es donde más margen tienes.`)
      improvements.push(`Tu fuerza no sube en ${list(stuck)}`)
      actions.push({ text: `Más frecuencia y progresión de carga en ${list(stuck)}: elígelas cuando AXIS te las ofrezca como opción.`, exerciseIds: [] })
    }
  } else if (done.length === 1) {
    parts.push('Tu primer test es la referencia: con el siguiente veremos qué zonas crecen más rápido.')
  }

  const counts = new Map<MuscleGroup, number>()
  for (const s of recent) for (const g of s.muscleGroups) counts.set(g, (counts.get(g) ?? 0) + 1)
  const ordered = MAIN_GROUPS.map((g) => ({ g, n: counts.get(g) ?? 0 })).sort((a, b) => a.n - b.n)
  const leastTrained = recent.length && ordered[0].n < ordered[ordered.length - 1].n ? ordered[0].g : null

  if (recent.length) {
    const least = ordered[0]
    const most = ordered[ordered.length - 1]
    details.push(...MAIN_GROUPS.map((g) => `${MUSCLE_GROUP_LABELS[g]}: ${counts.get(g) ?? 0} sesiones`))
    if (most.n > least.n) {
      parts.push(`Has entrenado sobre todo ${MUSCLE_GROUP_LABELS[most.g].toLowerCase()} y poco ${MUSCLE_GROUP_LABELS[least.g].toLowerCase()}: para un desarrollo completo, ${MUSCLE_GROUP_LABELS[least.g].toLowerCase()} necesita más trabajo.`)
      improvements.push(`${MUSCLE_GROUP_LABELS[least.g]} es lo que menos has entrenado`)
      actions.push({ text: `Más ${MUSCLE_GROUP_LABELS[least.g].toLowerCase()} en tus semanas: elígelo cuando AXIS te lo ofrezca como opción.`, exerciseIds: [] })
    }
    const perWeek = recent.length / (TRAINING_WINDOW_DAYS / 7)
    if (perWeek >= 2.5) strengths.push(`Entrenas con constancia (${one(perWeek)} sesiones por semana)`)
    else parts.push(`Con ${one(perWeek)} sesiones por semana, la constancia es lo que más te hará crecer ahora.`)
  }

  // Lo que destaca y lo que va por detrás en tus fotos (D-068); el historial lo confirma o lo matiza.
  if (strongZones.length) {
    const zones = list(strongZones.map((z) => SCAN_ZONE_LABELS[z]))
    parts.push(`En tus fotos destacan ${zones} frente a un físico equilibrado.`)
    strengths.push(`En tus fotos destacan ${zones}`)
  }
  if (weakZones.length) {
    for (const zone of weakZones) {
      const trained = counts.get(zone) ?? 0
      const median = ordered[Math.floor(ordered.length / 2)]?.n ?? 0
      const plural = PLURAL_ZONES.includes(zone)
      const behind = `En tus fotos, ${plural ? 'tus' : 'tu'} ${SCAN_ZONE_LABELS[zone]} ${plural ? 'van' : 'va'} por detrás`
      if (leastTrained === zone) {
        parts.push(`${behind} y tu historial lo confirma: es lo que menos has entrenado, y ahí está tu mayor margen.`)
      } else if (recent.length && trained > 0 && trained >= median) {
        parts.push(`${behind} aunque ${ZONE_PRONOUN[zone]} entrenas a menudo: ahí lo que más ayuda es ir subiendo la carga, no solo repetir.`)
      } else {
        parts.push(`${behind} del resto.`)
      }
    }
    const zones = list(weakZones.map((z) => SCAN_ZONE_LABELS[z]))
    improvements.push(`Más desarrollo en ${zones}`)
    actions.unshift({
      // Desde D-041 la prioridad la pone el motor: más series a la semana en esas zonas.
      text: `Dar prioridad a ${zones}: ya ${weakZones.length === 1 ? 'le' : 'les'} subo las series de la semana y ${weakZones.length === 1 ? 'la' : 'las'} elijo antes en tus sesiones.`,
      exerciseIds: Array.from(new Set(weakZones.flatMap((z) => ZONE_EXERCISES[z]))).slice(0, 4),
    })
  }

  const zones = zoneDevelopment(input.shots, input.previous ?? null, strengthUp, done.length >= 2)
  parts.push(...zones.parts)
  details.push(...zones.details)
  strengths.push(...zones.strengths)

  const coreArms = coreAndArms(input.shots)
  parts.push(...coreArms.parts)
  details.push(...coreArms.details)
  strengths.push(...coreArms.strengths)

  return { category: { ...base, text: parts.join(' '), details }, strengths, improvements, actions }
}

/**
 * Zonas que se miden a lo largo de su hueso (D-023, enmienda del 2026-10-13):
 * área media (`<key>Mean`) y contorno máximo (`<key>Peak`) de la silueta
 * respecto al propio hueso.
 */
export const ZONE_PROFILES: readonly { key: string; label: string; of: string; name: string; areas: string[] }[] = [
  { key: 'upperArm', label: 'Brazo', of: 'del brazo', name: 'tu brazo', areas: ['empuje', 'tirón'] },
  { key: 'forearm', label: 'Antebrazo', of: 'del antebrazo', name: 'tu antebrazo', areas: ['tirón'] },
  { key: 'thigh', label: 'Muslo', of: 'del muslo', name: 'tu muslo', areas: ['piernas'] },
  { key: 'calf', label: 'Pantorrilla', of: 'de la pantorrilla', name: 'tu pantorrilla', areas: ['piernas'] },
]

/**
 * Zonas medidas en la foto: los hombros respecto al tronco y cada zona respecto
 * a su hueso. Es la forma en la foto, no lo que hay dentro: solo se habla de
 * músculo si la zona crece **y** la fuerza de esa zona sube en los tests. Nunca
 * se habla de grasa.
 */
const ZONES_MEASURED: readonly { label: string; name: string; plural: boolean; areas: string[]; keys: string[] }[] = [
  { label: 'Hombros', name: 'tus hombros', plural: true, areas: ['empuje'], keys: ['shoulderToTorso'] },
  ...ZONE_PROFILES.map((z) => ({ label: z.label, name: z.name, plural: false, areas: z.areas, keys: [`${z.key}Mean`, `${z.key}Peak`] })),
]

const pct = (n: number) => `${Math.round(n * 100)} %`

function zoneDevelopment(
  shots: PoseShots,
  previous: { measurements: PoseShots; dayKey: DayKey } | null,
  strengthUp: readonly string[],
  hasTestTrend: boolean,
): { parts: string[]; details: string[]; strengths: string[] } {
  const measured = ZONES_MEASURED.map((z) => ({ ...z, values: z.keys.map((key) => stableValue(shots, 'front', key)) })).filter((z) =>
    z.values.some((v) => v !== null),
  )
  if (measured.length === 0) return { parts: [], details: [], strengths: [] }
  const details = measured.map((z) => {
    const [main, peak] = z.values
    if (z.keys.length === 1) return `${z.label}: ${pct(main!)} de su longitud de ancho (en la foto)`
    const shown = [main !== null ? `ancho medio ${pct(main)}` : null, peak !== null ? `máximo ${pct(peak)}` : null].filter(Boolean)
    return `${z.label}: ${shown.join(', ')} de su longitud (en la foto)`
  })
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const reference = {
    parts: ['En la foto mido el área y el contorno de cada zona respecto a su propio hueso: este escaneo es tu referencia. En el próximo verás si crecen, y si tu fuerza sube a la vez, será coherente con más músculo.'],
    details,
    strengths: [],
  }

  if (!previous) return reference

  const parts: string[] = []
  const strengths: string[] = []
  let compared = 0
  for (const zone of measured) {
    /*
     * Cada medida de la zona se compara con su margen. Crece si alguna sube más
     * que su margen y ninguna baja más que el suyo; al revés, decrece. Si una
     * sube y otra baja, no hay un cambio claro y no se dice nada.
     */
    const deltas = zone.keys.flatMap((key, i) => {
      const now = zone.values[i]
      const before = stableValue(previous.measurements, 'front', key)
      if (now === null || before === null) return []
      const delta = now - before
      const tolerance = STABILITY_TOLERANCE[key] ?? 0
      return [Math.abs(delta) <= tolerance ? 0 : Math.sign(delta)]
    })
    if (deltas.length === 0) continue
    compared++
    const up = deltas.includes(1)
    const down = deltas.includes(-1)
    if (up === down) continue
    const verb = zone.plural ? 'ocupan' : 'ocupa'
    if (up) {
      const backed = zone.areas.filter((a) => strengthUp.includes(a))
      if (backed.length) {
        parts.push(`${cap(zone.name)} ${verb} más anchura que en tu escaneo anterior y tu fuerza de ${list(backed)} ha subido: es coherente con más músculo.`)
        strengths.push(`${cap(zone.name)} ${zone.plural ? 'han crecido' : 'ha crecido'} junto con tu fuerza`)
      } else if (hasTestTrend) {
        parts.push(`${cap(zone.name)} ${verb} más anchura que en tu escaneo anterior, pero tu fuerza ahí no ha subido: no puedo atribuirlo a músculo.`)
      } else {
        parts.push(`${cap(zone.name)} ${verb} más anchura que en tu escaneo anterior. Sin un test que muestre más fuerza, no puedo saber si es músculo.`)
      }
    } else {
      parts.push(`${cap(zone.name)} ${verb} algo menos anchura que en tu escaneo anterior.`)
    }
  }
  // El escaneo anterior no tiene estas medidas (otro método): este es la referencia.
  if (compared === 0) return reference
  if (parts.length === 0) parts.push('La anchura de tus zonas no ha cambiado más que el margen de medida desde tu escaneo anterior.')
  return { parts, details, strengths }
}

/** Medidas de core y brazos (enmienda del 2026-10-14), con la pose de la que salen. */
const CORE_ARMS_KEYS: readonly [ScanPose, string][] = [
  ['side', 'bellyBulgePct'],
  ['front', 'flankBulgePct'],
  ['front', 'armToForearm'],
  ['flex', 'flexArmPeak'],
]

/** Recto, algo hacia fuera o claramente hacia fuera, según `CORE_SHAPE`. */
function coreShape(value: number, scale: { flat: number; out: number }): 'flat' | 'some' | 'out' {
  return value <= scale.flat ? 'flat' : value < scale.out ? 'some' : 'out'
}

/**
 * Core y brazos (D-023, enmienda del 2026-10-14). El core es la forma de la
 * silueta respecto a la recta costillas–cresta: puede ser músculo o grasa, y se
 * dice así. Los brazos, cuánto más ancho es el brazo que el antebrazo y, con la
 * pose flexionada, el pico del bíceps. Sin normas de población: es la referencia
 * para compararte contigo mismo.
 */
function coreAndArms(shots: PoseShots): { parts: string[]; details: string[]; strengths: string[] } {
  const parts: string[] = []
  const details: string[] = []
  const strengths: string[] = []

  const belly = stableValue(shots, 'side', 'bellyBulgePct')
  const flanks = stableValue(shots, 'front', 'flankBulgePct')
  if (belly !== null || flanks !== null) {
    const said: string[] = []
    if (belly !== null) {
      const shape = coreShape(belly, CORE_SHAPE.belly)
      said.push(
        shape === 'flat'
          ? 'de perfil, tu abdomen queda recto respecto a la línea que va de las costillas a la cadera'
          : shape === 'some'
            ? `de perfil, tu abdomen sale algo de la línea que va de las costillas a la cadera (${one(belly)} % del tronco)`
            : `de perfil, tu abdomen sale claramente de la línea que va de las costillas a la cadera (${one(belly)} % del tronco)`,
      )
      details.push(`Abdomen de perfil: ${one(belly)} % del tronco respecto a la línea costillas–cadera`)
      if (shape === 'flat') strengths.push('Tu abdomen se ve recto de perfil')
    }
    if (flanks !== null) {
      const shape = flanks < 0 ? 'in' : coreShape(flanks, CORE_SHAPE.flanks)
      said.push(
        shape === 'in'
          ? 'de frente, tu cintura se estrecha entre las costillas y la cadera'
          : shape === 'flat'
            ? 'de frente, tus flancos van rectos de las costillas a la cadera'
            : `de frente, tus flancos salen ${shape === 'some' ? 'algo' : 'claramente'} entre las costillas y la cadera`,
      )
      details.push(`Flancos: ${one(flanks)} % del tronco por lado respecto a la línea costillas–cadera`)
    }
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
    parts.push(`${cap(list(said))}. Es la forma en la foto: puede ser músculo o grasa, y con los próximos escaneos veremos hacia dónde va.`)
  }

  const ratio = stableValue(shots, 'front', 'armToForearm')
  const flexPeak = stableValue(shots, 'flex', 'flexArmPeak')
  const relaxedPeak = stableValue(shots, 'front', 'upperArmPeak')
  if (ratio !== null) {
    parts.push(
      ratio > 1
        ? `Tu brazo es un ${Math.round((ratio - 1) * 100)} % más ancho que tu antebrazo en la foto: el bíceps y el tríceps son los que más mueven esta relación.`
        : 'Tu brazo y tu antebrazo tienen una anchura parecida en la foto: el bíceps y el tríceps son los que más pueden cambiar esa relación.',
    )
    details.push(`Brazo / antebrazo: ${(Math.round(ratio * 100) / 100).toString().replace('.', ',')}`)
  }
  if (flexPeak !== null) {
    details.push(`Brazo flexionado, pico: ${pct(flexPeak)} de su longitud`)
    if (relaxedPeak !== null && flexPeak > relaxedPeak) {
      parts.push(`Al flexionar, el pico de tu brazo pasa del ${pct(relaxedPeak)} al ${pct(flexPeak)} de su longitud: es la medida que mejor seguirá cómo crece el bíceps.`)
    } else {
      parts.push(`Con el bíceps flexionado, el pico de tu brazo es el ${pct(flexPeak)} de su longitud: es la medida que mejor seguirá cómo crece.`)
    }
  }
  return { parts, details, strengths }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export function summarizeScan(input: ScanInput): ScanSummary {
  const notes = new Set<string>()
  const { shots } = input

  // Un solo aviso para todas las poses con una sola foto, no uno por pose.
  const single = (Object.keys(shots) as ScanPose[]).filter((pose) => (shots[pose]?.length ?? 0) === 1)
  if (single.length) {
    const which = single.length === Object.keys(shots).length ? 'por pose' : `en ${list(single.map((p) => POSE_NAMES[p].toLowerCase()))}`
    notes.add(`Con una sola foto ${which} no puedo comprobar que las medidas sean estables: la próxima vez, haz 2 o 3 de cada pose.`)
  }
  // La longitud de los huesos no se entrena: una diferencia grande delata una foto girada.
  for (const key of ['armAsymmetryPct', 'legAsymmetryPct']) {
    const limb = combine(shots, 'front', key, notes)
    if (limb !== null && Math.abs(limb) > LIMB_LENGTH_PHOTO_CHECK_PCT) {
      notes.add('De frente: el cuerpo parece girado respecto a la cámara. Ponte totalmente de frente para que la comparación entre lados sea fiable.')
    }
  }

  const sym = symmetryFindings(shots, notes)
  const pm = postureFindings(shots, notes)
  const read = (pose: ScanPose, key: string) => combine(shots, pose, key, notes)
  const fat = estimateBodyFat(read, input.selfReport?.sex, input.body?.heightCm)
  // Lo que antes se preguntaba, deducido de las fotos y del perfil (D-068).
  const diagnosis = diagnoseScan({
    read,
    sex: input.selfReport?.sex,
    body: input.body ?? null,
    bodyFatPct: input.bodyFatPct ?? (fat.ok ? fat.estimate.pct : null),
  })
  const development = muscleDevelopment(input, diagnosis)

  const v = combine(shots, 'front', 'shoulderToWaist', notes)
  const legs = combine(shots, 'front', 'legToTorso', notes)
  // Cintura / cadera: forma en la foto, dicha tal cual; nunca se interpreta como grasa.
  const waist = combine(shots, 'front', 'waistToHip', notes)
  const two = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')
  const proportion: ScanCategory = {
    key: 'proportion',
    title: 'Proporciones',
    // Se puntúa frente al objetivo que declare el usuario (D-023); hasta entonces, se mide y se compara consigo mismo.
    score: null,
    inIndex: true,
    text:
      v !== null || legs !== null || waist !== null
        ? `${v !== null ? `La relación entre la anchura de tus hombros y tu cintura es ${one(v)}. ` : ''}${waist !== null ? `En la foto, tu cintura mide un ${pct(waist)} de la anchura de tu cadera. ` : ''}La espalda y los hombros son lo que más cambia estas relaciones al entrenar, así que las iremos siguiendo escaneo a escaneo.`
        : 'Necesito una foto de frente con los brazos algo separados del cuerpo para medir tus proporciones.',
    details: [
      ...(v !== null ? [`Hombros / cintura: ${one(v)}`] : []),
      ...(waist !== null ? [`Cintura / cadera: ${two(waist)}`] : []),
      ...(legs !== null ? [`Piernas / tronco: ${one(legs)}`] : []),
    ],
  }

  const composition: ScanCategory = {
    key: 'composition',
    title: 'Composición corporal',
    score: null,
    inIndex: false,
    text: compositionText(input.selfReport ?? null, input.bodyFatPct ?? null, fat, diagnosis.build),
    details: [
      ...(fat.ok
        ? [
            `Grasa estimada: ${one(fat.estimate.pct)} % (±${fat.estimate.marginPct} %)`,
            `Perímetros estimados: cuello ${Math.round(fat.estimate.neckCm)} cm, cintura ${Math.round(fat.estimate.waistCm)} cm${fat.estimate.hipCm !== null ? `, cadera ${Math.round(fat.estimate.hipCm)} cm` : ''}`,
          ]
        : []),
      ...(diagnosis.build ? [`Complexión (escala Heath-Carter): ${buildRatings(diagnosis.build)}`] : []),
    ],
  }

  const symmetry: ScanCategory = {
    key: 'symmetry',
    title: 'Simetría',
    score: sym.length ? Math.round(mean(sym.map((f) => f.score))) : null,
    inIndex: true,
    text: categoryText(sym, 'Necesito fotos de frente, de brazos arriba o de sentadilla de frente para valorar tu simetría.'),
    details: sym.map((f) => f.detail),
  }
  const posture: ScanCategory = {
    key: 'postureMobility',
    title: 'Postura y movilidad',
    score: pm.length ? Math.round(mean(pm.map((f) => f.score))) : null,
    inIndex: true,
    text: categoryText(pm, 'Necesito fotos de perfil, de sentadilla o de brazos arriba para valorar tu postura y movilidad.'),
    details: pm.map((f) => f.detail),
  }

  const categories = [proportion, symmetry, posture, development.category, composition]

  // Índice: media ponderada de lo que tiene nota. Sin simetría ni postura no hay índice.
  const weighted = categories
    .filter((c) => c.inIndex && c.score !== null)
    .map((c) => ({ score: c.score as number, weight: SCAN_INDEX_WEIGHTS[c.key as keyof typeof SCAN_INDEX_WEIGHTS] }))
  const index =
    symmetry.score !== null && posture.score !== null
      ? Math.round(weighted.reduce((s, w) => s + w.score * w.weight, 0) / weighted.reduce((s, w) => s + w.weight, 0))
      : null

  const measured = [...sym, ...pm]
  // Dos medidas que dicen casi lo mismo (las dos de la rodilla, las dos de brazos
  // arriba) no se repiten en las listas: se queda la más clara.
  const weak = onePerGroup(measured.filter((f) => f.score <= IMPROVE_UNTIL).sort((a, b) => a.score - b.score))
  const strong = onePerGroup(measured.filter((f) => f.score >= STRENGTH_FROM).sort((a, b) => b.score - a.score))
  const strengths = [...strong.map((f) => f.strength), ...development.strengths]
  const improvements = [...weak.map((f) => f.improvement), ...development.improvements]

  // Tres pasos: lo que el usuario quiere priorizar, lo que más le frena y, si hay
  // prioridad, la alimentación.
  const priority = input.selfReport?.priority ?? null
  const hasZonePriority = diagnosis.weakZones.length > 0
  const training: ScanAction[] = []
  for (const action of [
    ...(priority && !hasZonePriority ? [PRIORITY_ACTIONS[priority]] : []),
    ...development.actions.filter((a) => a.exerciseIds.length > 0),
    ...weak.map((f) => f.action).filter((a): a is ScanAction => !!a),
    ...development.actions.filter((a) => a.exerciseIds.length === 0),
  ]) {
    if (!training.some((a) => a.text === action.text)) training.push(action)
  }
  const guide = nutritionGuide({
    priority,
    age: input.body?.age ?? null,
    weightKg: input.body?.weightKg ?? null,
    sex: input.selfReport?.sex ?? null,
    bodyFatPct: fat.ok ? fat.estimate.pct : null,
  })
  const actions = guide ? [...training.slice(0, 2), { text: `Alimentación: ${guide}`, exerciseIds: [] }] : training.slice(0, 3)

  return {
    index,
    overview: overviewText(index, strong, weak, input.selfReport ?? null, diagnosis, fat.ok ? fat.estimate : null),
    categories,
    strengths,
    improvements,
    actions,
    photoNotes: Array.from(notes),
    bodyFat: fat.ok ? fat.estimate : null,
    diagnosis,
  }
}

/** «Mesomorfa con tendencia ectomorfa», en minúscula para ir dentro de una frase. */
export function buildText(build: BuildEstimate): string {
  const main = SOMATOTYPE_LABELS[build.type].toLowerCase()
  return build.leaning ? `${main} con tendencia ${SOMATOTYPE_LABELS[build.leaning].toLowerCase()}` : main
}

function buildRatings(build: BuildEstimate): string {
  const short = { endomorfa: 'endo', mesomorfa: 'meso', ectomorfa: 'ecto' } as const
  return (['endomorfa', 'mesomorfa', 'ectomorfa'] as const)
    .filter((k) => build.ratings[k] !== undefined)
    .map((k) => `${short[k]} ${one(build.ratings[k]!)}`)
    .join(' · ')
}

/** Qué componentes faltaron, para decir con qué se estimó. */
const BUILD_SOURCES: Record<keyof BuildEstimate['ratings'], string> = {
  ectomorfa: 'tu altura y tu peso',
  endomorfa: 'tu grasa estimada',
  mesomorfa: 'la «V» de hombros a cintura de tus fotos',
}

/**
 * Composición corporal (enmienda del 2026-10-14): el % de grasa estimado con la
 * fórmula de la Marina, siempre con su margen y sus límites, o qué falta para
 * estimarlo. Nunca a partir de texturas ni sombras. Después, cómo se describe el
 * usuario y qué implica para su entrenamiento según su prioridad.
 */
function compositionText(
  self: ScanSelfReport | null,
  bodyFatPct: number | null,
  fat: { ok: true; estimate: BodyFatEstimate } | { ok: false; missing: BodyFatMissing },
  build: BuildEstimate | null,
): string {
  const parts: string[] = []
  if (fat.ok) {
    const e = fat.estimate
    const hip = e.hipCm !== null ? `, tu cadera (${Math.round(e.hipCm)} cm)` : ''
    parts.push(
      `Tu grasa corporal estimada es del ${one(e.pct)} % (±${e.marginPct} %). La calculo con la fórmula de la Marina de EE. UU. a partir del perímetro de tu cuello (${Math.round(e.neckCm)} cm), tu cintura (${Math.round(e.waistCm)} cm)${hip} y tu altura, medidos en tus fotos de frente y de perfil.`,
      'Es una estimación, no una medida médica: la ropa y la postura la mueven y no ve la grasa interna. Lo que más vale es cómo cambia de un escaneo a otro con el mismo montaje.',
    )
  } else {
    parts.push(BODY_FAT_MISSING[fat.missing])
  }
  if (typeof bodyFatPct === 'number') parts.push(`Tu dato registrado es ${one(bodyFatPct)} % de grasa corporal.`)
  if (build) {
    const sources = (Object.keys(build.ratings) as (keyof BuildEstimate['ratings'])[]).map((k) => BUILD_SOURCES[k])
    parts.push(`Por tus proporciones, tu complexión es ${buildText(build)}: la estimo con ${list(sources)}. Es una orientación para tu entrenamiento, no una etiqueta fija.`)
  }
  if (self?.priority) {
    const priority = SCAN_PRIORITY_LABELS[self.priority]
    const plan: Record<ScanPriority, string> = {
      musculo:
        build?.type === 'ectomorfa'
          ? 'Con una complexión ectomorfa, lo que más te hará ganar músculo es progresar en carga semana a semana con ejercicios grandes y ser constante: AXIS irá subiendo la exigencia cuando tu recuperación lo permita.'
          : 'Para ganar músculo, lo que más cuenta es progresar en carga y entrenar cada zona con frecuencia: AXIS irá subiendo la exigencia cuando tu recuperación lo permita.',
      definir: 'Para que se note más el músculo, lo que cuenta es mantener un volumen de trabajo alto y constante mientras ganas músculo.',
      fuerza: 'Para ganar fuerza, lo que más cuenta es ir subiendo la carga con pocas repeticiones bien hechas y descansar lo suficiente entre series.',
      equilibrio: 'Para equilibrar el cuerpo, lo que más ayuda es el trabajo a una pierna y a un brazo y no dejar de lado lo que menos entrenas.',
    }
    parts.push(`Tu prioridad es ${priority}. ${plan[self.priority]}`)
  }
  return parts.join(' ')
}

/** Qué falta para estimar la grasa, dicho como lo que el usuario puede hacer. */
const BODY_FAT_MISSING: Record<BodyFatMissing, string> = {
  no_sex: 'Para estimar tu % de grasa necesito saber qué fórmula usar, la de hombre o la de mujer: contéstalo en las preguntas del escaneo.',
  no_height: 'Para estimar tu % de grasa necesito tu altura: añádela en tu perfil.',
  no_front: 'Para estimar tu % de grasa necesito la foto de frente con el cuerpo entero, los brazos separados y, mejor, sin camiseta.',
  no_side: 'Para estimar tu % de grasa necesito la foto de perfil con el cuerpo entero y, mejor, sin camiseta.',
  out_of_range: 'Las medidas de cuello y cintura de estas fotos no dan una estimación creíble de tu % de grasa. Repítelas de pie, sin camiseta y con buena luz.',
}

/**
 * Uno por grupo de medidas que dicen casi lo mismo: la principal del grupo si
 * está en la lista; si no, la primera. Conserva el orden de la lista.
 */
function onePerGroup(findings: Finding[]): Finding[] {
  const keep = new Map<string, Finding>()
  for (const f of findings) {
    if (!f.group) continue
    const current = keep.get(f.group)
    if (!current || (f.lead && !current.lead)) keep.set(f.group, f)
  }
  return findings.filter((f) => !f.group || keep.get(f.group) === f)
}

/** El paso de entrenamiento de cada prioridad, cuando no ha marcado zonas concretas. */
const PRIORITY_ACTIONS: Record<ScanPriority, ScanAction> = {
  musculo: {
    text: 'Ganar músculo: ejercicios grandes con progresión, subiendo repeticiones y pasando a la variante más exigente cuando las domines, 3 o 4 días por semana.',
    exerciseIds: ['zancada-bulgara', 'flexiones', 'remo-unilateral', 'sentadilla-con-pesa'],
  },
  definir: {
    text: 'Que se note más el músculo: volumen alto y constante, con las últimas repeticiones de cada serie exigentes, y trabajo de core.',
    exerciseIds: ['flexiones', 'remo-unilateral', 'zancada-bulgara', 'plancha'],
  },
  fuerza: {
    text: 'Ganar fuerza: pocas repeticiones muy bien hechas en la variante más difícil que domines, con descanso completo entre series.',
    exerciseIds: ['flexiones-diamante', 'peso-muerto-unilateral', 'zancada-bulgara', 'remo-unilateral'],
  },
  equilibrio: ACTIONS.sideBalance,
}

/**
 * El resumen de entrada, como lo diría un entrenador: dónde estás, lo mejor que
 * tienes, lo que más te hará avanzar y, si se pudo estimar, tu grasa. Primero la
 * conclusión, sin exclamaciones ni cumplidos de apertura.
 */
function overviewText(
  index: number | null,
  strong: Finding[],
  weak: Finding[],
  self: ScanSelfReport | null,
  diagnosis: ScanDiagnosis,
  bodyFat: BodyFatEstimate | null,
): string {
  if (index === null) return 'Me faltan fotos para darte un resultado completo: necesito de frente, de perfil, la sentadilla y los brazos arriba.'
  const parts: string[] = [
    index >= STRENGTH_FROM
      ? `Partes de una base sólida: ${index}/100 en equilibrio corporal.`
      : index > IMPROVE_UNTIL
        ? `Tienes una buena base para construir: ${index}/100 en equilibrio corporal.`
        : `Tienes mucho margen para avanzar: ${index}/100 en equilibrio corporal, y eso significa que notarás los cambios pronto si entrenas con constancia.`,
  ]
  if (strong.length) parts.push(`Lo mejor: ${lowerFirst(list(strong.slice(0, 2).map((f, i) => (i === 0 ? f.strength : lowerFirst(f.strength)))))}.`)
  const goal = diagnosis.weakZones.length
    ? `dar prioridad a ${list(diagnosis.weakZones.map((z) => SCAN_ZONE_LABELS[z]))}, que es lo que menos destaca en tus fotos`
    : self?.priority
      ? `${SCAN_PRIORITY_LABELS[self.priority]}, que es tu prioridad`
      : null
  const brake = weak[0] ? lowerFirst(weak[0].improvement) : null
  parts.push(
    goal && brake
      ? `Lo que más te hará avanzar ahora: ${goal}, y trabajar lo que más te frena: ${brake}.`
      : goal
        ? `Lo que más te hará avanzar ahora: ${goal}.`
        : brake
          ? `Lo que más te hará avanzar ahora es trabajar esto: ${brake}.`
          : 'No veo desequilibrios destacables: ahora toca seguir sumando fuerza.',
  )
  if (bodyFat) parts.push(`Tu grasa corporal estimada es del ${one(bodyFat.pct)} % (±${bodyFat.marginPct} %).`)
  return parts.join(' ')
}
