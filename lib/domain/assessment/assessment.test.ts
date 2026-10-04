/**
 * El test de evolución mientras se hace (D-021): orden fijo, remo por lados,
 * descanso de 2 minutos, salir a mitad, reanudar el mismo día y el hecho de
 * actividad que leerá AXIS.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessmentRestState,
  completedAssessments,
  currentSide,
  currentTest,
  extendAssessmentRest,
  fixedPushUpVariant,
  hadAssessmentEffortOn,
  inProgressAssessment,
  interruptAssessment,
  lastCompletedAssessment,
  recordResult,
  reconcileStoredAssessment,
  skipAssessmentRest,
  startAssessment,
  undoLeftSide,
} from './assessment'
import { at, completed, started } from './test-fixtures'
import { ASSESSMENT_PROTOCOL_VERSION } from './protocol'
import type { Assessment } from './types'

const DAY = '2026-10-04'

function record(assessment: Assessment, ...values: number[]): Assessment {
  return values.reduce((current, value) => recordResult(current, value, at(DAY, '18:05:00')), assessment)
}

// ---------------------------------------------------------------------------
// Empezar
// ---------------------------------------------------------------------------

test('empezar crea un test en curso, del protocolo actual, sin resultados', () => {
  const assessment = startAssessment({ dayKey: DAY, pushUpVariantId: 'flexiones', now: at(DAY), id: 'a' })
  assert.ok(assessment)
  assert.equal(assessment.status, 'in_progress')
  assert.equal(assessment.protocolVersion, ASSESSMENT_PROTOCOL_VERSION)
  assert.equal(assessment.pushUpVariantId, 'flexiones')
  assert.deepEqual(assessment.results, [])
  assert.equal(assessment.endedAt, null)
  assert.equal(assessment.rest, null)
})

test('no se puede empezar con las flexiones negativas ni con un ejercicio inventado', () => {
  assert.equal(startAssessment({ dayKey: DAY, pushUpVariantId: 'flexiones-negativas' }), null)
  assert.equal(startAssessment({ dayKey: DAY, pushUpVariantId: 'press-banca' }), null)
})

// ---------------------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------------------

test('las pruebas van en orden: flexiones, plancha, sentadilla en pared y remo', () => {
  let assessment = started(DAY)
  const seen: string[] = []
  for (const value of [14, 68, 54]) {
    seen.push(currentTest(assessment)?.key ?? '')
    assessment = recordResult(assessment, value, at(DAY))
  }
  seen.push(currentTest(assessment)?.key ?? '')
  assert.deepEqual(seen, ['push', 'core', 'legs', 'pull'])
})

test('cada resultado guarda ejercicio, medida y carga; las flexiones, con su variante', () => {
  const assessment = completed(DAY, { push: 14, core: 68, legs: 54, pull: [12, 11] }, 'flexiones-declinadas')
  assert.deepEqual(
    assessment.results.map((result) => [result.exerciseId, result.measure, result.loadKg]),
    [
      ['flexiones-declinadas', 'reps', null],
      ['plancha', 'seconds', null],
      ['sentadilla-isometrica-pared', 'seconds', null],
      ['remo-unilateral', 'reps', 5],
    ],
  )
  assert.deepEqual(assessment.results[0].values, { kind: 'single', value: 14 })
  assert.deepEqual(assessment.results[3].values, { kind: 'sides', left: 12, right: 11 })
})

test('el remo pide primero el lado izquierdo y después el derecho', () => {
  const assessment = record(started(DAY), 14, 68, 54)
  assert.equal(currentSide(assessment), 'left')
  const afterLeft = recordResult(assessment, 12, at(DAY))
  assert.equal(afterLeft.pendingLeft, 12)
  assert.equal(currentSide(afterLeft), 'right')
  assert.equal(afterLeft.results.length, 3, 'un lado solo no es un resultado')
  assert.equal(afterLeft.rest, null, 'entre los dos lados no hay descanso')
})

test('el lado izquierdo se puede corregir antes de registrar el derecho', () => {
  const afterLeft = record(started(DAY), 14, 68, 54, 12)
  const corrected = recordResult(undoLeftSide(afterLeft), 13, at(DAY))
  const done = recordResult(corrected, 11, at(DAY))
  assert.deepEqual(done.results[3].values, { kind: 'sides', left: 13, right: 11 })
})

test('las pruebas sin lados no preguntan lado', () => {
  assert.equal(currentSide(started(DAY)), null)
})

test('registrar la cuarta prueba completa el test, sin descanso y con fecha de fin', () => {
  const assessment = completed(DAY)
  assert.equal(assessment.status, 'completed')
  assert.equal(assessment.results.length, 4)
  assert.equal(assessment.rest, null)
  assert.ok(assessment.endedAt)
  assert.equal(currentTest(assessment), null)
})

test('un test completado no admite más resultados', () => {
  const assessment = completed(DAY)
  assert.equal(recordResult(assessment, 20, at(DAY)), assessment)
})

test('un valor no válido no cambia nada', () => {
  const assessment = started(DAY)
  for (const value of [-1, 2.5, Number.NaN, 100_000]) {
    assert.equal(recordResult(assessment, value, at(DAY)), assessment)
  }
})

test('se aceptan valores por encima de 50, que el selector de entrenamiento no permite', () => {
  const assessment = record(started(DAY), 64, 185)
  assert.deepEqual(
    assessment.results.map((result) => result.values),
    [
      { kind: 'single', value: 64 },
      { kind: 'single', value: 185 },
    ],
  )
})

// ---------------------------------------------------------------------------
// Descanso
// ---------------------------------------------------------------------------

test('tras una prueba arranca un descanso de 2 minutos', () => {
  const now = at(DAY)
  const assessment = recordResult(started(DAY), 14, now)
  assert.deepEqual(assessmentRestState(assessment, now), { remainingSeconds: 120, totalSeconds: 120 })
  assert.deepEqual(assessmentRestState(assessment, new Date(now.getTime() + 45_000))?.remainingSeconds, 75)
  assert.equal(assessmentRestState(assessment, new Date(now.getTime() + 120_000)), null)
})

test('«+15 s» alarga el descanso en curso y «Saltar» lo termina', () => {
  const now = at(DAY)
  const resting = recordResult(started(DAY), 14, now)
  const extended = extendAssessmentRest(resting, 15, now)
  assert.deepEqual(assessmentRestState(extended, now), { remainingSeconds: 135, totalSeconds: 135 })
  assert.equal(assessmentRestState(skipAssessmentRest(extended), now), null)
})

test('un descanso terminado no se alarga', () => {
  const now = at(DAY)
  const resting = recordResult(started(DAY), 14, now)
  const later = new Date(now.getTime() + 200_000)
  assert.equal(extendAssessmentRest(resting, 15, later), resting)
})

// ---------------------------------------------------------------------------
// Salir a mitad
// ---------------------------------------------------------------------------

test('salir con alguna prueba registrada deja el test interrumpido, con sus resultados', () => {
  const outcome = interruptAssessment(record(started(DAY), 14, 68), at(DAY, '18:20:00'))
  assert.equal(outcome.kind, 'interrupted')
  assert.equal(outcome.kind === 'interrupted' && outcome.assessment.status, 'interrupted')
  assert.equal(outcome.kind === 'interrupted' && outcome.assessment.results.length, 2)
  assert.equal(outcome.kind === 'interrupted' && outcome.assessment.endedAt, at(DAY, '18:20:00').toISOString())
  assert.equal(outcome.kind === 'interrupted' && outcome.assessment.rest, null)
})

test('salir habiendo registrado solo un lado del remo también es interrumpido', () => {
  const outcome = interruptAssessment(record(started(DAY), 14, 68, 54, 12), at(DAY))
  assert.equal(outcome.kind, 'interrupted')
})

test('salir sin haber registrado nada no deja rastro', () => {
  assert.deepEqual(interruptAssessment(started(DAY), at(DAY)), { kind: 'discard' })
})

// ---------------------------------------------------------------------------
// Reanudar tras cerrar la aplicación
// ---------------------------------------------------------------------------

test('el mismo día se reanuda donde se dejó', () => {
  const stored = JSON.parse(JSON.stringify(record(started(DAY), 14)))
  const outcome = reconcileStoredAssessment(stored, { today: DAY })
  assert.equal(outcome.kind, 'resume')
  assert.equal(outcome.kind === 'resume' && currentTest(outcome.assessment)?.key, 'core')
})

test('otro día ya no se reanuda: con algo registrado queda interrumpido a la hora del último resultado', () => {
  const stored = record(started(DAY), 14, 68)
  const outcome = reconcileStoredAssessment(stored, { today: '2026-10-05' })
  assert.equal(outcome.kind, 'archive')
  assert.equal(outcome.kind === 'archive' && outcome.assessment.status, 'interrupted')
  assert.equal(outcome.kind === 'archive' && outcome.assessment.endedAt, at(DAY, '18:05:00').toISOString())
})

test('otro día sin nada registrado se descarta', () => {
  assert.deepEqual(reconcileStoredAssessment(started(DAY), { today: '2026-10-05' }), { kind: 'discard' })
})

test('un registro roto o que ya no está en curso no se reanuda', () => {
  assert.deepEqual(reconcileStoredAssessment({ id: 'x' }, { today: DAY }), { kind: 'discard' })
  assert.deepEqual(reconcileStoredAssessment(completed(DAY), { today: DAY }), { kind: 'discard' })
})

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

test('solo los completados cuentan como tests anteriores, del más reciente al más antiguo', () => {
  const interrupted = { ...record(started('2026-10-01', 'flexiones', 'i'), 14), status: 'interrupted' as const, endedAt: at('2026-10-01').toISOString() }
  const list = [completed('2026-08-01'), interrupted, completed('2026-09-02')]
  assert.deepEqual(completedAssessments(list).map((a) => a.dayKey), ['2026-09-02', '2026-08-01'])
  assert.equal(lastCompletedAssessment(list)?.dayKey, '2026-09-02')
  assert.equal(lastCompletedAssessment([]), null)
})

test('la variante queda fijada por el último test completado; uno interrumpido no la fija', () => {
  assert.equal(fixedPushUpVariant([]), null)
  const interrupted = { ...record(started('2026-09-01', 'flexiones-diamante'), 14), status: 'interrupted' as const, endedAt: at('2026-09-01').toISOString() }
  assert.equal(fixedPushUpVariant([interrupted]), null)
  assert.equal(fixedPushUpVariant([interrupted, completed('2026-08-01', undefined, 'flexiones')]), 'flexiones')
})

test('el test en curso de hoy se encuentra; el de otro día no', () => {
  const ongoing = record(started(DAY), 14)
  assert.equal(inProgressAssessment([ongoing], DAY)?.id, ongoing.id)
  assert.equal(inProgressAssessment([ongoing], '2026-10-05'), null)
  assert.equal(inProgressAssessment([completed(DAY)], DAY), null)
})

test('esfuerzo de test en un día: completado, interrumpido o en curso con algo registrado', () => {
  const interrupted = interruptAssessment(record(started(DAY), 14), at(DAY))
  assert.equal(hadAssessmentEffortOn([completed(DAY)], DAY), true)
  assert.equal(interrupted.kind === 'interrupted' && hadAssessmentEffortOn([interrupted.assessment], DAY), true)
  assert.equal(hadAssessmentEffortOn([record(started(DAY), 14)], DAY), true)
  assert.equal(hadAssessmentEffortOn([started(DAY)], DAY), false, 'empezar sin registrar nada no es esfuerzo')
  assert.equal(hadAssessmentEffortOn([completed(DAY)], '2026-10-05'), false)
})
