/**
 * Detección de intención.
 *
 * Coincidencia por palabras clave, deliberadamente explícita: se puede leer y
 * discutir. No pretende entender lenguaje natural — pretende no equivocarse en lo
 * que AXIS sabe responder y admitir el resto.
 *
 * Dos cosas la hacen algo más que una lista de `if`:
 *
 * 1. Reconoce **temas** («piernas», «tren superior») además de intenciones, para
 *    poder responder a «¿y por qué no piernas?».
 * 2. Usa la **última intención** como contexto, de modo que una pregunta corta de
 *    seguimiento se resuelve contra lo último que se habló.
 */

import { FOCUS_TERMS, type SessionFocus } from '../knowledge/focus'
import { SPORT_TERMS } from '../knowledge/sports'
import type { AxisIntent } from './types'

type IntentRule = {
  intent: AxisIntent
  any: readonly string[]
  /** Si se indica, además debe aparecer alguno de estos. */
  and?: readonly string[]
}

/** El orden importa: la primera regla que encaja gana. Las más específicas, antes. */
const RULES: readonly IntentRule[] = [
  // Fuera de ámbito antes que nada: cortar pronto lo que no es de AXTHLETICS.
  {
    intent: 'out_of_scope',
    any: ['capital de', 'quien es', 'quién es', 'que tiempo hace', 'receta', 'pelicula', 'película', 'traduce', 'noticia'],
  },
  {
    intent: 'medical',
    any: ['lesion', 'lesión', 'me duele', 'dolor', 'molestia', 'medico', 'médico', 'fisio', 'estoy enfermo', 'rodilla', 'hombro me'],
  },

  // Antes que 'change': preguntar qué se cambió no es pedir otro cambio.
  {
    intent: 'changed',
    any: ['que hemos cambiado', 'qué hemos cambiado', 'que cambiamos', 'qué cambiamos', 'que has cambiado', 'qué has cambiado', 'por que lo cambiamos', 'por qué lo cambiamos', 'que cambiaste', 'qué cambiaste', 'lo hemos cambiado'],
  },
  { intent: 'change', any: ['cambiar', 'cambia', 'otra sesion', 'otra sesión', 'otro entrenamiento', 'algo distinto', 'algo diferente'] },
  { intent: 'shorten', any: ['20 minutos', '15 minutos', '10 minutos', 'media hora', 'mas corto', 'más corto', 'menos tiempo', 'poco tiempo', 'solo hago', 'solo tengo'] },

  { intent: 'tired', any: ['cansado', 'cansada', 'agotado', 'agotada', 'reventado', 'sin fuerzas', 'hecho polvo', 'no puedo mas', 'no puedo más'] },

  { intent: 'factors', any: ['tienes en cuenta', 'has tenido en cuenta', 'como decides', 'cómo decides', 'en que te basas', 'en qué te basas', 'que miras', 'qué miras'] },

  { intent: 'why_not', any: ['por que no', 'porque no', 'por qué no', 'y no ', 'en vez de', 'en lugar de'] },
  { intent: 'why', any: ['por que', 'porque', 'por qué', 'razon', 'razón', 'explica', 'motivo', 'has elegido', 'elegiste'] },

  { intent: 'can_train', any: ['puedo entrenar', 'deberia entrenar', 'debería entrenar', 'tiene sentido entrenar', 'aunque tenga', 'aunque tengo'] },

  { intent: 'sport_impact', any: ['afecta', 'influye', 'condiciona'] },
  // Los nombres de deporte salen del conocimiento compartido con la negociación:
  // si AXIS entiende «básquet» al negociar, también lo entiende al clasificar.
  { intent: 'sport_today', any: ['deporte', 'partido', 'entreno de', 'actividad', ...SPORT_TERMS] },

  { intent: 'last_session', any: ['ultimo', 'último', 'ayer', 'anterior', 'hice', 'entrene', 'entrené'] },
  { intent: 'week', any: ['semana', 'progres', 'evolucion', 'evolución', 'llevo', 'racha'] },
  { intent: 'load', any: ['carga', 'acumulad', 'volumen'] },

  {
    intent: 'recovery',
    any: ['recuper', 'descans', 'sueño', 'sueno', 'dormid', 'fatiga', 'energia', 'energía', 'estres', 'estrés', 'hidrat'],
  },

  { intent: 'goals', any: ['objetivo', 'meta', 'priorizar', 'prioridad'] },

  {
    intent: 'today',
    any: ['hoy', 'ahora', 'deberia', 'debería', 'toca', 'entreno', 'entrenar', 'sesion', 'sesión', 'que hago', 'qué hago'],
  },
]

/**
 * Normaliza para que acentos, mayúsculas y puntuación no cambien el resultado.
 *
 * La apertura de interrogación importa: sin quitarla, «¿y eso?» no empieza por
 * «y eso» y las preguntas de seguimiento no se reconocerían.
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[¿¡"'\s]+/, '')
    .replace(/[?!."'\s]+$/, '')
    .trim()
}

/** Preguntas de seguimiento muy cortas: «¿y por qué?», «¿y eso?», «¿por qué no?». */
const FOLLOW_UP_MARKERS = ['y por que', 'y eso', 'y entonces', 'y si', 'por que no', 'y ademas']

export type IntentMatch = {
  intent: AxisIntent
  /** Foco mencionado explícitamente por el usuario, si lo hay. */
  focus: SessionFocus | null
  /** `true` si la pregunta se apoya en lo dicho justo antes. */
  isFollowUp: boolean
}

export function detectFocus(question: string): SessionFocus | null {
  const text = normalizeQuestion(question)
  for (const entry of FOCUS_TERMS) {
    if (entry.terms.some((term) => text.includes(normalizeQuestion(term)))) {
      return entry.focus
    }
  }
  return null
}

export function detectIntent(question: string, previous: AxisIntent | null = null): AxisIntent {
  return matchIntent(question, previous).intent
}

export function matchIntent(
  question: string,
  previous: AxisIntent | null = null,
): IntentMatch {
  const text = normalizeQuestion(question)
  const focus = detectFocus(question)
  const isFollowUp = FOLLOW_UP_MARKERS.some((marker) => text.startsWith(marker))

  if (text.length === 0) return { intent: 'unknown', focus, isFollowUp: false }

  for (const rule of RULES) {
    const matchesAny = rule.any.some((term) => text.includes(normalizeQuestion(term)))
    if (!matchesAny) continue
    if (rule.and && !rule.and.some((term) => text.includes(normalizeQuestion(term)))) continue

    // «¿Y por qué no piernas?» es un «por qué no» con foco, no un «por qué» suelto.
    if (rule.intent === 'why' && focus !== null) {
      return { intent: 'why_not', focus, isFollowUp }
    }
    return { intent: rule.intent, focus, isFollowUp }
  }

  // Nada ha encajado. Si es un seguimiento corto, se hereda el tema anterior.
  if (isFollowUp && previous) {
    return { intent: previous === 'today' ? 'why' : previous, focus, isFollowUp }
  }

  // Mencionar solo un grupo muscular tras hablar de la sesión es preguntar por él.
  if (focus !== null && previous !== null) {
    return { intent: 'why_not', focus, isFollowUp }
  }

  return { intent: 'unknown', focus, isFollowUp }
}
