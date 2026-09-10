/**
 * Fechas del dominio.
 *
 * Todo el dominio identifica un día por su `DayKey` local (`YYYY-MM-DD`) y no
 * por un timestamp. Un entrenamiento pertenece al día en que lo hiciste según
 * tu reloj, no según UTC.
 */

/** Día local en formato `YYYY-MM-DD`. */
export type DayKey = string

/** Índice de día de la semana con el lunes como 0, para que la semana empiece en lunes. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Lunes',
  1: 'Martes',
  2: 'Miércoles',
  3: 'Jueves',
  4: 'Viernes',
  5: 'Sábado',
  6: 'Domingo',
}

/** Iniciales usadas en la tira semanal de la interfaz. */
export const WEEKDAY_INITIALS: readonly string[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const pad = (n: number): string => String(n).padStart(2, '0')

export function toDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromDayKey(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now)
}

/** Lunes = 0 … domingo = 6. */
export function weekdayOf(date: Date): Weekday {
  return ((date.getDay() + 6) % 7) as Weekday
}

export function weekdayOfKey(key: DayKey): Weekday {
  return weekdayOf(fromDayKey(key))
}

/** Días completos entre dos claves de día. Positivo si `to` es posterior. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const a = fromDayKey(from).getTime()
  const b = fromDayKey(to).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key)
  date.setDate(date.getDate() + days)
  return toDayKey(date)
}

/** Lunes de la semana a la que pertenece `key`. */
export function startOfWeek(key: DayKey): DayKey {
  return addDays(key, -weekdayOfKey(key))
}

/** Las siete claves de día de la semana que contiene `key`, de lunes a domingo. */
export function weekDayKeys(key: DayKey): DayKey[] {
  const monday = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Minutos desde medianoche. `20:00` → `1200`. */
export function minutesFromMidnight(hours: number, minutes: number): number {
  return hours * 60 + minutes
}

export function formatMinutesOfDay(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60)
  const m = minutesOfDay % 60
  return `${pad(h)}:${pad(m)}`
}

/** Formatea una duración en segundos como `MM:SS`, o `H:MM:SS` si pasa de la hora. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

/** `Jue, 24 jul` — el formato corto que ya usa la interfaz de Historial. */
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function formatShortDate(key: DayKey): string {
  const date = fromDayKey(key)
  return `${SHORT_DAYS[weekdayOf(date)]}, ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`
}

/** `Hoy`, `Ayer` o la fecha corta. */
export function formatRelativeDay(key: DayKey, reference: DayKey = todayKey()): string {
  const diff = daysBetween(key, reference)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return formatShortDate(key)
}
