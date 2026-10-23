/**
 * Peso y medidas (D-060).
 *
 * Un entrenador no mira el peso de un día, mira la media de la semana: el agua,
 * la sal y la hora mueven la báscula un kilo arriba o abajo sin que cambie nada.
 * Y mide con cinta cada dos semanas, porque la cintura cuenta lo que el peso
 * no (perder grasa y ganar músculo a la vez puede dejar el peso quieto).
 *
 * Un registro por día, en el dispositivo. Todo lo de aquí es puro.
 */

import { addDays, daysBetween, startOfWeek, type DayKey } from '../shared/dates'
import { isArrayOf, isDayKey, isNullableNumber, isRecord } from '../shared/guards'
import { isMealEntry, type MealEntry } from '../nutrition/intake'

export type PerimeterKey = 'cintura' | 'cadera' | 'pecho' | 'brazo' | 'muslo'

export const PERIMETER_LABELS: Record<PerimeterKey, string> = {
  cintura: 'Cintura',
  cadera: 'Cadera',
  pecho: 'Pecho',
  brazo: 'Brazo',
  muslo: 'Muslo',
}

export const PERIMETER_ORDER = Object.keys(PERIMETER_LABELS) as PerimeterKey[]

/** Dónde se mide cada perímetro, para que dos medidas sean comparables. */
export const PERIMETER_HINTS: Record<PerimeterKey, string> = {
  cintura: 'A la altura del ombligo, sin apretar y tras soltar el aire.',
  cadera: 'Por la parte más ancha de los glúteos.',
  pecho: 'Por la línea de los pezones, con los brazos caídos.',
  brazo: 'El derecho, relajado, a mitad entre hombro y codo.',
  muslo: 'El derecho, a mitad entre cadera y rodilla.',
}

export type BodyMeasurement = {
  dayKey: DayKey
  weightKg: number | null
  /** Perímetros en cm. Ausente o `null`: ese día no se midió. */
  perimeters: Partial<Record<PerimeterKey, number | null>>
  /** Si ese día llegó a su proteína (D-061). Ausente o `null`: no contestó. */
  protein?: boolean | null
  /** Las comidas apuntadas ese día (D-066). Ausente: ninguna. */
  meals?: MealEntry[]
  updatedAt: string
}

/** Límites de entrada: evitan guardar un dato imposible, no son una referencia. */
export const WEIGHT_LIMITS = { min: 25, max: 250 } as const
export const PERIMETER_LIMITS = { min: 10, max: 250 } as const

/** Cada cuántos días toca volver a medir con cinta: una vez al mes, con la revisión (D-067). */
export const PERIMETER_INTERVAL_DAYS = 28

/** Dónde empieza la cinta cuando aún no hay ninguna medida: el centro de un rango común. */
export const PERIMETER_START: Record<PerimeterKey, number> = { cintura: 80, cadera: 95, pecho: 95, brazo: 30, muslo: 55 }

export function emptyMeasurement(dayKey: DayKey, updatedAt: string): BodyMeasurement {
  return { dayKey, weightKg: null, perimeters: {}, updatedAt }
}

/** El registro del día con el peso puesto, sin tocar los perímetros. */
export function withWeight(current: BodyMeasurement, weightKg: number | null, updatedAt: string): BodyMeasurement {
  return { ...current, weightKg, updatedAt }
}

/** El registro del día con estos perímetros, sin tocar el peso. */
export function withPerimeters(
  current: BodyMeasurement,
  perimeters: Partial<Record<PerimeterKey, number | null>>,
  updatedAt: string,
): BodyMeasurement {
  return { ...current, perimeters: { ...current.perimeters, ...perimeters }, updatedAt }
}

/** El registro del día con la respuesta de proteína (D-061). */
export function withProtein(current: BodyMeasurement, protein: boolean, updatedAt: string): BodyMeasurement {
  return { ...current, protein, updatedAt }
}


/** El registro del día con una comida más (D-066). */
export function withMeal(current: BodyMeasurement, meal: MealEntry, updatedAt: string): BodyMeasurement {
  return { ...current, meals: [...(current.meals ?? []), meal], updatedAt }
}

