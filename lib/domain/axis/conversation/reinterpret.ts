/**
 * Reinterpretar lo que el determinista no entiende (D-028).
 *
 * Cuando un mensaje sigue sin reconocerse después de corregir las faltas
 * (D-026), se le pide al modelo **una sola cosa**: que lo reescriba como una
 * frase clara, sin añadir nada. Después la frase vuelve al determinista, que es
 * quien responde. El modelo no contesta al usuario ni decide nada: traduce.
 *
 * Del dispositivo solo sale el mensaje. Sin briefing: para reescribir una frase
 * no hace falta saber nada del usuario.
 *
 * Este módulo es puro: el prompt, la petición y la puerta de lo que vuelve.
 */

import { findInventedNumber } from '../safety'
import type { AxisAiRequest } from './ai'
import type { AxisAnswer } from './types'

/** Lo que responde el modelo cuando el mensaje no se entiende o no va de AXTHLETICS. */
export const REINTERPRET_NONE = 'NO_ENTIENDO'

/** Una reformulación es una frase, no una explicación. */
export const MAX_REINTERPRETATION_LENGTH = 160

/**
 * Frases que el determinista entiende, para que el modelo reescriba hacia ellas.
 * Un test comprueba que ninguna deja de entenderse.
 */
export const REINTERPRET_EXAMPLES: readonly string[] = [
  'Estoy muy cansado.',
  '¿Cómo estoy recuperando?',
  '¿Qué tal la semana?',
  '¿Cómo va mi carga?',
  '¿Qué entrené ayer?',
  '¿Qué entrenamiento tengo hoy?',
  '¿Por qué me propones este entrenamiento?',
  '¿Puedo entrenar hoy?',
  'Quiero una sesión más corta.',
  'Quiero una sesión más suave.',
  'Hoy no quiero hacer piernas.',
  'Me duele la rodilla.',
  '¿Cuáles son mis objetivos?',
]

export function reinterpretSystemPrompt(): string {
  return [
    'Eres el intérprete de mensajes de AXIS, el entrenador de AXTHLETICS: entrenamiento, recuperación, sueño, hidratación, ejercicios, la sesión de hoy y el historial.',
    'Recibes un JSON con `question`: un mensaje del usuario que el motor de AXIS no ha entendido.',
    'Reescríbelo como una frase corta en español correcto, en primera persona, como la escribiría el propio usuario. Corrige faltas, abreviaturas y jerga.',
    `El motor entiende frases como estas; si el mensaje quiere decir lo mismo que una, usa sus palabras: ${REINTERPRET_EXAMPLES.map((example) => `«${example}»`).join(', ')}.`,
    'No añadas nada que el usuario no haya dicho: ni cifras, ni actividades, ni molestias, ni preferencias. No respondas al mensaje: solo reescríbelo.',
    `Si no se entiende, o no va de nada de lo anterior, el mensaje es exactamente ${REINTERPRET_NONE}.`,
    'Devuelve SOLO un objeto JSON con esta forma:',
    '{"message": "el mensaje reescrito", "action": null}',
  ].join('\n')
}

/** La petición: el mismo contrato de la ruta, con el briefing vacío. */
export type AxisAiReinterpretRequest = Omit<AxisAiRequest, 'briefing'> & {
  briefing: Record<string, never>
}

export function buildReinterpretRequest(question: string, local: AxisAnswer): AxisAiReinterpretRequest {
  return {
    system: reinterpretSystemPrompt(),
    question,
    briefing: {},
    domain: { text: local.text, intent: local.intent, proposedTarget: null },
  }
}

/** Letras, cifras y la puntuación de una frase. Nada de emojis, marcas ni saltos de línea. */
const SENTENCE = /^[\p{L}\p{N} ¿?¡!.,;:'"()-]+$/u

/**
 * La frase que vuelve, lista para el determinista, o `null` si no vale.
 *
 * No vale si el modelo no la entendió, si es larga o rara, o si trae una cifra
 * que el usuario no escribió: «tengo poco tiempo» no puede volver como «tengo
 * 20 minutos».
 */
export function readReinterpretation(original: string, text: string): string | null {
  const rewritten = text.trim().replace(/[«»]/g, '').replace(/[¡!]/g, '')
  if (rewritten.length === 0 || rewritten.includes(REINTERPRET_NONE)) return null
  if (rewritten.length > MAX_REINTERPRETATION_LENGTH || !SENTENCE.test(rewritten)) return null
  if (findInventedNumber(rewritten, original, {}) !== null) return null
  return rewritten
}

/**
 * La respuesta del determinista a la frase reinterpretada, tal como se enseña.
 *
 * Dice cómo se ha entendido el mensaje, al final para que la primera frase siga
 * siendo el veredicto: es una interpretación y se presenta como tal. Y no
 * aprende nada de ella: lo que el usuario «habría dicho» que hoy no ocurre o la
 * carga que «habría contado» salen de una suposición, y no se guardan. Lo que
 * proponga sigue necesitando su botón de confirmar.
 */
export function presentReinterpreted(answer: AxisAnswer, rewritten: string): AxisAnswer {
  const { cancelledActivities: _cancelled, reportedLoad: _load, ...rest } = answer
  return { ...rest, text: `${answer.text} Te he entendido como «${rewritten.replace(/[.;:,]+$/, '')}».` }
}
