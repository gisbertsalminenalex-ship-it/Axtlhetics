/**
 * La cadena de proveedores de AXIS (D-016).
 *
 *   Cloudflare Workers AI → Groq → (el cliente responde con el determinista)
 *
 * Aquí se decide el orden, el tiempo de cada intento y cuándo se pasa al
 * siguiente. Los proveedores solo construyen su petición y leen su respuesta;
 * el dominio no sabe que esto existe: para el navegador la ruta sigue
 * devolviendo `{text, action}` o un código.
 *
 * Todo el tiempo cabe en un plazo global (`CHAIN_DEADLINE_MS`) menor que el que
 * espera el navegador, para que quien corte sea siempre este código.
 *
 * Se registra una línea por intento con **metadatos**: proveedor, modelo,
 * estado HTTP, resultado, `finish_reason`, duración y consumo. Nunca la
 * pregunta, el briefing, el texto del modelo, cabeceras, credenciales, URLs ni
 * cuerpos de error.
 */

import { parseModelText, type ProviderUsage, type ProxyRequest } from './provider-contract'
import { cloudflareProvider } from './providers/cloudflare'
import { groqProvider } from './providers/groq'
import type { LanguageProvider, ProviderEnv, ProviderId } from './providers/types'

/** El orden de la cadena: el principal primero. */
export const PROVIDER_CHAIN: readonly LanguageProvider[] = [cloudflareProvider, groqProvider]

/** Todo lo que puede durar la cadena. Menor que la espera del navegador (8 s). */
export const CHAIN_DEADLINE_MS = 7000

/** Lo que se le da a un proveedor que no es el último, para dejar tiempo al siguiente. */
export const PRIMARY_ATTEMPT_MS = 4000

/** Con menos tiempo que esto no merece la pena empezar un intento. */
export const MIN_ATTEMPT_MS = 1000

export type AttemptOutcome =
  | 'ok'
  /** 429: cuota, neurons o límite de tasa. */
  | 'rate_limited'
  /** 5xx. */
  | 'server_error'
  /** 401/403: la credencial está mal configurada. */
  | 'auth_error'
  /** Otro 4xx: la petición no le gusta al proveedor. */
  | 'client_error'
  | 'timeout'
  | 'network'
  /** Respondió 200 sin texto. */
  | 'empty'
  /** `finish_reason` distinto de `stop`: cortada, filtrada o incompleta. */
  | 'unfinished'
  /** Texto que no es el JSON `{"message", "action"}`. */
  | 'bad_format'
  /** El navegador se fue: no se sigue gastando. */
  | 'aborted'
  /** No quedaba tiempo para intentarlo. */
  | 'no_time'

/** Lo que se registra de cada intento. Solo metadatos. */
export type AttemptLog = {
  provider: ProviderId
  model: string
  status: number | null
  outcome: AttemptOutcome
  finishReason: string | null
  durationMs: number
  usage: ProviderUsage | null
}

export type ChainResult =
  | { ok: true; provider: ProviderId; message: string; action: unknown }
  | { ok: false; code: 'AI_NOT_CONFIGURED' | 'AI_UNAVAILABLE' | 'AI_BAD_RESPONSE' }

export type ChainOptions = {
  providers?: readonly LanguageProvider[]
  fetchImpl?: typeof fetch
  now?: () => number
  log?: (entry: AttemptLog) => void
  deadlineMs?: number
  primaryAttemptMs?: number
  /** Se aborta si el navegador cierra la petición. */
  signal?: AbortSignal
}

/**
 * Fallos de contenido: se habló con el proveedor y no se le entendió. Si el
 * último intento acaba así, el código es `AI_BAD_RESPONSE`; si no, `AI_UNAVAILABLE`.
 */
const CONTENT_FAILURES: ReadonlySet<AttemptOutcome> = new Set(['empty', 'unfinished', 'bad_format'])

export function logAttempt(entry: AttemptLog): void {
  console.info(`[axis-ai] ${JSON.stringify(entry)}`)
}

