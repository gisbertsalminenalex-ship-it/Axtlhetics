/**
 * Carga de entrenamiento reciente (P-013).
 *
 * Índice **orientativo interno** de 0 a 100 sobre los últimos días. No es una
 * medición médica ni un diagnóstico: es una forma estable de resumir cuánto has
 * entrenado últimamente, calculada solo con datos que existen de verdad.
 *
 * Fórmula, deliberadamente simple y explicable:
 *
 *   unidades de una sesión = minutos × factor de intensidad × factor de esfuerzo
 *                            + volumen en kg / KG_POR_UNIDAD
 *
 *   carga = suma de unidades de la ventana / ESCALA_COMPLETA × 100
 *
 * La frecuencia entra sola: más sesiones en la ventana, más unidades sumadas.
 *
 * Si no hay ninguna sesión completada en la ventana, **no se inventa una carga**:
 * se devuelve `insufficient_data` y la interfaz muestra «—».
 */

import { daysBetween, type DayKey } from '../shared/dates'
import { clamp, safeDivide } from '../shared/ids'
import type { SessionIntensity, WorkoutSession } from './types'

/** Días que mira la carga hacia atrás, incluido hoy. */
export const TRAINING_LOAD_WINDOW_DAYS = 7

/** Cuánto pesa cada intensidad registrada en la sesión. */
export const INTENSITY_FACTORS: Record<SessionIntensity, number> = {
  ligera: 1,
  moderada: 1.4,
  alta: 1.8,
}

/**
 * Cómo se sintió la sesión, 1–5. Sin dato se usa 1: no se supone ni más ni menos
 * esfuerzo del que se registró.
 */
export const EFFORT_FACTORS: Record<number, number> = {
  1: 0.7,
  2: 0.85,
  3: 1,
  4: 1.15,
  5: 1.3,
}

export const DEFAULT_EFFORT_FACTOR = 1

/**
 * Kilos de volumen que equivalen a una unidad de carga.
 *
 * Con una sola pesa de 5 kg el volumen aporta poco, y así debe ser: la carga real
 * de estas sesiones viene del tiempo y la intensidad. La constante existe para que
 * el volumen cuente de verdad si algún día hay más material.
 */
export const KG_PER_LOAD_UNIT = 100

/**
 * Unidades semanales que equivalen a 100.
 *
 * Referencia: una semana muy exigente (5 sesiones largas e intensas) llega al tope.
 * Es una convención de escala, ajustable sin tocar el resto del cálculo.
 */
export const LOAD_FULL_SCALE_UNITS = 420

export type TrainingLoadBand = 'baja' | 'moderada' | 'alta'

export const TRAINING_LOAD_BAND_LABELS: Record<TrainingLoadBand, string> = {
  baja: 'Baja',
  moderada: 'Moderada',
  alta: 'Alta',
}

export const TRAINING_LOAD_THRESHOLDS = {
  /** A partir de aquí, `alta`. */
  alta: 75,
  /** A partir de aquí, `moderada`. Por debajo, `baja`. */
  moderada: 40,
} as const

export function loadBandFor(value: number): TrainingLoadBand {
  if (value >= TRAINING_LOAD_THRESHOLDS.alta) return 'alta'
  if (value >= TRAINING_LOAD_THRESHOLDS.moderada) return 'moderada'
  return 'baja'
}

export type TrainingLoad =
  | {
      status: 'ok'
      /** 0–100, entero. */
      value: number
      band: TrainingLoadBand
      sessionCount: number
      windowDays: number
    }
  | {
      status: 'insufficient_data'
      reason: string
      windowDays: number
    }

export function effortFactorFor(perceivedEffort: number | null): number {
  if (perceivedEffort === null) return DEFAULT_EFFORT_FACTOR
  return EFFORT_FACTORS[perceivedEffort] ?? DEFAULT_EFFORT_FACTOR
}

/** Unidades de carga de una sola sesión. Nunca negativa, nunca `NaN`. */
export function sessionLoadUnits(session: WorkoutSession): number {
  const minutes = Math.max(0, safeDivide(session.durationSeconds, 60, 0))
  const intensity = INTENSITY_FACTORS[session.intensity] ?? INTENSITY_FACTORS.moderada
  const effort = effortFactorFor(session.perceivedEffort)

  const volume = Number.isFinite(session.totalVolumeKg)
    ? Math.max(0, session.totalVolumeKg)
    : 0

  const units = minutes * intensity * effort + safeDivide(volume, KG_PER_LOAD_UNIT, 0)
  return Number.isFinite(units) ? Math.max(0, units) : 0
}

/** Sesiones completadas dentro de la ventana de carga. */
export function sessionsInLoadWindow(
  sessions: readonly WorkoutSession[],
  reference: DayKey,
  windowDays: number = TRAINING_LOAD_WINDOW_DAYS,
): WorkoutSession[] {
  return sessions.filter((session) => {
    if (session.status !== 'completed') return false
    const age = daysBetween(session.dayKey, reference)
    return age >= 0 && age < windowDays
  })
}

export function computeTrainingLoad(
  sessions: readonly WorkoutSession[],
  reference: DayKey,
  windowDays: number = TRAINING_LOAD_WINDOW_DAYS,
): TrainingLoad {
  const inWindow = sessionsInLoadWindow(sessions, reference, windowDays)

  if (inWindow.length === 0) {
    return {
      status: 'insufficient_data',
      reason: 'Todavía no hay entrenamientos recientes con los que calcularla.',
      windowDays,
    }
  }

  const units = inWindow.reduce((total, session) => total + sessionLoadUnits(session), 0)
  const ratio = safeDivide(units, LOAD_FULL_SCALE_UNITS, 0)
  const value = clamp(Math.round(ratio * 100), 0, 100)

  return {
    status: 'ok',
    value,
    band: loadBandFor(value),
    sessionCount: inWindow.length,
    windowDays,
  }
}

