/**
 * Preguntas por el test de evolución (D-021).
 *
 * AXIS solo habla del test cuando el usuario pregunta por él: ninguna otra
 * respuesta lo menciona. Aquí se reconoce la pregunta y se responde con los
 * hechos del briefing —disponibilidad, motivos, fechas, protocolo—, sin
 * animar a hacerlo ni prometer resultados.
 */

import type { AssessmentBlock } from '../../assessment/availability'
import { ASSESSMENT_INTERVAL_DAYS } from '../../assessment/protocol'
import { formatDayInSentence } from '../../shared/dates'
import type { AxisBriefing, BriefingAssessment } from '../briefing'
import { normalizeQuestion } from './intents'
import type { AxisAnswer, AxisIntent } from './types'

/** «test», «tests», «test de evolución». Como palabra: «contesta» no cuenta. */
const ASSESSMENT_TERM = /(^|[^a-z0-9])tests?([^a-z0-9]|$)/

/** Seguimientos que solo se entienden si se venía hablando del test. */
const FOLLOW_UP = /\b(repetir|repetirlo|cuando me toca|cuando toca|que ejercicios|que pruebas|como funciona|en que consiste|cuanto dura|que mide)\b/

/** `true` si el mensaje pregunta por el test, o sigue una pregunta sobre él. */
export function asksAboutAssessment(question: string, lastIntent: AxisIntent | null): boolean {
  const text = normalizeQuestion(question)
  if (ASSESSMENT_TERM.test(text)) return true
  return lastIntent === 'assessment' && FOLLOW_UP.test(text)
}

const HOW_TERMS = /\b(como funciona|en que consiste|que es|que ejercicios|que pruebas|que mide|cuanto dura|como se hace)\b/

export function answerAssessment(question: string, briefing: AxisBriefing): AxisAnswer {
  const text = normalizeQuestion(question)
  const assessment = briefing.assessment
  const parts = HOW_TERMS.test(text) ? describeProtocol(assessment) : describeAvailability(assessment)
  return { text: parts.join(' '), intent: 'assessment', unknown: false }
}

/** Qué es: las cuatro pruebas, qué se mide y con qué se compara. */
function describeProtocol(assessment: BriefingAssessment): string[] {
  const push = assessment.pushUp?.name.toLowerCase() ?? 'flexiones'
  const parts = [
    `El test de evolución son 4 pruebas, siempre en este orden: ${push}, plancha, sentadilla isométrica en pared y remo unilateral con 5 kg (una pesa o una garrafa de agua de 5 litros), cada lado por separado.`,
    'Se mide cuántas repeticiones o segundos aguantas con buena técnica, se para cuando la técnica deja de ser válida y se compara solo con tu test anterior. Son unos 10–15 minutos.',
  ]
  if (assessment.pushUp && !assessment.pushUp.fixed) {
    // «Flexiones» a secas es la variante estándar: dicho así, la frase no diría nada.
    const variant = push === 'flexiones' ? 'flexiones estándar' : push
    parts.push(`Para el primero, por tu nivel, tocan ${variant}.`)
  }
  parts.push(`Se puede repetir a los ${ASSESSMENT_INTERVAL_DAYS} días del último test completado.`)
  return parts
}

/** Si se puede hacer hoy y, si no, por qué. */
function describeAvailability(assessment: BriefingAssessment): string[] {
  const next = assessment.nextEligibleDay ? formatDayInSentence(assessment.nextEligibleDay) : null
  const last = assessment.lastCompletedDay ? formatDayInSentence(assessment.lastCompletedDay) : null

  if (assessment.status === 'in_progress') {
    return ['Tienes un test empezado hoy: puedes continuarlo donde lo dejaste.']
  }
  if (assessment.completedToday) {
    return ['Ya has hecho el test hoy.', ...(next ? [`El siguiente, a partir del ${next}.`] : [])]
  }
  if (assessment.interruptedToday) {
    return [
      'Hoy empezaste un test y lo dejaste a medias: no cuenta como comparación, y por hoy ya es suficiente esfuerzo.',
      'Puedes repetirlo otro día.',
    ]
  }
  if (assessment.status === 'available') {
    return ['Sí, hoy puedes hacer el test.', last ? `El anterior fue el ${last}.` : 'Sería tu primer test.']
  }

  /*
   * Una razón por causa. Si hoy ya se entrenó, el descanso que decide el motor
   * es consecuencia de eso: decirlo dos veces («ya has entrenado» y «has
   * completado una sesión») no añade nada.
   */
  const blocks = assessment.reasons.filter(
    (reason) => !(reason === 'axis_rest' && assessment.reasons.includes('trained_today')),
  )
  const reasons = blocks
    .map((reason) => reasonText(reason, assessment, last, next, blocks.length === 1))
    .filter((reason): reason is string => reason !== null)
  return ['Hoy no puedes hacer el test.', ...reasons]
}

