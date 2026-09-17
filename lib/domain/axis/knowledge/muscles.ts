/**
 * Conocimiento de AXIS: grupos musculares.
 *
 * Es el único punto por el que AXIS accede a los grupos musculares y a sus
 * etiquetas. La definición vive en `workouts/types.ts`, porque el catálogo, la
 * carga y el historial también la usan y esa capa no puede depender de AXIS.
 * Aquí **no hay una segunda tabla**: se reexporta la única que existe y se
 * añaden solo las lecturas que AXIS necesita.
 */

import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '../../workouts/types'

export { MUSCLE_GROUP_LABELS }
export type { MuscleGroup }

/** Todos los grupos, en el orden de la tabla. */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = Object.keys(
  MUSCLE_GROUP_LABELS,
) as MuscleGroup[]

export function isMuscleGroup(value: string): value is MuscleGroup {
  return value in MUSCLE_GROUP_LABELS
}

/** Etiqueta en minúscula, para usarla dentro de una frase: «piernas», «glúteos». */
export function muscleGroupLabel(group: string): string {
  return isMuscleGroup(group) ? MUSCLE_GROUP_LABELS[group].toLowerCase() : group
}
