import assert from 'node:assert/strict'
import test from 'node:test'

import { matchIntent } from './intents'
import {
  buildReinterpretRequest,
  presentReinterpreted,
  readReinterpretation,
  REINTERPRET_EXAMPLES,
  REINTERPRET_NONE,
} from './reinterpret'
import type { AxisAnswer } from './types'

test('D-028: las frases de ejemplo del prompt las entiende el determinista', () => {
  for (const example of REINTERPRET_EXAMPLES) {
    assert.notEqual(matchIntent(example, null).intent, 'unknown', example)
  }
})

const UNKNOWN: AxisAnswer = { text: 'No he entendido a qué te refieres.', intent: 'unknown', unknown: true }

test('D-028: del dispositivo solo sale el mensaje, sin briefing', () => {
  const request = buildReinterpretRequest('ando fundido', UNKNOWN)
  assert.equal(request.question, 'ando fundido')
  assert.deepEqual(request.briefing, {})
  assert.equal(request.domain.intent, 'unknown')
  assert.equal(request.domain.proposedTarget, null)
  assert.match(request.system, new RegExp(REINTERPRET_NONE))
})

test('D-028: una reescritura limpia vuelve tal cual, sin exclamaciones ni comillas', () => {
  assert.equal(readReinterpretation('ando fundido', 'Estoy muy cansado.'), 'Estoy muy cansado.')
  assert.equal(readReinterpretation('ando fundido', '¡Estoy «muy» cansado!'), 'Estoy muy cansado')
})

test('D-028: no vale si no se entendió, si es larga o rara, o si trae una cifra nueva', () => {
  assert.equal(readReinterpretation('blablabla', REINTERPRET_NONE), null)
  assert.equal(readReinterpretation('ando fundido', ''), null)
  assert.equal(readReinterpretation('ando fundido', 'Estoy cansado '.repeat(20)), null)
  assert.equal(readReinterpretation('ando fundido', 'Estoy cansado 😴'), null)
  assert.equal(readReinterpretation('ando fundido', 'Estoy cansado.\nY tengo hambre.'), null)
  assert.equal(readReinterpretation('tengo poco rato', 'Tengo 20 minutos.'), null)
  // Una cifra que el usuario sí escribió se conserva.
  assert.equal(readReinterpretation('tengo 20 min na mas', 'Solo tengo 20 minutos.'), 'Solo tengo 20 minutos.')
})

test('D-028: se dice cómo se entendió, al final, y no se aprende nada de una suposición', () => {
  const answer: AxisAnswer = {
    text: 'Hoy lo dejamos en recuperación.',
    intent: 'tired',
    unknown: false,
    cancelledActivities: ['activity-1'],
    reportedLoad: { kind: 'sport', label: 'baloncesto' } as unknown as AxisAnswer['reportedLoad'],
  }
  const shown = presentReinterpreted(answer, 'Estoy muy cansado.')

  assert.equal(shown.text, 'Hoy lo dejamos en recuperación. Te he entendido como «Estoy muy cansado».')
  assert.equal(shown.intent, 'tired')
  assert.equal('cancelledActivities' in shown, false)
  assert.equal('reportedLoad' in shown, false)
})
