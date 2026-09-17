/**
 * Seguridad de AXIS: la puerta de salida del modelo de lenguaje.
 *
 * El modelo redacta; no decide. Pero un texto puede decir lo contrario de lo que
 * el dominio decidió, y hasta ahora nadie lo comprobaba. Esta puerta lo hace
 * antes de que el texto llegue al usuario. Si no pasa, no se enseña: responde
 * el determinista, que ya tenía la respuesta correcta.
 *
 * Las comprobaciones son deliberadamente **pocas, literales y explicables**.
 * Cada rechazo lleva un motivo que se puede leer y discutir. No hay puntuación,
 * ni umbrales de parecido, ni heurísticas que nadie pueda predecir: o el texto
 * contiene algo de la lista, o no lo contiene.
 *
 * Lo que se comprueba sale de dos sitios: la forma, de `personality.ts` (la
 * misma tabla que genera el prompt), y el fondo, del veredicto y la propuesta
 * que el dominio ya emitió.
 */

import { normalizeQuestion } from './conversation/intents'
import type { AxisAnswer } from './conversation/types'
import { FOCUS_TERMS, type SessionFocus } from './knowledge/focus'
import { AXIS_PERSONALITY, type AxisPersonality } from './personality'

export type ModelTextRejection =
  | 'empty'
  | 'too_long'
  | 'emoji'
  | 'exclamation'
  | 'medical_language'
  | 'forbidden_opener'
  /** El dominio dijo que no y el texto dice que sí. */
  | 'contradicts_verdict'
  /** El dominio aprobó una opción y el texto anuncia otra, o se niega. */
  | 'contradicts_proposal'

export type ModelTextCheck =
  | { ok: true }
  | { ok: false; reason: ModelTextRejection; detail: string }

/** Lo que la puerta necesita saber de la respuesta del dominio. */
export type DomainAnswerForSafety = Pick<AxisAnswer, 'text' | 'intent' | 'verdict' | 'proposedTarget'>

/**
 * Frases con las que un texto concede un cambio.
 *
 * Solo se miran cuando el dominio ha dicho que **no**: en un «sí» son la
 * redacción normal. Están en la forma normalizada (sin acentos).
 */
const ACCEPTANCE_MARKERS: readonly string[] = [
  'de acuerdo',
  'cambio a ',
  'cambiamos a ',
  'pasamos a ',
  'adelante con',
  'hagamos ',
  'vale, ',
  'esta bien, ',
  'te lo cambio',
  'lo cambio',
]

/** Frases con las que un texto se niega. Solo se miran cuando el dominio dijo que sí. */
const REFUSAL_MARKERS: readonly string[] = [
  'no lo cambio',
  'no voy a cambiar',
  'no cambio la sesion',
  'sigo pensando lo mismo',
  'se queda como esta',
  'no lo quitaria',
  'mantengo la recomendacion',
  'mantengo la sesion',
  'hoy no lo cambiaria',
]

/** Con qué se anuncia un cambio de sesión. Sirve para leer a qué foco se cambia. */
const CHANGE_ANNOUNCEMENTS: readonly string[] = ['cambio a', 'cambiamos a', 'pasamos a', 'te propongo']

const EMOJI = /\p{Extended_Pictographic}/u
const EXCLAMATION = /[!¡]/

/** Frases de un texto. Los decimales («2.5 kg») no cuentan como punto final. */
export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length
}

/** Como la normalización de preguntas, pero sin comillas ni signos delante. */
function normalize(text: string): string {
  return normalizeQuestion(text).replace(/^[^a-z0-9]+/, '')
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalize(term)))
}

function focusMentionedIn(sentence: string): SessionFocus | null {
  for (const entry of FOCUS_TERMS) {
    if (entry.terms.some((term) => sentence.includes(normalize(term)))) return entry.focus
  }
  return null
}

/**
 * A qué foco dice el texto que cambia, si lo anuncia.
 *
 * Solo se lee lo que sigue al anuncio, hasta la siguiente pausa: en «cambio a
 * tren superior: las piernas ya las cargaste», el destino es tren superior y
 * las piernas son la explicación.
 */
function announcedFocus(text: string): SessionFocus | null {
  const normalized = normalize(text)
  for (const announcement of CHANGE_ANNOUNCEMENTS) {
    let from = 0
    for (;;) {
      const at = normalized.indexOf(announcement, from)
      if (at === -1) break
      const clause = normalized.slice(at + announcement.length).split(/[,:;.!?…]/)[0]
      const focus = focusMentionedIn(clause)
      if (focus) return focus
      from = at + announcement.length
    }
  }
  return null
}

/**
 * Comprueba el texto del modelo antes de enseñarlo.
 *
 * Devuelve el primer motivo de rechazo que encuentra, en orden de gravedad
 * decreciente para el usuario: primero el fondo (contradecir al dominio),
 * después la forma.
 */
export function checkModelText(
  text: string,
  domain: DomainAnswerForSafety,
  personality: AxisPersonality = AXIS_PERSONALITY,
): ModelTextCheck {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty', detail: 'El modelo no devolvió texto.' }
  }

  const normalized = normalize(trimmed)

  // Fondo: el veredicto no se negocia con la redacción.
  if (domain.verdict === 'decline' && includesAny(normalized, ACCEPTANCE_MARKERS)) {
    return {
      ok: false,
      reason: 'contradicts_verdict',
      detail: 'El dominio rechazó el cambio y el texto lo concede.',
    }
  }

  const target = domain.proposedTarget ?? null
  if (target) {
    if (includesAny(normalized, REFUSAL_MARKERS)) {
      return {
        ok: false,
        reason: 'contradicts_proposal',
        detail: 'El dominio aprobó un cambio y el texto se niega.',
      }
    }
    const announced = announcedFocus(trimmed)
    if (announced !== null && target.focus !== null && announced !== target.focus) {
      return {
        ok: false,
        reason: 'contradicts_proposal',
        detail: `El dominio aprobó ${target.focus} y el texto anuncia ${announced}.`,
      }
    }
  }

  // Forma: lo que la personalidad no admite.
  const opener = personality.forbiddenOpeners.find((phrase) => normalized.startsWith(normalize(phrase)))
  if (opener) {
    return {
      ok: false,
      reason: 'forbidden_opener',
      detail: `La respuesta abre con «${opener}».`,
    }
  }

  const medical = personality.forbiddenMedicalTerms.find((term) => normalized.includes(normalize(term)))
  if (medical) {
    return {
      ok: false,
      reason: 'medical_language',
      detail: `La respuesta usa lenguaje médico («${medical}»).`,
    }
  }

  if (!personality.limits.allowEmojis && EMOJI.test(trimmed)) {
    return { ok: false, reason: 'emoji', detail: 'La respuesta contiene emojis.' }
  }

  if (!personality.limits.allowExclamations && EXCLAMATION.test(trimmed)) {
    return { ok: false, reason: 'exclamation', detail: 'La respuesta contiene exclamaciones.' }
  }

  const sentences = countSentences(trimmed)
  if (sentences > personality.limits.maxSentences || trimmed.length > personality.limits.maxCharacters) {
    return {
      ok: false,
      reason: 'too_long',
      detail: `${sentences} frases y ${trimmed.length} caracteres; el máximo es ${personality.limits.maxSentences} frases y ${personality.limits.maxCharacters} caracteres.`,
    }
  }

  return { ok: true }
}
