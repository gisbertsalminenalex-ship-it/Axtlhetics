/**
 * Capa de lenguaje de AXIS.
 *
 * El modelo **redacta**, no decide. La recomendación del día, el veredicto sobre
 * un cambio y la sesión concreta salen del motor determinista; lo único que aporta
 * la IA es una explicación mejor escrita de eso mismo.
 *
 * Reglas que no se negocian:
 *
 * 1. **El navegador nunca habla con el proveedor.** Se llama a un endpoint propio
 *    del mismo origen que guarda la credencial en el servidor. Aquí no hay ni puede
 *    haber secretos.
 * 2. **El modelo no calcula nada.** Recibe el briefing ya construido por el dominio
 *    —Recovery Score, Training Load, historial, calendario y propuesta— y el
 *    veredicto que el motor ya ha emitido.
 * 3. **El modelo no ejecuta nada.** Puede sugerir un cambio, pero esa sugerencia se
 *    coteja contra lo que el dominio había decidido y después pasa por
 *    `validateAction` y por el botón de confirmar, como cualquier otra.
 * 4. **Si falla, responde el determinista.** La conversación nunca se queda muerta.
 *
 * Este módulo es puro: no conoce React, ni IndexedDB, ni el hosting, ni el SDK de
 * ningún proveedor. Cambiar de proveedor o de modelo no se toca aquí.
 */

import type { AxisActionTarget } from '../actions'
import type { AxisBriefing } from '../briefing'
import { AXIS_PERSONALITY, AXIS_SYSTEM_PROMPT } from '../personality'
import { checkModelText, type ModelTextRejection } from '../safety'
import type { AxisAnswer, AxisConversationEngine, AxisIntent } from './types'

export const AI_CONVERSATION_ID = 'axis-conversation-ai-v1'

/**
 * La personalidad vive en `personality.ts` y el prompt se genera desde ella. Se
 * reexporta aquí para que quien ya lo importaba de la conversación no cambie.
 */
export { AXIS_SYSTEM_PROMPT }

/**
 * Lo que se le pide al proveedor además de la personalidad: formato y límites.
 *
 * Separado del prompt anterior para que siga habiendo una sola fuente de verdad
 * sobre quién es AXIS. Esto es fontanería del proveedor, no personalidad.
 */
