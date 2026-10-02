/**
 * Cloudflare Workers AI: el proveedor principal de AXIS (D-016).
 *
 * Se usa su endpoint compatible con OpenAI, con `fetch` y sin SDK. Si falla,
 * la cadena pasa a Groq; si Groq también falla, responde el determinista.
 *
 * Como todo proveedor (`types.ts`), solo construye su petición y lee su
 * respuesta: el tiempo de espera, la llamada de red y el registro de uso son
 * de `provider-chain.ts`.
 */

import { buildChatMessages, readChatCompletion } from '../provider-contract'
import type { LanguageProvider, ProviderEnv } from './types'

export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4/accounts'

/** Gemma 4 26B (MoE, ~4B activos), ajustado a instrucciones. `CF_MODEL` lo cambia. */
export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it'

/**
 * Tokens de salida como máximo. Sin razonamiento (`enable_thinking: false`)
 * basta para cuatro frases dentro del JSON, y acota el consumo de neurons.
 */
export const CLOUDFLARE_MAX_COMPLETION_TOKENS = 400

export const CLOUDFLARE_TEMPERATURE = 0.3

/**
 * Un id de cuenta de Cloudflare son 32 caracteres hexadecimales. Va dentro de
 * la URL, así que se exige el formato: un valor raro no llega a construir una
 * petición.
 */
const ACCOUNT_ID = /^[0-9a-f]{32}$/i

function accountId(env: ProviderEnv): string | null {
  const value = env.CF_ACCOUNT_ID?.trim()
  return value && ACCOUNT_ID.test(value) ? value : null
}

export const cloudflareProvider: LanguageProvider = {
  id: 'cloudflare',
  model: (env) => env.CF_MODEL || CLOUDFLARE_DEFAULT_MODEL,
  configured: (env) => accountId(env) !== null && Boolean(env.CF_API_TOKEN),
  /**
   * `chat_template_kwargs.enable_thinking = false` apaga el razonamiento de
   * Gemma: AXIS no lo necesita para redactar y solo añade latencia y neurons.
   * El token va en la cabecera, nunca en la URL.
   */
  request(request, env) {
    return {
      url: `${CLOUDFLARE_API_BASE}/${accountId(env) ?? ''}/ai/v1/chat/completions`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CF_API_TOKEN ?? ''}` },
        body: JSON.stringify({
          model: cloudflareProvider.model(env),
          messages: buildChatMessages(request),
          temperature: CLOUDFLARE_TEMPERATURE,
          max_completion_tokens: CLOUDFLARE_MAX_COMPLETION_TOKENS,
          response_format: { type: 'json_object' },
          chat_template_kwargs: { enable_thinking: false },
        }),
      },
    }
  },
  /** `choices[0].message.content`, `finish_reason` y `usage` (tokens y neurons). */
  read: readChatCompletion,
}
