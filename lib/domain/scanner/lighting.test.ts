import assert from 'node:assert/strict'
import test from 'node:test'

import { lightingProblem, luma } from './lighting'

test('luz suficiente y repartida: se mide', () => {
  assert.equal(lightingProblem({ meanLuma: 140, leftLuma: 130, rightLuma: 150 }), null)
})

test('poca luz: se avisa en vez de medir', () => {
  assert.equal(lightingProblem({ meanLuma: 40, leftLuma: 40, rightLuma: 40 }), 'dark')
})

test('una mitad del cuerpo mucho más oscura que la otra: luz lateral', () => {
  assert.equal(lightingProblem({ meanLuma: 120, leftLuma: 60, rightLuma: 180 }), 'side_light')
  assert.equal(lightingProblem({ meanLuma: 120, leftLuma: 0, rightLuma: 180 }), 'side_light')
})

test('brillo de un píxel: blanco 255, negro 0', () => {
  assert.equal(Math.round(luma(255, 255, 255)), 255)
  assert.equal(luma(0, 0, 0), 0)
})