export function aiSystemPrompt(): string {
  return [
    AXIS_SYSTEM_PROMPT,
    '',
    'CÓMO RESPONDER.',
    'Recibes un JSON con `briefing` (los datos reales del usuario), `question` (lo que ha escrito) y `domain` (lo que el motor determinista ya ha concluido).',
    '`domain.text` es la respuesta correcta en cuanto al fondo. Tu trabajo es decirla mejor: más natural, más clara, sin perder ni un dato y sin añadir ninguno.',
    'No contradigas `domain`. Si el motor ha dicho que no, tú dices que no.',
    `Responde en ${AXIS_PERSONALITY.limits.targetSentences}. Nunca más de ${AXIS_PERSONALITY.limits.maxSentences}.`,
    'Devuelve SOLO un objeto JSON con esta forma:',
    '{"message": "tu respuesta", "action": null}',
    'Si `domain.proposedTarget` no es null y la conversación va de cambiar el entrenamiento, copia ese mismo objeto en `action.target` y pon `action.type` a "change_training". No propongas un destino distinto del que te da el dominio: se descartaría.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Qué sale del dispositivo
// ---------------------------------------------------------------------------

/**
 * El briefing recortado para enviar al proveedor.
 *
 * Se quita el nombre: sirve para saludar, no para razonar, y es el único dato del
 * briefing que identifica a una persona. Todo lo demás —edad, objetivos, deportes,
 * recuperación— sí influye en la respuesta, así que se manda.
 */
export type AxisAiBriefing = Omit<AxisBriefing, 'profile'> & {
  profile: Omit<NonNullable<AxisBriefing['profile']>, 'name'> | null
}

export function toAiBriefing(briefing: AxisBriefing): AxisAiBriefing {
  if (!briefing.profile) return { ...briefing, profile: null }

  const { name: _name, ...rest } = briefing.profile
  return { ...briefing, profile: rest }
}

/** Lo que el motor determinista ya ha concluido. El modelo lo redacta, no lo sustituye. */
export type AxisAiDomainAnswer = {
  text: string
  intent: AxisIntent
  proposedTarget: AxisActionTarget | null
}

export type AxisAiRequest = {
  system: string
  question: string
  briefing: AxisAiBriefing
  domain: AxisAiDomainAnswer
}

/** Lo único que el modelo puede sugerir. Sigue teniendo que pasar por el dominio. */
export type AxisAiAction = {
  type: 'change_training'
  target: AxisActionTarget
}

export type AxisAiResponse = {
  text: string
  action?: AxisAiAction | null
}

// ---------------------------------------------------------------------------
// Cuándo vale la pena llamar al modelo
// ---------------------------------------------------------------------------

/**
 * Preguntas donde el lenguaje aporta algo.
 *
 * Explicar por qué hoy no tocan piernas se beneficia de una redacción natural.
 * Decir cuál es tu Recovery Score, no: es un número que el dominio ya tiene, y
 * pasarlo por un modelo solo añade latencia, coste y una oportunidad de que se
 * equivoque.
 */
export const AI_WORTHY_INTENTS: readonly AxisIntent[] = [
  'why',
  'why_not',
  'factors',
  'change',
  'tired',
  'can_train',
  'sport_impact',
  'goals',
  'exercise',
]

export function benefitsFromAi(intent: AxisIntent): boolean {
  return AI_WORTHY_INTENTS.includes(intent)
}

// ---------------------------------------------------------------------------
// Leer lo que devuelve el proveedor
// ---------------------------------------------------------------------------

/**
 * Convierte la respuesta del endpoint en algo tipado, o falla.
 *
 * Todo lo que llega de fuera es sospechoso hasta que se comprueba. Si no encaja,
 * se lanza: quien llama cae al determinista en lugar de enseñar basura.
 */
export function parseAiResponse(payload: unknown): AxisAiResponse {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('El servicio de AXIS devolvió una respuesta que no se entiende.')
  }

  const raw = payload as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (text.length === 0) {
    throw new Error('El servicio de AXIS devolvió una respuesta vacía.')
  }

  return { text, action: parseAiAction(raw.action) }
}

/** Una acción mal formada no se intenta arreglar: se descarta. */
export function parseAiAction(value: unknown): AxisAiAction | null {
  if (typeof value !== 'object' || value === null) return null

  const raw = value as Record<string, unknown>
  if (raw.type !== 'change_training') return null

  const target = raw.target
  if (typeof target !== 'object' || target === null) return null

  const { type, focus } = target as Record<string, unknown>
  if (typeof type !== 'string') return null
  if (focus !== null && typeof focus !== 'string') return null

  return {
    type: 'change_training',
    target: { type, focus } as AxisActionTarget,
  }
}

export type TargetReconciliation = {
  /** Lo que se va a proponer al usuario. Siempre sale del dominio. */
  target: AxisActionTarget | null
  /** `true` si el modelo sugirió algo que el dominio no había aprobado. */
  modelDisagreed: boolean
}

/**
 * El dominio manda, y el desacuerdo se nota.
 *
 * El destino que acaba en el botón es **siempre** el que aprobó el motor. Si el
 * modelo sugiere otro, no se corrige ni se mezcla: se descarta y se deja
 * constancia. Un modelo que propone cambios que el dominio no respalda es un
 * problema que hay que poder ver, no algo que tapar.
 */
export function reconcileTarget(
  fromModel: AxisAiAction | null | undefined,
  fromDomain: AxisActionTarget | null,
): TargetReconciliation {
  if (!fromModel) return { target: fromDomain, modelDisagreed: false }

  if (!fromDomain) {
    // El modelo propone un cambio que el motor no ha aprobado. No hay botón.
    return { target: null, modelDisagreed: true }
  }

  const matches =
    fromModel.target.type === fromDomain.type && fromModel.target.focus === fromDomain.focus

  return { target: fromDomain, modelDisagreed: !matches }
}

// ---------------------------------------------------------------------------
// Rechazar lo que el modelo devuelve
// ---------------------------------------------------------------------------

export type AiRejectionReason = ModelTextRejection | 'model_disagreed' | 'transport_error'

/**
 * El modelo ha respondido, pero lo que ha dicho no se puede enseñar.
 *
 * Es un error a propósito: quien llama ya cae al determinista ante cualquier
 * fallo del proveedor, y esto es un fallo más, solo que con motivo conocido.
 */
export class AxisAiRejection extends Error {
  readonly reason: AiRejectionReason
  /** `true` si el modelo propuso un destino que el dominio no había aprobado. */
  readonly modelDisagreed: boolean

  constructor(reason: AiRejectionReason, detail: string, modelDisagreed = false) {
    super(detail)
    this.name = 'AxisAiRejection'
    this.reason = reason
    this.modelDisagreed = modelDisagreed
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

/**
 * Transporte hacia el endpoint propio.
 *
 * Se inyecta para poder probar el motor sin red y para que cambiar de proveedor
 * sea cambiar la función del servidor, no el dominio.
 */
export type AxisAiTransport = {
  /** `false` mientras no haya endpoint configurado. */
  isConfigured(): boolean
  send(request: AxisAiRequest, signal?: AbortSignal): Promise<AxisAiResponse>
}

/** Cuánto se espera al modelo antes de responder con el determinista. */
export const AI_TIMEOUT_MS = 8000

/**
 * Transporte real contra un endpoint propio del mismo origen.
 *
 * Con `endpoint` a `null` se declara no configurado y la aplicación usa el motor
 * determinista. No hay ninguna URL por defecto ni ninguna credencial.
 */
export function createHttpTransport(endpoint: string | null): AxisAiTransport {
  return {
    isConfigured() {
      return typeof endpoint === 'string' && endpoint.length > 0
    },
    async send(request, signal) {
      if (!endpoint) {
        throw new Error('No hay endpoint de IA configurado.')
      }

      // El propio transporte se pone un límite: una llamada colgada no puede
      // dejar la conversación esperando indefinidamente.
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), AI_TIMEOUT_MS)
      signal?.addEventListener('abort', () => timeout.abort(), { once: true })

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: timeout.signal,
        })

        if (!response.ok) {
          throw new Error(`El servicio de AXIS respondió ${response.status}.`)
        }

        return parseAiResponse(await response.json())
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/**
 * Motor conversacional con IA.
 *
 * `resolveDomain` es lo que el motor determinista responde a esa misma pregunta.
 * Se le pasa por parámetro para que este módulo no dependa del determinista y
 * siga siendo puro: aquí no se decide nada, solo se redacta.
 *
 * La respuesta que sale conserva **todos** los campos estructurados del dominio
 * —intención, petición de cambio, actividades canceladas, destino propuesto— y
 * solo cambia el texto. Es lo que impide que el modelo se convierta en una
 * segunda fuente de verdad.
 */
export function createAiConversation(
  transport: AxisAiTransport,
  resolveDomain: (
    question: string,
    briefing: AxisBriefing,
    memory?: Parameters<AxisConversationEngine['answer']>[2],
  ) => AxisAnswer,
): AxisConversationEngine {
  return {
    id: AI_CONVERSATION_ID,
    async isAvailable() {
      return transport.isConfigured()
    },
    async answer(question, briefing, memory): Promise<AxisAnswer> {
      const domain = resolveDomain(question, briefing, memory)

      const response = await transport.send({
        system: aiSystemPrompt(),
        question,
        briefing: toAiBriefing(briefing),
        domain: {
          text: domain.text,
          intent: domain.intent,
          proposedTarget: domain.proposedTarget ?? null,
        },
      })

      /*
       * Dos puertas, y las dos son del dominio.
       *
       * La acción: `reconcileTarget` es la autoridad. Si el modelo propone un
       * destino que el motor no aprobó, no se corrige ni se mezcla: se rechaza
       * la respuesta entera y contesta el determinista, dejando constancia de
       * que el modelo discrepó.
       *
       * El texto: `checkModelText` comprueba que la redacción no contradiga el
       * veredicto ni la propuesta, y que respete la personalidad. Lo que no
       * pasa no se enseña.
       */
      const reconciliation = reconcileTarget(response.action, domain.proposedTarget ?? null)
      if (reconciliation.modelDisagreed) {
        throw new AxisAiRejection(
          'model_disagreed',
          'El modelo propuso un cambio que el dominio no había aprobado.',
          true,
        )
      }

      const check = checkModelText(response.text, domain)
      if (!check.ok) {
        throw new AxisAiRejection(check.reason, check.detail)
      }

      return { ...domain, text: response.text.trim(), proposedTarget: reconciliation.target }
    },
  }
}
