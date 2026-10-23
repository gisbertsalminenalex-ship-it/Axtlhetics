/**
 * Alimentación con cifras (D-061).
 *
 * Lo que haría un entrenador: calorías y proteína según el objetivo, y cada
 * pocas semanas mirar la tendencia del peso y ajustar. Las calorías salen de
 * Mifflin-St Jeor por un factor de actividad según los días que entrena; es
 * una estimación de partida, y por eso el ajuste mira lo que hace el peso de
 * verdad.
 *
 * **Menores de 18 años** (D-023, D-066): las mismas cifras y el mismo registro
 * que un adulto, pero nunca un déficit. Están creciendo y comer de menos tiene
 * más coste: el objetivo no baja de lo que gastan y los ajustes solo suben.
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

/** Grasa, en % de las calorías (D-066). Los carbohidratos son el resto. */
export const FAT_KCAL_SHARE = [0.25, 0.3] as const

export type NutritionTargets = {
  /** Calorías al día, redondeadas a 50. */
  kcal: number
  /** Lo que se estima que gasta, sin el objetivo. */
  maintenanceKcal: number
  proteinGrams: readonly [number, number]
  /** Grasa y carbohidratos, en g (D-066). */
  fatGrams: readonly [number, number]
  carbsGrams: readonly [number, number]
  /** Menor de 18 (D-023, D-066): las mismas cifras, pero nunca por debajo de lo que gasta. */
  minor: boolean
  text: string
}

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
  const minor = input.age < ADULT_AGE

  const basal = basalKcal(input)
  const maintenance = basal * activityFactor(input.trainingDays)
  const goalDelta =
    plan.goal === 'perder_grasa'
      ? -Math.min(500, 0.15 * maintenance)
      : plan.goal === 'ganar_musculo'
        ? Math.min(300, 0.1 * maintenance)
        : 0
  // Nunca por debajo del gasto en reposo: comer menos que eso no es un déficit sensato.
  // Un menor está creciendo: nunca por debajo de lo que gasta (D-023, D-066).
  const floor = minor ? maintenance : basal
  const kcal = round50(Math.max(floor, maintenance + goalDelta + plan.adjustmentKcal))
  const [low, high] = PROTEIN_PER_KG[plan.goal]
  const proteinGrams = [round5(low * input.weightKg), round5(high * input.weightKg)] as const
  const fatGrams = [round5((FAT_KCAL_SHARE[0] * kcal) / 9), round5((FAT_KCAL_SHARE[1] * kcal) / 9)] as const
  // Lo que queda para los carbohidratos, con las cifras altas o bajas de lo demás.
  const carbsGrams = [
    Math.max(0, round5((kcal - proteinGrams[1] * 4 - fatGrams[1] * 9) / 4)),
    Math.max(0, round5((kcal - proteinGrams[0] * 4 - fatGrams[0] * 9) / 4)),
  ] as const
  const how: Record<NutritionGoal, string> = {
    perder_grasa: minor
      ? `a tu edad no se come menos: es lo que gastas, y el cambio llega entrenando con constancia y durmiendo bien. Si te preocupa tu peso, háblalo con tu médico`
      : 'un déficit moderado: perder entre medio y un 1 % de tu peso a la semana, sin perder músculo',
    mantener: minor ? 'lo que gastas: suficiente para entrenar y crecer' : 'lo que gastas: mantener el peso mientras entrenas',
    ganar_musculo: 'un ligero superávit: ganar músculo sin acumular grasa de más',
  }
  return {
    kcal,
    maintenanceKcal: round50(maintenance),
    proteinGrams,
    fatGrams,
    carbsGrams,
    minor,
    text: `Unas ${kcal.toLocaleString('es-ES')} kcal y ${proteinGrams[0]}–${proteinGrams[1]} g de proteína al día, repartida en 3 o 4 comidas (${PROTEIN_FOODS}): ${how[plan.goal]}. ${NUTRITION_DISCLAIMER}`,
  }
}

/**
 * Lo que AXIS dice al mirar el peso: un ajuste del objetivo (`adjust`) o, si lo
 * que se apunta comer explica el peso, que primero hay que acercarse al
 * objetivo (`adherence`, D-066), sin tocarlo.
 */
export type NutritionAdjustment = { kind: 'adjust' | 'adherence'; deltaKcal: number; reason: string }

/** Días completos apuntados desde el último ajuste para que cuente lo que se come (D-066). */
export const MIN_LOGGED_DAYS_FOR_ADHERENCE = 7
/** Diferencia con el objetivo, en kcal al día, a partir de la que lo comido explica el peso. */
export const ADHERENCE_GAP_KCAL = 250

/**
 * El ajuste que toca según lo que hace el peso, o `null` si va bien o si aún no
 * hay datos suficientes (3 semanas con pesos desde el último ajuste). A un
 * menor nunca se le baja el objetivo (D-023). Con lo comido apuntado
 * (`intake`, D-066), si la media se aleja del objetivo en la dirección que
 * explica el peso, no se cambia el objetivo: se dice. AXIS lo propone; el
 * usuario lo acepta.
 */
export function proposeAdjustment(input: {
  plan: NutritionPlan
  age: number
  weightKg: number
  weeks: readonly WeekWeight[]
  /** El objetivo de hoy y la media de los días completos apuntados desde el último ajuste. */
  targetKcal?: number
  intake?: { averageKcal: number; days: number } | null
}): NutritionAdjustment | null {
  const { plan, weightKg } = input
  if (weightKg <= 0) return null
  const minor = input.age < ADULT_AGE
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

  // Lo que se come de verdad explica el peso: el objetivo no es el problema.
  const eaten =
    input.intake && input.targetKcal !== undefined && input.intake.days >= MIN_LOGGED_DAYS_FOR_ADHERENCE
      ? { gap: input.intake.averageKcal - input.targetKcal, average: Math.round(input.intake.averageKcal / 50) * 50 }
      : null
  const adherence = (direction: 'más' | 'menos'): NutritionAdjustment => ({
    kind: 'adherence',
    deltaKcal: 0,
    reason: `Tu peso cambia ${kg(change)} por semana y ${wanted}, pero comes de media unas ${eaten!.average.toLocaleString('es-ES')} kcal, ${direction} que tu objetivo de ${input.targetKcal!.toLocaleString('es-ES')}. Antes de cambiarlo, acércate a él una semana.`,
  })

  if (ratePct < low) {
    if (eaten && eaten.gap < -ADHERENCE_GAP_KCAL) return adherence('menos')
    if (plan.adjustmentKcal + ADJUSTMENT_STEP_KCAL <= MAX_ADJUSTMENT_KCAL) {
      return {
        kind: 'adjust',
        deltaKcal: ADJUSTMENT_STEP_KCAL,
        reason: `Tu peso cambia ${kg(change)} por semana y ${wanted}: sube ${ADJUSTMENT_STEP_KCAL} kcal al día.`,
      }
    }
  }
  if (ratePct > high) {
    if (eaten && eaten.gap > ADHERENCE_GAP_KCAL) return adherence('más')
    if (!minor && plan.adjustmentKcal - ADJUSTMENT_STEP_KCAL >= -MAX_ADJUSTMENT_KCAL) {
      return {
        kind: 'adjust',
        deltaKcal: -ADJUSTMENT_STEP_KCAL,
        reason: `Tu peso cambia ${kg(change)} por semana y ${wanted}: baja ${ADJUSTMENT_STEP_KCAL} kcal al día.`,
      }
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
