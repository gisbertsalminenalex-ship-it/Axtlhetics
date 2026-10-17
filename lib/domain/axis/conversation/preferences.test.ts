import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyDayMemory, rememberAnswer } from '../memory'
import { detectDiscomfortZone, detectPreference } from './preferences'

test('D-037: «no me gustan las zancadas» es una preferencia sobre un ejercicio concreto', () => {
  assert.deepEqual(detectPreference('no me gustan las zancadas'), { exerciseId: 'zancadas', name: 'Zancadas', liked: false })
  assert.equal(detectPreference('odio el superman')?.exerciseId, 'superman')
  assert.deepEqual(detectPreference('ya me gustan las zancadas'), { exerciseId: 'zancadas', name: 'Zancadas', liked: true })
})

test('D-037: sin un ejercicio concreto, o sin decir que no gusta, no es una preferencia', () => {
  assert.equal(detectPreference('no me gusta entrenar por la mañana'), null)
  assert.equal(detectPreference('¿cómo se hacen las zancadas?'), null)
  assert.equal(detectPreference('hoy no quiero hacer piernas'), null)
})

test('D-037: la zona de una molestia se reconoce, y se apunta una vez por zona y día', () => {
  assert.equal(detectDiscomfortZone('me duele la rodilla'), 'rodilla')
  assert.equal(detectDiscomfortZone('tengo molestias en las lumbares'), 'espalda')
  assert.equal(detectDiscomfortZone('me duele'), null)

  const message = { id: 'm1', role: 'axis' as const, text: '…', createdAt: '2026-10-17T10:00:00.000Z' }
  let memory = emptyDayMemory('2026-10-17')
  memory = rememberAnswer(memory, message, { intent: 'medical', discomfort: 'rodilla' }, '2026-10-17T10:00:00.000Z')
  memory = rememberAnswer(memory, { ...message, id: 'm2' }, { intent: 'medical', discomfort: 'rodilla' }, '2026-10-17T11:00:00.000Z')
  assert.deepEqual(memory.discomforts, [{ zone: 'rodilla', at: '2026-10-17T10:00:00.000Z' }])
})
