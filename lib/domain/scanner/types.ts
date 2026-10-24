/**
 * Un escaneo corporal guardado (D-023).
 *
 * Se guardan las **medidas** (números), las **respuestas** del usuario y una
 * instantánea del resultado para el historial. El resumen completo se vuelve a
 * calcular con el dominio cuando se abre: así mejora si mejoran los textos, y
 * nunca se guarda una frase como si fuera un dato.
 *
 * Las miniaturas viven solo en el dispositivo (`P-016`): nunca viajan en la
 * copia de seguridad ni salen hacia ningún servidor.
 */

import { addDays, daysBetween, type DayKey } from '../shared/dates'
import { isRecord } from '../shared/guards'
import { SCAN_SEXES, type ScanSex } from './body-fat'
import { PERIMETER_LIMITS, PERIMETER_ORDER, type PerimeterKey } from '../body/measurements'
import type { Measurements, ScanPose } from './measure'
import type { CategoryKey, ScanPriority, ScanSelfReport } from './summary'

export const SCAN_PROTOCOL_VERSION = 1

export const SCAN_POSES: readonly ScanPose[] = ['front', 'side', 'squat_side', 'squat_front', 'arms_up', 'flex']

export type ScanRecord = {
  id: string
  dayKey: DayKey
  createdAt: string
  protocolVersion: number
  selfReport: ScanSelfReport
  /** Por pose, las medidas de cada foto. Sin imágenes. */
  measurements: Partial<Record<ScanPose, Measurements[]>>
  /** El resultado tal como se vio al guardarlo: para el historial y la comparación. */
  result: {
    index: number | null
    scores: Partial<Record<CategoryKey, number | null>>
    /** El % de grasa estimado al guardarlo (enmienda del 2026-10-14). Ausente en los anteriores. */
    bodyFatPct?: number | null
  }
  /** Los perímetros con cinta que valían el día del escaneo, en cm (D-069). Ausente en los anteriores. */
  tape?: Partial<Record<PerimeterKey, number>>
  /** Una miniatura JPEG por pose. Solo en el dispositivo: nunca en la copia. */
  thumbnails?: Partial<Record<ScanPose, string>>
}

const PRIORITIES: readonly ScanPriority[] = ['musculo', 'definir', 'fuerza', 'equilibrio']
const REASONS = ['not_visible', 'out_of_frame', 'no_silhouette']

/**
 * Las respuestas antes de las fotos. Los escaneos anteriores a D-068 traen
 * además `build`, `strongZones` y `weakZones`: no se comprueban y se ignoran.
 */
export function isSelfReport(value: unknown): value is ScanSelfReport {
  if (!isRecord(value)) return false
  return (
    (value.priority === null || PRIORITIES.includes(value.priority as ScanPriority)) &&
    (value.sex === undefined || value.sex === null || SCAN_SEXES.includes(value.sex as ScanSex))
  )
}

function isMeasurements(value: unknown): value is Measurements {
  if (!isRecord(value)) return false
  return Object.values(value).every(
    (m) =>
      isRecord(m) &&
      ((typeof m.value === 'number' && Number.isFinite(m.value)) || (m.value === null && REASONS.includes(m.reason as string))),
  )
}

const isScore = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)

/** Lo que llega del disco o de una copia es entrada no fiable: se comprueba entero. */
export function isScanRecord(value: unknown): value is ScanRecord {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (typeof value.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dayKey)) return false
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) return false
  if (typeof value.protocolVersion !== 'number') return false
  if (!isSelfReport(value.selfReport)) return false
  if (!isRecord(value.measurements)) return false
  for (const [pose, shots] of Object.entries(value.measurements)) {
    if (!SCAN_POSES.includes(pose as ScanPose) || !Array.isArray(shots) || !shots.every(isMeasurements)) return false
  }
  if (!isRecord(value.result) || !isScore(value.result.index) || !isRecord(value.result.scores)) return false
  if (!Object.values(value.result.scores).every(isScore)) return false
  const fat = value.result.bodyFatPct
  if (fat !== undefined && fat !== null && !(typeof fat === 'number' && Number.isFinite(fat) && fat > 0 && fat < 100)) return false
  if (value.tape !== undefined) {
    if (!isRecord(value.tape)) return false
    for (const [key, cm] of Object.entries(value.tape)) {
      if (!PERIMETER_ORDER.includes(key as PerimeterKey)) return false
      if (typeof cm !== 'number' || cm < PERIMETER_LIMITS.min || cm > PERIMETER_LIMITS.max) return false
    }
  }
  if (value.thumbnails !== undefined) {
    if (!isRecord(value.thumbnails)) return false
    for (const [pose, src] of Object.entries(value.thumbnails)) {
      if (!SCAN_POSES.includes(pose as ScanPose) || typeof src !== 'string' || !src.startsWith('data:image/jpeg;base64,')) return false
    }
  }
  return true
}

/** Cada cuántos días se pide repetir el escaneo: el mismo ritmo que el test de evolución (D-021). */
export const SCAN_INTERVAL_DAYS = 28

export type ScanDue =
  | { kind: 'first' }
  | { kind: 'due'; last: ScanRecord }
  | { kind: 'recent'; last: ScanRecord; nextDay: DayKey }

/**
 * Qué toca con el escáner hoy: el primero, repetirlo (cada 28 días, como el test
 * de evolución) o nada todavía. No bloquea: se puede repetir antes si se quiere.
 */
export function scanDue(scans: readonly ScanRecord[], today: DayKey): ScanDue {
  const last = sortScans(scans)[0]
  if (!last) return { kind: 'first' }
  const age = daysBetween(last.dayKey, today)
  if (age >= SCAN_INTERVAL_DAYS) return { kind: 'due', last }
  return { kind: 'recent', last, nextDay: addDays(last.dayKey, SCAN_INTERVAL_DAYS) }
}

/** Construye el registro que se guarda a partir de lo medido, lo respondido y el resumen calculado. */
export function createScanRecord(input: {
  id: string
  dayKey: DayKey
  now: Date
  selfReport: ScanSelfReport
  measurements: Partial<Record<ScanPose, Measurements[]>>
  summary: { index: number | null; categories: readonly { key: CategoryKey; score: number | null }[]; bodyFat?: { pct: number } | null }
  thumbnails: Partial<Record<ScanPose, string>>
  tape?: Partial<Record<PerimeterKey, number>> | null
}): ScanRecord {
  return {
    id: input.id,
    dayKey: input.dayKey,
    createdAt: input.now.toISOString(),
    protocolVersion: SCAN_PROTOCOL_VERSION,
    selfReport: input.selfReport,
    measurements: input.measurements,
    result: {
      index: input.summary.index,
      scores: Object.fromEntries(input.summary.categories.map((c) => [c.key, c.score])),
      bodyFatPct: input.summary.bodyFat?.pct ?? null,
    },
    thumbnails: input.thumbnails,
    ...(input.tape && Object.keys(input.tape).length ? { tape: input.tape } : {}),
  }
}

/** El escaneo sin miniaturas: lo único que viaja en una copia de seguridad (`P-016`). */
export function withoutThumbnails(scan: ScanRecord): ScanRecord {
  const { thumbnails: _thumbnails, ...rest } = scan
  return rest
}

/** Del más reciente al más antiguo. No modifica la lista recibida. */
export function sortScans(scans: readonly ScanRecord[]): ScanRecord[] {
  return [...scans].sort((a, b) => (a.dayKey === b.dayKey ? b.createdAt.localeCompare(a.createdAt) : b.dayKey.localeCompare(a.dayKey)))
}
