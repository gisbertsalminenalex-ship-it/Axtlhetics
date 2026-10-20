/**
 * El material de cada usuario (D-046).
 *
 * El perfil guarda lo que hay en casa con palabras de persona —una barra de
 * dominadas, gomas, un banco y una lista de pesas—; el catálogo habla en
 * requisitos (`Equipment`). Este módulo traduce lo primero a lo segundo y decide
 * qué kilos se pueden sugerir para cada ejercicio. Nada más lo hace.
 *
 * El peso corporal y una silla o un escalón se dan siempre por supuestos.
 */

import type { ExperienceLevel } from '../profile/types'
import { isArrayOf, isFiniteNumber, isOneOf, isRecord } from '../shared/guards'
import type { Equipment, Exercise } from './types'

/** El material que no es una pesa. */
export type GearItem = 'barra_dominadas' | 'gomas' | 'banco'

export const GEAR_ITEM_LABELS: Record<GearItem, string> = {
  barra_dominadas: 'Barra de dominadas',
  gomas: 'Gomas elásticas',
  banco: 'Banco',
}

/** Orden estable para enseñar y para guardar. */
export const GEAR_ITEM_ORDER: readonly GearItem[] = ['barra_dominadas', 'gomas', 'banco']

export type WeightKind = 'mancuerna' | 'kettlebell'

export const WEIGHT_KIND_LABELS: Record<WeightKind, string> = {
  mancuerna: 'Mancuerna',
  kettlebell: 'Kettlebell',
}

const WEIGHT_KIND_ORDER: readonly WeightKind[] = ['mancuerna', 'kettlebell']

/** Una pesa de la lista: «mancuernas de 10 kg, un par». */
export type FreeWeight = {
  kind: WeightKind
  kg: number
  /** Dos iguales. Hace falta para los ejercicios con una pesa en cada mano. */
  pair: boolean
}

export type UserEquipment = {
  items: GearItem[]
  weights: FreeWeight[]
}

/** Solo el cuerpo y una silla. */
export const NO_EQUIPMENT: UserEquipment = { items: [], weights: [] }

/**
 * Lo que se supone a un perfil anterior a D-046: el material de Alex, una sola
 * pesa de 5 kg. Así, para quien ya usaba la app, nada cambia hasta que lo edite.
 */
export const LEGACY_EQUIPMENT: UserEquipment = {
  items: [],
  weights: [{ kind: 'mancuerna', kg: 5, pair: false }],
}

/** Límites de entrada: evitan guardar una pesa imposible, no son una recomendación. */
export const MIN_WEIGHT_KG = 0.5
export const MAX_WEIGHT_KG = 100

/** El material del perfil, o el de antes de D-046 si el perfil no lo tiene. */
export function equipmentOf(profile: { equipment?: UserEquipment } | null | undefined): UserEquipment {
  return profile?.equipment ?? LEGACY_EQUIPMENT
}

/**
 * Lo que el material permite, en los términos del catálogo. `ninguno` y
 * `superficie_elevada` siempre: todo el mundo tiene suelo y una silla.
 */
export function availableEquipment(gear: UserEquipment): Equipment[] {
  const available: Equipment[] = ['ninguno', 'superficie_elevada', ...gear.items]
  if (gear.weights.length > 0) available.push('pesa')
  if (gear.weights.some((weight) => weight.pair)) available.push('par_pesas')
  if (gear.weights.some((weight) => weight.kind === 'kettlebell')) available.push('kettlebell')
  return available
}

/**
 * Los kilos con los que se puede hacer el ejercicio, de menor a mayor. Vacío si
 * no lleva carga o si el material no la tiene.
 *
 * Una kettlebell sirve para todo lo que pide «una pesa»; lo que pide
 * «kettlebell» (el swing) solo se hace con una; y lo que pide un par, solo con
 * pares.
 */
