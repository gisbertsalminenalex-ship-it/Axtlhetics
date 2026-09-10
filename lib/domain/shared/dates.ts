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

// ---------------------------------------------------------------------------
// Meses y años naturales
// ---------------------------------------------------------------------------
//
// Historial razona en periodos naturales, no en ventanas móviles: «el mes» es el
// mes del calendario en el que estás, del día 1 al último, y «el año» va de enero
// a diciembre. Así el eje del gráfico coincide con lo que el usuario ve en su
// propio calendario.

/** Primer día del mes al que pertenece `key`. */
export function startOfMonth(key: DayKey): DayKey {
  const date = fromDayKey(key)
  return toDayKey(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** Último día del mes al que pertenece `key`. */
export function endOfMonth(key: DayKey): DayKey {
  const date = fromDayKey(key)
  // Día 0 del mes siguiente es el último del actual, y ya contempla los bisiestos.
  return toDayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

/** Cuántos días tiene el mes al que pertenece `key`: 28, 29, 30 o 31. */
export function daysInMonth(key: DayKey): number {
  const date = fromDayKey(key)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/** Todas las claves de día del mes al que pertenece `key`, del 1 al último. */
export function monthDayKeys(key: DayKey): DayKey[] {
  const first = startOfMonth(key)
  return Array.from({ length: daysInMonth(key) }, (_, i) => addDays(first, i))
}

export function startOfYear(key: DayKey): DayKey {
  return `${fromDayKey(key).getFullYear()}-01-01`
}

export function endOfYear(key: DayKey): DayKey {
  return `${fromDayKey(key).getFullYear()}-12-31`
}

/** El día 1 de cada uno de los doce meses del año al que pertenece `key`. */
export function yearMonthKeys(key: DayKey): DayKey[] {
  const year = fromDayKey(key).getFullYear()
  return Array.from({ length: 12 }, (_, month) => `${year}-${pad(month + 1)}-01`)
}

/**
 * Desplaza meses conservando el día, y lo recorta si el mes destino es más corto.
 *
 * Sin recorte, el 31 de marzo menos un mes daría el 3 de marzo en lugar del 28 de
 * febrero, porque `Date` desborda hacia el mes siguiente.
 */
export function addMonths(key: DayKey, months: number): DayKey {
  const date = fromDayKey(key)
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return toDayKey(target)
}

/** Mismo día del año anterior o posterior, recortando el 29 de febrero. */
export function addYears(key: DayKey, years: number): DayKey {
  return addMonths(key, years * 12)
}

/** `Marzo de 2026` — cabecera del periodo en Historial. */
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function formatMonthName(key: DayKey): string {
  const date = fromDayKey(key)
  return `${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`
}

export function formatYearName(key: DayKey): string {
  return String(fromDayKey(key).getFullYear())
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
