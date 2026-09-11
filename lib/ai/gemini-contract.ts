/**
 * Contrato del proxy de IA.
 *
 * Vive aparte de la función de Netlify a propósito: aquí no se importa ningún
 * SDK ni se toca la red, así que todo esto se puede probar con `node:test` sin
 * credenciales y sin salir a internet.
 *
 * La función del servidor se queda con lo que no se puede probar así: leer la
 * variable de entorno y hablar con el proveedor.
 */

/**
 * Modelo que usa AXIS. Un único sitio, y cambiable sin tocar código.
 *
 * Flash porque la conversación es corta, tiene que ir rápida y esta fase se
 * mantiene en el nivel gratuito. `globalThis.process` y no `process` a secas:
 * este módulo solo corre en el servidor, pero así no explota si algún día se
 * importa desde otro sitio.
 */
export const AXIS_AI_MODEL =
  globalThis.process?.env?.GEMINI_MODEL ?? 'gemini-2.5-flash'

/** Techo de lo que se acepta del cliente. Un briefing normal ronda los 4 KB. */
export const MAX_REQUEST_BYTES = 64 * 1024

/** Cuánto se espera a Gemini dentro de la función. Menor que el del navegador. */
export const GEMINI_TIMEOUT_MS = 7000

/**
 * Errores que la función puede devolver.
 *
 * Códigos, no mensajes: el cliente no necesita saber qué pasó por dentro, y lo
 * que venga del proveedor no debe llegarle nunca. Todos acaban en lo mismo desde
 * el punto de vista del usuario: responde el motor determinista.
 */
export type AxisAiErrorCode =
  /** No hay credencial configurada en el servidor. */
  | 'AI_NOT_CONFIGURED'
  /** El cuerpo de la petición no es lo que se espera. */
  | 'BAD_REQUEST'
  /** El proveedor ha fallado, ha tardado o ha limitado la cuota. */
  | 'AI_UNAVAILABLE'
  /** El proveedor respondió algo que no se entiende. */
  | 'AI_BAD_RESPONSE'

export type AxisAiProxyError = { ok: false; code: AxisAiErrorCode }
export type AxisAiProxySuccess = { ok: true; text: string; action: unknown }
export type AxisAiProxyResult = AxisAiProxySuccess | AxisAiProxyError

/** Lo mínimo que la función necesita recibir para poder pedir una redacción. */
export type ProxyRequest = {
  system: string
  question: string
  briefing: unknown
  domain: { text: string; intent: string; proposedTarget: unknown }
}

/**
 * Valida el cuerpo que llega del navegador.
 *
 * Devuelve `null` en lugar de lanzar: quien llama decide el código de error, y
 * así la función no necesita try/catch para el camino previsible.
 */
export function parseProxyRequest(body: unknown): ProxyRequest | null {
  if (typeof body !== 'object' || body === null) return null

  const raw = body as Record<string, unknown>
  if (typeof raw.system !== 'string' || raw.system.length === 0) return null
  if (typeof raw.question !== 'string' || raw.question.trim().length === 0) return null
  if (raw.question.length > 2000) return null
  if (typeof raw.briefing !== 'object' || raw.briefing === null) return null

  const domain = raw.domain
  if (typeof domain !== 'object' || domain === null) return null

  const d = domain as Record<string, unknown>
  if (typeof d.text !== 'string' || typeof d.intent !== 'string') return null

  return {
    system: raw.system,
    question: raw.question,
    briefing: raw.briefing,
    domain: {
      text: d.text,
      intent: d.intent,
      proposedTarget: d.proposedTarget ?? null,
    },
  }
}

/** Lo que se le manda al modelo como entrada de usuario, ya en JSON. */
export function buildUserPayload(request: ProxyRequest): string {
  return JSON.stringify({
    question: request.question,
    briefing: request.briefing,
    domain: request.domain,
  })
}

/**
 * Lee la respuesta del modelo.
 *
 * Se pide JSON, pero un modelo puede devolver el JSON envuelto en un bloque de
 * código o con texto alrededor. Se intenta rescatar; si no se puede, se falla en
 * vez de inventar.
 */
export function parseModelText(modelText: string): { message: string; action: unknown } | null {
  const trimmed = modelText.trim()
  if (trimmed.length === 0) return null

  const json = extractJsonObject(trimmed)
  if (json === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const raw = parsed as Record<string, unknown>
  const message = typeof raw.message === 'string' ? raw.message.trim() : ''
  if (message.length === 0) return null

  return { message, action: raw.action ?? null }
}

/** Rescata el primer objeto JSON del texto, aunque venga dentro de ```json. */
function extractJsonObject(text: string): string | null {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  if (withoutFence.startsWith('{')) return withoutFence

  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  return withoutFence.slice(start, end + 1)
}

/**
 * Traduce un fallo del proveedor a un código propio.
 *
 * Cualquier fallo al llamar a Gemini —cuota agotada, 500, timeout, red caída—
 * acaba en el mismo sitio: `AI_UNAVAILABLE`. No se distinguen porque para el
 * cliente no cambian nada, hace exactamente lo mismo en todos los casos: caer al
 * motor determinista. Distinguirlos aquí solo serviría para filtrar información
 * de Google a través de un código de error.
 *
 * Lo único que sí se distingue, y se hace en la función, es haber hablado con
 * Gemini y no entender lo que ha contestado: eso es `AI_BAD_RESPONSE`.
 */
export function errorCodeFor(_cause: unknown): AxisAiErrorCode {
  return 'AI_UNAVAILABLE'
}

/** Cabeceras de la respuesta del proxy. No se cachea: cada respuesta es distinta. */
export const PROXY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
