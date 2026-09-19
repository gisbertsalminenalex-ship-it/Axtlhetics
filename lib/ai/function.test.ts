import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * La función de Netlify, invocada igual que la invocará el runtime.
 *
 * Solo se prueban los caminos que no salen a la red: sin credencial, método
 * equivocado y cuerpos inválidos. Lo que ocurre al otro lado —cuota, 500,
 * timeout, respuesta ininteligible— se prueba en `provider-contract.test.ts`, que
 * es donde vive esa lógica precisamente para poder probarla sin llamar a nadie.
 */

import handler, { config } from '../../netlify/functions/axis-ai.mts'
import { AXIS_AI_MODEL, PROVIDER_ENDPOINT, RATE_LIMIT } from './provider-contract'

const SITE = 'https://axthletics.netlify.app'
const ENDPOINT = `${SITE}/.netlify/functions/axis-ai`

function validBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    system: 'Eres AXIS.',
    question: '¿Por qué no piernas hoy?',
    briefing: { dayKey: '2026-09-11' },
    domain: { text: 'Porque hoy tienes baloncesto.', intent: 'why_not', proposedTarget: null },
    ...overrides,
  })
}

/** Como llama el navegador desde la propia app: con su Origin. */
async function call(init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init.headers)
  if (!headers.has('origin')) headers.set('origin', SITE)
  const response = await handler(new Request(ENDPOINT, { ...init, headers }))
  return { status: response.status, body: await response.json() }
}

/** Se restaura al final para no contaminar otros tests del mismo proceso. */
const originalKey = process.env.GROQ_API_KEY

test.after(() => {
  if (originalKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalKey
})

// ---------------------------------------------------------------------------

test('sin credencial configurada responde que la IA no está disponible', async () => {
  delete process.env.GROQ_API_KEY

  const { status, body } = await call({ method: 'POST', body: validBody() })

  assert.equal(status, 503)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'AI_NOT_CONFIGURED')
})

test('solo acepta POST', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { status, body } = await call({ method })
    assert.equal(status, 405, method)
    assert.equal(body.code, 'BAD_REQUEST', method)
  }
})

test('un cuerpo inválido se rechaza antes de llamar a nadie', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  const cuerposMalos = [
    'no soy json',
    '{roto',
    JSON.stringify({}),
    validBody({ domain: undefined }),
    validBody({ question: '   ' }),
    validBody({ briefing: null }),
    validBody({ system: '' }),
  ]

  for (const cuerpo of cuerposMalos) {
    const { status, body } = await call({ method: 'POST', body: cuerpo })
    assert.equal(status, 400, cuerpo.slice(0, 40))
    assert.equal(body.code, 'BAD_REQUEST')
  }
})

test('una petición desmesurada se corta por tamaño', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  const enorme = validBody({ briefing: { relleno: 'x'.repeat(70_000) } })
  const { status, body } = await call({ method: 'POST', body: enorme })

  assert.equal(status, 413)
  assert.equal(body.code, 'BAD_REQUEST')
})

test('ninguna respuesta de error lleva detalles internos', async () => {
  delete process.env.GROQ_API_KEY

  const { body } = await call({ method: 'POST', body: validBody() })
  const serialized = JSON.stringify(body)

  // Ni la clave, ni trazas, ni nada que venga de Google.
  assert.doesNotMatch(serialized, /gsk_|AIza|apiKey|stack|at Object|groq|google|gemini/i)
  assert.deepEqual(Object.keys(body).sort(), ['code', 'ok'])
})

// ---------------------------------------------------------------------------
// Quién puede llamar
// ---------------------------------------------------------------------------

test('una petición sin Origin ni Referer se rechaza, aunque haya credencial', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  const response = await handler(new Request(ENDPOINT, { method: 'POST', body: validBody() }))
  const body = await response.json()

  assert.equal(response.status, 403)
  assert.equal(body.code, 'FORBIDDEN')
})

test('una petición desde otro sitio se rechaza antes de mirar nada más', async () => {
  delete process.env.GROQ_API_KEY

  for (const origin of ['https://otro-sitio.com', 'https://axthletics.netlify.app.evil.com', 'null']) {
    const { status, body } = await call({ method: 'POST', body: validBody(), headers: { origin } })
    assert.equal(status, 403, origin)
    // Sin credencial habría sido 503: el origen se comprueba antes, y el de
    // fuera no se entera de si hay IA configurada.
    assert.equal(body.code, 'FORBIDDEN', origin)
  }
})

