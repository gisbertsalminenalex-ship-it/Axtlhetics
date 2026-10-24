/**
 * Riesgo para la vida (D-070, bloque 3), como en Mentax: si el usuario habla de
 * hacerse daño o de no querer vivir, AXIS no entrena ni charla. Contesta con
 * cuidado, siempre con el mismo texto revisado, le da el 024 (línea de atención
 * a la conducta suicida, gratuita y a cualquier hora) y el 112, y le anima a
 * contárselo a alguien. Nunca pasa por la IA.
 *
 * Es una lista de frases concretas, no comprensión del texto: prefiere
 * reconocer de más («quiero morirme» dicho en broma) a dejar pasar una de
 * verdad, pero no salta con expresiones de cansancio como «me muero de
 * agujetas» o «esta rutina me mata».
 */

import { normalizeQuestion } from './intents'

const CRISIS_PATTERNS: readonly RegExp[] = [
  /\bsuicid/,
  /\bquitarme la vida\b/,
  /\bmatarme\b/,
  /\bme quiero matar\b/,
  /\bquiero morir(me)?\b/,
  /\bme quiero morir\b/,
  /\bno quiero (seguir )?vivi(r|endo)\b/,
  /\bno tengo ganas de vivir\b/,
  /\bno quiero seguir aqui\b/,
  /\bganas de morir/,
  /\b(estaria|estar) mejor muert[oa]\b/,
  /\bmejor (estaria|estar) muert[oa]\b/,
  /\bacabar con todo\b/,
  /\bacabar con mi vida\b/,
  /\bautolesi/,
  /\bhacerme dano\b/,
  /\bme hago dano\b/,
  /\bcortarme\b/,
  /\bme corto\b/,
]

export function detectCrisis(message: string): boolean {
  const text = normalizeQuestion(message)
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text))
}

export const CRISIS_TEXT =
  'Lo que me cuentas es importante y no quiero que lo lleves solo. Habla ahora con alguien: en España puedes llamar gratis al 024, a cualquier hora, y si estás en peligro, al 112. Cuéntaselo también a un adulto de confianza. Del entrenamiento hablamos cuando quieras; aquí sigo.'
