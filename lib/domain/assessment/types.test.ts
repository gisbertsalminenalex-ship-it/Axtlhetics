/**
 * El validador de un test leído de fuera (D-021): forma y coherencia. Lo que no
 * se entiende se descarta antes que compararlo con números falsos.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { recordResult } from './assessment'
import { at, completed, started } from './test-fixtures'
import { isAssessment } from './types'

function roundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

test('un test completado, uno en curso y uno interrumpido sobreviven a JSON y se aceptan', () => {
  const inProgress = recordResult(started('2026-10-04'), 14, at('2026-10-04'))
  const interrupted = { ...inProgress, status: 'interrupted', endedAt: at('2026-10-04').toISOString() }
  assert.equal(isAssessment(roundTrip(completed('2026-10-04'))), true)
  assert.equal(isAssessment(roundTrip(inProgress)), true)
  assert.equal(isAssessment(roundTrip(interrupted)), true)
})

test('se rechaza lo que no es un test', () => {
  for (const value of [null, undefined, 3, 'test', [], {}]) {
    assert.equal(isAssessment(value), false)
  }
})

test('se rechaza un test con un campo roto', () => {
  const base = roundTrip(completed('2026-10-04')) as Record<string, unknown>
  const broken: Record<string, unknown>[] = [
    { ...base, id: '' },
    { ...base, dayKey: '4/10/2026' },
    { ...base, startedAt: 'ayer' },
    { ...base, status: 'done' },
    { ...base, protocolVersion: '1' },
    { ...base, pushUpVariantId: 'flexiones-negativas' },
    { ...base, pendingLeft: -2 },
    { ...base, rest: { startedAt: 'x' } },
  ]
  for (const value of broken) assert.equal(isAssessment(value), false, JSON.stringify(value).slice(0, 80))
})

test('se rechaza un resultado con un valor imposible o de la forma equivocada', () => {
  const base = roundTrip(completed('2026-10-04')) as { results: Record<string, unknown>[] }
  const withResult = (index: number, patch: Record<string, unknown>) => ({
    ...base,
    results: base.results.map((result, i) => (i === index ? { ...result, ...patch } : result)),
  })
  assert.equal(isAssessment(withResult(0, { values: { kind: 'single', value: -3 } })), false)
  assert.equal(isAssessment(withResult(1, { values: { kind: 'single', value: 1.5 } })), false)
  assert.equal(isAssessment(withResult(3, { values: { kind: 'sides', left: 10 } })), false)
  assert.equal(isAssessment(withResult(0, { measure: 'kg' })), false)
  assert.equal(isAssessment(withResult(0, { exerciseId: '' })), false)
})

test('un test completado debe tener exactamente las cuatro pruebas', () => {
  const base = roundTrip(completed('2026-10-04')) as { results: unknown[] }
  assert.equal(isAssessment({ ...base, results: base.results.slice(0, 3) }), false)
})

test('los resultados deben seguir el orden del protocolo', () => {
  const base = roundTrip(completed('2026-10-04')) as { results: unknown[] }
  const [a, b, ...rest] = base.results
  assert.equal(isAssessment({ ...base, results: [b, a, ...rest] }), false)
})

test('en curso no tiene fecha de fin; interrumpido sí', () => {
  const inProgress = roundTrip(started('2026-10-04')) as Record<string, unknown>
  assert.equal(isAssessment({ ...inProgress, endedAt: at('2026-10-04').toISOString() }), false)
  assert.equal(isAssessment({ ...inProgress, status: 'interrupted' }), false)
})
