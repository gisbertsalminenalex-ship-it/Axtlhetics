import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AXIS_AI_MODEL,
  MAX_COMPLETION_TOKENS,
  PROVIDER_ENDPOINT,
  PROVIDER_TIMEOUT_MS,
  buildProviderRequest,
  readProviderText,
  MAX_REQUEST_BYTES,
  PROXY_HEADERS,
  buildUserPayload,
  errorCodeFor,
  parseModelText,
  parseProxyRequest,
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
// Errores
// ---------------------------------------------------------------------------

test('cualquier fallo del proveedor se convierte en un único código propio', () => {
  // 429, 500, timeout o red caída: para el cliente son lo mismo, cae al
  // determinista. Distinguirlos solo filtraría información de Google.
  const causas: unknown[] = [
    { status: 429 },
    { status: 500 },
    { status: 400, message: 'API key not valid' },
    new Error('fetch failed'),
    { name: 'AbortError' },
    null,
    undefined,
  ]

  for (const causa of causas) {
    assert.equal(errorCodeFor(causa), 'AI_UNAVAILABLE')
  }
})

test('ningún código de error filtra detalles del proveedor', () => {
  for (const causa of [{ status: 429, message: 'Quota exceeded for project 12345' }]) {
    const code = errorCodeFor(causa)
    assert.doesNotMatch(code, /quota|project|12345|groq|google|gemini/i)
  }
})

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

test('el modelo está definido en un único sitio y es de producción en el plan gratuito de Groq', () => {
  assert.match(AXIS_AI_MODEL, /^openai\/gpt-oss-(120b|20b)$/, 'esta fase se mantiene en el nivel gratuito')
  assert.equal(PROVIDER_ENDPOINT, 'https://api.groq.com/openai/v1/chat/completions')
})

test('hay límites de tamaño y de tiempo', () => {
  assert.ok(MAX_REQUEST_BYTES > 0 && MAX_REQUEST_BYTES <= 256 * 1024)
  assert.ok(PROVIDER_TIMEOUT_MS > 0 && PROVIDER_TIMEOUT_MS <= 15000)
  assert.ok(MAX_COMPLETION_TOKENS >= 200 && MAX_COMPLETION_TOKENS <= 2000)
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

test('la petición al proveedor lleva la personalidad como sistema y el briefing como usuario, en JSON', () => {
  const request = parseProxyRequest({
    system: 'Eres AXIS.',
    question: '¿Por qué no piernas?',
    briefing: { dayKey: '2026-09-19' },
    domain: { text: 'Porque sí.', intent: 'why_not', proposedTarget: null },
  })!
  const body = buildProviderRequest(request, 'openai/gpt-oss-120b')

  assert.equal(body.model, 'openai/gpt-oss-120b')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Eres AXIS.' },
    { role: 'user', content: buildUserPayload(request) },
  ])
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.equal(body.temperature, 0.4)
  assert.equal(body.max_completion_tokens, MAX_COMPLETION_TOKENS)
  assert.equal(body.reasoning_effort, 'low', 'los gpt-oss razonan: se pide el mínimo')
  assert.equal('tools' in body, false, 'AXIS no usa herramientas')
})

test('el esfuerzo de razonamiento solo se pide a los modelos que lo admiten', () => {
  const request = parseProxyRequest({ system: 's', question: 'q', briefing: {}, domain: { text: 't', intent: 'why' } })!
  assert.equal('reasoning_effort' in buildProviderRequest(request, 'llama-3.1-8b-instant'), false)
  assert.equal(buildProviderRequest(request, 'openai/gpt-oss-20b').reasoning_effort, 'low')
})

test('el texto del modelo se lee de choices[0].message.content y nada más', () => {
  assert.equal(readProviderText({ choices: [{ message: { content: '{"message":"Hola."}', reasoning: 'x' } }] }), '{"message":"Hola."}')
  assert.equal(readProviderText({ choices: [] }), '')
  assert.equal(readProviderText({ choices: [{ message: { content: null } }] }), '')
  assert.equal(readProviderText({ choices: [{ message: {} }] }), '')
  assert.equal(readProviderText(null), '')
  assert.equal(readProviderText('texto'), '')
  assert.equal(readProviderText({ reasoning: 'solo razonamiento' }), '')
})
