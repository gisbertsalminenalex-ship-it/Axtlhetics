/**
 * Pesos del Recovery Score y política de datos insuficientes.
 *
 * **Este es el único sitio del proyecto donde viven estos números.** Ningún
 * componente, repositorio ni regla de AXIS puede redefinirlos (D-002).
 */

import type { RecoveryBand, RecoveryFactorKey } from './types'

/** Pesos aprobados. Suman exactamente 1. */
export const RECOVERY_WEIGHTS: Record<RecoveryFactorKey, number> = {
  sleep: 0.35,
  energy: 0.2,
  muscleFatigue: 0.2,
  stress: 0.15,
  hydration: 0.1,
}

export const RECOVERY_FACTOR_ORDER: readonly RecoveryFactorKey[] = [
  'sleep',
  'energy',
  'muscleFatigue',
  'stress',
  'hydration',
]

/**
 * Política de «datos suficientes». Deliberadamente conservadora y centralizada
 * aquí para poder endurecerla o relajarla sin tocar el cálculo (`P-010`).
 *
 * Dos condiciones, ambas obligatorias:
 *
 * 1. El **sueño es obligatorio**. Pesa un 35 %: sin él, el resultado sería más una
 *    suposición que una medida.
 * 2. Debe haber al menos `MIN_FACTORS` factores registrados en total.
 */
export const RECOVERY_REQUIRED_FACTORS: readonly RecoveryFactorKey[] = ['sleep']
export const RECOVERY_MIN_FACTORS = 3

/** Umbrales de banda visual aprobados en el Design System §17. */
export const RECOVERY_BAND_THRESHOLDS = {
  /** A partir de aquí, `good`. */
  good: 75,
  /** A partir de aquí, `moderate`. Por debajo, `low`. */
  moderate: 50,
} as const

export function bandFor(value: number): RecoveryBand {
  if (value >= RECOVERY_BAND_THRESHOLDS.good) return 'good'
  if (value >= RECOVERY_BAND_THRESHOLDS.moderate) return 'moderate'
  return 'low'
}
