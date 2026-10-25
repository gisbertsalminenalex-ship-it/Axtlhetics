/**
 * Patrones de movimiento (D-073).
 *
 * Un entrenador no monta una sesión rellenando huecos de «empuje» y «tirón»:
 * la monta por patrones. Una de torso lleva un empuje y un tirón horizontales y
 * otros dos verticales; una de pierna, una sentadilla, una bisagra de cadera y
 * una zancada. Los accesorios (brazos, hombro, gemelos, core) van detrás.
 *
 * Las categorías de siempre no cambian: esto solo dice qué patrón es cada
 * ejercicio de entrenamiento. Un test exige que estén todos; los saltos, la
 * movilidad y los intervalos no tienen patrón.
 */

import type { Exercise } from './types'

export type MovementPattern =
  | 'empuje_horizontal'
  | 'empuje_vertical'
  | 'tiron_horizontal'
  | 'tiron_vertical'
  | 'sentadilla'
  | 'bisagra'
  | 'zancada'
  | 'biceps'
  | 'triceps'
  | 'hombro'
  | 'gemelos'
  | 'gluteo'
  | 'core'

/** Los accesorios: trabajan un músculo, no un patrón grande. Nunca abren la sesión ni van a repeticiones bajas. */
export const ISOLATION_PATTERNS: readonly MovementPattern[] = ['biceps', 'triceps', 'hombro', 'gemelos', 'gluteo', 'core']

export const EXERCISE_PATTERNS: Readonly<Record<string, MovementPattern>> = {
  // --- Empuje horizontal ----------------------------------------------------
  'flexiones-inclinadas': 'empuje_horizontal',
  'flexiones-rodillas': 'empuje_horizontal',
  'flexiones-negativas': 'empuje_horizontal',
  flexiones: 'empuje_horizontal',
  'flexiones-diamante': 'empuje_horizontal',
  'flexiones-declinadas': 'empuje_horizontal',
  'press-suelo-unilateral': 'empuje_horizontal',
  'press-pecho-goma': 'empuje_horizontal',
  'press-suelo-mancuernas': 'empuje_horizontal',
  'press-banca-mancuernas': 'empuje_horizontal',

  // --- Empuje vertical ------------------------------------------------------
  'press-hombro-unilateral': 'empuje_vertical',
  'press-hombro-mancuernas': 'empuje_vertical',
  'flexion-pica': 'empuje_vertical',

  // --- Tirón horizontal -----------------------------------------------------
  superman: 'tiron_horizontal',
  'remo-unilateral': 'tiron_horizontal',
  'remo-renegado': 'tiron_horizontal',
  'remo-goma': 'tiron_horizontal',
  'remo-inclinado-mancuernas': 'tiron_horizontal',

  // --- Tirón vertical -------------------------------------------------------
  'colgarse-barra': 'tiron_vertical',
  'dominadas-negativas': 'tiron_vertical',
  'dominadas-asistidas-goma': 'tiron_vertical',
  'dominadas-supinas': 'tiron_vertical',
  dominadas: 'tiron_vertical',
  'jalon-goma': 'tiron_vertical',
  'pullover-con-pesa': 'tiron_vertical',

  // --- Pierna ---------------------------------------------------------------
  sentadilla: 'sentadilla',
  'sentadilla-con-pesa': 'sentadilla',
  'sentadilla-isometrica-pared': 'sentadilla',
  zancadas: 'zancada',
  'zancada-atras': 'zancada',
  'zancada-bulgara': 'zancada',
  'zancada-lateral': 'zancada',
  'zancadas-mancuernas': 'zancada',
  'subida-escalon': 'zancada',
  'peso-muerto-rumano-mancuernas': 'bisagra',
  'peso-muerto-unilateral': 'bisagra',
  'peso-muerto-kettlebell': 'bisagra',
  'swing-kettlebell': 'bisagra',
  'hip-thrust-con-pesa': 'bisagra',
  'puente-gluteos': 'bisagra',
  'puente-talones-silla': 'bisagra',

  // --- Accesorios -----------------------------------------------------------
  'curl-biceps-unilateral': 'biceps',
  'curl-martillo-unilateral': 'biceps',
  'curl-mancuernas': 'biceps',
  'extension-triceps-unilateral': 'triceps',
  'patada-triceps-unilateral': 'triceps',
  'extension-triceps-goma': 'triceps',
  'fondos-banco': 'triceps',
  'elevaciones-laterales': 'hombro',
  'face-pull-goma': 'hombro',
  'separacion-goma': 'hombro',
  'ytw-boca-abajo': 'hombro',
  'elevacion-gemelos': 'gemelos',
  'elevacion-gemelos-una-pierna': 'gemelos',
  'paseo-lateral-goma': 'gluteo',
  'dead-bug': 'core',
  'bird-dog': 'core',
  plancha: 'core',
  'plancha-lateral': 'core',
  'hollow-hold': 'core',
  'plancha-toque-hombro': 'core',
  'elevaciones-rodillas-colgado': 'core',
  'press-pallof-goma': 'core',
}

/**
 * Sustitutos: hacen el patrón a falta de algo mejor. El pullover no es una
 * dominada ni el superman un remo: entran solo cuando no hay otro del patrón.
 */
export const PATTERN_FALLBACKS: readonly string[] = [
  'pullover-con-pesa',
  'colgarse-barra',
  'superman',
  'sentadilla-isometrica-pared',
  'puente-gluteos',
  'puente-talones-silla',
]

export function isPatternFallback(exercise: Pick<Exercise, 'id'>): boolean {
  return PATTERN_FALLBACKS.includes(exercise.id)
}

export function patternOf(exercise: Pick<Exercise, 'id'>): MovementPattern | null {
  return EXERCISE_PATTERNS[exercise.id] ?? null
}

/** Un ejercicio de un músculo (o sin patrón): ni abre la sesión ni se trabaja a repeticiones bajas. */
export function isIsolation(exercise: Pick<Exercise, 'id'>): boolean {
  const pattern = patternOf(exercise)
  return pattern === null || ISOLATION_PATTERNS.includes(pattern)
}
