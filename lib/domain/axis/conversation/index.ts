/**
 * Selección del motor conversacional.
 *
 * El reparto es fijo y no depende de si hay IA conectada:
 *
 *   El motor determinista **decide**. El modelo, cuando lo hay, **redacta**.
 *
 * De ahí salen las dos reglas de este módulo:
 *
 * 1. **La conversación nunca se queda muerta.** Si no hay IA configurada, o falla,
 *    o tarda demasiado, responde el determinista. Nunca se le enseña un error al
 *    usuario como respuesta.
 * 2. **No se llama al modelo por costumbre.** Solo en las preguntas donde una
 *    redacción natural aporta algo. Cuál es tu Recovery Score lo resuelve el
 *    dominio: pasarlo por un modelo solo añade latencia, coste y una ocasión de
 *    equivocarse.
 */

import type { AxisBriefing } from '../briefing'
import {
  AxisAiRejection,
  benefitsFromAi,
  createAiConversation,
  createHttpTransport,
  type AiRejectionReason,
  type AxisAiTransport,
} from './ai'
import { answerFromBriefing, createDeterministicConversation } from './deterministic'
import { matchIntent } from './intents'
import type { AxisAnswer, AxisConversationEngine, AxisConversationMemory } from './types'

export type AxisConversationOptions = {
  /**
   * Endpoint propio que habla con el proveedor.
   *
   * En producción es la función de Netlify. `null` desactiva la IA por completo.
   */
  aiEndpoint?: string | null
  /** Transporte alternativo. Se usa en los tests para no tocar la red. */
  transport?: AxisAiTransport
}

export type AxisConversationResult = AxisAnswer & {
  /** Motor que acabó respondiendo. La interfaz lo usa para avisar del modo. */
  engineId: string
  /** `true` si se pidió IA pero respondió el determinista. */
  usedFallback: boolean
  /**
   * `true` si el modelo propuso un destino distinto del que el dominio aprobó.
   *
   * Se registra siempre que ocurre: un modelo que discrepa del motor es un
   * problema que hay que poder ver, no algo que tapar.
   */
  modelDisagreed: boolean
  /** Por qué se descartó la respuesta del modelo, si se descartó. */
  rejectedReason: AiRejectionReason | null
}

/**
 * Un motor compuesto: el determinista siempre está detrás.
 */
export function createAxisConversation(
  options: AxisConversationOptions = {},
): {
  engine: AxisConversationEngine
  ask(
    question: string,
    briefing: AxisBriefing,
    memory?: AxisConversationMemory,
  ): Promise<AxisConversationResult>
} {
  const deterministic = createDeterministicConversation()
  const transport = options.transport ?? createHttpTransport(options.aiEndpoint ?? null)
  const ai = createAiConversation(transport, answerFromBriefing)

  async function ask(
    question: string,
    briefing: AxisBriefing,
    memory?: AxisConversationMemory,
  ): Promise<AxisConversationResult> {
    const local = answerFromBriefing(question, briefing, memory)

    /*
     * Se mira la intención antes de gastar una llamada. Las preguntas que son una
     * consulta de datos ya tienen su respuesta exacta; las que piden una
     * explicación son las que se benefician de que las escriba un modelo.
     *
     * Las respuestas de ámbito médico o fuera de AXTHLETICS se quedan siempre en
     * el determinista: ahí la redacción no aporta y el riesgo sí.
     */
    const intent = matchIntent(question, memory?.lastIntent ?? null).intent
    const worthIt = benefitsFromAi(local.intent) && benefitsFromAi(intent)

    if (!worthIt || !(await ai.isAvailable())) {
      return {
        ...local,
        engineId: deterministic.id,
        usedFallback: false,
        modelDisagreed: false,
        rejectedReason: null,
      }
    }

    try {
      const answer = await ai.answer(question, briefing, memory)
      return {
        ...answer,
        engineId: ai.id,
        usedFallback: false,
        modelDisagreed: false,
        rejectedReason: null,
      }
    } catch (cause) {
      /*
       * El proveedor ha fallado, ha tardado, ha devuelto algo ininteligible, o
       * ha dicho algo que el dominio no admite. No se propaga: AXIS sigue
       * sabiendo responder por su cuenta. Lo único que sale es el motivo.
       */
      const rejection = cause instanceof AxisAiRejection ? cause : null
      return {
        ...local,
        engineId: deterministic.id,
        usedFallback: true,
        modelDisagreed: rejection?.modelDisagreed ?? false,
        rejectedReason: rejection?.reason ?? 'transport_error',
      }
    }
  }

  return { engine: deterministic, ask }
}

export { answerFromBriefing, createDeterministicConversation, suggestionsFor } from './deterministic'
export {
  AI_TIMEOUT_MS,
  AI_WORTHY_INTENTS,
  AXIS_SYSTEM_PROMPT,
  AxisAiRejection,
  aiSystemPrompt,
  benefitsFromAi,
  createAiConversation,
  createHttpTransport,
  parseAiAction,
  parseAiResponse,
  reconcileTarget,
  toAiBriefing,
} from './ai'
export type {
  AiRejectionReason,
  AxisAiAction,
  AxisAiBriefing,
  AxisAiRequest,
  AxisAiResponse,
  AxisAiTransport,
} from './ai'
export { detectIntent } from './intents'
export type {
  AxisAnswer,
  AxisConversationEngine,
  AxisConversationMemory,
  AxisIntent,
  AxisMessage,
  AxisSuggestion,
} from './types'
