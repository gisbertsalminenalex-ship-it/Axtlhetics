/**
 * Fuerza estimada (D-055, D-056).
 *
 * Con las repeticiones de una serie, los kilos y cuántas quedaban en reserva se
 * estima de qué es capaz el usuario: el 1RM (fórmula de Epley) en los ejercicios
 * con carga, y las repeticiones máximas en los de peso corporal. Con eso AXIS
 * ajusta la siguiente serie durante la sesión y fija la carga exacta de la
 * próxima.
 *
 * Es una estimación, nunca un test de 1RM: no se pide a nadie que levante su
 * máximo. Sin la reserva contestada, una serie solo dice «al menos esto»: se
 * cuenta como hecha al fallo, que es lo más prudente.
 */

import type { CompletedSet, RepsInReserve } from './types'

/** Lo que vale cada respuesta en repeticiones. «3 o más» cuenta 3: lo mínimo que dice. */
export const RESERVE_REPS: Record<RepsInReserve, number> = {
  ninguna: 0,
  una_dos: 1,
  tres_mas: 3,
}

/** Orden de las respuestas, de menos a más reserva. */
const RESERVE_RANK: Record<RepsInReserve, number> = { ninguna: 0, una_dos: 1, tres_mas: 2 }

/**
 * Más allá de esto la fórmula exagera: una serie de 30 repeticiones no dice
 * cuánto se levanta a una. Esas series no estiman un 1RM.
 */
export const MAX_REPS_FOR_ESTIMATE = 20

/** La fórmula de Epley: kg × (1 + repeticiones hasta el fallo / 30). */
export function epley(kg: number, repsToFailure: number): number {
  return kg * (1 + repsToFailure / 30)
}

/** Repeticiones hasta el fallo de una serie: las hechas más las que quedaban. */
export function repsToFailure(set: Pick<CompletedSet, 'reps' | 'reserve'>): number {
  return set.reps + (set.reserve ? RESERVE_REPS[set.reserve] : 0)
}

/** El 1RM que estima una serie con carga, o `null` si no la lleva o no sirve para estimar. */
export function estimateOneRepMax(set: CompletedSet): number | null {
  if (!set.completed || set.weightKg === null || set.weightKg <= 0 || set.reps < 1) return null
  const total = repsToFailure(set)
  if (total > MAX_REPS_FOR_ESTIMATE) return null
  return epley(set.weightKg, total)
}

/** El mejor 1RM estimado entre unas series, o `null` si ninguna sirve. */
export function bestOneRepMax(sets: readonly CompletedSet[]): number | null {
  const estimates = sets.map(estimateOneRepMax).filter((value): value is number => value !== null)
  return estimates.length > 0 ? Math.max(...estimates) : null
}

/**
 * Cuántas repeticiones caben con `kg` dejando `reserve` en reserva, para un 1RM
 * estimado: Epley al revés. Nunca menos de 0.
 */
export function repsAt(oneRepMax: number, kg: number, reserve: number): number {
  if (kg <= 0) return 0
  return Math.max(0, Math.floor(30 * (oneRepMax / kg - 1) - reserve + 1e-9))
}

/** Redondea un 1RM para enseñarlo: al medio kilo. */
export function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2
}

// ---------------------------------------------------------------------------
// La siguiente serie (D-055)
// ---------------------------------------------------------------------------

/**
 * La reserva que se busca en una serie: 1–2 en una sesión normal o fuerte, 3 o
 * más en una ligera o de descarga. Es lo que se dice en la pantalla del
 * ejercicio y contra lo que se compara lo que contesta el usuario.
 */
export function targetReserveFor(plan: { intensity: string; deload?: boolean }): RepsInReserve {
  return plan.intensity === 'ligera' || plan.deload ? 'tres_mas' : 'una_dos'
}

/** Repeticiones que se suman o restan cuando la reserva se aleja del objetivo y no hay otro peso. */
export const IN_SESSION_REP_STEP = 2

export type NextSet = { reps: number; weightKg: number | null }

/**
 * Lo que toca en la siguiente serie tras contestar cuántas quedaban (D-055).
 *
 * - Lo contestado coincide con el objetivo: se repite la serie.
 * - Quedaban menos: el peso más ligero que tenga el usuario con las mismas
 *   repeticiones o, si no hay otro, 2 repeticiones menos.
 * - Quedaban más: el siguiente peso, con las repeticiones que caben dejando la
 *   reserva objetivo, si no bajan de 2 menos que las previstas; si no, 2
 *   repeticiones más.
 *
 * Parte siempre de la serie hecha, no de lo que había: contestar otra cosa no
 * acumula ajustes.
 */
export function nextSetAfter(
  set: CompletedSet,
  reserve: RepsInReserve,
  target: RepsInReserve,
  options: { loads: readonly number[]; targetReps: number; maxReps: number },
): NextSet {
  const { loads, targetReps, maxReps } = options
  const same: NextSet = { reps: set.reps, weightKg: set.weightKg }
  const diff = RESERVE_RANK[reserve] - RESERVE_RANK[target]
  if (diff === 0) return same

  const weight = set.weightKg
  if (diff < 0) {
    const lighter = weight === null ? undefined : [...loads].reverse().find((kg) => kg < weight)
    if (lighter !== undefined) return { reps: set.reps, weightKg: lighter }
    return { reps: Math.max(1, set.reps - IN_SESSION_REP_STEP), weightKg: weight }
  }

  const heavier = weight === null ? undefined : loads.find((kg) => kg > weight)
  if (weight !== null && heavier !== undefined) {
    const oneRepMax = epley(weight, set.reps + RESERVE_REPS[reserve])
    const reps = Math.min(repsAt(oneRepMax, heavier, RESERVE_REPS[target]), targetReps)
    if (reps >= Math.max(1, targetReps - IN_SESSION_REP_STEP)) return { reps, weightKg: heavier }
  }
  return { reps: Math.min(maxReps, set.reps + IN_SESSION_REP_STEP), weightKg: weight }
}
