/**
 * Guía general de alimentación del escáner (D-023, enmienda del 2026-10-14).
 *
 * Sale de la prioridad del usuario, su grasa estimada, su peso y su edad. Es una
 * orientación general, no un plan ni un consejo médico, y lo dice.
 *
 * **Menores de 18 años:** nunca déficit ni cifras. Si quieren ganar músculo, que
 * coman algo más de lo habitual; siempre, comer suficiente para entrenar y crecer.
 * Están creciendo: las fórmulas de gasto no valen igual para ellos y comer de
 * menos tiene más coste.
 */

import type { ScanSex } from './body-fat'
import { NUTRITION } from './scales'
import type { ScanPriority } from './summary'

export type NutritionInput = {
  priority: ScanPriority | null
  age: number | null
  weightKg: number | null
  sex: ScanSex | null
  bodyFatPct: number | null
}

const DISCLAIMER = 'Es una guía general: no sustituye a un profesional de la nutrición.'
const PROTEIN_FOODS = 'huevos, carne, pescado, legumbres o lácteos'

/** Gramos de proteína al día, redondeados a 5 g; `null` sin peso. */
function proteinGrams(priority: ScanPriority, weightKg: number | null): string | null {
  if (!weightKg || weightKg <= 0) return null
  const [low, high] = NUTRITION.proteinPerKg[priority]
  const round5 = (n: number) => Math.round(n / 5) * 5
  return `${round5(low * weightKg)}–${round5(high * weightKg)} g`
}

const range = ([low, high]: readonly [number, number]) => `${low}–${high}`

/** La guía para este escaneo, o `null` sin prioridad declarada. */
export function nutritionGuide(input: NutritionInput): string | null {
  const { priority } = input
  if (!priority) return null

  // Menores (o edad desconocida): sin déficit y sin cifras.
  if (input.age === null || input.age < NUTRITION.adultAge) {
    const minor: Record<ScanPriority, string> = {
      musculo: `Para ganar músculo, come algo más de lo habitual y con proteína en cada comida (${PROTEIN_FOODS}): estás creciendo, y entrenar pide energía.`,
      definir: `A tu edad no hace falta comer menos: lo que hace que se note más el músculo es ganar músculo. Come suficiente, con proteína en cada comida (${PROTEIN_FOODS}), y entrena con constancia.`,
      fuerza: `Come suficiente para entrenar y crecer, con proteína en cada comida (${PROTEIN_FOODS}): sin energía, la fuerza no sube.`,
      equilibrio: `Come suficiente para entrenar y crecer, con proteína en cada comida (${PROTEIN_FOODS}).`,
    }
    return `${minor[priority]} ${DISCLAIMER}`
  }

  const grams = proteinGrams(priority, input.weightKg)
  const protein = grams ? `unos ${grams} de proteína al día` : `proteína en cada comida (${PROTEIN_FOODS})`
  const lean = input.sex && input.bodyFatPct !== null && input.bodyFatPct <= NUTRITION.leanFatPct[input.sex]
  const adult: Record<ScanPriority, string> = {
    musculo: `Para ganar músculo, come algo más de lo que gastas, un ligero superávit de unas ${range(NUTRITION.surplusKcal)} kcal al día, y ${protein}, repartida en 3 o 4 comidas.`,
    definir: lean
      ? `Tu grasa estimada ya es baja: para que se note más el músculo, lo que falta es músculo, no comer menos. Come lo que gastas y ${protein}.`
      : `Para que se note más el músculo, un ligero déficit de unas ${range(NUTRITION.deficitKcal)} kcal al día ayuda a perder grasa, siempre con ${protein} para no perder músculo.`,
    fuerza: `Come lo que gastas y ${protein}: para ganar fuerza, lo que más cuenta después de entrenar es dormir y recuperar.`,
    equilibrio: `Come lo que gastas, con ${protein}.`,
  }
  return `${adult[priority]} ${DISCLAIMER}`
}
