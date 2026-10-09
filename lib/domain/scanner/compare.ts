/**
 * Comparar un escaneo con el anterior (D-023, enmienda de comparación).
 *
 * Se comparan medidas, no fotos: cada medida estable del escaneo actual frente a
 * la del anterior. Un cambio solo cuenta si supera el margen de esa medida (el
 * mismo con el que se descarta una medida inestable entre fotos); por debajo,
 * «sin cambio». Así un poco de ruido no se presenta como progreso.
 *
 * Lo que tiene una dirección clara (una rodilla que se cierra menos) se dice como
 * mejora o retroceso. La proporción hombros/cintura se dice tal cual, sin juzgar:
 * no se interpreta como grasa ni como músculo.
 */

import { formatDayInSentence, type DayKey } from '../shared/dates'
import { STABILITY_TOLERANCE } from './scales'
import { stableValue, type CategoryKey, type PoseShots } from './summary'
import type { ScanRecord } from './types'

export type ChangeTrend = 'better' | 'worse' | 'same' | 'changed'

export type ScanChange = {
  key: string
  label: string
  from: number
  to: number
  trend: ChangeTrend
  /** Una frase con el cambio, lista para enseñar. */
  text: string
}

export type ScanComparison = {
  previousDay: DayKey
  index: { from: number | null; to: number | null }
  categories: { key: CategoryKey; from: number | null; to: number | null }[]
  /** Solo las medidas que existen en los dos escaneos. */
  changes: ScanChange[]
  headline: string
  /** Recordatorio de en qué condiciones la comparación vale. */
  note: string
}

type Spec = {
  key: string
  label: string
  read: (shots: PoseShots) => number | null
  /** Qué sentido es mejor; `none` para lo que no se juzga. */
  direction: 'lower' | 'higher' | 'none'
  tolerance: number
  unit: string
  better: string
  worse: string
}

const abs = (v: number | null) => (v === null ? null : Math.abs(v))
const positive = (v: number | null) => (v === null ? null : Math.max(0, v))

const SPECS: readonly Spec[] = [
  {
    key: 'shoulders', label: 'Línea de hombros', unit: '°', direction: 'lower', tolerance: STABILITY_TOLERANCE.shoulderTiltDeg,
    read: (s) => abs(stableValue(s, 'front', 'shoulderTiltDeg')),
    better: 'tus hombros están más nivelados', worse: 'tus hombros están menos nivelados',
  },
  {
    key: 'hips', label: 'Línea de caderas', unit: '°', direction: 'lower', tolerance: STABILITY_TOLERANCE.hipTiltDeg,
    read: (s) => abs(stableValue(s, 'front', 'hipTiltDeg')),
    better: 'tus caderas están más niveladas', worse: 'tus caderas están menos niveladas',
  },
  {
    key: 'head', label: 'Cabeza adelantada', unit: '%', direction: 'lower', tolerance: STABILITY_TOLERANCE.headForwardPct,
    read: (s) => positive(stableValue(s, 'side', 'headForwardPct')),
    better: 'llevas la cabeza menos adelantada', worse: 'llevas la cabeza más adelantada',
  },
  {
    key: 'squatDepth', label: 'Rodilla abajo en la sentadilla', unit: '°', direction: 'lower', tolerance: STABILITY_TOLERANCE.kneeAngleDeg,
    read: (s) => stableValue(s, 'squat_side', 'kneeAngleDeg'),
    better: 'bajas más en la sentadilla', worse: 'bajas menos en la sentadilla',
  },
  {
    key: 'trunkLean', label: 'Inclinación del tronco', unit: '°', direction: 'lower', tolerance: STABILITY_TOLERANCE.trunkLeanDeg,
    read: (s) => stableValue(s, 'squat_side', 'trunkLeanDeg'),
    better: 'el tronco se inclina menos en la sentadilla', worse: 'el tronco se inclina más en la sentadilla',
  },
  {
    key: 'kneeInward', label: 'Rodilla hacia dentro', unit: '%', direction: 'lower', tolerance: STABILITY_TOLERANCE.leftKneeInPct,
    read: (s) => {
      const l = positive(stableValue(s, 'squat_front', 'leftKneeInPct'))
      const r = positive(stableValue(s, 'squat_front', 'rightKneeInPct'))
      return l === null && r === null ? null : Math.max(l ?? 0, r ?? 0)
    },
    better: 'tus rodillas se cierran menos en la sentadilla', worse: 'tus rodillas se cierran más en la sentadilla',
  },
  {
    key: 'overhead', label: 'Brazos arriba', unit: '°', direction: 'higher', tolerance: STABILITY_TOLERANCE.leftArmDeg,
    read: (s) => {
      const l = stableValue(s, 'arms_up', 'leftArmDeg')
      const r = stableValue(s, 'arms_up', 'rightArmDeg')
      return l === null || r === null ? null : Math.min(l, r)
    },
    better: 'los brazos suben más por encima de la cabeza', worse: 'los brazos suben menos por encima de la cabeza',
  },
  {
    key: 'armsSides', label: 'Diferencia entre brazos', unit: '°', direction: 'lower', tolerance: STABILITY_TOLERANCE.armsDiffDeg,
    read: (s) => abs(stableValue(s, 'arms_up', 'armsDiffDeg')),
    better: 'tus dos brazos suben más igualados', worse: 'hay más diferencia entre tus brazos',
  },
  {
    key: 'shoulderToWaist', label: 'Hombros / cintura', unit: '', direction: 'none', tolerance: STABILITY_TOLERANCE.shoulderToWaist,
    read: (s) => stableValue(s, 'front', 'shoulderToWaist'),
    better: '', worse: '',
  },
]

