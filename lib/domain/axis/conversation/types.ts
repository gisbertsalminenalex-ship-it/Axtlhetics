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
  /**
   * Alternativa que la aplicación debe seleccionar como sesión del día.
   *
   * Es lo que convierte la conversación en una decisión de verdad: cuando AXIS
   * acepta un cambio, la sesión cambia. `null` cuando no hay nada que aplicar,
   * incluido cuando AXIS se ha negado.
   */
  applyProposalId?: string | null
  /** La petición que se acaba de juzgar, para reconocer que insiste con la misma. */
  changeRequest?: { kind: string; focus: string | null } | null
}

/**
 * Memoria mínima de la conversación.
 *
 * Solo lo necesario para entender una pregunta de seguimiento. No es un historial
 * ni un estado paralelo: la verdad sigue estando en el briefing.
 */
export type AxisConversationMemory = {
  lastIntent: AxisIntent | null
  /**
   * La conversación está acotada a cambiar el entrenamiento de hoy.
   *
   * Se activa al pulsar «Cambiar entrenamiento». Mientras dura, un mensaje suelto
   * («ayer hice 20 km de bici, hoy piernas no») se lee como una petición de
   * cambio y no como una pregunta cualquiera.
   */
  changeMode?: boolean
  /**
   * Lo último que el usuario pidió cambiar.
   *
   * Sirve para no ceder por insistencia: si vuelve con «venga, porfa» sin aportar
   * nada nuevo, AXIS reconoce que es la misma petición y mantiene su veredicto en
   * lugar de preguntar otra vez qué quiere.
   */
  lastChangeRequest?: { kind: string; focus: string | null } | null
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
