/**
 * Lo que AXIS recuerda de un día para otro (D-037): qué ejercicios no gustan y
 * dónde hay una molestia.
 *
 * Detectores puros sobre el mensaje ya corregido (D-026). Qué se guarda y dónde
 * lo decide el store; aquí solo se reconoce.
 */

import { normalizeQuestion } from './intents'
import { detectExercise } from './intents'

/** «No me gustan las zancadas», «odio el superman», «no soporto la plancha». */
const DISLIKE = /\b(no me gusta|no me gustan|odio|no soporto|no me mola|no me molan|no me gusta nada)\b/
/** «Ya me gustan las zancadas», «vuelve a ponerme sentadillas». */
const LIKE = /\b(ya me gusta|ya me gustan|vuelve a poner|vuelve a proponer|me gusta otra vez|me gustan otra vez)\b/

export type ExercisePreference = { exerciseId: string; name: string; liked: boolean }

/** Una preferencia sobre un ejercicio concreto, o `null` si el mensaje no la expresa. */
export function detectPreference(message: string): ExercisePreference | null {
  const text = normalizeQuestion(message)
  const liked = LIKE.test(text)
  if (!liked && !DISLIKE.test(text)) return null
  const exercise = detectExercise(message)
  if (!exercise) return null
  return { exerciseId: exercise.id, name: exercise.name, liked }
}

/** Zonas del cuerpo que se apuntan cuando el usuario cuenta una molestia. */
export const DISCOMFORT_ZONES: readonly { zone: string; terms: readonly string[] }[] = [
  { zone: 'rodilla', terms: ['rodilla'] },
  { zone: 'tobillo', terms: ['tobillo'] },
  { zone: 'hombro', terms: ['hombro'] },
  { zone: 'espalda', terms: ['espalda', 'lumbar', 'lumbares'] },
  { zone: 'codo', terms: ['codo'] },
  { zone: 'muñeca', terms: ['muneca', 'muñeca'] },
  { zone: 'cadera', terms: ['cadera'] },
  { zone: 'cuello', terms: ['cuello', 'cervical'] },
]

/** La zona de la molestia que cuenta el mensaje, o `null` si no nombra ninguna. */
export function detectDiscomfortZone(message: string): string | null {
  const text = normalizeQuestion(message)
  return DISCOMFORT_ZONES.find((entry) => entry.terms.some((term) => text.includes(normalizeQuestion(term))))?.zone ?? null
}

/** Lo que reconoce este módulo, como vocabulario del corrector de faltas (D-026). */
export const PREFERENCE_VOCABULARY: readonly (string | RegExp)[] = [DISLIKE, LIKE, ...DISCOMFORT_ZONES.flatMap((entry) => entry.terms)]