const fmt = (n: number, unit: string) => {
  const text = unit === '' ? (Math.round(n * 100) / 100).toString() : (Math.round(n * 10) / 10).toString()
  return `${text.replace('.', ',')}${unit === '°' ? '°' : unit === '%' ? ' %' : ''}`
}

function changeOf(spec: Spec, from: number, to: number): ScanChange {
  const delta = to - from
  let trend: ChangeTrend = 'same'
  if (Math.abs(delta) > spec.tolerance) {
    if (spec.direction === 'none') trend = 'changed'
    else trend = (spec.direction === 'lower' ? delta < 0 : delta > 0) ? 'better' : 'worse'
  }
  const text =
    trend === 'better'
      ? `${spec.better.charAt(0).toUpperCase()}${spec.better.slice(1)} (${fmt(from, spec.unit)} → ${fmt(to, spec.unit)})`
      : trend === 'worse'
        ? `${spec.worse.charAt(0).toUpperCase()}${spec.worse.slice(1)} (${fmt(from, spec.unit)} → ${fmt(to, spec.unit)})`
        : trend === 'changed'
          ? `${spec.label}: de ${fmt(from, spec.unit)} a ${fmt(to, spec.unit)}`
          : `${spec.label}: sin cambio`
  return { key: spec.key, label: spec.label, from, to, trend, text }
}

const CATEGORY_KEYS: readonly CategoryKey[] = ['symmetry', 'postureMobility', 'proportion']

export function compareScans(
  current: { shots: PoseShots; index: number | null; scores: Partial<Record<CategoryKey, number | null>> },
  previous: ScanRecord,
): ScanComparison {
  const changes: ScanChange[] = []
  for (const spec of SPECS) {
    const from = spec.read(previous.measurements)
    const to = spec.read(current.shots)
    if (from !== null && to !== null) changes.push(changeOf(spec, from, to))
  }

  const better = changes.filter((c) => c.trend === 'better').length
  const worse = changes.filter((c) => c.trend === 'worse').length
  const day = formatDayInSentence(previous.dayKey)
  const from = previous.result.index
  const to = current.index

  const parts: string[] = []
  parts.push(
    from !== null && to !== null
      ? to === from
        ? `Tu índice sigue en ${to}, igual que en tu escaneo del ${day}.`
        : `Tu índice ha pasado de ${from} a ${to} desde tu escaneo del ${day}.`
      : `Comparado con tu escaneo del ${day}.`,
  )
  if (changes.length === 0) parts.push('No hay medidas que se puedan comparar: repite las mismas poses que la otra vez.')
  else if (better === 0 && worse === 0) parts.push('Ninguna medida cambia más que su margen de medida.')
  else parts.push(`${better ? `${better} ${better === 1 ? 'medida mejora' : 'medidas mejoran'}` : 'Ninguna medida mejora'}${worse ? ` y ${worse} ${worse === 1 ? 'empeora' : 'empeoran'}` : ''}.`)

  return {
    previousDay: previous.dayKey,
    index: { from, to },
    categories: CATEGORY_KEYS.map((key) => ({ key, from: previous.result.scores[key] ?? null, to: current.scores[key] ?? null })),
    changes,
    headline: parts.join(' '),
    note: 'La comparación solo es fiable si hiciste las fotos con el mismo montaje: misma distancia, misma altura del móvil y misma luz.',
  }
}
