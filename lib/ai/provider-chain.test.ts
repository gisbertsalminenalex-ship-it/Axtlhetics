import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * La cadena Cloudflare → Groq, sin red: `fetch` es falso y el reloj también
 * cuando hace falta.
 */

import {
  CHAIN_DEADLINE_MS,
  MIN_ATTEMPT_MS,
  PRIMARY_ATTEMPT_MS,
  PROVIDER_CHAIN,
  askWithFallback,
  type AttemptLog,
  type ChainOptions,
} from './provider-chain'
import { parseProxyRequest } from './provider-contract'
import type { ProviderEnv } from './providers/types'

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const BOTH: ProviderEnv = { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 'cf-token-secreto', GROQ_API_KEY: 'gsk-clave-secreta' }

const QUESTION = '¿Por qué no piernas hoy?'
const BRIEFING_MARK = 'dato-del-briefing-7731'

const request = parseProxyRequest({
  system: 'Eres AXIS.',
  question: QUESTION,
  briefing: { dayKey: '2026-09-19', marca: BRIEFING_MARK },
  domain: { text: 'Porque hoy tienes baloncesto.', intent: 'why_not', proposedTarget: null },
})!

const GOOD = '{"message":"Hoy no tocan piernas: tienes baloncesto.","action":null}'

function chat(content: string | null, finishReason: string | null = 'stop', usage: unknown = { prompt_tokens: 800, completion_tokens: 40, total_tokens: 840 }): Response {
  return new Response(
    JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }], usage }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

type Scripted = Response | Error | ((url: string) => Response | Promise<Response>)

/** Un `fetch` que responde lo que se le diga según a quién se llame. */
function fakeFetch(replies: { cloudflare?: Scripted; groq?: Scripted }) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    const reply = url.includes('api.cloudflare.com') ? replies.cloudflare : replies.groq
    if (reply === undefined) throw new Error(`llamada inesperada a ${url}`)
    if (reply instanceof Error) throw reply
    if (typeof reply === 'function') return reply(url)
    return reply
  }) as typeof fetch
  return { impl, calls }
}

async function run(replies: { cloudflare?: Scripted; groq?: Scripted }, env: ProviderEnv = BOTH, options: ChainOptions = {}) {
  const fake = fakeFetch(replies)
  const logs: AttemptLog[] = []
  const result = await askWithFallback(request, env, { fetchImpl: fake.impl, log: (entry) => logs.push(entry), ...options })
  return { result, calls: fake.calls, logs }
}

const providersCalled = (calls: { url: string }[]) =>
  calls.map((call) => (call.url.includes('api.cloudflare.com') ? 'cloudflare' : 'groq'))

// ---------------------------------------------------------------------------
// El orden
// ---------------------------------------------------------------------------

test('la cadena es Cloudflare primero y Groq después', () => {
  assert.deepEqual(PROVIDER_CHAIN.map((provider) => provider.id), ['cloudflare', 'groq'])
})

test('si Cloudflare responde bien, no se llama a Groq', async () => {
  const { result, calls } = await run({ cloudflare: chat(GOOD) })
  assert.deepEqual(result, { ok: true, provider: 'cloudflare', message: 'Hoy no tocan piernas: tienes baloncesto.', action: null, followUps: [] })
  assert.deepEqual(providersCalled(calls), ['cloudflare'])
})

test('Cloudflare sin configurar se salta sin contar como fallo', async () => {
  const { result, calls, logs } = await run({ groq: chat(GOOD) }, { GROQ_API_KEY: 'k' })
  assert.equal(result.ok && result.provider, 'groq')
  assert.deepEqual(providersCalled(calls), ['groq'])
  assert.deepEqual(logs.map((log) => log.provider), ['groq'])
})

test('solo Cloudflare configurado también funciona', async () => {
  const { result, calls } = await run({ cloudflare: chat(GOOD) }, { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 't' })
  assert.equal(result.ok && result.provider, 'cloudflare')
  assert.deepEqual(providersCalled(calls), ['cloudflare'])
})

