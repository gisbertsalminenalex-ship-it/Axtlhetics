/**
 * Cálculo del Recovery Score.
 *
 * Media ponderada de los factores **registrados**, renormalizada sobre el peso
 * disponible. Si faltan datos críticos no se calcula nada: se devuelve
 * `insufficient_data`. El dominio nunca inventa una puntuación (D-002).
 */

import { clamp, safeDivide } from '../shared/ids'
import { DEFAULT_SLEEP_AGE, normalizeEnergy, normalizeHydration, normalizeMuscleFatigue, normalizeSleep, normalizeStress } from './scales'
import type { RecoveryFactor, RecoveryFactorKey, RecoveryInputs, RecoveryScore } from './types'
import { RECOVERY_FACTOR_LABELS } from './types'
import { bandFor, RECOVERY_FACTOR_ORDER, RECOVERY_MIN_FACTORS, RECOVERY_REQUIRED_FACTORS, RECOVERY_WEIGHTS } from './weights'

export type RecoveryScoreOptions = {
  /** Edad del perfil. Solo influye en la normalización del sueño. */
  age?: number
}

function normalizeFactor(
  key: RecoveryFactorKey,
  inputs: RecoveryInputs,
  age: number,
): number | null {
  switch (key) {
    case 'sleep':
      return inputs.sleepHours === null ? null : normalizeSleep(inputs.sleepHours, age)
    case 'energy':
      return inputs.energy === null ? null : normalizeEnergy(inputs.energy)
    case 'muscleFatigue':
      return inputs.muscleFatigue === null ? null : normalizeMuscleFatigue(inputs.muscleFatigue)
    case 'stress':
      return inputs.stress === null ? null : normalizeStress(inputs.stress)
    case 'hydration':
      return inputs.hydrationGlasses === null ? null : normalizeHydration(inputs.hydrationGlasses)
  }
}

function buildFactors(inputs: RecoveryInputs, age: number): RecoveryFactor[] {
  return RECOVERY_FACTOR_ORDER.map((key) => ({
    key,
    weight: RECOVERY_WEIGHTS[key],
    normalized: normalizeFactor(key, inputs, age),
  }))
}

function missingReason(missingRequired: RecoveryFactorKey[], recordedCount: number): string {
  if (missingRequired.length > 0) {
    const names = missingRequired.map((key) => RECOVERY_FACTOR_LABELS[key].toLowerCase())
    return `Falta registrar ${names.join(' y ')} para poder calcularlo.`
  }
  const pending = RECOVERY_MIN_FACTORS - recordedCount
  const noun = pending === 1 ? 'indicador' : 'indicadores'
  return `Registra ${pending} ${noun} más para calcular tu recuperación.`
}

/**
 * Devuelve el Recovery Score del día, o el motivo por el que no puede calcularse.
 */
export function computeRecoveryScore(
  inputs: RecoveryInputs,
  options: RecoveryScoreOptions = {},
): RecoveryScore {
  const age = options.age ?? DEFAULT_SLEEP_AGE
  const factors = buildFactors(inputs, age)

  const recorded = factors.filter((factor) => factor.normalized !== null)
  const missing = factors
    .filter((factor) => factor.normalized === null)
    .map((factor) => factor.key)

  const missingRequired = RECOVERY_REQUIRED_FACTORS.filter((key) => missing.includes(key))
  const hasEnough = missingRequired.length === 0 && recorded.length >= RECOVERY_MIN_FACTORS

  if (!hasEnough) {
    return {
      status: 'insufficient_data',
      factors,
      missing,
      reason: missingReason([...missingRequired], recorded.length),
    }
  }

  // Renormalizamos sobre el peso realmente disponible: un factor sin registrar no
  // arrastra el resultado hacia abajo, simplemente no participa.
  const availableWeight = recorded.reduce((total, factor) => total + factor.weight, 0)
  const weighted = recorded.reduce(
    (total, factor) => total + factor.weight * (factor.normalized ?? 0),
    0,
  )
  const value = clamp(Math.round(safeDivide(weighted, availableWeight, 0)), 0, 100)

  const ranked = [...recorded].sort(
    (a, b) => (b.normalized ?? 0) - (a.normalized ?? 0),
  )

  return {
    status: 'ok',
    value,
    band: bandFor(value),
    factors,
    strongest: ranked.slice(0, 2).map((factor) => factor.key),
    weakest: ranked.slice(-2).reverse().map((factor) => factor.key),
  }
}
