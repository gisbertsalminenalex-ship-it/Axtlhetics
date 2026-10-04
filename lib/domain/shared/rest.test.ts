/**
 * El descanso como dos instantes (D-019), compartido por el entrenamiento y el
 * test de evolución (D-021).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { extendRestWindow, restRemaining, startRestWindow } from './rest'

const NOW = new Date('2026-10-04T18:00:00.000Z')
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)

test('un descanso guarda cuándo empieza y cuándo acaba', () => {
  assert.deepEqual(startRestWindow(90, NOW), {
    startedAt: '2026-10-04T18:00:00.000Z',
    endsAt: '2026-10-04T18:01:30.000Z',
  })
})

test('lo que queda se redondea hacia arriba y desaparece al acabar', () => {
  const rest = startRestWindow(90, NOW)
  assert.deepEqual(restRemaining(rest, NOW), { remainingSeconds: 90, totalSeconds: 90 })
  assert.equal(restRemaining(rest, new Date(NOW.getTime() + 89_500))?.remainingSeconds, 1)
  assert.equal(restRemaining(rest, later(90)), null)
  assert.equal(restRemaining(null, NOW), null)
  assert.equal(restRemaining({ startedAt: 'x', endsAt: 'y' }, NOW), null)
})

test('alargar suma al final y a la duración total; uno terminado no se alarga', () => {
  const rest = startRestWindow(90, NOW)
  const extended = extendRestWindow(rest, 15, later(30))
  assert.deepEqual(restRemaining(extended, later(30)), { remainingSeconds: 75, totalSeconds: 105 })
  assert.equal(extendRestWindow(rest, 15, later(91)), null)
})
