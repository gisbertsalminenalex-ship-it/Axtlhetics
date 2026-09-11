/**
 * Proxy entre AXTHLETICS y Gemini.
 *
 * Es el **único** punto del sistema que conoce la credencial y el único que habla
 * con el proveedor. El navegador llama aquí, del mismo origen, y nunca ve la
 * clave: por eso existe esta función y no una llamada directa desde React.
 *
 *   Navegador → /.netlify/functions/axis-ai → Gemini
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

import { GoogleGenAI } from '@google/genai'
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
} from '../../lib/ai/gemini-contract'

function fail(code: AxisAiErrorCode, status: number): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: PROXY_HEADERS,
  })
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

  // Un modelo colgado no puede dejar colgada la función.
  const abort = AbortController ? new AbortController() : null
  const timer = setTimeout(() => abort?.abort(), GEMINI_TIMEOUT_MS)

  let modelText: string
  try {
    const genai = new GoogleGenAI({ apiKey })
    const response = await genai.models.generateContent({
      model: AXIS_AI_MODEL,
      contents: buildUserPayload(parsed),
      config: {
        systemInstruction: parsed.system,
        responseMimeType: 'application/json',
        // Corto a propósito: AXIS responde en tres frases, no en tres párrafos.
        maxOutputTokens: 400,
        temperature: 0.4,
        abortSignal: abort?.signal,
      },
    })
    modelText = response.text ?? ''
  } catch (cause) {
    return fail(errorCodeFor(cause), 502)
  } finally {
    clearTimeout(timer)
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
