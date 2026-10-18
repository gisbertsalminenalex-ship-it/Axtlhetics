/**
 * Groq: el proveedor de respaldo de AXIS (D-013, D-016).
 *
 * API compatible con OpenAI y plan gratuito. Se usa cuando Cloudflare falla o
 * no está configurado.
 */

import { buildChatMessages, readChatCompletion, temperatureFor } from '../provider-contract'
import type { LanguageProvider } from './types'

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * `openai/gpt-oss-120b`: modelo de producción incluido en el plan gratuito, con
 * buen español y respuesta rápida. `GROQ_MODEL` lo cambia desde el entorno si
 * un día se limita o se retira, sin desplegar código.
 */
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b'

/**
 * Tokens de salida como máximo. Una respuesta larga son hasta siete frases
 * (D-030); el margen es para el JSON que las envuelve y el razonamiento breve
 * de los `gpt-oss`.
 */
export const GROQ_MAX_COMPLETION_TOKENS = 1000

export const GROQ_TEMPERATURE = 0.4

export const groqProvider: LanguageProvider = {
  id: 'groq',
  model: (env) => env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
  configured: (env) => Boolean(env.GROQ_API_KEY),
  /**
   * Se pide JSON (`response_format`) porque lo que se espera es
   * `{"message", "action"}`, y temperatura baja: se le pide redactar, no crear.
   * Los `gpt-oss` razonan antes de contestar; `reasoning_effort: low` mantiene
   * latencia y tokens al mínimo y solo se envía a ellos. La credencial va en la
   * cabecera, nunca en la URL.
   */
  request(request, env) {
    const model = groqProvider.model(env)
    const body: Record<string, unknown> = {
      model,
      messages: buildChatMessages(request),
      temperature: temperatureFor(request, GROQ_TEMPERATURE),
      max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      response_format: { type: 'json_object' },
    }
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low'
    return {
      url: GROQ_ENDPOINT,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY ?? ''}` },
        body: JSON.stringify(body),
      },
    }
  },
  read: readChatCompletion,
}
