import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Los proveedores: cómo construye cada uno su petición y qué lee de la
 * respuesta. Sin red: la cadena y la ruta se prueban aparte.
 */

import { buildUserPayload, parseProxyRequest, VOICE_TEMPERATURE } from '../provider-contract'
import {
  CLOUDFLARE_DEFAULT_MODEL,
  CLOUDFLARE_MAX_COMPLETION_TOKENS,
  CLOUDFLARE_TEMPERATURE,
  cloudflareProvider,
} from './cloudflare'
import { GROQ_DEFAULT_MODEL, GROQ_ENDPOINT, GROQ_MAX_COMPLETION_TOKENS, groqProvider } from './groq'
import type { ProviderEnv } from './types'

const ACCOUNT = '0123456789abcdef0123456789abcdef'

const request = parseProxyRequest({
  system: 'Eres AXIS.',
  question: '¿Por qué no piernas?',
  briefing: { dayKey: '2026-09-19' },
  domain: { text: 'Porque sí.', intent: 'why_not', proposedTarget: null },
})!

function body(init: { body: string }): Record<string, unknown> {
  return JSON.parse(init.body)
}

// ---------------------------------------------------------------------------
// Cloudflare
// ---------------------------------------------------------------------------

test('Cloudflare necesita un id de cuenta válido y un token para considerarse configurado', () => {
  assert.equal(cloudflareProvider.configured({}), false)
  assert.equal(cloudflareProvider.configured({ CF_ACCOUNT_ID: ACCOUNT }), false)
  assert.equal(cloudflareProvider.configured({ CF_API_TOKEN: 't' }), false)
  assert.equal(cloudflareProvider.configured({ CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 't' }), true)
  // El id va dentro de la URL: un valor con otra forma no construye una petición.
  for (const raro of ['cuenta', `${ACCOUNT}/../x`, `${ACCOUNT}?a=1`, '']) {
    assert.equal(cloudflareProvider.configured({ CF_ACCOUNT_ID: raro, CF_API_TOKEN: 't' }), false, raro)
  }
})

test('Cloudflare usa el endpoint compatible con OpenAI de la cuenta, con el token en cabecera', () => {
  const env: ProviderEnv = { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 'token-de-prueba' }
  const { url, init } = cloudflareProvider.request(request, env)

  assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, 'Bearer token-de-prueba')
  assert.equal(url.includes('token-de-prueba'), false, 'el token nunca va en la URL')
})

test('Cloudflare pide Gemma sin razonamiento, con temperatura baja, salida acotada y JSON', () => {
  const sent = body(cloudflareProvider.request(request, { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 't' }).init)

  assert.equal(CLOUDFLARE_DEFAULT_MODEL, '@cf/google/gemma-4-26b-a4b-it')
  assert.equal(sent.model, CLOUDFLARE_DEFAULT_MODEL)
  // La voz de AXIS (D-070) algo más suelta que al redactar; la base del proveedor queda para reescribir (D-028).
  assert.equal(sent.temperature, VOICE_TEMPERATURE)
  assert.equal(body(cloudflareProvider.request({ ...request, domain: { ...request.domain, intent: 'unknown' } }, { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 't' }).init).temperature, CLOUDFLARE_TEMPERATURE)
  assert.equal(CLOUDFLARE_TEMPERATURE, 0.3)
  assert.equal(sent.max_completion_tokens, CLOUDFLARE_MAX_COMPLETION_TOKENS)
  // Siete frases de respuesta larga (D-030) caben; un techo, para acotar el consumo.
  assert.ok(CLOUDFLARE_MAX_COMPLETION_TOKENS >= 600 && CLOUDFLARE_MAX_COMPLETION_TOKENS <= 800)
  assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: false })
  assert.deepEqual(sent.response_format, { type: 'json_object' })
  assert.deepEqual(sent.messages, [
    { role: 'system', content: 'Eres AXIS.' },
    { role: 'user', content: buildUserPayload(request) },
  ])
  assert.equal('tools' in sent, false, 'AXIS no usa herramientas')
})

test('CF_MODEL cambia el modelo de Cloudflare sin tocar código', () => {
  const env: ProviderEnv = { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: 't', CF_MODEL: '@cf/otro/modelo' }
  assert.equal(cloudflareProvider.model(env), '@cf/otro/modelo')
  assert.equal(body(cloudflareProvider.request(request, env).init).model, '@cf/otro/modelo')
})

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

test('Groq se configura con su clave y usa por defecto un modelo de producción del plan gratuito', () => {
  assert.equal(groqProvider.configured({}), false)
  assert.equal(groqProvider.configured({ GROQ_API_KEY: 'k' }), true)
  assert.match(GROQ_DEFAULT_MODEL, /^openai\/gpt-oss-(120b|20b)$/)
  assert.equal(groqProvider.model({ GROQ_MODEL: 'openai/gpt-oss-20b' }), 'openai/gpt-oss-20b')
})

test('Groq mantiene su petición: endpoint, clave en cabecera, JSON y razonamiento bajo', () => {
  const { url, init } = groqProvider.request(request, { GROQ_API_KEY: 'clave' })
  const sent = body(init)

  assert.equal(url, GROQ_ENDPOINT)
  assert.equal(GROQ_ENDPOINT, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(init.headers.Authorization, 'Bearer clave')
  assert.equal(sent.model, GROQ_DEFAULT_MODEL)
  assert.equal(sent.temperature, VOICE_TEMPERATURE)
  assert.equal(sent.max_completion_tokens, GROQ_MAX_COMPLETION_TOKENS)
  assert.deepEqual(sent.response_format, { type: 'json_object' })
  assert.equal(sent.reasoning_effort, 'low', 'los gpt-oss razonan: se pide el mínimo')
  assert.equal('chat_template_kwargs' in sent, false)
})

test('el esfuerzo de razonamiento solo se pide a los modelos que lo admiten', () => {
  const para = (model: string) => body(groqProvider.request(request, { GROQ_API_KEY: 'k', GROQ_MODEL: model }).init)
  assert.equal('reasoning_effort' in para('llama-3.1-8b-instant'), false)
  assert.equal(para('openai/gpt-oss-20b').reasoning_effort, 'low')
})

test('los dos proveedores leen la respuesta con el mismo lector', () => {
  const payload = { choices: [{ message: { content: '{"message":"Hola."}' }, finish_reason: 'stop' }], usage: { total_tokens: 5 } }
  assert.deepEqual(cloudflareProvider.read(payload), groqProvider.read(payload))
  assert.equal(cloudflareProvider.read(payload).finishReason, 'stop')
})
