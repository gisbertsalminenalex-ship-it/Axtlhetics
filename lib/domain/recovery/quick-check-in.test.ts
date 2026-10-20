/**
 * «¿Cómo llegas hoy?» (D-049): el sueño en cinco tramos y que tres toques
 * bastan para tener recuperación.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { QUICK_SLEEP_OPTIONS, quickSleepOptionOf } from './scales'
import { computeRecoveryScore } from './score'
import { emptyRecoveryInputs } from './types'

test('cada tramo de sueño se guarda como su punto medio, y lo guardado vuelve a su tramo', () => {
  assert.deepEqual(QUICK_SLEEP_OPTIONS.map((option) => option.hours), [5.5, 6.5, 7.5, 8.5, 9.5])
  for (const option of QUICK_SLEEP_OPTIONS) assert.equal(quickSleepOptionOf(option.hours)?.label, option.label)
  // Lo registrado en Recuperación con la cifra exacta también cae en su tramo.
  assert.equal(quickSleepOptionOf(4)?.label, '<6 h')
  assert.equal(quickSleepOptionOf(8)?.label, '8–9')
  assert.equal(quickSleepOptionOf(11)?.label, '9+')
  assert.equal(quickSleepOptionOf(null), null)
})

test('sueño, energía y fatiga bastan para calcular la recuperación (D-009)', () => {
  const empty = emptyRecoveryInputs('2026-10-20', '2026-10-20T08:00:00.000Z')
  assert.equal(computeRecoveryScore(empty, { age: 15 }).status, 'insufficient_data')
  const answered = { ...empty, sleepHours: 8.5, energy: 4 as const, muscleFatigue: 2 as const }
  assert.equal(computeRecoveryScore(answered, { age: 15 }).status, 'ok')
})
