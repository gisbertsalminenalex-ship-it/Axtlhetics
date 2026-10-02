/**
 * Contrato del proxy de IA.
 *
 * Vive aparte del route handler a propósito: aquí no se importa ningún
 * SDK ni se toca la red, así que todo esto se puede probar con `node:test` sin
 * credenciales y sin salir a internet.
 *
 * Es lo común a cualquier proveedor: qué se acepta del navegador, qué se le
 * manda al modelo, cómo se lee lo que contesta y quién puede llamar. Lo que es
 * de cada proveedor —URL, credencial, parámetros— vive en `providers/`, y el
 * orden en que se prueban en `provider-chain.ts`.
 */

/** Techo de lo que se acepta del cliente. Un briefing normal ronda los 4 KB. */
export const MAX_REQUEST_BYTES = 64 * 1024

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
 * Los mensajes de chat, iguales para cualquier proveedor compatible con OpenAI:
 * la personalidad como sistema y el briefing con la pregunta como usuario.
 */
export function buildChatMessages(request: ProxyRequest): { role: string; content: string }[] {
  return [
    { role: 'system', content: request.system },
    { role: 'user', content: buildUserPayload(request) },
  ]
}

/**
 * Consumo que declara el proveedor. Solo números: nada del contenido.
 *
 * `neurons` es la unidad de facturación de Cloudflare; queda en `null` cuando
 * la respuesta no la trae.
 */
export type ProviderUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  neurons: number | null
}

/** Lo que interesa de una respuesta de chat: el texto, por qué terminó y cuánto costó. */
export type ChatCompletionReply = {
  text: string
  finishReason: string | null
  usage: ProviderUsage | null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readUsage(value: unknown): ProviderUsage | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  return {
    promptTokens: numberOrNull(raw.prompt_tokens),
    completionTokens: numberOrNull(raw.completion_tokens),
    totalTokens: numberOrNull(raw.total_tokens),
    neurons: numberOrNull(raw.neurons),
  }
}

/**
 * Lee una respuesta de chat compatible con OpenAI.
 *
 * El texto está en `choices[0].message.content`. Lo que haya en cualquier otro
 * campo —razonamiento, ids— no se mira. Si no hay texto, cadena vacía: quien
 * llama lo tratará como respuesta vacía.
 */
export function readChatCompletion(payload: unknown): ChatCompletionReply {
  if (typeof payload !== 'object' || payload === null) {
    return { text: '', finishReason: null, usage: null }
  }
  const raw = payload as { choices?: unknown; usage?: unknown }
  const usage = readUsage(raw.usage)
  if (!Array.isArray(raw.choices) || raw.choices.length === 0) {
    return { text: '', finishReason: null, usage }
  }
  const choice = raw.choices[0] as { message?: { content?: unknown }; finish_reason?: unknown }
  const content = choice?.message?.content
  return {
    text: typeof content === 'string' ? content : '',
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
    usage,
  }
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
 * Límite de tasa del endpoint, por IP.
 *
 * Es la protección real contra alguien que descubra la URL y la use para
 * gastar la cuota. En Vercel no se declara en código: es una regla del
 * firewall del proyecto (Firewall → Configure → New Rule → path `/api/axis-ai`
 * → Rate Limit, ventana fija, por IP, acción 429), disponible en el plan Hobby.
 * Estos valores son la referencia para esa regla, y un test los mantiene
 * razonables. Una persona pregunta a AXIS unas pocas veces por minuto; veinte
 * es holgado para el uso real y ridículo para el abuso.
 */
export const RATE_LIMIT = {
  windowLimit: 20,
  /** Segundos. El firewall de Vercel admite de 10 s a 10 min. */
  windowSize: 60,
} as const

/**
 * De dónde se aceptan peticiones.
 *
 * `hosts` son los dominios donde vive la aplicación: el sitio publicado y, en
 * Vercel, los de previsualización. `allowLocalhost` solo en desarrollo.
 */
export type TrustedOrigins = {
  hosts: readonly string[]
  allowLocalhost: boolean
}

/** El host de una URL, o de un host a secas como los que da Vercel. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).host || null
  } catch {
    return null
  }
}

/**
 * Los orígenes de confianza, a partir del entorno de Vercel y de la propia
 * URL de la petición.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` es el dominio de producción, `VERCEL_URL` y
 * `VERCEL_BRANCH_URL` los de esta publicación; Vercel los da **sin esquema**
 * (`mi-sitio.vercel.app`), y solo si el proyecto expone las variables del
 * sistema. Por eso el host de la petición se añade siempre: es donde la ruta
 * está sirviendo, así que una petición del mismo sitio siempre cuadra aunque
 * el entorno no diga nada. `localhost` solo en desarrollo.
 */
export function trustedOriginsFromEnv(
  env: Record<string, string | undefined>,
  requestHost: string | null = null,
): TrustedOrigins {
  const hosts = new Set<string>()
  for (const key of ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'VERCEL_BRANCH_URL']) {
    const host = hostOf(env[key])
    if (host) hosts.add(host)
  }
  if (requestHost) hosts.add(requestHost)
  return {
    hosts: [...hosts],
    allowLocalhost: env.VERCEL_ENV === 'development' || env.NODE_ENV === 'development',
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
