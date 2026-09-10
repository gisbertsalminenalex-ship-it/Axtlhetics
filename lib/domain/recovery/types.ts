/**
 * Recuperación: entradas del usuario y resultado del Recovery Score.
 *
 * El Recovery Score es un **índice orientativo interno de 0 a 100** (D-002).
 * No es una medición médica ni un diagnóstico, y así debe presentarse siempre.
 */

import type { DayKey } from '../shared/dates'

/** Escala 1–5 compartida por energía, fatiga y estrés. */
export type Scale5 = 1 | 2 | 3 | 4 | 5

export const ENERGY_LABELS: Record<Scale5, string> = {
  1: 'Muy baja',
  2: 'Baja',
  3: 'Normal',
  4: 'Alta',
  5: 'Muy alta',
}

/** En fatiga y estrés, más alto es peor. */
export const FATIGUE_LABELS: Record<Scale5, string> = {
  1: 'Ninguna',
  2: 'Baja',
  3: 'Moderada',
  4: 'Alta',
  5: 'Muy alta',
}

export const STRESS_LABELS: Record<Scale5, string> = {
  1: 'Muy bajo',
  2: 'Bajo',
  3: 'Moderado',
  4: 'Alto',
  5: 'Muy alto',
}

/** La hidratación son exactamente 8 vasos (decisión cerrada). */
export const HYDRATION_GLASS_COUNT = 8

/**
 * Lo que el usuario registra en un día.
 *
 * `null` significa **no registrado**, y es distinto de un valor bajo. El dominio
 * nunca rellena un hueco con un valor por defecto: si falta un dato, falta.
 */
export type RecoveryInputs = {
  dayKey: DayKey
  sleepHours: number | null
  energy: Scale5 | null
  muscleFatigue: Scale5 | null
  stress: Scale5 | null
  /** 0–8 vasos. `null` mientras el usuario no haya tocado ningún vaso. */
  hydrationGlasses: number | null
  updatedAt: string
}

export function emptyRecoveryInputs(dayKey: DayKey, updatedAt: string): RecoveryInputs {
  return {
    dayKey,
    sleepHours: null,
    energy: null,
    muscleFatigue: null,
    stress: null,
    hydrationGlasses: null,
    updatedAt,
  }
}

export type RecoveryFactorKey = 'sleep' | 'energy' | 'muscleFatigue' | 'stress' | 'hydration'

export const RECOVERY_FACTOR_LABELS: Record<RecoveryFactorKey, string> = {
  sleep: 'Sueño',
  energy: 'Energía',
  muscleFatigue: 'Fatiga muscular',
  stress: 'Estrés',
  hydration: 'Hidratación',
}

/** Un factor tras normalizarse a 0–100, con el peso que le corresponde. */
export type RecoveryFactor = {
  key: RecoveryFactorKey
  /** Peso nominal del factor, entre 0 y 1. */
  weight: number
  /** Valor normalizado 0–100, o `null` si el usuario no lo ha registrado. */
  normalized: number | null
}

export type RecoveryBand = 'low' | 'moderate' | 'good'

/** Cómo se nombra cada banda. Lo usan la interfaz y las respuestas de AXIS. */
export const RECOVERY_BAND_LABELS: Record<RecoveryBand, string> = {
  good: 'Buen estado',
  moderate: 'Recuperación moderada',
  low: 'Recuperación baja',
}

/**
 * Resultado del cálculo.
 *
 * Es una unión discriminada a propósito: quien consume el resultado **no puede**
 * leer un número sin haber comprobado antes que existe.
 */
export type RecoveryScore =
  | {
      status: 'ok'
      /** 0–100, entero. */
      value: number
      band: RecoveryBand
      factors: RecoveryFactor[]
      /** Factores presentes, de mayor a menor aportación al resultado. */
      strongest: RecoveryFactorKey[]
      weakest: RecoveryFactorKey[]
    }
  | {
      status: 'insufficient_data'
      factors: RecoveryFactor[]
      missing: RecoveryFactorKey[]
      /** Explicación breve y en lenguaje de usuario de por qué no hay resultado. */
      reason: string
    }