function outcomeForStatus(status: number): AttemptOutcome {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server_error'
  if (status === 401 || status === 403) return 'auth_error'
  return 'client_error'
}

function isTimeoutError(cause: unknown): boolean {
  const name = (cause as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

type Attempt =
  | { ok: true; message: string; action: unknown; log: AttemptLog }
  | { ok: false; log: AttemptLog }

async function attempt(
  provider: LanguageProvider,
  request: ProxyRequest,
  env: ProviderEnv,
  budgetMs: number,
  fetchImpl: typeof fetch,
  now: () => number,
  clientSignal: AbortSignal | undefined,
): Promise<Attempt> {
  const started = now()
  const log: AttemptLog = {
    provider: provider.id,
    model: provider.model(env),
    status: null,
    outcome: 'ok',
    finishReason: null,
    durationMs: 0,
    usage: null,
  }
  const fail = (outcome: AttemptOutcome): Attempt => {
    log.outcome = outcome
    log.durationMs = Math.max(0, now() - started)
    return { ok: false, log }
  }

  const timeout = AbortSignal.timeout(budgetMs)
  const signal = clientSignal ? AbortSignal.any([clientSignal, timeout]) : timeout
  const classify = (cause: unknown): AttemptOutcome => {
    if (clientSignal?.aborted) return 'aborted'
    if (timeout.aborted || isTimeoutError(cause)) return 'timeout'
    return 'network'
  }

  const { url, init } = provider.request(request, env)
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal })
  } catch (cause) {
    return fail(classify(cause))
  }

  log.status = response.status
  if (!response.ok) {
    // El cuerpo del error no se lee ni se propaga: puede llevar ids o cuotas.
    response.body?.cancel().catch(() => {})
    return fail(outcomeForStatus(response.status))
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    return fail(signal.aborted ? classify(cause) : 'bad_format')
  }

  const reply = provider.read(payload)
  log.usage = reply.usage
  log.finishReason = reply.finishReason
  if (reply.text.trim().length === 0) return fail('empty')
  if (reply.finishReason !== 'stop') return fail('unfinished')

  const parsed = parseModelText(reply.text)
  if (!parsed) return fail('bad_format')

  log.durationMs = Math.max(0, now() - started)
  return { ok: true, message: parsed.message, action: parsed.action, log }
}

/**
 * Pide la redacción al primer proveedor configurado y, si falla por cualquier
 * motivo que no sea que el navegador se ha ido, al siguiente.
 *
 * Un proveedor sin configurar se salta sin contar como fallo. Si ninguno está
 * configurado, `AI_NOT_CONFIGURED`.
 */
export async function askWithFallback(
  request: ProxyRequest,
  env: ProviderEnv,
  options: ChainOptions = {},
): Promise<ChainResult> {
  const providers = (options.providers ?? PROVIDER_CHAIN).filter((provider) => provider.configured(env))
  if (providers.length === 0) return { ok: false, code: 'AI_NOT_CONFIGURED' }

  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const log = options.log ?? logAttempt
  const deadline = now() + (options.deadlineMs ?? CHAIN_DEADLINE_MS)
  const primaryMs = options.primaryAttemptMs ?? PRIMARY_ATTEMPT_MS

  let last: AttemptOutcome = 'no_time'
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const remaining = deadline - now()
    if (remaining < MIN_ATTEMPT_MS) {
      last = 'no_time'
      log({ provider: provider.id, model: provider.model(env), status: null, outcome: 'no_time', finishReason: null, durationMs: 0, usage: null })
      break
    }

    const isLast = index === providers.length - 1
    const budget = isLast ? remaining : Math.min(primaryMs, remaining)
    const result = await attempt(provider, request, env, budget, fetchImpl, now, options.signal)
    log(result.log)

    if (result.ok) {
      return { ok: true, provider: provider.id, message: result.message, action: result.action }
    }
    last = result.log.outcome
    if (last === 'aborted') break
  }

  return { ok: false, code: CONTENT_FAILURES.has(last) ? 'AI_BAD_RESPONSE' : 'AI_UNAVAILABLE' }
}
