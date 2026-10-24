import assert from 'node:assert/strict'
import test from 'node:test'

import { CRISIS_TEXT, detectCrisis } from './crisis'

test('D-070: reconoce cuando habla de hacerse daño o de no querer vivir', () => {
  for (const message of [
    'a veces pienso en el suicidio',
    'Me quiero morir',
    'no quiero seguir viviendo',
    'quiero hacerme daño',
    'estoy pensando en acabar con todo',
    'creo que estaría mejor muerto',
    '¿y si me corto?',
  ]) {
    assert.equal(detectCrisis(message), true, message)
  }
})

test('D-070: no salta con el cansancio de siempre', () => {
  for (const message of ['me muero de agujetas', 'esta rutina me mata', 'estoy muerto de cansancio', 'hoy no tengo ganas de entrenar', 'me corté el pelo ayer']) {
    assert.equal(detectCrisis(message), false, message)
  }
})

test('D-070: la respuesta da el 024 y el 112, sin exclamaciones', () => {
  assert.match(CRISIS_TEXT, /024/)
  assert.match(CRISIS_TEXT, /112/)
  assert.doesNotMatch(CRISIS_TEXT, /[!¡]/)
})