test('el navegador delata una llamada cross-site aunque Origin cuadre', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  const { status, body } = await call({
    method: 'POST',
    body: validBody(),
    headers: { origin: SITE, 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(status, 403)
  assert.equal(body.code, 'FORBIDDEN')
})

test('la propia aplicación pasa el filtro de origen aunque el entorno no diga nada', async () => {
  delete process.env.GROQ_API_KEY
  delete process.env.URL

  // Mismo host que la URL de la función: pasa el origen y llega hasta la credencial.
  const { status, body } = await call({ method: 'POST', body: validBody(), headers: { origin: SITE } })
  assert.equal(status, 503)
  assert.equal(body.code, 'AI_NOT_CONFIGURED')

  // Un Referer del propio sitio también vale.
  const viaReferer = await handler(
    new Request(ENDPOINT, { method: 'POST', body: validBody(), headers: { referer: `${SITE}/` } }),
  )
  assert.equal(viaReferer.status, 503)
})

test('la función declara el límite de tasa nativo de Netlify por IP y dominio', () => {
  assert.deepEqual(config, {
    rateLimit: {
      windowLimit: RATE_LIMIT.windowLimit,
      windowSize: RATE_LIMIT.windowSize,
      aggregateBy: ['ip', 'domain'],
      action: 'rate_limit',
    },
  })
  assert.equal('path' in config, false, 'sin path: rompía netlify dev')
})

test('el rechazo por origen tampoco filtra nada', async () => {
  const response = await handler(new Request(ENDPOINT, { method: 'POST', body: validBody() }))
  const body = await response.json()
  assert.deepEqual(Object.keys(body).sort(), ['code', 'ok'])
  assert.doesNotMatch(JSON.stringify(body), /origin|host|netlify|groq|gemini/i)
})

// ---------------------------------------------------------------------------
// Hablar con el proveedor (la red se sustituye por un fetch falso)
// ---------------------------------------------------------------------------

type Captured = { url: string; init: RequestInit }

/** Sustituye `fetch` durante una prueba y recuerda lo que se le pidió. */
async function withProvider(
  reply: (captured: Captured) => Response | Promise<Response>,
  run: (captured: Captured[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  const captured: Captured[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = { url: String(input), init: init ?? {} }
    captured.push(entry)
    return reply(entry)
  }) as typeof fetch
  try {
    await run(captured)
  } finally {
    globalThis.fetch = original
  }
}

function providerReply(content: string): Response {
  return new Response(
    JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion', model: AXIS_AI_MODEL, choices: [{ index: 0, message: { role: 'assistant', content, reasoning: 'pensando…' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

test('llama a Groq con el modelo, la credencial en cabecera y el formato de chat', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'

  await withProvider(
    () => providerReply('{"message":"Hoy toca tren superior.","action":null}'),
    async (captured) => {
      const { status, body } = await call({ method: 'POST', body: validBody() })
      assert.equal(status, 200)
      assert.deepEqual(body, { text: 'Hoy toca tren superior.', action: null })

      assert.equal(captured.length, 1)
      const [request] = captured
      assert.equal(request.url, PROVIDER_ENDPOINT)
      assert.equal(request.init.method, 'POST')
      const headers = new Headers(request.init.headers)
      assert.equal(headers.get('authorization'), 'Bearer clave-de-prueba')
      assert.equal(headers.get('content-type'), 'application/json')
      assert.equal(request.url.includes('clave-de-prueba'), false, 'la clave nunca va en la URL')

      const sent = JSON.parse(String(request.init.body))
      assert.equal(sent.model, AXIS_AI_MODEL)
      assert.equal(sent.messages[0].role, 'system')
      assert.equal(sent.messages[0].content, 'Eres AXIS.')
      assert.equal(sent.messages[1].role, 'user')
      assert.match(sent.messages[1].content, /"question":"¿Por qué no piernas hoy\?"/)
      assert.match(sent.messages[1].content, /"domain":\{"text":"Porque hoy tienes baloncesto\."/)
      assert.deepEqual(sent.response_format, { type: 'json_object' })
    },
  )
})

test('la acción del modelo viaja tal cual: la valida el dominio, no la función', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'
  await withProvider(
    () => providerReply('{"message":"Cambio a tren superior.","action":{"type":"change_training","target":{"type":"MODIFIED_TRAINING","focus":"tren_superior"}}}'),
    async () => {
      const { status, body } = await call({ method: 'POST', body: validBody() })
      assert.equal(status, 200)
      assert.deepEqual(body.action, { type: 'change_training', target: { type: 'MODIFIED_TRAINING', focus: 'tren_superior' } })
    },
  )
})

test('un error de la API —cuota, 500, 401— es AI_UNAVAILABLE sin detalles', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'
  for (const providerStatus of [429, 500, 401]) {
    await withProvider(
      () => new Response(JSON.stringify({ error: { message: 'Rate limit reached for org_123 on model x', type: 'tokens' } }), { status: providerStatus }),
      async () => {
        const { status, body } = await call({ method: 'POST', body: validBody() })
        assert.equal(status, 502, String(providerStatus))
        assert.equal(body.code, 'AI_UNAVAILABLE')
        assert.doesNotMatch(JSON.stringify(body), /org_123|rate limit|tokens/i)
      },
    )
  }
})

test('un timeout o una red caída también es AI_UNAVAILABLE', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'
  for (const failure of [Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }), new TypeError('fetch failed')]) {
    await withProvider(
      () => Promise.reject(failure),
      async () => {
        const { status, body } = await call({ method: 'POST', body: validBody() })
        assert.equal(status, 502)
        assert.equal(body.code, 'AI_UNAVAILABLE')
      },
    )
  }
})

test('una respuesta que no se entiende es AI_BAD_RESPONSE', async () => {
  process.env.GROQ_API_KEY = 'clave-de-prueba'
  const malas = [
    providerReply(''),
    providerReply('esto no es json'),
    providerReply('{"sin_message":true}'),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }),
  ]
  for (const reply of malas) {
    await withProvider(
      () => reply,
      async () => {
        const { status, body } = await call({ method: 'POST', body: validBody() })
        assert.equal(status, 502)
        assert.equal(body.code, 'AI_BAD_RESPONSE')
      },
    )
  }
})

test('sin credencial no se llama al proveedor', async () => {
  delete process.env.GROQ_API_KEY
  await withProvider(
    () => providerReply('{"message":"no debería llegar","action":null}'),
    async (captured) => {
      const { status, body } = await call({ method: 'POST', body: validBody() })
      assert.equal(status, 503)
      assert.equal(body.code, 'AI_NOT_CONFIGURED')
      assert.equal(captured.length, 0)
    },
  )
})
