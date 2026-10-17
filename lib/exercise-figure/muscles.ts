/**
 * Qué se marca en azul en la figura de cada ejercicio (D-024): sale de los
 * músculos del catálogo, nunca de una lista aparte. Principales en azul,
 * secundarios en azul suave.
 */

import type { Exercise, MuscleGroup } from '../domain/workouts/types'
import type { MuscleMap, Overlay } from './draw'

/** Dónde se dibuja cada grupo muscular del catálogo. */
const OVERLAYS: Record<MuscleGroup, Overlay> = {
  pecho: 'chest',
  espalda: 'back',
  hombros: 'shoulder',
  brazos: 'upperArm',
  core: 'core',
  piernas: 'thigh',
  gluteos: 'glutes',
}

/** Ejercicios de piernas que trabajan sobre todo la pantorrilla o el tobillo, no el muslo. */
const LOWER_LEG_FAMILIES = new Set(['gemelos'])
const LOWER_LEG_IDS = new Set(['tobillo-pared', 'saltos-tobillo', 'equilibrio-una-pierna'])

function overlayOf(exercise: Pick<Exercise, 'id' | 'family'>, group: MuscleGroup): Overlay {
  if (group === 'piernas' && (LOWER_LEG_IDS.has(exercise.id) || (exercise.family && LOWER_LEG_FAMILIES.has(exercise.family)))) return 'shin'
  return OVERLAYS[group]
}

export function musclesOf(exercise: Pick<Exercise, 'id' | 'family' | 'primaryMuscles' | 'secondaryMuscles'>): MuscleMap {
  const map: MuscleMap = {}
  for (const group of exercise.secondaryMuscles) map[overlayOf(exercise, group)] = 2
  // Lo principal gana si un grupo aparece en las dos listas.
  for (const group of exercise.primaryMuscles) map[overlayOf(exercise, group)] = 1
  return map
}
