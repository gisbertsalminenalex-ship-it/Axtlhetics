/**
 * El nivel de un ejercicio (D-065): dentro de su familia, la variante con la
 * que entrena el usuario.
 *
 * AXIS propone una variante (D-020, D-046) y el usuario puede cambiarla a mitad
 * de sesión por otra de la misma familia («Flexiones inclinadas» → «Flexiones
 * con rodillas»). La elegida se recuerda por familia en el perfil
 * (`UserProfile.exerciseLevels`) y es el punto de partida de las siguientes
 * sesiones; desde ahí AXIS sigue subiendo cuando se domina.
 */

import type { CareZone } from '../profile/types'
import { EXERCISE_CATALOG, findExercise, isAvailable } from './catalog'
import { loadsCareZone } from './joints'
import type { Equipment, Exercise } from './types'

/** El nivel elegido de cada familia: `familia → id del ejercicio`. */
export type ExerciseLevels = Record<string, string>

type LevelFilter = {
  catalog?: readonly Exercise[]
  /** El material de hoy (`availableEquipment(gearToday(...))`). */
  equipment: readonly Equipment[]
  careZones?: readonly CareZone[]
}

function doable(exercise: Exercise, { equipment, careZones = [] }: LevelFilter): boolean {
  return !exercise.warmupOnly && isAvailable(exercise, equipment) && !loadsCareZone(exercise.id, careZones)
}

/**
 * Las variantes entre las que se puede elegir, de la más accesible a la más
 * exigente: la misma familia y categoría, con el material de hoy y sin cargar
 * una zona a cuidar. El propio ejercicio siempre está. Vacío si no hay a qué
 * cambiar.
 */
export function levelOptions(exercise: Exercise, filter: LevelFilter): Exercise[] {
  if (!exercise.family) return []
  const catalog = filter.catalog ?? EXERCISE_CATALOG
  const options = catalog
    .filter(
      (item) =>
        item.id === exercise.id ||
        (item.family === exercise.family && item.category === exercise.category && doable(item, filter)),
    )
    .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name, 'es'))
  return options.length > 1 ? options : []
}

/**
 * La variante que el usuario eligió para la familia de `exercise`, si se puede
 * hacer hoy; si no, `null` y AXIS elige como siempre.
 */
export function chosenLevel(
  exercise: Exercise,
  levels: Readonly<ExerciseLevels> | undefined,
  filter: LevelFilter,
): Exercise | null {
  const id = exercise.family ? levels?.[exercise.family] : undefined
  if (!id) return null
  const chosen = findExercise(id, filter.catalog ?? EXERCISE_CATALOG)
  if (!chosen || chosen.family !== exercise.family || chosen.category !== exercise.category) return null
  return doable(chosen, filter) ? chosen : null
}
