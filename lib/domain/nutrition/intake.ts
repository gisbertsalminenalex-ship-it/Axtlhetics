/**
 * Lo que se come (D-066): las comidas que el usuario apunta, con calorías,
 * proteína, carbohidratos y grasa, y lo que AXIS saca de ellas.
 *
 * Se guardan en el registro del día (`BodyMeasurement.meals`, D-060), junto al
 * peso y la respuesta de proteína. Un día cuenta como **completo** cuando tiene
 * la cena o al menos tres comidas: solo con días completos se calculan medias y
 * se dice que se comió poco, para que un registro a medias no engañe a AXIS.
 *
 * Todo lo de aquí es puro.
 */

import { addDays, type DayKey } from '../shared/dates'
import { isFiniteNumber, isOneOf, isRecord } from '../shared/guards'
import type { NutritionTargets } from './targets'

export type MealSlot = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'snack'

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  merienda: 'Merienda',
  cena: 'Cena',
  snack: 'Picoteo',
}

export const MEAL_SLOT_ORDER = Object.keys(MEAL_SLOT_LABELS) as MealSlot[]

export type MealEntry = {
  id: string
  slot: MealSlot
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  createdAt: string
}

/** Límites de entrada: evitan guardar un dato imposible, no son una referencia. */
export const MEAL_LIMITS = { kcal: 5000, grams: 500 } as const

export type DayIntake = { kcal: number; proteinG: number; carbsG: number; fatG: number; meals: number; complete: boolean }

/** Desde cuántas comidas, sin la cena, un día cuenta como completo. */
export const MEALS_FOR_COMPLETE_DAY = 3

export function dayIntake(meals: readonly MealEntry[] | undefined): DayIntake {
  const list = meals ?? []
  const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => Math.round(list.reduce((total, meal) => total + meal[key], 0))
  return {
    kcal: sum('kcal'),
    proteinG: sum('proteinG'),
    carbsG: sum('carbsG'),
    fatG: sum('fatG'),
    meals: list.length,
    complete: list.length >= MEALS_FOR_COMPLETE_DAY || list.some((meal) => meal.slot === 'cena'),
  }
}

/**
 * Si ese día llegó a su proteína: con comidas apuntadas lo dicen los gramos
 * (D-066); sin ellas, lo que contestó a «¿Hoy llegaste a tu proteína?» (D-061).
 * Un día a medias que aún no llega no cuenta como «no».
 */
export function proteinReached(
  record: { meals?: readonly MealEntry[]; protein?: boolean | null },
  proteinTarget: number | null,
): boolean | null {
  const intake = dayIntake(record.meals)
  if (intake.meals > 0 && proteinTarget !== null) {
    if (intake.proteinG >= proteinTarget) return true
    return intake.complete ? false : null
  }
  return typeof record.protein === 'boolean' ? record.protein : null
}

/** Media de calorías y proteína de los días completos, o `null` si no hay ninguno. */
export function averageIntake(
  records: readonly { dayKey: DayKey; meals?: readonly MealEntry[] }[],
  from: DayKey,
  to: DayKey,
): { averageKcal: number; averageProteinG: number; days: number } | null {
  const days = records
    .filter((record) => record.dayKey >= from && record.dayKey <= to)
    .map((record) => dayIntake(record.meals))
    .filter((intake) => intake.complete)
  if (days.length === 0) return null
  return {
    averageKcal: Math.round(days.reduce((total, day) => total + day.kcal, 0) / days.length),
    averageProteinG: Math.round(days.reduce((total, day) => total + day.proteinG, 0) / days.length),
    days: days.length,
  }
}

/** Por debajo de esta parte del objetivo, un día completo es comer poco (D-066). */
export const LOW_INTAKE_RATIO = 0.7

/**
 * Lo que se comió ayer si fue muy poco: un día completo por debajo del 70 % de
 * las calorías objetivo. Con eso AXIS propone hoy una sesión más suave.
 */
export function lowIntakeYesterday(
  records: readonly { dayKey: DayKey; meals?: readonly MealEntry[] }[],
  today: DayKey,
  targets: Pick<NutritionTargets, 'kcal'> | null,
): { kcal: number; targetKcal: number } | null {
  if (!targets) return null
  const yesterday = records.find((record) => record.dayKey === addDays(today, -1))
  const intake = dayIntake(yesterday?.meals)
  if (!intake.complete || intake.kcal >= LOW_INTAKE_RATIO * targets.kcal) return null
  return { kcal: intake.kcal, targetKcal: targets.kcal }
}

export function isMealEntry(value: unknown): value is MealEntry {
  if (!isRecord(value)) return false
  const grams = (item: unknown) => isFiniteNumber(item) && item >= 0 && item <= MEAL_LIMITS.grams
  return (
    typeof value.id === 'string' &&
    isOneOf(value.slot, MEAL_SLOT_ORDER) &&
    isFiniteNumber(value.kcal) &&
    value.kcal >= 0 &&
    value.kcal <= MEAL_LIMITS.kcal &&
    grams(value.proteinG) &&
    grams(value.carbsG) &&
    grams(value.fatG) &&
    typeof value.createdAt === 'string'
  )
}
