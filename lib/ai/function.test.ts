import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * La función de Netlify, invocada igual que la invocará el runtime.
 *
 * Solo se prueban los caminos que no salen a la red: sin credencial, método
 * equivocado y cuerpos inválidos. Lo que ocurre al otro lado —cuota, 500,
 * timeout, respuesta ininteligible— se prueba en `gemini-contract.test.ts`, que
 * es donde vive esa lógica precisamente para poder probarla sin llamar a nadie.
 */

import handler, { config } from '../../netlify/functions/axis-ai.mts'
import { RATE_LIMIT } from './gemini-contract'

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
const originalKey = process.env.GEMINI_API_KEY

test.after(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalKey
})

// ---------------------------------------------------------------------------

test('sin credencial configurada responde que la IA no está disponible', async () => {
  delete process.env.GEMINI_API_KEY

  const { status, body } = await call({ method: 'POST', body: validBody() })

  assert.equal(status, 503)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'AI_NOT_CONFIGURED')
})

test('solo acepta POST', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba'

  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { status, body } = await call({ method })
    assert.equal(status, 405, method)
    assert.equal(body.code, 'BAD_REQUEST', method)
  }
})

test('un cuerpo inválido se rechaza antes de llamar a nadie', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba'

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
  process.env.GEMINI_API_KEY = 'clave-de-prueba'

  const enorme = validBody({ briefing: { relleno: 'x'.repeat(70_000) } })
  const { status, body } = await call({ method: 'POST', body: enorme })

  assert.equal(status, 413)
  assert.equal(body.code, 'BAD_REQUEST')
})

test('ninguna respuesta de error lleva detalles internos', async () => {
  delete process.env.GEMINI_API_KEY

  const { body } = await call({ method: 'POST', body: validBody() })
  const serialized = JSON.stringify(body)

  // Ni la clave, ni trazas, ni nada que venga de Google.
  assert.doesNotMatch(serialized, /AIza|apiKey|stack|at Object|google|gemini/i)
  assert.deepEqual(Object.keys(body).sort(), ['code', 'ok'])
})

// ---------------------------------------------------------------------------
// Quién puede llamar
// ---------------------------------------------------------------------------

test('una petición sin Origin ni Referer se rechaza, aunque haya credencial', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba'

  const response = await handler(new Request(ENDPOINT, { method: 'POST', body: validBody() }))
  const body = await response.json()

  assert.equal(response.status, 403)
  assert.equal(body.code, 'FORBIDDEN')
})

test('una petición desde otro sitio se rechaza antes de mirar nada más', async () => {
  delete process.env.GEMINI_API_KEY

  for (const origin of ['https://otro-sitio.com', 'https://axthletics.netlify.app.evil.com', 'null']) {
    const { status, body } = await call({ method: 'POST', body: validBody(), headers: { origin } })
    assert.equal(status, 403, origin)
    // Sin credencial habría sido 503: el origen se comprueba antes, y el de
    // fuera no se entera de si hay IA configurada.
    assert.equal(body.code, 'FORBIDDEN', origin)
  }
})

test('el navegador delata una llamada cross-site aunque Origin cuadre', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba'

  const { status, body } = await call({
    method: 'POST',
    body: validBody(),
    headers: { origin: SITE, 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(status, 403)
  assert.equal(body.code, 'FORBIDDEN')
})

test('la propia aplicación pasa el filtro de origen aunque el entorno no diga nada', async () => {
  delete process.env.GEMINI_API_KEY
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
  assert.doesNotMatch(JSON.stringify(body), /origin|host|netlify|gemini/i)
})
