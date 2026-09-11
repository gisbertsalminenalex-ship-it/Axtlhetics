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

import handler from '../../netlify/functions/axis-ai.mts'

const ENDPOINT = 'https://axthletics.netlify.app/.netlify/functions/axis-ai'

function validBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    system: 'Eres AXIS.',
    question: '¿Por qué no piernas hoy?',
    briefing: { dayKey: '2026-09-11' },
    domain: { text: 'Porque hoy tienes baloncesto.', intent: 'why_not', proposedTarget: null },
    ...overrides,
  })
}

async function call(init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handler(new Request(ENDPOINT, init))
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
