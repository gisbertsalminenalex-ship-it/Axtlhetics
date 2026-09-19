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
  /** La petición no viene de la propia aplicación. */
  | 'FORBIDDEN'

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

// ---------------------------------------------------------------------------
// Quién puede llamar a la función
// ---------------------------------------------------------------------------

/**
 * Límite de tasa que aplica Netlify a la función, por IP y dominio.
 *
 * Es la protección real contra alguien que descubra la URL y la use para
 * gastar la cuota: la aplica la plataforma antes de que la función arranque,
 * y devuelve 429. Vive aquí, y no solo en la función, para poder comprobar en
 * un test que la función lo declara. Una persona pregunta a AXIS unas pocas
 * veces por minuto; veinte es holgado para el uso real y ridículo para el abuso.
 */
export const RATE_LIMIT = {
  windowLimit: 20,
  /** Segundos. Netlify admite hasta 180. */
  windowSize: 60,
} as const

/**
 * De dónde se aceptan peticiones.
 *
 * `hosts` son los dominios donde vive la aplicación: el sitio publicado y, en
 * Netlify, los de previsualización. `allowLocalhost` solo en desarrollo.
 */
export type TrustedOrigins = {
  hosts: readonly string[]
  allowLocalhost: boolean
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * Los orígenes de confianza, a partir del entorno de Netlify y de la propia
 * URL de la petición.
 *
 * `URL` es el dominio principal del sitio, `DEPLOY_PRIME_URL` y `DEPLOY_URL`
 * los de esta publicación. El host de la petición se añade siempre: es donde
 * la función está sirviendo, así que una petición del mismo sitio siempre
 * cuadra aunque el entorno no diga nada. `CONTEXT=dev` es `netlify dev`.
 */
export function trustedOriginsFromEnv(
  env: Record<string, string | undefined>,
  requestHost: string | null = null,
): TrustedOrigins {
  const hosts = new Set<string>()
  for (const key of ['URL', 'DEPLOY_PRIME_URL', 'DEPLOY_URL']) {
    const host = hostOf(env[key])
    if (host) hosts.add(host)
  }
  if (requestHost) hosts.add(requestHost)
  return {
    hosts: [...hosts],
    allowLocalhost: env.CONTEXT === 'dev' || env.NETLIFY_DEV === 'true',
  }
}

function isLocalhost(host: string): boolean {
  const name = host.replace(/:\d+$/, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

export type OriginCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'untrusted' | 'cross_site' }

/**
 * Comprueba que la petición viene de la propia aplicación.
 *
 * No es autenticación: `Origin` lo puede escribir cualquiera con `curl`. Es
 * una defensa adicional que corta lo fácil —una página de otro dominio, un
 * script sin cabeceras— y deja el resto al límite de tasa de la plataforma.
 * Lo que sí es fiable viene del navegador: `Sec-Fetch-Site` lo pone el propio
 * navegador y una página ajena no puede falsearlo.
 *
 * Se mira `Origin` y, si no está, `Referer`. Sin ninguno de los dos no hay
 * forma de saber quién llama, y se rechaza.
 */
export function checkRequestOrigin(headers: Headers, trusted: TrustedOrigins): OriginCheck {
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
    return { ok: false, reason: 'cross_site' }
  }

  const source = headers.get('origin') ?? headers.get('referer')
  if (!source) return { ok: false, reason: 'missing' }

  const host = hostOf(source)
  if (!host) return { ok: false, reason: 'untrusted' }

  if (trusted.hosts.includes(host)) return { ok: true }
  if (trusted.allowLocalhost && isLocalhost(host)) return { ok: true }
  return { ok: false, reason: 'untrusted' }
}
