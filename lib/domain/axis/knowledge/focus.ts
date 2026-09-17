/**
 * Conocimiento de AXIS: focos de sesión.
 *
 * Qué grupos carga cada foco y cómo se nombra viven en `workouts/types.ts`, que
 * es la única definición (el constructor de sesiones y el historial la usan).
 * Aquí se reexporta y se añade lo que solo AXIS necesita: cómo **nombra el
 * usuario** cada foco cuando escribe, y cómo se dice el foco dentro de una frase.
 *
 * Solo datos. Elegir el foco del día es cosa de `rules.ts`.
 */

import {
  FOCUS_CATEGORIES,
  FOCUS_MUSCLE_GROUPS,
  SESSION_FOCUS_LABELS,
  type SessionFocus,
} from '../../workouts/types'

export { FOCUS_CATEGORIES, FOCUS_MUSCLE_GROUPS, SESSION_FOCUS_LABELS }
export type { SessionFocus }

/** Todos los focos, en el orden de la tabla. */
export const SESSION_FOCUSES: readonly SessionFocus[] = Object.keys(
  SESSION_FOCUS_LABELS,
) as SessionFocus[]

/** El foco tal y como va dentro de una frase: «tren superior», «core y movilidad». */
export function describeFocus(focus: SessionFocus): string {
  return SESSION_FOCUS_LABELS[focus].toLowerCase()
}

/**
 * Cómo nombra el usuario cada foco.
 *
 * Nadie escribe «tren_inferior»: escribe «piernas», «sentadilla» o «glúteo». El
 * orden de la lista importa: la primera entrada cuyo término aparece gana.
 */
export const FOCUS_TERMS: readonly { focus: SessionFocus; terms: readonly string[] }[] = [
  { focus: 'tren_inferior', terms: ['pierna', 'piernas', 'tren inferior', 'sentadilla', 'gluteo', 'glúteo'] },
  { focus: 'tren_superior', terms: ['tren superior', 'pecho', 'espalda', 'brazo', 'brazos', 'hombro', 'hombros'] },
  { focus: 'core_movilidad', terms: ['core', 'abdominal', 'movilidad', 'plancha'] },
  { focus: 'cuerpo_completo', terms: ['cuerpo completo', 'todo el cuerpo', 'full body'] },
]