/**
 * Por qué hoy no se puede hacer el test, con las mismas palabras con las que lo
 * responde AXIS. `null` si se puede hacer o hay uno a medias que reanudar. Lo usa
 * la introducción del test: la disponibilidad del dominio manda también ahí.
 */
export function assessmentUnavailableText(assessment: BriefingAssessment): string | null {
  if (assessment.status === 'available' || assessment.status === 'in_progress') return null
  return describeAvailability(assessment).join(' ')
}

function reasonText(
  reason: AssessmentBlock,
  assessment: BriefingAssessment,
  last: string | null,
  next: string | null,
  onlyBlock: boolean,
): string | null {
  switch (reason) {
    case 'too_soon':
      return last && next
        ? `El último fue el ${last} y se repite a los ${ASSESSMENT_INTERVAL_DAYS} días: a partir del ${next}.`
        : `Se repite a los ${ASSESSMENT_INTERVAL_DAYS} días del último.`
    case 'assessment_today':
      return null // ya cubierto por completado o interrumpido hoy
    case 'trained_today':
      return 'Hoy ya has entrenado, y el test pide llegar fresco.'
    case 'recovery_unknown':
      // Registrarla solo cambia algo si es lo único que falta: si no, sería
      // ofrecer una salida que no lleva a ningún sitio.
      return onlyBlock
        ? 'No tengo tu recuperación de hoy registrada, y sin ella no sé si estás para un esfuerzo máximo. Regístrala y lo miro.'
        : 'No tengo tu recuperación de hoy registrada.'
    case 'recovery_low':
      return 'Tu recuperación de hoy es baja: no es día para un esfuerzo máximo.'
    case 'demanding_activity_today':
      return 'Hoy tienes un deporte exigente.'
    case 'demanding_activity_tomorrow':
      return 'Mañana tienes un deporte exigente y llegarías cargado.'
    case 'axis_rest':
      // El motivo es el del motor, no uno nuevo.
      return assessment.restReason ? `Hoy toca descansar: ${lowerFirst(assessment.restReason)}` : 'Hoy toca descansar.'
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * El motivo breve con el que la tarjeta de Entrenamiento explica que el test ya
 * tocaría pero hoy no se puede hacer. `null` cuando no hay nada que explicar: si
 * está disponible o a medias (la tarjeta lo ofrece), si aún no han pasado los
 * 28 días (no se muestra, sin contador) o si hoy ya se hizo uno.
 */
export function assessmentEntryReason(assessment: BriefingAssessment): string | null {
  if (assessment.status !== 'unavailable') return null
  if (assessment.completedToday || assessment.interruptedToday) return null
  if (assessment.reasons.includes('too_soon') || assessment.reasons.includes('assessment_today')) return null

  const first = assessment.reasons[0]
  switch (first) {
    case 'trained_today':
      return 'Hoy ya has entrenado.'
    case 'recovery_unknown':
      return 'Registra tu recuperación de hoy para poder hacerlo.'
    case 'recovery_low':
      return 'Tu recuperación de hoy es baja.'
    case 'demanding_activity_today':
      return 'Hoy tienes un deporte exigente.'
    case 'demanding_activity_tomorrow':
      return 'Mañana tienes un deporte exigente.'
    case 'axis_rest':
      return 'Hoy toca descansar.'
    default:
      return null
  }
}

/** Lo que reconoce la respuesta sobre el test, como vocabulario del corrector de faltas (D-026). */
export const ASSESSMENT_VOCABULARY: readonly RegExp[] = [ASSESSMENT_TERM, FOLLOW_UP, HOW_TERMS]
