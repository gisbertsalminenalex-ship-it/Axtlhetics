/**
 * Conversación con AXIS.
 *
 * AXIS no se convierte en un chatbot: responde **desde el briefing**, que es el
 * mismo contexto y la misma decisión que alimentan la pantalla de Inicio. No hay un
 * segundo sistema de decisión.
 */

import type { AxisActionProposal, AxisActionTarget } from '../actions'
import type { AxisBriefing } from '../briefing'
import type { ReportedLoad } from '../memory'

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
  | 'changed'
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
  /**
   * Acción pendiente de confirmar, si este mensaje propone una.
   *
   * Viaja con el mensaje para que el botón aparezca dentro de la conversación, y
   * no en una pantalla aparte. Su presencia no cambia nada por sí sola.
   */
  action?: AxisActionProposal | null
  /**
   * `true` si el modelo de lenguaje propuso algo que el dominio no aprobó y se
   * respondió con el determinista. Queda en el mensaje, y por tanto guardado,
   * para que un modelo que discrepa deje rastro.
   */
  modelDisagreed?: boolean
}

/**
 * Qué ha decidido AXIS sobre una petición de cambio.
 *
 * Es el dato que hace explicable la firmeza: un texto puede sonar a sí o a no,
 * pero el veredicto es uno de estos cuatro y no admite matices.
 */
export type AxisVerdict =
  /** Se cambia: la evidencia lo respalda. */
  | 'accept'
  /** Ni lo uno ni lo otro: se ofrece un punto intermedio. */
  | 'compromise'
  /** No se cambia, y se explica por qué. */
  | 'decline'
  /** Falta saber algo para poder decidir. */
  | 'need_info'

export type AxisAnswer = {
  text: string
  intent: AxisIntent
  /** `true` si la respuesta es «no tengo ese dato». */
  unknown: boolean
  /**
   * El veredicto, cuando la respuesta juzga una petición de cambio.
   *
   * Es lo que permite comprobar que una redacción externa no convierta un «no»
   * en un «sí»: el texto puede reescribirse, el veredicto no.
   */
  verdict?: AxisVerdict | null
  /**
   * La opción que AXIS propone para hoy, si ha llegado a una.
   *
   * **No se aplica sola.** La aplicación la convierte en una propuesta de acción
   * con su botón, y solo al pulsarlo cambia la sesión. Que el usuario escriba
   * «sí» en la conversación no basta: decirlo no es confirmarlo.
   *
   * `null` cuando no hay nada que proponer, incluido cuando AXIS se ha negado.
   */
  proposedTarget?: AxisActionTarget | null
  /** El motivo con el que AXIS defiende esa propuesta. Queda registrado. */
  proposedReason?: string
  /** La petición que se acaba de juzgar, para reconocer que insiste con la misma. */
  changeRequest?: { kind: string; focus: string | null } | null
  /**
   * La carga que el usuario ha contado en este mensaje, si la hay.
   *
   * La aplicación la guarda en la memoria del día para que siga contando en las
   * peticiones siguientes. Aquí solo se transporta.
   */
  reportedLoad?: ReportedLoad | null
  /**
   * Actividades del calendario que el usuario acaba de decir que hoy no ocurren.
   *
   * La aplicación las descarta y AXIS vuelve a decidir sin ellas. Reservar
   * piernas para un partido que se ha cancelado es decidir con datos falsos.
   */
  cancelledActivities?: string[]
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
