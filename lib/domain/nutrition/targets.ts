/**
 * Alimentación con cifras (D-061).
 *
 * Lo que haría un entrenador: calorías y proteína según el objetivo, y cada
 * pocas semanas mirar la tendencia del peso y ajustar. Las calorías salen de
 * Mifflin-St Jeor por un factor de actividad según los días que entrena; es
 * una estimación de partida, y por eso el ajuste mira lo que hace el peso de
 * verdad.
 *
 * **Menores de 18 años** (D-023, enmienda del 2026-10-14): nunca déficit ni
 * cifras. Están creciendo: las fórmulas de gasto no valen igual para ellos y
 * comer de menos tiene más coste. Reciben la misma orientación sin números.
 *
 * Es una guía general, no un plan ni un consejo médico, y lo dice.
 */

import type { DayKey } from '../shared/dates'
import { isDayKey, isFiniteNumber, isOneOf, isRecord } from '../shared/guards'
import { startOfWeek } from '../shared/dates'
import { weeklyWeightChange, type WeekWeight } from '../body/measurements'

export type NutritionGoal = 'perder_grasa' | 'mantener' | 'ganar_musculo'

export const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = {
  perder_grasa: 'Perder grasa',
  mantener: 'Mantener mi peso',
  ganar_musculo: 'Ganar músculo',
}

export const NUTRITION_GOAL_ORDER = Object.keys(NUTRITION_GOAL_LABELS) as NutritionGoal[]

/** Lo que se guarda en el perfil: el objetivo y los ajustes aceptados. */
export type NutritionPlan = {
  goal: NutritionGoal
  /** Suma de los ajustes aceptados, en kcal al día. */
  adjustmentKcal: number
  /** El día del último ajuste, o en que se eligió el objetivo. */
  since: DayKey
}

export const ADULT_AGE = 18
export const NUTRITION_DISCLAIMER = 'Es una guía general: no sustituye a un profesional de la nutrición.'
const PROTEIN_FOODS = 'huevos, carne, pescado, legumbres o lácteos'

/** Proteína en g por kg de peso, por objetivo. */
export const PROTEIN_PER_KG: Record<NutritionGoal, readonly [number, number]> = {
  perder_grasa: [2.0, 2.2],
  mantener: [1.6, 2.0],
  ganar_musculo: [1.6, 2.0],
}

/** Cambio de peso buscado, en % del peso por semana. */
export const TARGET_RATE_PCT: Record<NutritionGoal, readonly [number, number]> = {
  perder_grasa: [-1.0, -0.5],
  mantener: [-0.25, 0.25],
  ganar_musculo: [0.1, 0.5],
}

/** Cuánto se mueve cada ajuste, y cuánto en total como mucho. */
export const ADJUSTMENT_STEP_KCAL = 150
export const MAX_ADJUSTMENT_KCAL = 500
/** Semanas con peso desde el último ajuste antes de proponer otro. */
export const WEEKS_BEFORE_ADJUSTING = 3

export type NutritionTargets =
  | {
      kind: 'adult'
      /** Calorías al día, redondeadas a 50. */
      kcal: number
      /** Lo que se estima que gasta, sin el objetivo. */
      maintenanceKcal: number
      proteinGrams: readonly [number, number]
      text: string
    }
  | { kind: 'minor'; text: string }

/** El factor de actividad según los días que entrena. */
export function activityFactor(trainingDays: number): number {
  if (trainingDays <= 2) return 1.375
  if (trainingDays <= 4) return 1.5
  return 1.65
}

/** Mifflin-St Jeor. Sin sexo, el punto medio entre las dos fórmulas. */
export function basalKcal(input: { weightKg: number; heightCm: number; age: number; sex: 'hombre' | 'mujer' | null }): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return base + (input.sex === 'hombre' ? 5 : input.sex === 'mujer' ? -161 : -78)
}

const round50 = (value: number) => Math.round(value / 50) * 50
const round5 = (value: number) => Math.round(value / 5) * 5

