/**
 * Proxy entre AXTHLETICS y los proveedores de lenguaje de AXIS.
 *
 * Es el **único** punto del sistema que lee las credenciales y el único que
 * habla con los proveedores. El navegador llama aquí, del mismo origen, y nunca
 * ve una clave: por eso existe esta ruta y no una llamada directa desde React.
 *
 *   Navegador → /api/axis-ai (route handler de Next, función de Vercel)
 *             → Cloudflare Workers AI → si falla, Groq (D-016)
 *
 * Si los dos fallan, la ruta devuelve un código y el navegador responde con el
 * motor determinista. Se llama a las APIs REST con `fetch` en lugar de usar un
 * SDK: sin dependencias no hay nada que empaquetar, y un test lo vigila.
 *
 * Lo que no hace, y no debe hacer nunca:
 *
 * - No decide nada. La recomendación viene ya decidida en el cuerpo de la
 *   petición; aquí solo se le pide al modelo que la escriba mejor.
 * - No guarda nada. No hay base de datos ni registro de conversaciones. Lo
 *   único que deja son líneas de log con metadatos de cada intento (ver
 *   `provider-chain.ts`), sin contenido.
 * - No deja salir nada del proveedor. Ni mensajes de error, ni trazas, ni
 *   cuotas, ni cuál respondió: solo `{text, action}` o un código propio.
 */

import { PROVIDER_CHAIN, askWithFallback } from '../../../lib/ai/provider-chain'
import {
  MAX_REQUEST_BYTES,
  PROXY_HEADERS,
  checkRequestOrigin,
  parseProxyRequest,
  trustedOriginsFromEnv,
  type AxisAiErrorCode,
} from '../../../lib/ai/provider-contract'
import type { ProviderEnv } from '../../../lib/ai/providers/types'
import { clientKeyOf, createRateLimiter } from '../../../lib/ai/rate-limit'
import { storeConfigFromEnv } from '../../../lib/push/store'

/**
 * Configuración del route handler (Vercel Functions, runtime Node.js).
 *
 * `maxDuration` va por encima del plazo de la cadena (7 s) para que quien corte
 * sea siempre nuestro código, con un código propio, y no la plataforma con un
 * 504 vacío.
 */
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Las credenciales y modelos, leídos del entorno del servidor.
 *
 * Una lista cerrada: solo se copian estas variables, y este es el único sitio
 * del código desplegado que las lee.
 */
function providerEnv(): ProviderEnv {
  return {
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    CF_API_TOKEN: process.env.CF_API_TOKEN,
    CF_MODEL: process.env.CF_MODEL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
  }
}

/** El límite de uso, con el Redis de los avisos de entreno (D-044) si está configurado. */
function rateLimiter() {
  return createRateLimiter(
    storeConfigFromEnv({
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    }),
  )
}

/** El host donde está sirviendo la ruta. Una petición del mismo sitio siempre cuadra con él. */
function hostOfRequest(request: Request): string | null {
  try {
    return new URL(request.url).host
  } catch {
    return null
  }
}

function fail(code: AxisAiErrorCode, status: number): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: PROXY_HEADERS,
  })
}

export async function POST(request: Request): Promise<Response> {
  /*
   * Solo la propia aplicación. Se comprueba antes que nada, incluidas las
   * credenciales: quien no debería llamar no se entera ni de si hay IA.
   *
   * No es autenticación —`Origin` se puede escribir a mano— sino la defensa que
   * corta lo fácil. Contra lo demás está el límite de tasa del firewall de
   * Vercel, que se configura en el panel del proyecto (ver `RATE_LIMIT`), y el
   * límite por persona de `lib/ai/rate-limit.ts` (D-070), más abajo.
   */
  const trusted = trustedOriginsFromEnv(process.env, hostOfRequest(request))
  if (!checkRequestOrigin(request.headers, trusted).ok) {
    return fail('FORBIDDEN', 403)
  }

  const env = providerEnv()
  if (!PROVIDER_CHAIN.some((provider) => provider.configured(env))) {
    return fail('AI_NOT_CONFIGURED', 503)
  }

  // 40 peticiones cada 10 minutos por persona (D-070): pasado el límite, responde el determinista.
  const clientKey = clientKeyOf(request.headers)
  if (clientKey && !(await rateLimiter()(clientKey))) {
    return fail('RATE_LIMITED', 429)
  }

  const raw = await request.text()
  if (raw.length > MAX_REQUEST_BYTES) {
    return fail('BAD_REQUEST', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('BAD_REQUEST', 400)
  }

  const parsed = parseProxyRequest(body)
  if (!parsed) {
    return fail('BAD_REQUEST', 400)
  }

  const result = await askWithFallback(parsed, env, { signal: request.signal })
  if (!result.ok) {
    return fail(result.code, result.code === 'AI_NOT_CONFIGURED' ? 503 : 502)
  }

  return new Response(
    JSON.stringify({ text: result.message, action: result.action, followUps: result.followUps }),
    { status: 200, headers: PROXY_HEADERS },
  )
}
