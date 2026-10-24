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
 * 2. **La IA es la voz de AXIS** (D-070): contesta casi todo, en
 *    `AI_WORTHY_INTENTS`, con el fondo que fija el motor. Lo médico y lo ajeno
 *    se quedan siempre en el determinista.
 *    Y, desde D-028, en lo que el determinista no entiende: ahí el modelo no
 *    redacta, reescribe el mensaje para que el determinista lo responda.
 */

import type { AxisBriefing } from '../briefing'
import { DATA_ANSWER_INTENTS } from '../safety'
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
import {
  buildReinterpretRequest,
  presentReinterpreted,
  readReinterpretation,
  REINTERPRET_NONE,
} from './reinterpret'
import { understandMessage } from './understand'
import type { AxisAnswer, AxisConversationEngine, AxisConversationMemory } from './types'

export type AxisConversationOptions = {
  /**
   * Endpoint propio que habla con el proveedor.
   *
   * En producción es la ruta `/api/axis-ai` de la propia app. `null` desactiva la IA por completo.
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
  /** Cómo reescribió el modelo un mensaje que el determinista no entendía (D-028). */
  reinterpretedAs?: string
}

/**
 * Qué aviso merece una respuesta, si merece alguno.
 *
 * `offline` solo cuando la IA no se alcanzó y el navegador dice que no hay red;
 * cualquier otro motivo —la ruta la rechaza, los proveedores fallan, el filtro
 * descarta el texto— es `local`: hay conexión, pero la respuesta es la del motor.
 */
export type AxisFallbackNotice = 'offline' | 'local'

export function fallbackNoticeOf(
  result: Pick<AxisConversationResult, 'usedFallback' | 'rejectedReason'>,
  online: boolean,
): AxisFallbackNotice | null {
  if (!result.usedFallback) return null
  return result.rejectedReason === 'transport_error' && !online ? 'offline' : 'local'
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
  // Lo que no se entiende ni reescrito se contesta como charla (D-042), no con «no he entendido».
  const chat = createAiConversation(transport, (question, briefing, memory) => ({
    ...answerFromBriefing(question, briefing, memory),
    intent: 'social',
  }))

  /*
   * El modelo solo traduce el mensaje; quien responde es el determinista. Si no
   * vuelve una frase que valga, o el determinista sigue sin entenderla, se queda
   * el «no he entendido» de siempre.
   */
  async function reinterpret(
    question: string,
    briefing: AxisBriefing,
    memory: AxisConversationMemory | undefined,
    local: AxisAnswer,
  ): Promise<AxisConversationResult> {
    const fallback = (usedFallback: boolean, rejectedReason: AiRejectionReason | null) => ({
      ...local,
      engineId: deterministic.id,
      usedFallback,
      modelDisagreed: false,
      rejectedReason,
    })

    let text: string
    try {
      text = (await transport.send(buildReinterpretRequest(question, local))).text
    } catch {
      return fallback(true, 'transport_error')
    }

    // El modelo dice que no lo entiende: no va de entrenamiento, así que se charla (D-042).
    if (text.trim() === REINTERPRET_NONE) return chatInstead(question, briefing, memory, fallback)

    const rewritten = readReinterpretation(question, text)
    // Una reescritura que no vale tampoco acaba en «no he entendido»: se charla (D-070).
    if (rewritten === null) return chatInstead(question, briefing, memory, fallback)

    const answer = answerFromBriefing(rewritten, briefing, memory)
    if (answer.intent === 'unknown') return chatInstead(question, briefing, memory, fallback)

    const presented = presentReinterpreted(answer, rewritten)
    const reinterpreted = { engineId: ai.id, usedFallback: false, modelDisagreed: false, rejectedReason: null, reinterpretedAs: rewritten }

    /*
     * Desde D-070 la voz de AXIS contesta al mensaje original con el fondo de la
     * frase reescrita: el usuario lee una respuesta a lo que escribió, no a la
     * traducción. De una reinterpretación no se aprende nada (D-028), así que el
     * dominio va sin actividades canceladas ni cargas contadas. Lo médico y lo
     * ajeno se quedan en el determinista.
     */
    if (benefitsFromAi(answer.intent)) {
      const { cancelledActivities: _cancelled, reportedLoad: _load, ...domain } = answer
      try {
        const voiced = await createAiConversation(transport, () => domain).answer(question, briefing, memory)
        return { ...voiced, ...reinterpreted }
      } catch {
        // Si la voz falla, la respuesta del motor a la frase reescrita, diciendo cómo se entendió.
      }
    }
    return { ...presented, ...reinterpreted }
  }

  async function chatInstead(
    question: string,
    briefing: AxisBriefing,
    memory: AxisConversationMemory | undefined,
    fallback: (usedFallback: boolean, rejectedReason: AiRejectionReason | null) => AxisConversationResult,
  ): Promise<AxisConversationResult> {
    try {
      const answer = await chat.answer(question, briefing, memory)
      // El «no entiendo» del intérprete no es una respuesta que enseñar.
      if (answer.text.includes(REINTERPRET_NONE)) return fallback(true, 'invalid_reinterpretation')
      return { ...answer, engineId: chat.id, usedFallback: false, modelDisagreed: false, rejectedReason: null }
    } catch (cause) {
      return fallback(true, cause instanceof AxisAiRejection ? cause.reason : 'transport_error')
    }
  }

  async function ask(
    question: string,
    briefing: AxisBriefing,
    memory?: AxisConversationMemory,
  ): Promise<AxisConversationResult> {
    const local = answerFromBriefing(question, briefing, memory)

    /*
     * Se mira la intención antes de gastar una llamada: solo las de
     * `AI_WORTHY_INTENTS` pasan por el modelo.
     *
     * Las respuestas de ámbito médico o fuera de AXTHLETICS se quedan siempre en
     * el determinista: ahí la redacción no aporta y el riesgo sí. Y también una
     * respuesta de datos sin datos (D-027): no hay cifras que redactar, y es
     * justo donde el modelo podría convertir una ausencia en un hecho.
     */
    const intent = matchIntent(understandMessage(question, briefing), memory?.lastIntent ?? null, briefing.equipment).intent

    // Lo que ni corregido se entiende lo reescribe el modelo y lo responde el determinista (D-028).
    if (intent === 'unknown' && local.intent === 'unknown' && (await ai.isAvailable())) {
      return reinterpret(question, briefing, memory, local)
    }

    const noData = local.unknown === true && DATA_ANSWER_INTENTS.includes(local.intent)
    // «Quiero algo más intenso» solo no dice nada; en una negociación es un cambio, y se redacta (D-030).
    const negotiated = local.intent === 'change' && intent === 'unknown'
    // La charla se reconoce antes que cualquier intención (D-042): `intent` no la ve.
    const social = local.intent === 'social'
    // Las preferencias (D-037), como la charla, se reconocen antes que `intent`.
    const preference = local.intent === 'preference'
    // El escáner se reconoce antes que `intent` (D-023); desde D-070 va a la IA con su resumen.
    const scan = local.intent === 'scan'
    const worthIt = benefitsFromAi(local.intent) && (benefitsFromAi(intent) || negotiated || social || preference || scan) && !noData

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