test('sin ningún proveedor configurado no se llama a nadie', async () => {
  const { result, calls } = await run({}, {})
  assert.deepEqual(result, { ok: false, code: 'AI_NOT_CONFIGURED' })
  assert.equal(calls.length, 0)
})

// ---------------------------------------------------------------------------
// Qué provoca pasar a Groq
// ---------------------------------------------------------------------------

const httpError = (status: number) =>
  new Response(JSON.stringify({ errors: [{ message: 'daily free allocation exceeded for account 999' }] }), { status })

const FALLBACK_CASES: { name: string; cloudflare: Scripted; outcome: AttemptLog['outcome'] }[] = [
  { name: '429', cloudflare: httpError(429), outcome: 'rate_limited' },
  { name: '500', cloudflare: httpError(500), outcome: 'server_error' },
  { name: '503', cloudflare: httpError(503), outcome: 'server_error' },
  { name: '401', cloudflare: httpError(401), outcome: 'auth_error' },
  { name: '403', cloudflare: httpError(403), outcome: 'auth_error' },
  { name: '400', cloudflare: httpError(400), outcome: 'client_error' },
  { name: 'timeout', cloudflare: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), outcome: 'timeout' },
  { name: 'red caída', cloudflare: new TypeError('fetch failed'), outcome: 'network' },
  { name: 'respuesta vacía', cloudflare: chat(''), outcome: 'empty' },
  { name: 'contenido nulo', cloudflare: chat(null), outcome: 'empty' },
  { name: 'finish_reason length', cloudflare: chat(GOOD, 'length'), outcome: 'unfinished' },
  { name: 'finish_reason content_filter', cloudflare: chat(GOOD, 'content_filter'), outcome: 'unfinished' },
  { name: 'sin finish_reason', cloudflare: chat(GOOD, null), outcome: 'unfinished' },
  { name: 'texto que no es JSON', cloudflare: chat('Hoy no tocan piernas.'), outcome: 'bad_format' },
  { name: 'JSON sin message', cloudflare: chat('{"texto":"hola"}'), outcome: 'bad_format' },
  { name: 'cuerpo que no es JSON', cloudflare: new Response('<html>502</html>', { status: 200 }), outcome: 'bad_format' },
]

for (const failure of FALLBACK_CASES) {
  test(`Cloudflare → Groq cuando Cloudflare da ${failure.name}`, async () => {
    const { result, calls, logs } = await run({ cloudflare: failure.cloudflare, groq: chat(GOOD) })
    assert.equal(result.ok && result.provider, 'groq')
    assert.deepEqual(providersCalled(calls), ['cloudflare', 'groq'])
    assert.equal(logs[0].provider, 'cloudflare')
    assert.equal(logs[0].outcome, failure.outcome)
    assert.equal(logs[1].outcome, 'ok')
  })
}

test('si los dos fallan por disponibilidad, AI_UNAVAILABLE', async () => {
  const { result } = await run({ cloudflare: httpError(429), groq: httpError(500) })
  assert.deepEqual(result, { ok: false, code: 'AI_UNAVAILABLE' })
})

test('si el último falla por contenido, AI_BAD_RESPONSE', async () => {
  const { result } = await run({ cloudflare: httpError(429), groq: chat('no es json') })
  assert.deepEqual(result, { ok: false, code: 'AI_BAD_RESPONSE' })
})

test('Groq también se rechaza si no termina en stop', async () => {
  const { result } = await run({ groq: chat(GOOD, 'length') }, { GROQ_API_KEY: 'k' })
  assert.deepEqual(result, { ok: false, code: 'AI_BAD_RESPONSE' })
})

test('la acción del modelo viaja tal cual: la valida el dominio, en el cliente', async () => {
  const action = { type: 'change_training', target: { type: 'MODIFIED_TRAINING', focus: 'tren_superior' } }
  const { result } = await run({ cloudflare: chat(JSON.stringify({ message: 'Cambio a tren superior.', action })) })
  assert.deepEqual(result.ok && result.action, action)
})

