import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_REQUEST_BYTES,
  PROXY_HEADERS,
  buildChatMessages,
  buildUserPayload,
  parseModelText,
  parseProxyRequest,
  readChatCompletion,
} from './provider-contract'

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    system: 'Eres AXIS.',
    question: '¿Por qué no piernas hoy?',
    briefing: { dayKey: '2026-09-11', recovery: { known: false } },
    domain: { text: 'Porque hoy tienes baloncesto.', intent: 'why_not', proposedTarget: null },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Validación de la petición
// ---------------------------------------------------------------------------

test('acepta un cuerpo bien formado', () => {
  const parsed = parseProxyRequest(validBody())

  assert.ok(parsed)
  assert.equal(parsed.question, '¿Por qué no piernas hoy?')
  assert.equal(parsed.domain.intent, 'why_not')
})

test('rechaza cuerpos inválidos sin lanzar', () => {
  const malos: unknown[] = [
    null,
    undefined,
    'texto suelto',
    42,
    [],
    {},
    validBody({ system: '' }),
    validBody({ question: '   ' }),
    validBody({ question: 'x'.repeat(2001) }),
    validBody({ briefing: null }),
    validBody({ briefing: 'no soy un objeto' }),
    validBody({ domain: null }),
    validBody({ domain: { intent: 'why' } }),
    validBody({ domain: { text: 'hola' } }),
  ]

  for (const malo of malos) {
    assert.equal(parseProxyRequest(malo), null, `debería rechazarse: ${JSON.stringify(malo)}`)
  }
})

test('el payload al modelo lleva la pregunta, el briefing y lo que decidió el dominio', () => {
  const payload = JSON.parse(buildUserPayload(parseProxyRequest(validBody())!))

  assert.equal(payload.question, '¿Por qué no piernas hoy?')
  assert.ok(payload.briefing)
  assert.equal(payload.domain.text, 'Porque hoy tienes baloncesto.')
  // El prompt de sistema va aparte, no dentro del mensaje de usuario.
  assert.equal(payload.system, undefined)
})

// ---------------------------------------------------------------------------
// Lectura de la respuesta del modelo
// ---------------------------------------------------------------------------

test('lee un JSON limpio', () => {
  const parsed = parseModelText('{"message":"Hoy toca tren superior.","action":null}')

  assert.ok(parsed)
  assert.equal(parsed.message, 'Hoy toca tren superior.')
  assert.equal(parsed.action, null)
})

test('rescata el JSON aunque venga envuelto en un bloque de código', () => {
  const parsed = parseModelText('```json\n{"message":"Hoy toca tren superior."}\n```')

  assert.ok(parsed)
  assert.equal(parsed.message, 'Hoy toca tren superior.')
})

test('rescata el JSON aunque el modelo añada texto alrededor', () => {
  const parsed = parseModelText('Claro: {"message":"Hoy toca tren superior."} Espero que ayude.')

  assert.ok(parsed)
  assert.equal(parsed.message, 'Hoy toca tren superior.')
})

test('una respuesta malformada se rechaza, no se remienda', () => {
  const malas = [
    '',
    '   ',
    'no soy json',
    '{roto',
    '{"message":""}',
    '{"message":"   "}',
    '{"mensaje":"campo equivocado"}',
    '{"message":123}',
    '[]',
    'null',
  ]

  for (const mala of malas) {
    assert.equal(parseModelText(mala), null, `debería rechazarse: ${mala}`)
  }
})

test('la acción del modelo se transporta tal cual para que la valide el dominio', () => {
  const parsed = parseModelText(
    '{"message":"Cambio a tren superior.","action":{"type":"change_training","target":{"type":"LIGHT_TRAINING","focus":"tren_superior"}}}',
  )

  assert.ok(parsed)
  // Aquí no se valida: eso es trabajo del dominio, en el cliente.
  assert.deepEqual(parsed.action, {
    type: 'change_training',
    target: { type: 'LIGHT_TRAINING', focus: 'tren_superior' },
  })
})

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

test('hay un límite de tamaño para lo que llega del navegador', () => {
  assert.ok(MAX_REQUEST_BYTES > 0 && MAX_REQUEST_BYTES <= 256 * 1024)
})

test('la respuesta del proxy nunca se cachea', () => {
  assert.equal(PROXY_HEADERS['Cache-Control'], 'no-store')
})

// ---------------------------------------------------------------------------
// Quién puede llamar a la función
// ---------------------------------------------------------------------------

import { checkRequestOrigin, RATE_LIMIT, trustedOriginsFromEnv } from './provider-contract'

const SITE = 'https://axthletics.vercel.app'

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

test('los orígenes de confianza salen del entorno de Vercel y del host de la petición', () => {
  // Vercel da los hosts sin esquema.
  const trusted = trustedOriginsFromEnv(
    {
      VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app',
      VERCEL_URL: 'axthletics-abc123-alex.vercel.app',
      VERCEL_BRANCH_URL: 'axthletics-git-main-alex.vercel.app',
      VERCEL_ENV: 'production',
    },
    'axthletics.vercel.app',
  )
  assert.deepEqual(trusted.hosts, [
    'axthletics.vercel.app',
    'axthletics-abc123-alex.vercel.app',
    'axthletics-git-main-alex.vercel.app',
  ])
  assert.equal(trusted.allowLocalhost, false)

  // Con esquema también vale, y lo que no es un host se ignora.
  assert.deepEqual(trustedOriginsFromEnv({ VERCEL_URL: 'https://x.vercel.app', VERCEL_BRANCH_URL: '' }).hosts, ['x.vercel.app'])

  // Sin entorno, el host de la petición basta: la función sirve desde el sitio.
  assert.deepEqual(trustedOriginsFromEnv({}, 'mi-dominio.com').hosts, ['mi-dominio.com'])
  assert.deepEqual(trustedOriginsFromEnv({}).hosts, [])
})

