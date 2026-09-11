/**
 * Proxy entre AXTHLETICS y Gemini.
 *
 * Es el **único** punto del sistema que conoce la credencial y el único que habla
 * con el proveedor. El navegador llama aquí, del mismo origen, y nunca ve la
 * clave: por eso existe esta función y no una llamada directa desde React.
 *
 *   Navegador → /.netlify/functions/axis-ai → Gemini
 *
 * Se llama a la API REST con `fetch` en lugar de usar el SDK, y no por gusto: el
 * proyecto usa pnpm, que enlaza `node_modules` con symlinks, y al empaquetar la
 * función esos enlaces viajaban rotos hasta Lambda. La función desplegada moría
 * con `Cannot find package '@google/genai'` antes de ejecutar una sola línea
 * propia. Sin dependencias no hay nada que empaquetar y el problema desaparece.
 *
 * Lo que no hace, y no debe hacer nunca:
 *
 * - No decide nada. La recomendación viene ya decidida en el cuerpo de la
 *   petición; aquí solo se le pide al modelo que la escriba mejor.
 * - No escribe en ningún sitio. No hay base de datos, ni registro de
 *   conversaciones, ni analítica de prompts.
 * - No deja salir nada de Google. Ni mensajes de error, ni trazas, ni cuotas:
 *   solo un código propio que el cliente sabe interpretar.
 */

import {
  AXIS_AI_MODEL,
  GEMINI_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  PROXY_HEADERS,
  buildUserPayload,
  errorCodeFor,
  parseModelText,
  parseProxyRequest,
  type AxisAiErrorCode,
  type ProxyRequest,
} from '../../lib/ai/gemini-contract'

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

function fail(code: AxisAiErrorCode, status: number): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: PROXY_HEADERS,
  })
}

/**
 * Llama a Gemini y devuelve el texto del modelo.
 *
 * La credencial va en la cabecera, nunca en la URL: una query string acaba en
 * los registros de cualquier intermediario.
 */
async function askGemini(request: ProxyRequest, apiKey: string): Promise<string> {
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(AXIS_AI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPayload(request) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          // Corto a propósito: AXIS responde en tres frases, no en tres párrafos.
          maxOutputTokens: 400,
          temperature: 0.4,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  )

  if (!response.ok) {
    // El cuerpo del error de Google no se lee ni se propaga.
    throw Object.assign(new Error('gemini'), { status: response.status })
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }

  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return fail('BAD_REQUEST', 405)
  }

  // La credencial vive solo aquí, en el entorno del servidor.
  const apiKey = process.env.GEMINI_API_KEY
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
    modelText = await askGemini(parsed, apiKey)
  } catch (cause) {
    return fail(errorCodeFor(cause), 502)
  }

  const parsedModel = parseModelText(modelText)
  if (!parsedModel) {
    // Hemos hablado con Gemini y no se le entiende. Es distinto de que no esté.
    return fail('AI_BAD_RESPONSE', 502)
  }

  return new Response(
    JSON.stringify({ text: parsedModel.message, action: parsedModel.action }),
    { status: 200, headers: PROXY_HEADERS },
  )
}

export const config = {
  path: '/.netlify/functions/axis-ai',
}
