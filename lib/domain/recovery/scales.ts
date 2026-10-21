/**
 * Normalización de cada indicador de recuperación a una escala 0–100.
 *
 * Todas las funciones son puras y testeables por separado. Ninguna hace una
 * afirmación médica: son conversiones de escala explícitas y conservadoras,
 * pensadas para poder ajustarse sin tocar el resto del cálculo.
 */

import { clamp, safeDivide } from '../shared/ids'
import { HYDRATION_GLASS_COUNT, type Scale5 } from './types'

/**
 * Banda de sueño de referencia por edad, en horas por cada 24 h.
 *
 * El usuario objetivo inicial puede tener 15 años, así que la referencia de
 * adulto no vale. Para 13–18 años se usa 8–10 h.
 */
export type SleepReference = { min: number; max: number; label: string }

export const SLEEP_REFERENCES: readonly { maxAge: number; reference: SleepReference }[] = [
  { maxAge: 12, reference: { min: 9, max: 11, label: '9–11 h' } },
  { maxAge: 18, reference: { min: 8, max: 10, label: '8–10 h' } },
  { maxAge: Number.POSITIVE_INFINITY, reference: { min: 7, max: 9, label: '7–9 h' } },
]

/** Edad usada cuando todavía no hay perfil. Deliberadamente la banda adulta, la más exigente. */
export const DEFAULT_SLEEP_AGE = 30

export function sleepReferenceForAge(age: number): SleepReference {
  const safeAge = Number.isFinite(age) && age > 0 ? age : DEFAULT_SLEEP_AGE
  for (const entry of SLEEP_REFERENCES) {
    if (safeAge <= entry.maxAge) return entry.reference
  }
  return SLEEP_REFERENCES[SLEEP_REFERENCES.length - 1].reference
}

/**
 * Por debajo de esta cifra, el sueño puntúa 0. Entre este suelo y el mínimo de la
 * banda de referencia, la puntuación sube de forma lineal.
 */
export const SLEEP_DEFICIT_FLOOR_HOURS = 4

/**
 * Dormir de más **no** se trata como un problema.
 *
 * Por encima de la banda la puntuación baja muy despacio y nunca por debajo de
 * `SLEEP_OVERSHOOT_FLOOR`: dormir 11 h con 15 años sigue siendo buen descanso,
 * no una señal de alarma.
 */
export const SLEEP_OVERSHOOT_PENALTY_PER_HOUR = 5
export const SLEEP_OVERSHOOT_FLOOR = 80

/**
 * Normaliza horas de sueño a 0–100 usando la referencia de la edad indicada.
 *
 * - Dentro de la banda → 100.
 * - Por debajo → descenso lineal hasta 0 en `SLEEP_DEFICIT_FLOOR_HOURS`.
 * - Por encima → descenso suave con suelo en `SLEEP_OVERSHOOT_FLOOR`.
 */
export function normalizeSleep(hours: number, age: number): number {
  if (!Number.isFinite(hours) || hours < 0) return 0

  const { min, max } = sleepReferenceForAge(age)

  if (hours >= min && hours <= max) return 100

  if (hours < min) {
    const span = min - SLEEP_DEFICIT_FLOOR_HOURS
    const progress = safeDivide(hours - SLEEP_DEFICIT_FLOOR_HOURS, span, 0)
    return clamp(Math.round(progress * 100), 0, 100)
  }

  const excess = hours - max
  const penalty = excess * SLEEP_OVERSHOOT_PENALTY_PER_HOUR
  return clamp(Math.round(100 - penalty), SLEEP_OVERSHOOT_FLOOR, 100)
}

/** 1 → 0, 5 → 100. Más energía es mejor. */
export function normalizeEnergy(level: Scale5): number {
  return clamp(Math.round(((level - 1) / 4) * 100), 0, 100)
}

/** Invertida: 1 (sin fatiga) → 100, 5 (fatiga muy alta) → 0. */
export function normalizeMuscleFatigue(level: Scale5): number {
  return clamp(Math.round(((5 - level) / 4) * 100), 0, 100)
}

/** Invertida: 1 (estrés muy bajo) → 100, 5 (estrés muy alto) → 0. */
export function normalizeStress(level: Scale5): number {
  return clamp(Math.round(((5 - level) / 4) * 100), 0, 100)
}

/** 0 vasos → 0, 8 vasos → 100. Más de 8 no puntúa por encima de 100. */
export function normalizeHydration(glasses: number): number {
  if (!Number.isFinite(glasses) || glasses < 0) return 0
  const ratio = safeDivide(glasses, HYDRATION_GLASS_COUNT, 0)
  return clamp(Math.round(ratio * 100), 0, 100)
}

/**
 * Formatea horas de sueño como `8h` o `8h 30m`.
 *
 * Vive aquí y no en un componente porque lo usan varias pantallas y porque el
 * formato debe ser el mismo en todas: media hora es `30m`, no `0,5h`.
 */
export function formatSleepHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—'
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  return minutes === 0 ? `${whole}h` : `${whole}h ${minutes}m`
}

/** Escalón del selector de sueño, en horas. */
export const SLEEP_STEP_HOURS = 0.5

/** Límites razonables de lo que se puede registrar. No son un juicio, solo un rango. */
export const MIN_SLEEP_HOURS = 0
export const MAX_SLEEP_HOURS = 16

/** Punto de partida cuando todavía no hay nada registrado. */
export const DEFAULT_SLEEP_HOURS = 8

/**
 * Sube o baja las horas de sueño registradas.
 *
 * El paso, los límites y el valor de partida son reglas sobre el sueño, no sobre la
 * interfaz, así que viven aquí junto al resto de la normalización.
 */
export function adjustSleepHours(current: number | null, steps: number): number {
  const base = current ?? DEFAULT_SLEEP_HOURS
  return clamp(base + steps * SLEEP_STEP_HOURS, MIN_SLEEP_HOURS, MAX_SLEEP_HOURS)
}
