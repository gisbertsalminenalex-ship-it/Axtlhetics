/**
 * Subgrupos para equilibrar piernas y brazos (D-053).
 *
 * Los siete grupos de siempre (D-034) no cambian. Esto solo añade qué parte de
 * las piernas o de los brazos trabaja cada ejercicio, para que una semana no
 * sea todo cuádriceps o todo bíceps.
 */

import { daysBetween, startOfWeek, type DayKey } from '../shared/dates'
import type { Exercise, WorkoutSession } from './types'
import { isMainExercise } from './types'

export type Subgroup = 'cuadriceps' | 'isquios' | 'gemelos' | 'biceps' | 'triceps'

export const SUBGROUP_LABELS: Record<Subgroup, string> = {
  cuadriceps: 'Cuádriceps',
  isquios: 'Isquiotibiales',
  gemelos: 'Gemelos',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
}

/** Las parejas que se equilibran entre sí. */
export const BALANCED_PAIRS: readonly (readonly [Subgroup, Subgroup])[] = [
  ['cuadriceps', 'isquios'],
  ['biceps', 'triceps'],
]

/** Diferencia de series a partir de la cual una parte va por detrás de su pareja. */
export const IMBALANCE_SETS = 2

/**
 * Qué parte trabaja cada ejercicio de entrenamiento con piernas o brazos. Un
 * test exige que estén todos; la movilidad y el calentamiento no cuentan.
 */
export const EXERCISE_SUBGROUPS: Readonly<Record<string, readonly Subgroup[]>> = {
  // --- Empuje: los brazos son el tríceps ------------------------------------
  'flexiones-inclinadas': ['triceps'],
  'flexiones-negativas': ['triceps'],
  flexiones: ['triceps'],
  'flexiones-diamante': ['triceps'],
  'flexiones-rodillas': ['triceps'],
  'flexiones-declinadas': ['triceps'],
  'flexion-pica': ['triceps'],
  'press-hombro-unilateral': ['triceps'],
  'extension-triceps-unilateral': ['triceps'],
  'press-suelo-unilateral': ['triceps'],
  'patada-triceps-unilateral': ['triceps'],
  'press-pecho-goma': ['triceps'],
  'extension-triceps-goma': ['triceps'],
  'press-suelo-mancuernas': ['triceps'],
  'press-banca-mancuernas': ['triceps'],
  'press-hombro-mancuernas': ['triceps'],
  'fondos-banco': ['triceps'],

  // --- Tirón: los brazos son el bíceps --------------------------------------
  'remo-unilateral': ['biceps'],
  'remo-renegado': ['biceps'],
  'curl-biceps-unilateral': ['biceps'],
  'curl-martillo-unilateral': ['biceps'],
  'colgarse-barra': ['biceps'],
  'dominadas-negativas': ['biceps'],
  'dominadas-asistidas-goma': ['biceps'],
  'dominadas-supinas': ['biceps'],
  dominadas: ['biceps'],
  'remo-goma': ['biceps'],
  'jalon-goma': ['biceps'],
  'remo-inclinado-mancuernas': ['biceps'],
  'curl-mancuernas': ['biceps'],

  // --- Piernas ---------------------------------------------------------------
  sentadilla: ['cuadriceps'],
  'sentadilla-con-pesa': ['cuadriceps'],
  'sentadilla-isometrica-pared': ['cuadriceps'],
  zancadas: ['cuadriceps'],
  'zancada-atras': ['cuadriceps'],
  'zancada-bulgara': ['cuadriceps'],
  'zancada-lateral': ['cuadriceps'],
  'subida-escalon': ['cuadriceps'],
  'zancadas-mancuernas': ['cuadriceps'],
  'peso-muerto-unilateral': ['isquios'],
  'peso-muerto-rumano-mancuernas': ['isquios'],
  'peso-muerto-kettlebell': ['isquios'],
  'swing-kettlebell': ['isquios'],
  'puente-gluteos': ['isquios'],
  'puente-talones-silla': ['isquios'],
  'hip-thrust-con-pesa': ['isquios'],
  'elevacion-gemelos': ['gemelos'],
  'elevacion-gemelos-una-pierna': ['gemelos'],
  // El glúteo medio y los abductores: ni delante ni detrás.
  'paseo-lateral-goma': [],

  // --- Pliometría ------------------------------------------------------------
  'saltos-tobillo': ['gemelos'],
  'aterrizaje-controlado': ['cuadriceps'],
  'sentadilla-salto': ['cuadriceps'],
  'saltos-patinador': ['cuadriceps'],

  // --- Acondicionamiento -----------------------------------------------------
  'rodillas-altas': ['cuadriceps'],
  'subidas-escalon-rapidas': ['cuadriceps'],
  'burpees-sin-salto': ['cuadriceps'],
  burpees: ['cuadriceps', 'triceps'],
  'saltos-estrella': ['cuadriceps', 'gemelos'],
  'zancadas-salto': ['cuadriceps'],
  'plancha-jacks': [],
  'escaladores-cruzados': [],
  'boxeo-sombra': [],
}

export function subgroupsOf(exerciseId: string): readonly Subgroup[] {
  return EXERCISE_SUBGROUPS[exerciseId] ?? []
}

/**
 * Series de la semana por subgrupo, de lunes a hoy: enteras si piernas o
 * brazos son músculo principal del ejercicio, medias si son secundario. Solo
 * el entrenamiento, como en D-034.
 */
export function weeklySubgroupSets(
  sessions: readonly WorkoutSession[],
  today: DayKey,
  catalog: readonly Exercise[],
): Record<Subgroup, number> {
  const monday = startOfWeek(today)
  const totals: Record<Subgroup, number> = { cuadriceps: 0, isquios: 0, gemelos: 0, biceps: 0, triceps: 0 }
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))

  for (const session of sessions) {
    if (session.dayKey < monday || daysBetween(session.dayKey, today) < 0) continue
    for (const performed of session.exercises) {
      if (!isMainExercise(performed)) continue
      const exercise = byId.get(performed.exerciseId)
      if (!exercise) continue
      const done = performed.sets.filter((set) => set.completed).length
      if (done === 0) continue
      for (const subgroup of subgroupsOf(exercise.id)) {
        const limb = subgroup === 'biceps' || subgroup === 'triceps' ? 'brazos' : 'piernas'
        totals[subgroup] += exercise.primaryMuscles.includes(limb) ? done : done / 2
      }
    }
  }
  return totals
}

/** Las partes que van por detrás de su pareja esta semana, por 2 series o más. */
export function laggingSubgroups(
  sessions: readonly WorkoutSession[],
  today: DayKey,
  catalog: readonly Exercise[],
): Subgroup[] {
  const sets = weeklySubgroupSets(sessions, today, catalog)
  const lagging: Subgroup[] = []
  for (const [a, b] of BALANCED_PAIRS) {
    if (sets[b] - sets[a] >= IMBALANCE_SETS) lagging.push(a)
    else if (sets[a] - sets[b] >= IMBALANCE_SETS) lagging.push(b)
  }
  return lagging
}
