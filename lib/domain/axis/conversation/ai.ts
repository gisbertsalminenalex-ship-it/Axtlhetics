/**
 * Motor conversacional con IA — **preparado, no conectado**.
 *
 * Hoy no existe proveedor: no hay backend, ni endpoint, ni credenciales. Este módulo
 * define el contrato para que conectarlo más adelante sea una configuración, no una
 * reescritura.
 *
 * Reglas que la implementación futura debe respetar:
 *
 * 1. **El navegador nunca habla con el proveedor.** Se llama a un endpoint propio
 *    que guarda la credencial en el servidor. Aquí no hay ni puede haber secretos.
 * 2. **El modelo no calcula nada.** Recibe el briefing ya construido por el dominio
 *    —Recovery Score, Training Load, historial, calendario y propuesta— y solo lo
 *    redacta. No inventa métricas ni sesiones.
 * 3. **Si falla, se cae al determinista.** La conversación nunca se queda muerta.
 */

import type { AxisBriefing } from '../briefing'
import type { AxisAnswer, AxisConversationEngine } from './types'

export const AI_CONVERSATION_ID = 'axis-conversation-ai-v1'

/**
 * Instrucciones de sistema que definen quién es AXIS.
 *
 * Vive en el dominio y no en el proveedor a propósito: la personalidad y los límites
 * de AXIS son una decisión de producto, no un ajuste de infraestructura.
 */
export const AXIS_SYSTEM_PROMPT = [
  'Eres AXIS, el sistema de orientación de Axtlhetics. No eres un asistente genérico.',
  'Hablas en español, con frases cortas, tono calmado y seguro. Sin emojis, sin exclamaciones, sin saludos efusivos.',
  'Respondes ÚNICAMENTE con los datos del briefing que recibes. No calculas métricas ni inventas sesiones, ejercicios, fechas ni cifras.',
  'Si un dato no está en el briefing, dices claramente que no dispones de él. Nunca lo estimas.',
  'La recomendación del día ya está decidida por el motor determinista: la explicas, no la sustituyes ni la contradices.',
  'No eres médico. No diagnosticas, no interpretas síntomas y no hablas de lesiones. Si algo requiere criterio médico, dices que no puedes evaluarlo.',
  'No hablas de peso corporal, estética ni dietas, y no propones entrenar por encima de lo que indica la recomendación.',
  '',
  'FIRMEZA. Eres un entrenador, no un asistente complaciente. Estas reglas están por encima de agradar:',
  '- No cedes por insistencia, cedes por evidencia. Aceptas un cambio cuando algo lo respalda: un dato del briefing, o una carga que el usuario acaba de contarte. Si lo único que lo sostiene es que no le apetece, dices que no y explicas por qué.',
  '- Nunca abres con «tienes razón», «buena idea», «claro» ni ningún cumplido. La primera frase es el veredicto.',
  '- No cambias de criterio porque el usuario repita, se queje o insista. Si aporta información nueva, la valoras; si solo insiste, mantienes la recomendación.',
  '- Discrepar es parte de tu trabajo. Decir que no, con el motivo, vale más que decir que sí para quedar bien.',
  '- Lo que el usuario cuenta y no está en el briefing lo tienes en cuenta, pero dices que no te consta registrado. No lo presentas como un hecho comprobado.',
].join('\n')

/** Lo que se envía al endpoint propio. El briefing va tal cual: ya es una vista mínima. */
export type AxisAiRequest = {
  system: string
  question: string
  briefing: AxisBriefing
}

export type AxisAiResponse = {
  text: string
}

/**
 * Transporte hacia el endpoint propio.
 *
 * Se inyecta para poder probar el motor sin red y para que el día que exista el
 * endpoint solo haya que pasar una implementación real.
 */
export type AxisAiTransport = {
  /** `false` mientras no haya endpoint configurado. */
  isConfigured(): boolean
  send(request: AxisAiRequest, signal?: AbortSignal): Promise<AxisAiResponse>
}

/**
 * Transporte real contra un endpoint propio del mismo origen.
 *
 * Mientras `endpoint` sea `null` se declara no configurado y la aplicación usa el
 * motor determinista. No hay ninguna URL por defecto ni ninguna credencial.
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })

      if (!response.ok) {
        throw new Error(`El servicio de AXIS respondió ${response.status}.`)
      }

      const payload: unknown = await response.json()
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as AxisAiResponse).text !== 'string'
      ) {
        throw new Error('El servicio de AXIS devolvió una respuesta que no se entiende.')
      }

      return payload as AxisAiResponse
    },
  }
}

export function createAiConversation(transport: AxisAiTransport): AxisConversationEngine {
  return {
    id: AI_CONVERSATION_ID,
    async isAvailable() {
      return transport.isConfigured()
    },
    async answer(question, briefing): Promise<AxisAnswer> {
      const response = await transport.send({
        system: AXIS_SYSTEM_PROMPT,
        question,
        briefing,
      })

      const text = response.text.trim()
      if (text.length === 0) {
        throw new Error('El servicio de AXIS devolvió una respuesta vacía.')
      }

      // La intención se sigue detectando en el dominio: sirve para auditar de qué
      // dato salió la respuesta, aunque la haya redactado un modelo.
      return { text, intent: 'unknown', unknown: false }
    },
  }
}
