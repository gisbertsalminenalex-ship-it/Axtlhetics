/**
 * El escaneo entrena (D-041): lo que AXIS ve en las fotos se convierte en un
 * plan para las sesiones.
 *
 * Revoca P-017 («el motor no lee el escaneo»), por decisión de Alex: el motor
 * usa el último escaneo para priorizar zonas, añadir correctivos al
 * calentamiento y pedir trabajo unilateral. Siempre lo explica.
 *
 * Dos fuentes, y se dice cuál es cuál:
 *
 * - **Las fotos, frente a un físico equilibrado** (\`PHYSIQUE_REFERENCE\`,
 *   provisional): la «V» hombros/cintura y el equilibrio brazo/muslo.
 * - **Lo medido de postura, movilidad y simetría**, con los umbrales del
 *   escáner (\`POSTURE_SCALES\`, \`SYMMETRY_SCALES\`): solo cuenta lo que queda
 *   claramente por fuera, a medio camino entre «bien» y «mal», para no
 *   reaccionar al ruido de una foto.
 *
 * Y lo que el usuario dijo de sí mismo (zonas que ve más flojas), que sigue
 * contando como suyo. Nada de esto es un diagnóstico, y nunca se habla de grasa.
 */

import type { DayKey } from '../shared/dates'
import { daysBetween } from '../shared/dates'
import { listNames } from '../shared/text'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '../workouts/types'
import { PHYSIQUE_REFERENCE, POSTURE_SCALES, SYMMETRY_SCALES, type Scale } from './scales'
import { stableValue, type PoseShots, type ScanZone } from './summary'
import type { ScanRecord } from './types'

/** Un escaneo deja de guiar las sesiones pasados estos días: el cuerpo cambia. */
export const SCAN_PLAN_DAYS = 90

/** Cuánto sube el objetivo semanal de series de una zona prioritaria (D-034). */
export const PRIORITY_VOLUME_FACTOR = 1.25

/** Correctivos que se añaden al calentamiento como mucho, para no alargarlo. */
export const MAX_WARMUP_EXTRAS = 2

export type PhysiquePlan = {
  scanDay: DayKey
  /** Grupos que reciben prioridad y más volumen semanal. */
  priorityGroups: MuscleGroup[]
  /** Ejercicios de movilidad o control que se añaden al calentamiento. */
  warmupExtras: string[]
  /** Hay una diferencia clara entre lados: al menos un ejercicio a una mano o una pierna. */
  unilateral: boolean
  /** Lo que AXIS cuenta, una frase por hallazgo. */
  findings: string[]
}

const ZONE_GROUPS: Record<ScanZone, MuscleGroup[]> = {
  pecho: ['pecho'],
  espalda: ['espalda'],
  hombros: ['hombros'],
  brazos: ['brazos'],
  piernas: ['piernas', 'gluteos'],
  core: ['core'],
}

/** A medio camino entre «bien» y «mal»: lo que queda claramente fuera. */
function clearly(scale: Scale): number {
  return (scale.good + scale.poor) / 2
}

/** El escaneo más reciente que todavía guía las sesiones, o \`null\`. */
export function latestScan(scans: readonly ScanRecord[], today: DayKey): ScanRecord | null {
  const recent = scans.filter((scan) => {
    const age = daysBetween(scan.dayKey, today)
    return age >= 0 && age <= SCAN_PLAN_DAYS
  })
  if (recent.length === 0) return null
  return recent.reduce((latest, scan) => (scan.dayKey > latest.dayKey ? scan : latest))
}

/** Basta con lo que se mide y lo que el usuario dijo: sirve antes de guardar el escaneo. */
export type PhysiqueInput = Pick<ScanRecord, 'dayKey' | 'measurements' | 'selfReport'>

