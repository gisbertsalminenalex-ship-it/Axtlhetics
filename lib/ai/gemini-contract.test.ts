import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AXIS_AI_MODEL,
  GEMINI_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  PROXY_HEADERS,
  buildUserPayload,
  errorCodeFor,
  parseModelText,
  parseProxyRequest,
} from './gemini-contract'

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
    assert.doesNotMatch(code, /quota|project|12345|google|gemini/i)
  }
})

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

test('el modelo está definido en un único sitio y es un Flash', () => {
  assert.match(AXIS_AI_MODEL, /flash/i, 'esta fase se mantiene en el nivel gratuito')
})

test('hay límites de tamaño y de tiempo', () => {
  assert.ok(MAX_REQUEST_BYTES > 0 && MAX_REQUEST_BYTES <= 256 * 1024)
  assert.ok(GEMINI_TIMEOUT_MS > 0 && GEMINI_TIMEOUT_MS <= 15000)
})

test('la respuesta del proxy nunca se cachea', () => {
  assert.equal(PROXY_HEADERS['Cache-Control'], 'no-store')
})
