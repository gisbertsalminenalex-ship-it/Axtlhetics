/**
 * Conversación con AXIS.
 *
 * AXIS no se convierte en un chatbot: responde **desde el briefing**, que es el
 * mismo contexto y la misma decisión que alimentan la pantalla de Inicio. No hay un
 * segundo sistema de decisión.
 */

import type { AxisBriefing } from '../briefing'

/** Lo que el usuario puede preguntar hoy. Cada intención se responde con datos reales. */
export type AxisIntent =
  | 'today'
  | 'why'
  | 'why_not'
  | 'factors'
  | 'recovery'
  | 'last_session'
  | 'week'
  | 'load'
  | 'goals'
  | 'sport_today'
  | 'sport_impact'
  | 'can_train'
  | 'tired'
  | 'change'
  | 'shorten'
  | 'medical'
  | 'out_of_scope'
  | 'unknown'

export type AxisMessageRole = 'user' | 'axis'

export type AxisMessage = {
  id: string
  role: AxisMessageRole
  text: string
  createdAt: string
  /** Solo en las respuestas: de qué dato salió, para poder auditarla. */
  intent?: AxisIntent
  /** `true` cuando AXIS ha dicho explícitamente que no dispone del dato. */
  unknown?: boolean
}

export type AxisAnswer = {
  text: string
  intent: AxisIntent
  /** `true` si la respuesta es «no tengo ese dato». */
  unknown: boolean
}

/**
 * Memoria mínima de la conversación.
 *
 * Solo lo necesario para entender una pregunta de seguimiento. No es un historial
 * ni un estado paralelo: la verdad sigue estando en el briefing.
 */
export type AxisConversationMemory = {
  lastIntent: AxisIntent | null
}

/**
 * La costura por la que entraría un proveedor de IA.
 *
 * `isAvailable()` permite a la interfaz decir la verdad sobre el estado del motor
 * sin lanzar excepciones, y a la aplicación caer al determinista cuando toque.
 */
export type AxisConversationEngine = {
  readonly id: string
  isAvailable(): Promise<boolean>
  answer(
    question: string,
    briefing: AxisBriefing,
    memory?: AxisConversationMemory,
  ): Promise<AxisAnswer>
}

/** Sugerencia que la pantalla ofrece cuando la conversación está vacía. */
export type AxisSuggestion = {
  label: string
  question: string
}