export function physiquePlan(scan: PhysiqueInput): PhysiquePlan {
  const shots = scan.measurements as PoseShots
  const value = (pose: Parameters<typeof stableValue>[1], key: string) => stableValue(shots, pose, key)
  const priority = new Set<MuscleGroup>()
  const extras: string[] = []
  const findings: string[] = []

  // --- Las fotos, frente a un físico equilibrado ----------------------------
  const sex = scan.selfReport.sex ?? 'sin_dato'
  const v = value('front', 'shoulderToWaist')
  const vTarget = PHYSIQUE_REFERENCE.shoulderToWaist[sex]
  if (v !== null && v < vTarget) {
    priority.add('hombros')
    priority.add('espalda')
    findings.push(`En tus fotos, la «V» de hombros a cintura (${decimal(v)}) queda por debajo de un físico equilibrado (${decimal(vTarget)}): doy prioridad a hombros y espalda.`)
  }

  const arm = value('front', 'upperArmMean')
  const thigh = value('front', 'thighMean')
  if (arm !== null && thigh !== null && thigh > 0) {
    const ratio = arm / thigh
    if (ratio < PHYSIQUE_REFERENCE.armToThigh.min) {
      priority.add('brazos')
      findings.push('En tus fotos, los brazos se ven por detrás de las piernas: les doy prioridad.')
    } else if (ratio > PHYSIQUE_REFERENCE.armToThigh.max) {
      priority.add('piernas')
      priority.add('gluteos')
      findings.push('En tus fotos, las piernas se ven por detrás de los brazos: les doy prioridad.')
    }
  }

  // --- Lo que el usuario dijo de sí mismo ------------------------------------
  const weak = scan.selfReport.weakZones
  if (weak.length > 0) {
    for (const zone of weak) for (const group of ZONE_GROUPS[zone]) priority.add(group)
    findings.push(`Me dijiste que te ves con menos ${listNames([...weak])}: también ${weak.length === 1 ? 'le' : 'les'} doy prioridad.`)
  }

  // --- Postura y movilidad -----------------------------------------------------
  const head = value('side', 'headForwardPct')
  const overhead = minOf(value('arms_up', 'leftArmDeg'), value('arms_up', 'rightArmDeg'))
  if ((head !== null && head > clearly(POSTURE_SCALES.headForwardPct)) || (overhead !== null && overhead < clearly(POSTURE_SCALES.armOverheadDeg))) {
    extras.push('angeles-pared', 'rotacion-toracica')
    findings.push(
      head !== null && head > clearly(POSTURE_SCALES.headForwardPct)
        ? 'La cabeza se adelanta al hombro: calentamiento con movilidad de hombro y columna torácica.'
        : 'Los brazos no llegan del todo arriba: calentamiento con movilidad de hombro y columna torácica.',
    )
  }

  const knee = value('squat_side', 'kneeAngleDeg')
  if (knee !== null && knee > clearly(POSTURE_SCALES.squatKneeAngleDeg)) {
    extras.push('tobillo-pared', 'estiramiento-flexor-cadera')
    findings.push('La sentadilla se queda corta: calentamiento con tobillo y cadera.')
  }

  const inward = maxOf(value('squat_front', 'leftKneeInPct'), value('squat_front', 'rightKneeInPct'))
  if (inward !== null && inward > clearly(POSTURE_SCALES.kneeInwardPct)) {
    extras.push('equilibrio-una-pierna')
    findings.push('En la sentadilla una rodilla se va hacia dentro: calentamiento con equilibrio a una pierna para controlarla.')
  }

  // --- Simetría ----------------------------------------------------------------
  const shoulders = value('front', 'shoulderTiltDeg')
  const hips = value('front', 'hipTiltDeg')
  const arms = value('arms_up', 'armsDiffDeg')
  const unilateral =
    (shoulders !== null && Math.abs(shoulders) > clearly(SYMMETRY_SCALES.shoulderTiltDeg)) ||
    (hips !== null && Math.abs(hips) > clearly(SYMMETRY_SCALES.hipTiltDeg)) ||
    (arms !== null && Math.abs(arms) > clearly(SYMMETRY_SCALES.armsDiffDeg))
  if (unilateral) findings.push('Hay diferencia entre un lado y otro: cada sesión lleva al menos un ejercicio a una mano o una pierna.')

  return {
    scanDay: scan.dayKey,
    priorityGroups: [...priority],
    warmupExtras: [...new Set(extras)],
    unilateral,
    findings,
  }
}

/** Dos decimales con coma, como el resto de la app: «1,22». */
function decimal(value: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * El plan en una frase, sin cifras: lo que AXIS dice en el motivo del día y en
 * la conversación. El detalle, con las cifras, está en el resumen del escaneo.
 * `null` si el escaneo no pide nada.
 */
export function planSummary(plan: PhysiquePlan): string | null {
  const parts: string[] = []
  if (plan.priorityGroups.length > 0) parts.push(`priorizo ${listNames(plan.priorityGroups.map((group) => MUSCLE_GROUP_LABELS[group].toLowerCase()))}`)
  if (plan.warmupExtras.length > 0) parts.push('añado movilidad al calentamiento')
  if (plan.unilateral) parts.push('incluyo trabajo a una mano o una pierna')
  return parts.length > 0 ? listNames(parts) : null
}

function minOf(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

function maxOf(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}
