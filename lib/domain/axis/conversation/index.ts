/**
 * Selección del motor conversacional.
 *
 * La regla es una sola: **la conversación nunca se queda muerta**. Si hay IA
 * configurada se usa; si no la hay, o si falla, responde el determinista.
 */

import type { AxisBriefing } from '../briefing'
import { createAiConversation, createHttpTransport, type AxisAiTransport } from './ai'
import { answerFromBriefing, createDeterministicConversation } from './deterministic'
import type { AxisAnswer, AxisConversationEngine, AxisConversationMemory } from './types'

export type AxisConversationOptions = {
  /**
   * Endpoint propio que habla con el proveedor. `null` mientras no exista, que es
   * el estado actual del proyecto.
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
}

/**
 * Un motor compuesto: intenta la IA y, ante cualquier problema, responde con el
 * determinista en lugar de dejar al usuario sin respuesta.
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
  const ai = createAiConversation(transport)

  async function ask(
    question: string,
    briefing: AxisBriefing,
    memory?: AxisConversationMemory,
  ): Promise<AxisConversationResult> {
    if (await ai.isAvailable()) {
      try {
        const answer = await ai.answer(question, briefing, memory)
        return { ...answer, engineId: ai.id, usedFallback: false }
      } catch {
        // El proveedor ha fallado. No se propaga: AXIS sigue sabiendo responder.
        const answer = answerFromBriefing(question, briefing, memory)
        return { ...answer, engineId: deterministic.id, usedFallback: true }
      }
    }

    const answer = answerFromBriefing(question, briefing, memory)
    return { ...answer, engineId: deterministic.id, usedFallback: false }
  }

  return { engine: deterministic, ask }
}

export { answerFromBriefing, createDeterministicConversation, suggestionsFor } from './deterministic'
export { AXIS_SYSTEM_PROMPT, createAiConversation, createHttpTransport } from './ai'
export { detectIntent } from './intents'
export type {
  AxisAnswer,
  AxisConversationEngine,
  AxisConversationMemory,
  AxisIntent,
  AxisMessage,
  AxisSuggestion,
} from './types'
