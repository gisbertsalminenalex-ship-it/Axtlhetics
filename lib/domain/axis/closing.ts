/**
 * Lo que AXIS dice al cerrar una sesión (D-019).
 *
 * Sustituye al motivo con el que se propuso la sesión, que hablaba de antes de
 * entrenar. Es determinista y solo afirma lo que el resto del sistema hace de
 * verdad: que la próxima propuesta parte de lo registrado, que un ejercicio a
 * medias no sube la carga y que una sesión interrumpida no se usa para progresar.
 *
 * Como el resto de AXIS: la primera frase es el veredicto, sin cumplidos ni
 * exclamaciones.
 */

import { listNames } from '../shared/text'
import type { PersonalRecord } from '../workouts/history'
import type { WorkoutSession } from '../workouts/types'
import { metTarget } from '../workouts/types'

export function closingMessage(
  session: WorkoutSession,
  records: readonly PersonalRecord[] = [],
): string {
  const parts: string[] = []

  if (session.status === 'abandoned') {
    const sets = session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
    parts.push(
      `Sesión interrumpida con ${sets} ${sets === 1 ? 'serie registrada' : 'series registradas'}.`,
      'Queda guardada, pero no la uso para subir cargas: al no terminarla no dice de qué eres capaz.',
    )
    return parts.join(' ')
  }

  const short = session.exercises.filter((exercise) => !metTarget(exercise)).map((e) => e.name)
  const skipped = session.modifications.some(
    (modification) => modification.kind === 'exercise_skipped' || modification.kind === 'session_shortened',
  )

  if (short.length > 0) {
    parts.push(
      `${listNames(short)} ${short.length === 1 ? 'quedó' : 'quedaron'} por debajo de lo previsto, así que la próxima vez repito esos parámetros en lugar de subir.`,
    )
  } else if (skipped) {
    parts.push('Te dejaste ejercicios sin hacer. Lo que sí hiciste queda registrado y la próxima propuesta parte de ahí.')
  } else {
    parts.push('Sesión completa: hiciste todo lo previsto. La próxima propuesta parte de lo que has registrado hoy.')
  }

  /*
   * Un récord cuenta aunque el ejercicio quedara a medias: la serie existió. Pero
   * se dice aparte, para que superar una marca no se confunda con haber hecho
   * todo lo previsto.
   */
  const recordNames = [...new Set(records.map((record) => record.name))]
  const fullRecords = recordNames.filter((name) => !short.includes(name))
  const partialRecords = recordNames.filter((name) => short.includes(name))

  if (fullRecords.length > 0) {
    parts.push(`Has superado tu mejor marca registrada en ${listNames(fullRecords)}.`)
  }
  if (partialRecords.length > 0) {
    parts.push(
      `En ${listNames(partialRecords)} también superaste tu mejor marca, aunque sin completar lo previsto.`,
    )
  }

  return parts.join(' ')
}
