/**
 * Estadísticas del historial.
 *
 * Todo se calcula a partir de las sesiones realmente guardadas. Las funciones son
 * puras y están protegidas contra el caso vacío: sin datos, con un único punto o con
 * todos los valores iguales, nunca devuelven `NaN`, `Infinity` ni una división por cero.
 */

import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  endOfMonth,
  endOfYear,
  formatMonthName,
  formatYearName,
  fromDayKey,
  monthDayKeys,
  startOfMonth,
  startOfWeek,
  startOfYear,
  WEEKDAY_INITIALS,
  weekDayKeys,
  yearMonthKeys,
  type DayKey,
} from '../shared/dates'
import { safeDivide } from '../shared/ids'
import type { WorkoutSession } from '../workouts/types'

export type HistoryRange = 'semana' | 'mes' | 'anio'

export const HISTORY_RANGE_LABELS: Record<HistoryRange, string> = {
  semana: 'Semana',
  mes: 'Mes',
  anio: 'Año',
}

export type ChartPoint = {
  /** Lo que se escribe en el eje: `L`, `1`, `E`… */
  label: string
  value: number
  /**
   * `true` cuando ese día o mes todavía no ha llegado.
   *
   * Un día futuro no vale cero: es que no ha pasado. El gráfico corta ahí en vez
   * de dibujar una caída a cero que parecería que no has entrenado.
   */
  future: boolean
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
  /** El periodo que se está mirando: `Septiembre de 2026`, `2026`… */
  periodLabel: string
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

/**
 * Primer día del periodo natural que contiene `reference`.
 *
 * Natural, no móvil: el lunes de esta semana, el día 1 de este mes, el 1 de enero
 * de este año. Coincide con lo que el usuario ve en su calendario.
 */
export function periodStart(range: HistoryRange, reference: DayKey): DayKey {
  if (range === 'semana') return startOfWeek(reference)
  if (range === 'mes') return startOfMonth(reference)
  return startOfYear(reference)
}

/** Último día del periodo natural, aunque todavía no haya llegado. */
export function periodEnd(range: HistoryRange, reference: DayKey): DayKey {
  if (range === 'semana') return addDays(startOfWeek(reference), 6)
  if (range === 'mes') return endOfMonth(reference)
  return endOfYear(reference)
}

/** El mismo punto del periodo anterior: hace una semana, un mes o un año. */
function sameDayPreviousPeriod(range: HistoryRange, reference: DayKey): DayKey {
  if (range === 'semana') return addDays(reference, -7)
  if (range === 'mes') return addMonths(reference, -1)
  return addYears(reference, -1)
}

export function periodLabel(range: HistoryRange, reference: DayKey): string {
  if (range === 'mes') return formatMonthName(reference)
  if (range === 'anio') return formatYearName(reference)
  const start = periodStart('semana', reference)
  const end = periodEnd('semana', reference)
  return `${fromDayKey(start).getDate()}–${fromDayKey(end).getDate()} de ${formatMonthName(end).toLowerCase()}`
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

/** Volumen acumulado en un único día. */
function volumeOnDay(sessions: readonly WorkoutSession[], dayKey: DayKey): number {
  return totalVolume(sessions.filter((s) => isCompleted(s) && s.dayKey === dayKey))
}

/**
 * Puntos del gráfico, uno por cada unidad natural del periodo.
 *
 * - Semana: los siete días, de lunes a domingo.
 * - Mes: todos los días del mes, del 1 al 28, 29, 30 o 31 según toque.
 * - Año: los doce meses, de enero a diciembre.
 *
 * Los que aún no han llegado se marcan como `future` para que el gráfico se corte
 * en el día de hoy en vez de fingir ceros.
 */
function buildPoints(
  sessions: readonly WorkoutSession[],
  range: HistoryRange,
  reference: DayKey,
): ChartPoint[] {
  if (range === 'semana') {
    return weekDayKeys(reference).map((dayKey, index) => ({
      label: WEEKDAY_INITIALS[index],
      value: volumeOnDay(sessions, dayKey),
      future: daysBetween(reference, dayKey) > 0,
    }))
  }

  if (range === 'mes') {
    return monthDayKeys(reference).map((dayKey) => ({
      // El número del día tal cual: 1, 2, 3… hasta el último del mes.
      label: String(fromDayKey(dayKey).getDate()),
      value: volumeOnDay(sessions, dayKey),
      future: daysBetween(reference, dayKey) > 0,
    }))
  }

  return yearMonthKeys(reference).map((monthStart) => ({
    label: MONTH_INITIALS[fromDayKey(monthStart).getMonth()],
    value: totalVolume(sessionsInRange(sessions, monthStart, endOfMonth(monthStart))),
    // Un mes solo es futuro si empieza después de hoy: el mes en curso cuenta.
    future: daysBetween(reference, monthStart) > 0,
  }))
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
  // Se compara lo transcurrido contra lo transcurrido: el día 3 del mes se mide
  // contra los tres primeros días del mes pasado, no contra el mes entero. Si no,
  // cualquier mes empezado saldría siempre en negativo.
  const previousReference = sameDayPreviousPeriod(range, reference)

  const current = totalVolume(
    sessionsInRange(sessions, periodStart(range, reference), reference),
  )
  const previous = totalVolume(
    sessionsInRange(sessions, periodStart(range, previousReference), previousReference),
  )

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
  // El resumen cubre el periodo natural completo, igual que el gráfico, para que
  // los dos no puedan contar cosas distintas.
  const inRange = sessionsInRange(
    sessions,
    periodStart(range, reference),
    periodEnd(range, reference),
  )

  return {
    range,
    periodLabel: periodLabel(range, reference),
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
