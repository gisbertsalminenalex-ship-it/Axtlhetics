/**
 * La nota de salud (D-064): lo que el usuario escribe, leído por el modelo o,
 * sin él, en el dispositivo; siempre convertido en zonas y señales conocidas.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { parseProxyRequest } from '../../ai/provider-contract'
import {
  buildHealthNoteRequest,
  createHealthNoteReader,
  describeHealthReading,
  detectHealthNote,
  hasNewFlag,
  mergeZones,
  readHealthNoteReply,
} from './health-note'
import { isHealthScreen, MAX_HEALTH_NOTE_LENGTH } from './screening'

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

test('la petición cumple el contrato de la ruta y solo lleva la nota', () => {
  const request = buildHealthNoteRequest('  Me operaron de la rodilla  ')
  assert.ok(parseProxyRequest(request))
  assert.equal(request.question, 'Me operaron de la rodilla')
  assert.deepEqual(request.briefing, {})
  assert.equal(request.domain.intent, 'health_note')
})

test('la respuesta del modelo solo deja pasar identificadores conocidos, en orden', () => {
  const reading = readHealthNoteReply({ text: 'ok', action: { zones: ['hombro', 'rodilla', 'pie'], flags: ['inventada', 'corazon'] } })
  assert.deepEqual(reading, { zones: ['rodilla', 'hombro'], flags: ['corazon'], source: 'model' })
  assert.equal(readHealthNoteReply({ text: 'ok', action: null }), null)
  assert.equal(readHealthNoteReply({ text: 'ok', action: { zones: 'rodilla', flags: [] } }), null)
})

test('sin modelo, la nota se lee con una lista de palabras', () => {
  assert.deepEqual(detectHealthNote('Tengo una hernia discal y me duele la rodilla izquierda'), {
    zones: ['rodilla', 'espalda_baja'],
    flags: ['huesos_articulaciones'],
    source: 'local',
  })
  assert.deepEqual(detectHealthNote('Soy hipertenso y tomo pastillas').flags, ['corazon', 'medicacion'])
  assert.deepEqual(detectHealthNote('A veces me mareo al levantarme').flags, ['mareos'])
  assert.deepEqual(detectHealthNote('Duermo poco'), { zones: [], flags: [], source: 'local' })
})

test('el lector usa al modelo y, si falla, lee en el dispositivo', async () => {
  const model = createHealthNoteReader('/api/axis-ai', reply({ text: 'ok', action: { zones: ['cuello'], flags: [] } }))
  assert.deepEqual(await model('Tengo contracturas cervicales'), { zones: ['cuello'], flags: [], source: 'model' })

  const down = createHealthNoteReader('/api/axis-ai', reply({ ok: false, code: 'AI_UNAVAILABLE' }, 502))
  assert.equal((await down('Me duele el hombro')).source, 'local')
  assert.deepEqual((await down('Me duele el hombro')).zones, ['hombro'])

  const offline = createHealthNoteReader('/api/axis-ai', (async () => {
    throw new TypeError('Failed to fetch')
  }) as unknown as typeof fetch)
  assert.deepEqual((await offline('Me duele el codo')).zones, ['codo'])

  const garbage = createHealthNoteReader('/api/axis-ai', reply({ text: 'ok', action: null }))
  assert.equal((await garbage('Me duele el tobillo')).source, 'local')
})

test('las zonas leídas se suman a las que había y una señal nueva pide visto bueno', () => {
  assert.deepEqual(mergeZones(['hombro'], ['rodilla', 'hombro']), ['rodilla', 'hombro'])
  assert.equal(hasNewFlag(['corazon'], ['corazon']), false)
  assert.equal(hasNewFlag(['corazon'], ['corazon', 'mareos']), true)
})

test('lo entendido se cuenta en frases cortas', () => {
  assert.deepEqual(describeHealthReading({ zones: ['rodilla'], flags: [] }), [
    'Cuidaré tu rodilla: dejo fuera los ejercicios que cargan esa zona.',
  ])
  assert.deepEqual(describeHealthReading({ zones: [], flags: ['corazon', 'medicacion'] }), [
    'Me cuentas algo de corazón o tensión arterial y medicación.',
  ])
  assert.match(describeHealthReading({ zones: [], flags: [] })[0], /No he encontrado nada/)
})

test('la nota se guarda con el resto de la salud, con un tope de longitud', () => {
  assert.ok(isHealthScreen({ flags: [], cleared: false, note: 'Me duele la rodilla' }))
  assert.ok(isHealthScreen({ flags: [], cleared: false }))
  assert.ok(!isHealthScreen({ flags: [], cleared: false, note: 'x'.repeat(MAX_HEALTH_NOTE_LENGTH + 1) }))
  assert.ok(!isHealthScreen({ flags: [], cleared: false, note: 3 }))
})
