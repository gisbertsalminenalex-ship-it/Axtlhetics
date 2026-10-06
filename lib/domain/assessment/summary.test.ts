/**
 * Lo que se enseña de un test (D-021): el resumen y su fila en el historial.
 * Las reglas de comparación ya se prueban en `compare.test.ts`; aquí, que lo
 * pintado sale de ellas y con los textos aprobados.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { interruptAssessment, recordResult } from './assessment'
import { assessmentHistory, summarizeAssessment } from './summary'
import { at, completed, started, type TestValues } from './test-fixtures'

const SEPT: TestValues = { push: 11, core: 56, legs: 62, pull: [10, 12] }

test('el primer test es la primera referencia: línea base en todo, sin comparación inventada', () => {
  const first = completed('2026-09-05', SEPT)
  const summary = summarizeAssessment(first, [first])
  assert.ok(summary)
  assert.equal(summary.isFirst, true)
  assert.ok(summary.rows.every((row) => row.delta === 'Línea base' && row.trend === null && row.previous === null))
  assert.deepEqual(summary.rows.map((row) => row.value), ['11 reps', '56 s', '62 s', '10 / 12 reps'])
})

test('un test posterior: diferencia firmada, «No cambio» exacto y «−» real', () => {
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', { push: 14, core: 56, legs: 54, pull: [12, 12] })
  const summary = summarizeAssessment(oct, [sept, oct])
  assert.ok(summary)
  assert.equal(summary.isFirst, false)
  const byKey = Object.fromEntries(summary.rows.map((row) => [row.key, row]))
  assert.equal(byKey.push.delta, '+3 reps')
  assert.equal(byKey.core.delta, 'No cambio')
  assert.equal(byKey.legs.delta, '−8 s')
  assert.ok(!byKey.legs.delta.includes('-'))
  assert.equal(byKey.pull.delta, 'Mixto · +2 / 0')
  assert.equal(byKey.legs.previous, '62 s')
})

test('remo: un lado que baja con el otro igual es «Mixto · −1 / 0»', () => {
  const sept = completed('2026-09-05', SEPT)
  const oct = completed('2026-10-04', { ...SEPT, pull: [9, 12] })
  const pull = summarizeAssessment(oct, [sept, oct])?.rows.find((row) => row.key === 'pull')
  assert.equal(pull?.delta, 'Mixto · −1 / 0')
})

test('la mejor marca es la del test, por variante y por lado, independiente del entrenamiento', () => {
  const aug = completed('2026-08-01', { push: 9, core: 70, legs: 40, pull: [12, 9] })
  const sept = completed('2026-09-05', SEPT)
  const summary = summarizeAssessment(sept, [aug, sept])
  const best = Object.fromEntries((summary?.rows ?? []).map((row) => [row.key, row.best]))
  assert.deepEqual(best, { push: '11 reps', core: '70 s', legs: '62 s', pull: '12 / 12 reps' })
})

test('las flexiones se nombran por su variante', () => {
  const first = completed('2026-09-05', SEPT, 'flexiones')
  assert.equal(summarizeAssessment(first, [first])?.rows[0].name, 'Flexiones')
  const incline = completed('2026-09-05', SEPT, 'flexiones-inclinadas')
  assert.equal(summarizeAssessment(incline, [incline])?.rows[0].name, 'Flexiones inclinadas')
})

test('un test sin completar no tiene resumen', () => {
  assert.equal(summarizeAssessment(recordResult(started('2026-10-04'), 14, at('2026-10-04')), []), null)
})

test('el historial: del más reciente al más antiguo; los interrumpidos sin comparación; sin los de en curso', () => {
  const outcome = interruptAssessment(recordResult(started('2026-09-20'), 14, at('2026-09-20')), at('2026-09-20'))
  assert.equal(outcome.kind, 'interrupted')
  const interrupted = outcome.kind === 'interrupted' ? outcome.assessment : completed('2026-09-20')
  const entries = assessmentHistory([
    completed('2026-08-01'),
    interrupted,
    completed('2026-09-05'),
    started('2026-10-04'),
  ])
  assert.deepEqual(entries.map((entry) => [entry.dayKey, entry.status]), [
    ['2026-09-20', 'interrupted'],
    ['2026-09-05', 'completed'],
    ['2026-08-01', 'completed'],
  ])
  assert.equal(entries[0].summary, null)
  assert.equal(entries[0].testsDone, 1)
  assert.equal(entries[2].summary?.isFirst, true)
  assert.equal(entries[1].summary?.isFirst, false)
})