export function loadsFor(exercise: Pick<Exercise, 'equipment'>, gear: UserEquipment): number[] {
  const needs = exercise.equipment
  const usable = needs.includes('kettlebell')
    ? gear.weights.filter((weight) => weight.kind === 'kettlebell')
    : needs.includes('par_pesas')
      ? gear.weights.filter((weight) => weight.pair)
      : needs.includes('pesa')
        ? gear.weights
        : []
  return [...new Set(usable.map((weight) => weight.kg))].sort((a, b) => a - b)
}

/** El peso más pesado del material, o `null` si no hay pesas. */
export function heaviestLoad(gear: UserEquipment): number | null {
  return gear.weights.length > 0 ? Math.max(...gear.weights.map((weight) => weight.kg)) : null
}

/** Cuánto se estira la referencia de partida según la experiencia declarada. */
export const START_LOAD_FACTOR: Record<ExperienceLevel, number> = {
  principiante: 1,
  intermedio: 1.5,
  avanzado: 2,
}

/**
 * El peso con el que se empieza un ejercicio: el más pesado que no pase la
 * referencia del catálogo para esta experiencia, o el más ligero si todos la
 * pasan. Con una sola pesa, esa pesa.
 */
export function startingLoad(
  exercise: Pick<Exercise, 'startLoadKg'>,
  loads: readonly number[],
  experience: ExperienceLevel,
): number | null {
  if (loads.length === 0) return null
  const reference = (exercise.startLoadKg ?? loads[0]) * (START_LOAD_FACTOR[experience] ?? 1)
  const fitting = loads.filter((kg) => kg <= reference)
  return fitting.length > 0 ? fitting[fitting.length - 1] : loads[0]
}

/** El siguiente peso por encima de `current`, o `null` si no hay ninguno mayor. */
export function nextLoad(loads: readonly number[], current: number): number | null {
  return loads.find((kg) => kg > current) ?? null
}

/**
 * El material en su forma canónica: cada pesa una vez por tipo y kilos (si
 * alguna de las repetidas es un par, queda el par), ordenadas, y el resto del
 * material sin repetir y en su orden.
 */
export function normalizeEquipment(gear: UserEquipment): UserEquipment {
  const byKey = new Map<string, FreeWeight>()
  for (const weight of gear.weights) {
    const key = `${weight.kind}:${weight.kg}`
    const existing = byKey.get(key)
    byKey.set(key, { ...weight, pair: weight.pair || (existing?.pair ?? false) })
  }
  const weights = [...byKey.values()].sort(
    (a, b) => WEIGHT_KIND_ORDER.indexOf(a.kind) - WEIGHT_KIND_ORDER.indexOf(b.kind) || a.kg - b.kg,
  )
  return { items: GEAR_ITEM_ORDER.filter((item) => gear.items.includes(item)), weights }
}

/** «5 kg» o «12,5 kg». */
export function formatWeightKg(kg: number): string {
  return `${String(kg).replace('.', ',')} kg`
}

/** «Mancuernas de 10 kg (par)», «Kettlebell de 12 kg». */
export function describeWeight(weight: FreeWeight): string {
  const name = weight.kind === 'mancuerna' ? (weight.pair ? 'Mancuernas' : 'Mancuerna') : weight.pair ? 'Kettlebells' : 'Kettlebell'
  return `${name} de ${formatWeightKg(weight.kg)}${weight.pair ? ' (par)' : ''}`
}

function isFreeWeight(value: unknown): value is FreeWeight {
  if (!isRecord(value)) return false
  if (!isOneOf(value.kind, WEIGHT_KIND_ORDER)) return false
  if (!isFiniteNumber(value.kg) || value.kg < MIN_WEIGHT_KG || value.kg > MAX_WEIGHT_KG) return false
  return typeof value.pair === 'boolean'
}

/** Comprobación de forma, para leer una copia de seguridad. */
export function isUserEquipment(value: unknown): value is UserEquipment {
  if (!isRecord(value)) return false
  if (!isArrayOf(value.items, (item): item is GearItem => isOneOf(item, GEAR_ITEM_ORDER))) return false
  return isArrayOf(value.weights, isFreeWeight)
}