export function nutritionTargets(input: {
  plan: NutritionPlan
  age: number
  weightKg: number
  heightCm: number
  sex: 'hombre' | 'mujer' | null
  trainingDays: number
}): NutritionTargets {
  const { plan } = input
  if (input.age < ADULT_AGE) {
    const minor: Record<NutritionGoal, string> = {
      ganar_musculo: `Para ganar músculo, come algo más de lo habitual y con proteína en cada comida (${PROTEIN_FOODS}): estás creciendo, y entrenar pide energía.`,
      perder_grasa: `A tu edad no hace falta comer menos: come suficiente, con proteína en cada comida (${PROTEIN_FOODS}), entrena con constancia y duerme bien. Si te preocupa tu peso, háblalo con tu médico.`,
      mantener: `Come suficiente para entrenar y crecer, con proteína en cada comida (${PROTEIN_FOODS}).`,
    }
    return { kind: 'minor', text: `${minor[plan.goal]} ${NUTRITION_DISCLAIMER}` }
  }

  const basal = basalKcal(input)
  const maintenance = basal * activityFactor(input.trainingDays)
  const goalDelta =
    plan.goal === 'perder_grasa'
      ? -Math.min(500, 0.15 * maintenance)
      : plan.goal === 'ganar_musculo'
        ? Math.min(300, 0.1 * maintenance)
        : 0
  // Nunca por debajo del gasto en reposo: comer menos que eso no es un déficit sensato.
  const kcal = round50(Math.max(basal, maintenance + goalDelta + plan.adjustmentKcal))
  const [low, high] = PROTEIN_PER_KG[plan.goal]
  const proteinGrams = [round5(low * input.weightKg), round5(high * input.weightKg)] as const
  const how: Record<NutritionGoal, string> = {
    perder_grasa: 'un déficit moderado: perder entre medio y un 1 % de tu peso a la semana, sin perder músculo',
    mantener: 'lo que gastas: mantener el peso mientras entrenas',
    ganar_musculo: 'un ligero superávit: ganar músculo sin acumular grasa de más',
  }
  return {
    kind: 'adult',
    kcal,
    maintenanceKcal: round50(maintenance),
    proteinGrams,
    text: `Unas ${kcal.toLocaleString('es-ES')} kcal y ${proteinGrams[0]}–${proteinGrams[1]} g de proteína al día, repartida en 3 o 4 comidas: ${how[plan.goal]}. ${NUTRITION_DISCLAIMER}`,
  }
}

export type NutritionAdjustment = { deltaKcal: number; reason: string }

/**
 * El ajuste que toca según lo que hace el peso, o `null` si va bien, si aún no
 * hay datos suficientes (3 semanas con pesos desde el último ajuste) o si es
 * menor de edad. AXIS lo propone; el usuario lo acepta.
 */
export function proposeAdjustment(input: {
  plan: NutritionPlan
  age: number
  weightKg: number
  weeks: readonly WeekWeight[]
}): NutritionAdjustment | null {
  const { plan, weightKg } = input
  if (input.age < ADULT_AGE || weightKg <= 0) return null
  const since = startOfWeek(plan.since)
  const weeks = input.weeks.filter((week) => week.weekStart > since)
  if (weeks.length < WEEKS_BEFORE_ADJUSTING) return null
  const change = weeklyWeightChange(weeks)
  if (change === null) return null

  const ratePct = (change / weightKg) * 100
  const [low, high] = TARGET_RATE_PCT[plan.goal]
  const kg = (value: number) => {
    const rounded = Math.round(value * 10) / 10
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString('es-ES')} kg`
  }
  const wanted = `buscamos entre ${kg((low * weightKg) / 100)} y ${kg((high * weightKg) / 100)}`
  if (ratePct < low && plan.adjustmentKcal + ADJUSTMENT_STEP_KCAL <= MAX_ADJUSTMENT_KCAL) {
    return {
      deltaKcal: ADJUSTMENT_STEP_KCAL,
      reason: `Tu peso cambia ${kg(change)} por semana y ${wanted}: sube ${ADJUSTMENT_STEP_KCAL} kcal al día.`,
    }
  }
  if (ratePct > high && plan.adjustmentKcal - ADJUSTMENT_STEP_KCAL >= -MAX_ADJUSTMENT_KCAL) {
    return {
      deltaKcal: -ADJUSTMENT_STEP_KCAL,
      reason: `Tu peso cambia ${kg(change)} por semana y ${wanted}: baja ${ADJUSTMENT_STEP_KCAL} kcal al día.`,
    }
  }
  return null
}

/** El plan con un ajuste aceptado hoy. */
export function withAdjustment(plan: NutritionPlan, deltaKcal: number, today: DayKey): NutritionPlan {
  return { ...plan, adjustmentKcal: plan.adjustmentKcal + deltaKcal, since: today }
}

export function isNutritionPlan(value: unknown): value is NutritionPlan {
  return (
    isRecord(value) &&
    isOneOf(value.goal, NUTRITION_GOAL_ORDER) &&
    isFiniteNumber(value.adjustmentKcal) &&
    Math.abs(value.adjustmentKcal) <= MAX_ADJUSTMENT_KCAL &&
    isDayKey(value.since)
  )
}