// ---------------------------------------------------------------------------
// El tiempo
// ---------------------------------------------------------------------------

test('el plazo cabe en lo que espera el navegador y deja tiempo al respaldo', () => {
  assert.equal(CHAIN_DEADLINE_MS, 7000)
  assert.ok(PRIMARY_ATTEMPT_MS < CHAIN_DEADLINE_MS)
  assert.ok(CHAIN_DEADLINE_MS - PRIMARY_ATTEMPT_MS >= MIN_ATTEMPT_MS, 'a Groq siempre le queda tiempo')
})

test('Cloudflare tiene su propio tope y un cuelgue suyo acaba en Groq', async () => {
  const logs: AttemptLog[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes('api.cloudflare.com')) return chat(GOOD)
    // Cloudflare no responde nunca: solo lo corta la señal de la cadena.
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })
  }) as typeof fetch

  const started = Date.now()
  const result = await askWithFallback(request, BOTH, { fetchImpl: impl, log: (entry) => logs.push(entry), primaryAttemptMs: 50, deadlineMs: 2000 })
  assert.equal(result.ok && result.provider, 'groq')
  assert.equal(logs[0].outcome, 'timeout')
  assert.ok(Date.now() - started < 1500)
})

test('si no queda tiempo para Groq, no se le llama', async () => {
  let clock = 0
  const { result, calls, logs } = await run(
    { cloudflare: () => { clock += 6500; return httpError(500) }, groq: chat(GOOD) },
    BOTH,
    { now: () => clock },
  )
  assert.deepEqual(result, { ok: false, code: 'AI_UNAVAILABLE' })
  assert.deepEqual(providersCalled(calls), ['cloudflare'])
  assert.deepEqual(logs.map((log) => log.outcome), ['server_error', 'no_time'])
})

test('si el navegador se va, no se sigue gastando en Groq', async () => {
  const controller = new AbortController()
  const { result, calls, logs } = await run(
    { cloudflare: () => { controller.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }, groq: chat(GOOD) },
    BOTH,
    { signal: controller.signal },
  )
  assert.equal(result.ok, false)
  assert.deepEqual(providersCalled(calls), ['cloudflare'])
  assert.equal(logs[0].outcome, 'aborted')
})

// ---------------------------------------------------------------------------
// Lo que se registra
// ---------------------------------------------------------------------------

test('se registra un intento con metadatos: proveedor, modelo, estado, resultado, finish_reason, duración y consumo', async () => {
  const { logs } = await run({ cloudflare: chat(GOOD, 'stop', { prompt_tokens: 812, completion_tokens: 41, total_tokens: 853, neurons: 12.5 }) })
  assert.equal(logs.length, 1)
  const [log] = logs
  assert.deepEqual(Object.keys(log).sort(), ['durationMs', 'finishReason', 'model', 'outcome', 'provider', 'status', 'usage'])
  assert.equal(log.provider, 'cloudflare')
  assert.equal(log.model, '@cf/google/gemma-4-26b-a4b-it')
  assert.equal(log.status, 200)
  assert.equal(log.outcome, 'ok')
  assert.equal(log.finishReason, 'stop')
  assert.ok(log.durationMs >= 0)
  assert.deepEqual(log.usage, { promptTokens: 812, completionTokens: 41, totalTokens: 853, neurons: 12.5 })
})

test('el registro nunca lleva la pregunta, el briefing, el texto, credenciales, URLs ni errores del proveedor', async () => {
  const { logs } = await run({ cloudflare: httpError(429), groq: chat(GOOD) })
  const serialized = JSON.stringify(logs)

  for (const prohibido of [
    QUESTION,
    BRIEFING_MARK,
    'Hoy no tocan piernas',
    'cf-token-secreto',
    'gsk-clave-secreta',
    ACCOUNT,
    'api.cloudflare.com',
    'api.groq.com',
    'daily free allocation',
    'Eres AXIS',
    'Bearer',
  ]) {
    assert.equal(serialized.includes(prohibido), false, `el registro contiene «${prohibido}»`)
  }
})
