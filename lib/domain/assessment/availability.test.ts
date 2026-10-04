/**
 * Cuándo se ofrece el test de evolución (D-021). Cada regla se prueba sola:
 * partiendo de un día en el que todo lo permite, se rompe una cosa cada vez.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { interruptAssessment, recordResult } from './assessment'
import { assessmentAvailability, type AvailabilityInput } from './availability'
import { at, completed, started } from './test-fixtures'

const TODAY = '2026-10-04'

function input(patch: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    today: TODAY,
    assessments: [],
    trainedToday: false,
    recoveryBand: 'good',
    demandingActivityToday: false,
    demandingActivityTomorrow: false,
    axisRecommendsRest: false,
    ...patch,
  }
}

function blocksOf(patch: Partial<AvailabilityInput>) {
  const result = assessmentAvailability(input(patch))
  return result.status === 'unavailable' ? result.blocks : []
}

test('sin tests anteriores y con todo a favor, está disponible', () => {
  assert.deepEqual(assessmentAvailability(input()), { status: 'available' })
})

test('con recuperación moderada también está disponible: solo bloquea la banda baja', () => {
  assert.deepEqual(assessmentAvailability(input({ recoveryBand: 'moderate' })), { status: 'available' })
})

test('hasta 28 días después del último test completado no está disponible', () => {
  assert.deepEqual(blocksOf({ assessments: [completed('2026-09-07')] }), ['too_soon'])
  assert.deepEqual(assessmentAvailability(input({ assessments: [completed('2026-09-06')] })), { status: 'available' })
})

test('un test interrumpido no cuenta para los 28 días', () => {
  const outcome = interruptAssessment(recordResult(started('2026-10-01'), 14, at('2026-10-01')), at('2026-10-01'))
  assert.equal(outcome.kind, 'interrupted')
  const assessments = outcome.kind === 'interrupted' ? [outcome.assessment, completed('2026-08-01')] : []
  assert.deepEqual(assessmentAvailability(input({ assessments })), { status: 'available' })
})

test('después de completar o interrumpir un test hoy, no se ofrece otro', () => {
  assert.ok(blocksOf({ assessments: [completed(TODAY)] }).includes('assessment_today'))
  const outcome = interruptAssessment(recordResult(started(TODAY), 14, at(TODAY)), at(TODAY))
  const assessments = outcome.kind === 'interrupted' ? [outcome.assessment] : []
  assert.deepEqual(blocksOf({ assessments }), ['assessment_today'])
})

test('si ya ha entrenado hoy, no está disponible', () => {
  assert.deepEqual(blocksOf({ trainedToday: true }), ['trained_today'])
})

test('con recuperación baja no está disponible', () => {
  assert.deepEqual(blocksOf({ recoveryBand: 'low' }), ['recovery_low'])
})

test('con «datos insuficientes» de recuperación no está disponible', () => {
  assert.deepEqual(blocksOf({ recoveryBand: null }), ['recovery_unknown'])
})

test('con un deporte de intensidad alta hoy o mañana no está disponible', () => {
  assert.deepEqual(blocksOf({ demandingActivityToday: true }), ['demanding_activity_today'])
  assert.deepEqual(blocksOf({ demandingActivityTomorrow: true }), ['demanding_activity_tomorrow'])
})

test('si AXIS recomienda descansar hoy, no está disponible', () => {
  assert.deepEqual(blocksOf({ axisRecommendsRest: true }), ['axis_rest'])
})

test('se recogen todos los motivos a la vez', () => {
  assert.deepEqual(
    blocksOf({
      assessments: [completed('2026-09-20')],
      trainedToday: true,
      recoveryBand: 'low',
      demandingActivityTomorrow: true,
      axisRecommendsRest: true,
    }),
    ['too_soon', 'trained_today', 'recovery_low', 'demanding_activity_tomorrow', 'axis_rest'],
  )
})

test('un test a medias de hoy se reanuda aunque las condiciones hayan cambiado', () => {
  const ongoing = recordResult(started(TODAY), 14, at(TODAY))
  const result = assessmentAvailability(input({ assessments: [ongoing], recoveryBand: 'low', trainedToday: true }))
  assert.equal(result.status, 'in_progress')
  assert.equal(result.status === 'in_progress' && result.assessment.id, ongoing.id)
})

test('un test a medias de otro día no se reanuda ni bloquea por sí mismo', () => {
  const stale = recordResult(started('2026-10-03'), 14, at('2026-10-03'))
  assert.deepEqual(assessmentAvailability(input({ assessments: [stale] })), { status: 'available' })
})
