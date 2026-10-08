/**
 * Resumen del escáner corporal (D-023): todas las fotos juntas → un resumen de
 * entrenador con índice de equilibrio, categorías, puntos fuertes, áreas de
 * mejora y pasos de acción.
 *
 * Determinista y honesto: cada frase sale de una medida o de un dato registrado.
 * - Simetría, proporciones y postura/movilidad salen de las fotos.
 * - El desarrollo muscular se estima con la fuerza y el entrenamiento reales
 *   (tests de evolución, sesiones, nivel): la cámara no ve cuánto músculo hay.
 * - La composición corporal no se deduce de una foto: solo un dato real del usuario.
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

export type ScanBuild = 'delgada' | 'media' | 'ancha'
export type ScanPriority = 'musculo' | 'definir' | 'fuerza' | 'equilibrio'
export const SCAN_PRIORITY_LABELS: Record<ScanPriority, string> = {
  musculo: 'ganar músculo',
  definir: 'que se note más el músculo',
  fuerza: 'ganar fuerza',
  equilibrio: 'equilibrar el cuerpo',
}

/**
 * Lo que el usuario dice de sí mismo (D-023, enmienda de autoevaluación). Cubre
 * lo que la foto no puede medir. Se presenta siempre como suyo, nunca como medido.
 */
export type ScanSelfReport = {
  build: ScanBuild | null
  strongZones: readonly ScanZone[]
  weakZones: readonly ScanZone[]
  priority: ScanPriority | null
}

export type ScanInput = {
  shots: PoseShots
  assessments?: readonly Assessment[]
  sessions?: readonly WorkoutSession[]
  experience?: ExperienceLevel | null
  bodyFatPct?: number | null
  selfReport?: ScanSelfReport | null
  /** Día de referencia para el historial de entrenamiento. */
  today?: DayKey
}

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
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Mediana de una medida entre las fotos de una pose; `null` si no hay datos o varían demasiado. */
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

