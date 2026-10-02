/**
 * Qué es un proveedor de lenguaje para el proxy de AXIS.
 *
 * Un proveedor solo sabe dos cosas: construir su petición y leer su respuesta.
 * No llama a la red, no decide cuándo se prueba el siguiente y no conoce el
 * dominio: eso es de `provider-chain.ts`. Así cada uno se prueba sin red y
 * añadir o quitar uno no toca nada más.
 */

import type { ChatCompletionReply, ProxyRequest } from '../provider-contract'

export type ProviderId = 'cloudflare' | 'groq'

/**
 * Las variables de entorno que leen los proveedores.
 *
 * Una lista cerrada, no `process.env` entero: la ruta copia solo estas, y es la
 * única que lee el entorno.
 */
export type ProviderEnv = {
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string
  CF_MODEL?: string
  GROQ_API_KEY?: string
  GROQ_MODEL?: string
}

/** La petición lista para `fetch`, sin `signal`: el tiempo lo pone la cadena. */
export type ProviderHttpRequest = {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: string }
}

export type LanguageProvider = {
  id: ProviderId
  /** El modelo que se usará con este entorno. Es configuración, no secreto. */
  model(env: ProviderEnv): string
  /** `false` si le falta algo. Un proveedor sin configurar se salta; no es un fallo. */
  configured(env: ProviderEnv): boolean
  request(request: ProxyRequest, env: ProviderEnv): ProviderHttpRequest
  read(payload: unknown): ChatCompletionReply
}