/** El registro del día sin esa comida (D-066). */
export function withoutMeal(current: BodyMeasurement, mealId: string, updatedAt: string): BodyMeasurement {
  return { ...current, meals: (current.meals ?? []).filter((meal) => meal.id !== mealId), updatedAt }
}
/** Del más antiguo al más reciente. */
export function sortMeasurements(records: readonly BodyMeasurement[]): BodyMeasurement[] {
  return [...records].sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/** El peso más reciente registrado, o `null` si nunca se registró. */
export function latestWeight(records: readonly BodyMeasurement[]): { dayKey: DayKey; weightKg: number } | null {
  const last = sortMeasurements(records)
    .reverse()
    .find((record) => record.weightKg !== null)
  return last && last.weightKg !== null ? { dayKey: last.dayKey, weightKg: last.weightKg } : null
}

/** El peso con el que trabajar: el último registrado o, si no hay, el del perfil. */
export function currentWeight(records: readonly BodyMeasurement[], profileWeightKg: number): number {
  return latestWeight(records)?.weightKg ?? profileWeightKg
}

export type WeekWeight = {
  /** Lunes de la semana. */
  weekStart: DayKey
  /** Media de los pesos de esa semana, a una décima. */
  averageKg: number
  weighIns: number
}

/** La media de cada semana con pesos, de las últimas `weeks`, de la más antigua a la actual. */
export function weeklyWeights(records: readonly BodyMeasurement[], today: DayKey, weeks = 8): WeekWeight[] {
  const current = startOfWeek(today)
  const result: WeekWeight[] = []
  for (let back = weeks - 1; back >= 0; back--) {
    const weekStart = addDays(current, -7 * back)
    const end = addDays(weekStart, 7)
    const weights = records
      .filter((record) => record.dayKey >= weekStart && record.dayKey < end && record.dayKey <= today)
      .map((record) => record.weightKg)
      .filter((kg): kg is number => kg !== null)
    if (weights.length === 0) continue
    result.push({ weekStart, averageKg: round1(weights.reduce((a, b) => a + b, 0) / weights.length), weighIns: weights.length })
  }
  return result
}

/**
 * Cuánto cambia el peso por semana: la diferencia entre la media de la última
 * semana con pesos y la de hasta 4 semanas antes, dividida por las semanas que
 * las separan. `null` con menos de dos semanas con pesos.
 */
export function weeklyWeightChange(weeks: readonly WeekWeight[]): number | null {
  if (weeks.length < 2) return null
  const last = weeks[weeks.length - 1]
  const first = weeks.filter((week) => daysBetween(week.weekStart, last.weekStart) <= 28)[0]
  if (!first || first === last) return null
  const span = daysBetween(first.weekStart, last.weekStart) / 7
  return round2((last.averageKg - first.averageKg) / span)
}

/** Los últimos perímetros medidos de cada zona, con su día. */
export function latestPerimeters(records: readonly BodyMeasurement[]): Partial<Record<PerimeterKey, { dayKey: DayKey; cm: number }>> {
  const result: Partial<Record<PerimeterKey, { dayKey: DayKey; cm: number }>> = {}
  for (const record of sortMeasurements(records)) {
    for (const key of PERIMETER_ORDER) {
      const cm = record.perimeters[key]
      if (typeof cm === 'number') result[key] = { dayKey: record.dayKey, cm }
    }
  }
  return result
}

/** El cambio de cada perímetro entre la primera medida y la última. */
export function perimeterChanges(records: readonly BodyMeasurement[]): Partial<Record<PerimeterKey, { from: number; to: number }>> {
  const sorted = sortMeasurements(records)
  const result: Partial<Record<PerimeterKey, { from: number; to: number }>> = {}
  for (const key of PERIMETER_ORDER) {
    const values = sorted.map((record) => record.perimeters[key]).filter((cm): cm is number => typeof cm === 'number')
    if (values.length >= 2) result[key] = { from: values[0], to: values[values.length - 1] }
  }
  return result
}

/** `true` si toca medir con cinta: nunca se hizo o la última fue hace 28 días o más (D-067). */
export function perimetersDue(records: readonly BodyMeasurement[], today: DayKey): boolean {
  const last = sortMeasurements(records)
    .reverse()
    .find((record) => PERIMETER_ORDER.some((key) => typeof record.perimeters[key] === 'number'))
  return !last || daysBetween(last.dayKey, today) >= PERIMETER_INTERVAL_DAYS
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isPerimeterInRange(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'number' && value >= PERIMETER_LIMITS.min && value <= PERIMETER_LIMITS.max)
}

export function isBodyMeasurement(value: unknown): value is BodyMeasurement {
  if (!isRecord(value) || !isDayKey(value.dayKey) || typeof value.updatedAt !== 'string') return false
  if (!isNullableNumber(value.weightKg)) return false
  if (value.weightKg !== null && (value.weightKg < WEIGHT_LIMITS.min || value.weightKg > WEIGHT_LIMITS.max)) return false
  if (value.protein !== undefined && value.protein !== null && typeof value.protein !== 'boolean') return false
  if (value.meals !== undefined && !isArrayOf(value.meals, isMealEntry)) return false
  if (!isRecord(value.perimeters)) return false
  const perimeters = value.perimeters
  if (Object.keys(perimeters).some((key) => !(PERIMETER_ORDER as string[]).includes(key))) return false
  return PERIMETER_ORDER.every((key) => isPerimeterInRange(perimeters[key]))
}
