import assert from 'node:assert/strict'
import test from 'node:test'

import { bestSetOf, targetProgress } from '../workouts/targets'
import { isFirstCompletedTest, recommendTargets } from './targets'
import { completed, started } from './test-fixtures'

const FIRST = completed('2026-10-01') // flexiones inclinadas 11, plancha 56 s, pared 62 s, remo 10 / 12

test('D-040: tras el primer test, un objetivo por prueba: la marca más un 25 %, con mínimo, en 8 semanas', () => {
  const drafts = recommendTargets(FIRST, [])
  assert.deepEqual(
    drafts.map((draft) => [draft.exerciseId, draft.startValue, draft.target, draft.unit]),
    [
      ['flexiones-inclinadas', 11, 14, 'reps'],
      ['plancha', 56, 70, 's'],
      ['sentadilla-isometrica-pared', 62, 80, 's'],
      ['remo-unilateral', 12, 15, 'reps'],
    ],
  )
  assert.ok(drafts.every((draft) => draft.deadline === '2026-11-26'))
})

test('D-040: con marcas bajas manda el mínimo; un ejercicio con objetivo ya no se propone', () => {
  const low = completed('2026-10-01', { push: 2, core: 10, legs: 20, pull: [3, 3] })
  const [push, core] = recommendTargets(low, [])
  assert.equal(push.target, 4, '+2 repeticiones como mínimo')
  assert.equal(core.target, 20, '+10 segundos como mínimo')

  const existing = [{ id: 't', exerciseId: 'plancha', target: 90, deadline: '2026-12-01', startValue: 50, createdAt: '2026-09-01T09:00:00.000Z' }]
  assert.ok(!recommendTargets(FIRST, existing).some((draft) => draft.exerciseId === 'plancha'))
})

test('D-040: solo el primer test completado propone objetivos', () => {
  const second = completed('2026-10-29')
  assert.equal(isFirstCompletedTest(FIRST, [FIRST]), true)
  assert.equal(isFirstCompletedTest(second, [FIRST, second]), false)
  assert.equal(isFirstCompletedTest(started('2026-10-01'), []), false, 'uno a medias no')
})

test('D-040: las marcas del test cuentan para los objetivos, en el remo el mejor lado', () => {
  assert.equal(bestSetOf('plancha', [], [FIRST]), 56)
  assert.equal(bestSetOf('remo-unilateral', [], [FIRST]), 12)
  const [, plank] = recommendTargets(FIRST, [])
  const target = { id: 't', ...plank, createdAt: '2026-10-01T18:00:00.000Z' }
  assert.equal(targetProgress(target, [], '2026-10-02', [FIRST]).current, 56)
})