test('localhost solo se admite en desarrollo', () => {
  assert.equal(trustedOriginsFromEnv({ VERCEL_ENV: 'development' }).allowLocalhost, true)
  assert.equal(trustedOriginsFromEnv({ NODE_ENV: 'development' }).allowLocalhost, true)
  assert.equal(trustedOriginsFromEnv({ VERCEL_ENV: 'production', NODE_ENV: 'production' }).allowLocalhost, false)
  assert.equal(trustedOriginsFromEnv({ VERCEL_ENV: 'preview' }).allowLocalhost, false)

  const dev = trustedOriginsFromEnv({ NODE_ENV: 'development' }, 'localhost:3000')
  assert.equal(checkRequestOrigin(headers({ origin: 'http://localhost:3000' }), dev).ok, true)
  assert.equal(checkRequestOrigin(headers({ origin: 'http://127.0.0.1:4000' }), dev).ok, true)

  const prod = trustedOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app' }, 'axthletics.vercel.app')
  assert.deepEqual(checkRequestOrigin(headers({ origin: 'http://localhost:3000' }), prod), { ok: false, reason: 'untrusted' })
})

test('la propia aplicación pasa: por Origin o, si falta, por Referer', () => {
  const trusted = trustedOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app' })
  assert.equal(checkRequestOrigin(headers({ origin: SITE }), trusted).ok, true)
  assert.equal(checkRequestOrigin(headers({ referer: `${SITE}/` }), trusted).ok, true)
  assert.equal(checkRequestOrigin(headers({ origin: SITE, 'sec-fetch-site': 'same-origin' }), trusted).ok, true)
})

test('sin Origin ni Referer no se sabe quién llama: se rechaza', () => {
  const trusted = trustedOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app' })
  assert.deepEqual(checkRequestOrigin(headers({}), trusted), { ok: false, reason: 'missing' })
  assert.deepEqual(checkRequestOrigin(headers({ 'content-type': 'application/json' }), trusted), { ok: false, reason: 'missing' })
})

test('otro sitio, un origen roto o un subdominio parecido no pasan', () => {
  const trusted = trustedOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app' })
  for (const origin of [
    'https://otro-sitio.com',
    'https://axthletics.vercel.app.evil.com',
    'https://evil-axthletics.vercel.app',
    'null',
    'no-es-una-url',
  ]) {
    assert.deepEqual(checkRequestOrigin(headers({ origin }), trusted), { ok: false, reason: 'untrusted' }, origin)
  }
})

test('lo que dice el navegador manda: Sec-Fetch-Site cross-site se rechaza aunque Origin cuadre', () => {
  const trusted = trustedOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'axthletics.vercel.app' })
  assert.deepEqual(
    checkRequestOrigin(headers({ origin: SITE, 'sec-fetch-site': 'cross-site' }), trusted),
    { ok: false, reason: 'cross_site' },
  )
  assert.deepEqual(
    checkRequestOrigin(headers({ origin: SITE, 'sec-fetch-site': 'none' }), trusted),
    { ok: false, reason: 'cross_site' },
  )
})

test('el límite de tasa de referencia es razonable y cabe en lo que admite el firewall de Vercel', () => {
  assert.ok(RATE_LIMIT.windowLimit >= 5 && RATE_LIMIT.windowLimit <= 60)
  assert.ok(RATE_LIMIT.windowSize >= 10 && RATE_LIMIT.windowSize <= 600)
})

// ---------------------------------------------------------------------------
// La petición al proveedor y su respuesta
// ---------------------------------------------------------------------------

test('los mensajes llevan la personalidad como sistema y el briefing como usuario, en JSON', () => {
  const request = parseProxyRequest({
    system: 'Eres AXIS.',
    question: '¿Por qué no piernas?',
    briefing: { dayKey: '2026-09-19' },
    domain: { text: 'Porque sí.', intent: 'why_not', proposedTarget: null },
  })!

  assert.deepEqual(buildChatMessages(request), [
    { role: 'system', content: 'Eres AXIS.' },
    { role: 'user', content: buildUserPayload(request) },
  ])
})

test('el texto del modelo se lee de choices[0].message.content y nada más', () => {
  const text = (payload: unknown) => readChatCompletion(payload).text
  assert.equal(text({ choices: [{ message: { content: '{"message":"Hola."}', reasoning: 'x' } }] }), '{"message":"Hola."}')
  assert.equal(text({ choices: [] }), '')
  assert.equal(text({ choices: [{ message: { content: null } }] }), '')
  assert.equal(text({ choices: [{ message: {} }] }), '')
  assert.equal(text(null), '')
  assert.equal(text('texto'), '')
  assert.equal(text({ reasoning: 'solo razonamiento' }), '')
})

test('se leen el finish_reason y el consumo, solo como números', () => {
  const reply = readChatCompletion({
    choices: [{ message: { content: 'x' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020, neurons: 37.5, secreto: 'no' },
  })
  assert.equal(reply.finishReason, 'length')
  assert.deepEqual(reply.usage, { promptTokens: 900, completionTokens: 120, totalTokens: 1020, neurons: 37.5 })

  const sinDatos = readChatCompletion({ choices: [{ message: { content: 'x' } }], usage: { total_tokens: '10' } })
  assert.equal(sinDatos.finishReason, null)
  assert.deepEqual(sinDatos.usage, { promptTokens: null, completionTokens: null, totalTokens: null, neurons: null })
  assert.equal(readChatCompletion({ choices: [] }).usage, null)
})
