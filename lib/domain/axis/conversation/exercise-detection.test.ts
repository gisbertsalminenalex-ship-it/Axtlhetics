/**
 * AXIS reconoce los ejercicios por su nombre (D-020).
 *
 * Con el catálogo ampliado, varios ejercicios comparten la primera palabra. Quien
 * pregunta por «el puente» sigue hablando del básico, no de su variante, y cada
 * ejercicio se reconoce por su nombre completo.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG } from '../../workouts/catalog'
import { detectExercise, matchIntent } from './intents'

test('cada ejercicio del catálogo se reconoce por su nombre completo', () => {
  for (const exercise of EXERCISE_CATALOG) {
    const question = `¿Cómo se hace ${exercise.name.toLowerCase()}?`
    assert.equal(matchIntent(question).intent, 'exercise', question)
    assert.equal(detectExercise(question)?.id, exercise.id, question)
  }
})

test('nombrar solo la primera palabra lleva al ejercicio básico, no a su variante', () => {
  const cases: [string, string][] = [
    ['¿Cómo hago el puente?', 'puente-gluteos'],
    ['¿Cómo se hace la sentadilla?', 'sentadilla'],
    ['¿Cómo se hace la plancha?', 'plancha'],
    ['¿Cómo hago flexiones?', 'flexiones'],
    ['¿Cómo hago una flexión?', 'flexiones'],
    ['¿Cómo hago la zancada?', 'zancadas'],
    ['¿Cómo hago la elevación?', 'elevacion-gemelos'],
  ]
  for (const [question, id] of cases) {
    assert.equal(detectExercise(question)?.id, id, question)
  }
})

test('una palabra demasiado corta para ser raíz no se adivina', () => {
  // «press» se queda en «pres», que no llega a cinco letras: igual que antes de D-020.
  assert.equal(detectExercise('¿Cómo hago el press?'), null)
})
