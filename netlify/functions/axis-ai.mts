/**
 * Proxy entre AXTHLETICS y el proveedor de IA (Groq).
 *
 * Es el **único** punto del sistema que conoce la credencial y el único que habla
 * con el proveedor. El navegador llama aquí, del mismo origen, y nunca ve la
 * clave: por eso existe esta función y no una llamada directa desde React.
 *
 *   Navegador → /.netlify/functions/axis-ai → Groq
 *
 * Se llama a la API REST con `fetch` en lugar de usar un SDK, y no por gusto: el
 * proyecto usa pnpm, que enlaza `node_modules` con symlinks, y al empaquetar la
 * función esos enlaces viajaban rotos hasta Lambda (con el proveedor anterior la
 * función desplegada moría antes de ejecutar una sola línea propia). Sin
 * dependencias no hay nada que empaquetar y el problema desaparece.
 *
 * Lo que no hace, y no debe hacer nunca:
 *
 * - No decide nada. La recomendación viene ya decidida en el cuerpo de la
 *   petición; aquí solo se le pide al modelo que la escriba mejor.
 * - No escribe en ningún sitio. No hay base de datos, ni registro de
 *   conversaciones, ni analítica de prompts.
 * - No deja salir nada del proveedor. Ni mensajes de error, ni trazas, ni
 *   cuotas: solo un código propio que el cliente sabe interpretar.
 */

import {
  MAX_REQUEST_BYTES,
  PROVIDER_ENDPOINT,
  PROVIDER_TIMEOUT_MS,
  PROXY_HEADERS,
  RATE_LIMIT,
  buildProviderRequest,
  checkRequestOrigin,
  errorCodeFor,
  parseModelText,
  parseProxyRequest,
  readProviderText,
  trustedOriginsFromEnv,
  type AxisAiErrorCode,
  type ProxyRequest,
} from '../../lib/ai/provider-contract'

/** El host donde está sirviendo la función. Una petición del mismo sitio siempre cuadra con él. */
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

/**
 * Llama al proveedor y devuelve el texto del modelo.
 *
 * La credencial va en la cabecera, nunca en la URL: una query string acaba en
 * los registros de cualquier intermediario. El cuerpo lo construye el contrato,
 * que es donde se puede probar sin red.
 */
async function askProvider(request: ProxyRequest, apiKey: string): Promise<string> {
  const response = await fetch(PROVIDER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildProviderRequest(request)),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })

  if (!response.ok) {
    // El cuerpo del error del proveedor no se lee ni se propaga.
    throw Object.assign(new Error('provider'), { status: response.status })
  }

  return readProviderText(await response.json())
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return fail('BAD_REQUEST', 405)
  }

  /*
   * Solo la propia aplicación. Se comprueba antes que nada, incluida la
   * credencial: quien no debería llamar no se entera ni de si hay IA.
   *
   * No es autenticación —`Origin` se puede escribir a mano— sino la defensa que
   * corta lo fácil. Contra lo demás está el límite de tasa de la plataforma.
   */
  const trusted = trustedOriginsFromEnv(process.env, hostOfRequest(request))
  if (!checkRequestOrigin(request.headers, trusted).ok) {
    return fail('FORBIDDEN', 403)
  }

  // La credencial vive solo aquí, en el entorno del servidor.
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return fail('AI_NOT_CONFIGURED', 503)
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

  let modelText: string
  try {
    modelText = await askProvider(parsed, apiKey)
  } catch (cause) {
    return fail(errorCodeFor(cause), 502)
  }

  const parsedModel = parseModelText(modelText)
  if (!parsedModel) {
    // Hemos hablado con el proveedor y no se le entiende. Es distinto de que no esté.
    return fail('AI_BAD_RESPONSE', 502)
  }

  return new Response(
    JSON.stringify({ text: parsedModel.message, action: parsedModel.action }),
    { status: 200, headers: PROXY_HEADERS },
  )
}

/**
 * Configuración de la función.
 *
 * Solo el límite de tasa. Lo aplica Netlify por IP y dominio antes de que la
 * función arranque, y responde 429 al superarlo: es lo que impide que alguien
 * que descubra la URL se gaste la cuota. Los valores viven en el contrato para
 * poder comprobarlos en un test. `netlify dev` no lo aplica en local.
 *
 * Sin `path`: aquí hubo un `path: '/.netlify/functions/axis-ai'`, que es
 * exactamente la ruta por defecto, y declararla como ruta personalizada rompía
 * el desarrollo local. La función sigue en esa URL por convención.
 */
export const config = {
  rateLimit: {
    windowLimit: RATE_LIMIT.windowLimit,
    windowSize: RATE_LIMIT.windowSize,
    aggregateBy: ['ip', 'domain'],
    action: 'rate_limit',
  },
}