function muscleDevelopment(input: ScanInput): Development {
  const done = completedAssessments(input.assessments ?? [])
  const sessions = (input.sessions ?? []).filter((s) => s.status === 'completed')
  const today = input.today ?? sessions.map((s) => s.dayKey).sort().at(-1) ?? null
  const recent = today ? sessions.filter((s) => { const age = daysBetween(s.dayKey, today); return age >= 0 && age < TRAINING_WINDOW_DAYS }) : []
  const base: ScanCategory = { key: 'muscleDevelopment', title: 'Desarrollo muscular', score: null, inIndex: false, text: '', details: [] }

  const self = input.selfReport
  const hasSelf = !!self && (self.strongZones.length > 0 || self.weakZones.length > 0)

  if (done.length === 0 && recent.length === 0 && !hasSelf) {
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
    const stuck = comparisons.filter((c) => c.delta.kind !== 'baseline' && (c.delta.trend === 'down' || c.delta.trend === 'same')).map((c) => AREA[c.test.key])
    for (const c of comparisons) details.push(`${AREA[c.test.key].charAt(0).toUpperCase() + AREA[c.test.key].slice(1)}: ${c.delta.kind === 'baseline' ? 'línea base' : c.delta.trend === 'up' ? 'sube' : c.delta.trend === 'down' ? 'baja' : c.delta.trend === 'same' ? 'igual' : 'mixto'}`)
    if (up.length) {
      parts.push(`Tu fuerza sube en ${list(up)}: ese músculo está respondiendo.`)
      strengths.push(`Tu fuerza sube en ${list(up)}`)
    }
    if (stuck.length) {
      parts.push(`En ${list(stuck)} no hay progreso respecto al test anterior, y es donde más margen tienes.`)
      improvements.push(`Tu fuerza no sube en ${list(stuck)}`)
      actions.push({ text: `Más frecuencia y progresión de carga en ${list(stuck)}: AXIS les dará prioridad en tus próximas sesiones.`, exerciseIds: [] })
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
      actions.push({ text: `Más ${MUSCLE_GROUP_LABELS[least.g].toLowerCase()} en tus semanas: AXIS lo tendrá en cuenta al elegir el foco de cada sesión.`, exerciseIds: [] })
    }
    const perWeek = recent.length / (TRAINING_WINDOW_DAYS / 7)
    if (perWeek >= 2.5) strengths.push(`Entrenas con constancia (${one(perWeek)} sesiones por semana)`)
    else parts.push(`Con ${one(perWeek)} sesiones por semana, la constancia es lo que más te hará crecer ahora.`)
  }

  // Cómo se ve el usuario: lo dice él; los datos lo confirman o lo matizan.
  if (self && hasSelf) {
    if (self.strongZones.length) {
      const zones = list(self.strongZones.map((z) => SCAN_ZONE_LABELS[z]))
      parts.push(`Te ves con más músculo en ${zones}.`)
      strengths.push(`Te ves con más músculo en ${zones}`)
    }
    if (self.weakZones.length) {
      for (const zone of self.weakZones) {
        const trained = counts.get(zone) ?? 0
        const median = ordered[Math.floor(ordered.length / 2)]?.n ?? 0
        if (leastTrained === zone) {
          parts.push(`Te ves con menos ${SCAN_ZONE_LABELS[zone]} y tu historial lo confirma: es lo que menos has entrenado, y ahí está tu mayor margen.`)
        } else if (recent.length && trained > 0 && trained >= median) {
          parts.push(`Te ves con menos ${SCAN_ZONE_LABELS[zone]} aunque la entrenas a menudo: ahí lo que más ayuda es ir subiendo la carga, no solo repetir.`)
        } else {
          parts.push(`Te ves con menos ${SCAN_ZONE_LABELS[zone]}.`)
        }
      }
      const zones = list(self.weakZones.map((z) => SCAN_ZONE_LABELS[z]))
      improvements.push(`Quieres más músculo en ${zones}`)
      actions.unshift({
        text: `Prioridad a ${zones}: AXIS les dará más peso al elegir el foco y los ejercicios de tus sesiones.`,
        exerciseIds: Array.from(new Set(self.weakZones.flatMap((z) => ZONE_EXERCISES[z]))).slice(0, 4),
      })
    }
    if (done.length === 0 && recent.length === 0) {
      parts.push('Todavía no tengo tus tests ni tus sesiones para confirmarlo: con ellos te diré si los datos coinciden con cómo te ves.')
    }
  }

  return { category: { ...base, text: parts.join(' '), details }, strengths, improvements, actions }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export function summarizeScan(input: ScanInput): ScanSummary {
  const notes = new Set<string>()
  const { shots } = input

  for (const pose of Object.keys(shots) as ScanPose[]) {
    if ((shots[pose]?.length ?? 0) === 1) notes.add(`${POSE_NAMES[pose]}: con una sola foto no puedo comprobar que la medida sea estable. Mejor 3 o más.`)
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
  const development = muscleDevelopment(input)

  const v = combine(shots, 'front', 'shoulderToWaist', notes)
  const legs = combine(shots, 'front', 'legToTorso', notes)
  const proportion: ScanCategory = {
    key: 'proportion',
    title: 'Proporciones',
    // Se puntúa frente al objetivo que declare el usuario (D-023); hasta entonces, se mide y se compara consigo mismo.
    score: null,
    inIndex: true,
    text:
      v !== null || legs !== null
        ? `${v !== null ? `La relación entre la anchura de tus hombros y tu cintura es ${one(v)}. ` : ''}La espalda y los hombros son lo que más cambia esta relación al entrenar, así que la iremos siguiendo escaneo a escaneo. Cuando me digas qué zonas quieres desarrollar, también te diré cómo vas respecto a tu objetivo.`
        : 'Necesito una foto de frente con los brazos algo separados del cuerpo para medir tus proporciones.',
    details: [...(v !== null ? [`Hombros / cintura: ${one(v)}`] : []), ...(legs !== null ? [`Piernas / tronco: ${one(legs)}`] : [])],
  }

  const composition: ScanCategory = {
    key: 'composition',
    title: 'Composición corporal',
    score: null,
    inIndex: false,
    text: compositionText(input.selfReport ?? null, input.bodyFatPct ?? null),
    details: [],
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
  const weak = measured.filter((f) => f.score <= IMPROVE_UNTIL).sort((a, b) => a.score - b.score)
  const strengths = [...measured.filter((f) => f.score >= STRENGTH_FROM).map((f) => f.strength), ...development.strengths]
  const improvements = [...weak.map((f) => f.improvement), ...development.improvements]

  const actions: ScanAction[] = []
  for (const action of [...weak.map((f) => f.action).filter((a): a is ScanAction => !!a), ...development.actions]) {
    if (!actions.some((a) => a.text === action.text)) actions.push(action)
  }

  return {
    index,
    overview: overviewText(index, symmetry, posture, weak, development),
    categories,
    strengths,
    improvements,
    actions: actions.slice(0, 4),
    photoNotes: Array.from(notes),
  }
}

const BUILD_TEXT: Record<ScanBuild, string> = {
  delgada: 'más bien delgada',
  media: 'media',
  ancha: 'más bien ancha',
}

/**
 * Composición corporal: nunca se deduce de la foto. Se dice cómo se describe el
 * usuario, qué implica para su entrenamiento según su prioridad, y el dato real
 * si lo ha dado. Sin peso, sin dietas: AXIS habla de entrenar.
 */
function compositionText(self: ScanSelfReport | null, bodyFatPct: number | null): string {
  const parts: string[] = []
  if (self?.build) parts.push(`Describes tu complexión como ${BUILD_TEXT[self.build]}.`)
  if (self?.priority) {
    const priority = SCAN_PRIORITY_LABELS[self.priority]
    const plan: Record<ScanPriority, string> = {
      musculo:
        self.build === 'delgada'
          ? 'Con una complexión delgada, lo que más te hará ganar músculo es progresar en carga semana a semana con ejercicios grandes y ser constante: AXIS irá subiendo la exigencia cuando tu recuperación lo permita.'
          : 'Para ganar músculo, lo que más cuenta es progresar en carga y entrenar cada zona con frecuencia: AXIS irá subiendo la exigencia cuando tu recuperación lo permita.',
      definir:
        'Para que se note más el músculo, lo que AXIS puede hacer es mantener un volumen de trabajo alto y constante y ayudarte a ganar músculo; la alimentación queda fuera de lo que valora AXIS.',
      fuerza: 'Para ganar fuerza, AXIS priorizará pocas repeticiones bien hechas con más carga y descansos completos.',
      equilibrio: 'Para equilibrar el cuerpo, AXIS dará más peso al trabajo a una pierna y a un brazo y a lo que menos entrenas.',
    }
    parts.push(`Tu prioridad es ${priority}. ${plan[self.priority]}`)
  }
  if (typeof bodyFatPct === 'number') parts.push(`Tu dato registrado es ${one(bodyFatPct)} % de grasa corporal; lo uso solo para seguir tu evolución.`)
  parts.push(
    parts.length
      ? 'Lo que es músculo y lo que no, la foto no lo puede medir: no lo estimo.'
      : 'Una foto no permite saber qué parte es músculo y qué parte no, así que no lo estimo. Cuéntame tu complexión y tu prioridad, o añade un dato real de una báscula de composición o de una medición profesional.',
  )
  return parts.join(' ')
}

/** La primera frase es la conclusión: dónde estás y qué te hará avanzar más. */
function overviewText(index: number | null, symmetry: ScanCategory, posture: ScanCategory, weak: Finding[], development: Development): string {
  if (index === null) return 'Me faltan fotos para darte un resultado completo: necesito de frente, de perfil, la sentadilla y los brazos arriba.'
  const solid = [symmetry, posture].filter((c) => (c.score ?? 0) >= STRENGTH_FROM).map((c) => c.title.toLowerCase())
  const base =
    index >= STRENGTH_FROM
      ? `Partes de una base sólida (${index}/100)${solid.length ? `, sobre todo en ${list(solid)}` : ''}.`
      : index > IMPROVE_UNTIL
        ? `Tienes una base buena para construir (${index}/100)${solid.length ? `, con ${list(solid)} como punto fuerte` : ''}.`
        : `Hay bastante margen de mejora (${index}/100), y eso significa que vas a notar los cambios pronto si entrenas con constancia.`
  const focus = [
    ...weak.slice(0, 2).map((f) => lowerFirst(f.improvement)),
    ...(development.improvements.length ? [lowerFirst(development.improvements[0])] : []),
  ]
  return focus.length ? `${base} Lo que más te hará avanzar ahora: ${list(focus.slice(0, 2))}.` : `${base} No veo desequilibrios destacables: ahora toca seguir sumando fuerza.`
}
