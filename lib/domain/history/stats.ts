/**
 * Estadísticas del historial.
 *
 * Todo se calcula a partir de las sesiones realmente guardadas. Las funciones son
 * puras y están protegidas contra el caso vacío: sin datos, con un único punto o con
 * todos los valores iguales, nunca devuelven `NaN`, `Infinity` ni una división por cero.
 */

import { addDays, daysBetween, fromDayKey, toDayKey, WEEKDAY_INITIALS, weekDayKeys, type DayKey } from '../shared/dates'
import { safeDivide } from '../shared/ids'
import type { WorkoutSession } from '../workouts/types'

export type HistoryRange = 'semana' | 'mes' | 'anio'

export const HISTORY_RANGE_LABELS: Record<HistoryRange, string> = {
  semana: 'Semana',
  mes: 'Mes',
  anio: 'Año',
}

export type ChartPoint = {
  label: string
  value: number
}

export type PerformanceDelta = {
  /** `false` cuando no hay periodo anterior con el que comparar. */
  available: boolean
  /** Variación porcentual redondeada. `null` si no se puede calcular. */
  percent: number | null
  comparisonLabel: string
}

export type HistoryStats = {
  range: HistoryRange
  sessionCount: number
  totalSeconds: number
  totalVolumeKg: number
  points: ChartPoint[]
  performance: PerformanceDelta
}

const COMPARISON_LABELS: Record<HistoryRange, string> = {
  semana: 'vs. semana pasada',
  mes: 'vs. mes pasado',
  anio: 'vs. año pasado',
}

const MONTH_INITIALS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function isCompleted(session: WorkoutSession): boolean {
  return session.status === 'completed'
}

/** Longitud en días del periodo, usada para localizar el periodo anterior. */
function periodLengthDays(range: HistoryRange): number {
  if (range === 'semana') return 7
  if (range === 'mes') return 28
  return 364
}

/** Primer día del periodo actual. */
export function periodStart(range: HistoryRange, reference: DayKey): DayKey {
  return addDays(reference, -(periodLengthDays(range) - 1))
}

function sessionsInRange(
  sessions: readonly WorkoutSession[],
  from: DayKey,
  to: DayKey,
): WorkoutSession[] {
  return sessions.filter((session) => {
    if (!isCompleted(session)) return false
    const fromDiff = daysBetween(from, session.dayKey)
    const toDiff = daysBetween(session.dayKey, to)
    return fromDiff >= 0 && toDiff >= 0
  })
}

function totalVolume(sessions: readonly WorkoutSession[]): number {
  return sessions.reduce((total, session) => total + session.totalVolumeKg, 0)
}

/**
 * Puntos del gráfico. Siempre devuelve al menos dos puntos para que la línea tenga
 * algo que dibujar aunque el usuario no tenga historial.
 */
function buildPoints(
  sessions: readonly WorkoutSession[],
  range: HistoryRange,
  reference: DayKey,
): ChartPoint[] {
  if (range === 'semana') {
    return weekDayKeys(reference).map((dayKey, index) => ({
      label: WEEKDAY_INITIALS[index],
      value: totalVolume(sessions.filter((session) => session.dayKey === dayKey)),
    }))
  }

  if (range === 'mes') {
    const start = periodStart('mes', reference)
    return Array.from({ length: 4 }, (_, week) => {
      const from = addDays(start, week * 7)
      const to = addDays(from, 6)
      return {
        label: `S${week + 1}`,
        value: totalVolume(sessionsInRange(sessions, from, to)),
      }
    })
  }

  const referenceDate = fromDayKey(reference)
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (11 - index), 1)
    const from = toDayKey(month)
    const to = toDayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))
    return {
      label: MONTH_INITIALS[month.getMonth()],
      value: totalVolume(sessionsInRange(sessions, from, to)),
    }
  })
}

/**
 * Variación de volumen respecto al periodo anterior.
 *
 * Sin periodo anterior, o con volumen anterior cero, no hay porcentaje que mostrar:
 * se devuelve `available: false` en lugar de un número inventado o un `Infinity`.
 */
export function computePerformanceDelta(
  sessions: readonly WorkoutSession[],
  range: HistoryRange,
  reference: DayKey,
): PerformanceDelta {
  const length = periodLengthDays(range)
  const currentFrom = periodStart(range, reference)
  const previousTo = addDays(currentFrom, -1)
  const previousFrom = addDays(previousTo, -(length - 1))

  const current = totalVolume(sessionsInRange(sessions, currentFrom, reference))
  const previous = totalVolume(sessionsInRange(sessions, previousFrom, previousTo))

  if (previous <= 0) {
    return { available: false, percent: null, comparisonLabel: COMPARISON_LABELS[range] }
  }

  const ratio = safeDivide(current - previous, previous, 0)
  return {
    available: true,
    percent: Math.round(ratio * 100),
    comparisonLabel: COMPARISON_LABELS[range],
  }
}

export function computeHistoryStats(
  sessions: readonly WorkoutSession[],
  range: HistoryRange,
  reference: DayKey,
): HistoryStats {
  const from = periodStart(range, reference)
  const inRange = sessionsInRange(sessions, from, reference)

  return {
    range,
    sessionCount: inRange.length,
    totalSeconds: inRange.reduce((total, session) => total + session.durationSeconds, 0),
    totalVolumeKg: totalVolume(inRange),
    points: buildPoints(sessions, range, reference),
    performance: computePerformanceDelta(sessions, range, reference),
  }
}

/**
 * Estado de la tira semanal de Inicio: qué días de esta semana tienen sesión.
 */
export function weeklyActivityFor(
  sessions: readonly WorkoutSession[],
  reference: DayKey,
): { completedDays: boolean[]; todayIndex: number } {
  const keys = weekDayKeys(reference)
  return {
    completedDays: keys.map((dayKey) =>
      sessions.some((session) => isCompleted(session) && session.dayKey === dayKey),
    ),
    todayIndex: keys.indexOf(reference),
  }
}

/** Formatea segundos como `18h 45m`, el formato que ya usa Historial. */
export function formatTotalTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/** Formatea kilos como `34.250 kg`, con separador de millares español. */
export function formatVolume(volumeKg: number): string {
  const safe = Number.isFinite(volumeKg) ? Math.round(volumeKg) : 0
  return `${safe.toLocaleString('es-ES')} kg`
}
