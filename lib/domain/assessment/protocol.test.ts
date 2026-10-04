/**
 * El protocolo v1 del test de evolución (D-021): cuatro pruebas fijas, en orden,
 * con ejercicios del catálogo y el material de D-008.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { EXERCISE_CATALOG, findExercise, MAX_AVAILABLE_LOAD_KG } from '../workouts/catalog'
import {
  ASSESSMENT_INTERVAL_DAYS,
  ASSESSMENT_PROTOCOL,
  ASSESSMENT_PROTOCOL_VERSION,
  ASSESSMENT_REST_SECONDS,
  exerciseIdFor,
  isValidAssessmentValue,
  PUSH_UP_VARIANT_IDS,
  recommendedPushUpVariant,
} from './protocol'

test('el protocolo v1 son cuatro pruebas en orden fijo: empuje, core, piernas y tirón', () => {
  assert.equal(ASSESSMENT_PROTOCOL_VERSION, 1)
  assert.deepEqual(
    ASSESSMENT_PROTOCOL.map((item) => item.key),
    ['push', 'core', 'legs', 'pull'],
  )
})

test('cada prueba mide lo aprobado: flexiones y remo en repeticiones, plancha y pared en segundos', () => {
  const byKey = Object.fromEntries(ASSESSMENT_PROTOCOL.map((item) => [item.key, item]))
  assert.equal(byKey.push.measure, 'reps')
  assert.equal(byKey.core.measure, 'seconds')
  assert.equal(byKey.legs.measure, 'seconds')
  assert.equal(byKey.pull.measure, 'reps')
  assert.equal(byKey.pull.perSide, true)
  assert.equal(ASSESSMENT_PROTOCOL.filter((item) => item.perSide).length, 1)
})

test('los ejercicios fijos existen en el catálogo y miden igual que en él', () => {
  for (const item of ASSESSMENT_PROTOCOL) {
    if (!item.exerciseId) continue
    const exercise = findExercise(item.exerciseId)
    assert.ok(exercise, item.exerciseId)
    assert.equal(exercise.work.isTimed, item.measure === 'seconds', item.exerciseId)
    assert.equal(exercise.unilateral, item.perSide, item.exerciseId)
  }
})

test('la única carga es la pesa de 5 kg del remo, dentro del material de D-008', () => {
  const loads = ASSESSMENT_PROTOCOL.filter((item) => item.loadKg !== null)
  assert.deepEqual(loads.map((item) => [item.key, item.loadKg]), [['pull', 5]])
  assert.ok(loads.every((item) => (item.loadKg ?? 0) <= MAX_AVAILABLE_LOAD_KG))
})

test('las variantes de flexiones son de la familia del catálogo y excluyen las negativas', () => {
  assert.deepEqual(PUSH_UP_VARIANT_IDS, [
    'flexiones-inclinadas',
    'flexiones',
    'flexiones-declinadas',
    'flexiones-diamante',
  ])
  assert.ok(!PUSH_UP_VARIANT_IDS.includes('flexiones-negativas'))
  for (const id of PUSH_UP_VARIANT_IDS) {
    const exercise = EXERCISE_CATALOG.find((item) => item.id === id)
    assert.ok(exercise, id)
    assert.equal(exercise.family, 'flexion', id)
    assert.equal(exercise.work.isTimed, false, id)
  }
})

test('la variante recomendada: inclinadas para un principiante, estándar para el resto', () => {
  assert.equal(recommendedPushUpVariant('principiante'), 'flexiones-inclinadas')
  assert.equal(recommendedPushUpVariant('intermedio'), 'flexiones')
  assert.equal(recommendedPushUpVariant('avanzado'), 'flexiones')
})

test('la prueba de empuje usa la variante del test; las demás, su ejercicio fijo', () => {
  const [push, core] = ASSESSMENT_PROTOCOL
  assert.equal(exerciseIdFor(push, 'flexiones-diamante'), 'flexiones-diamante')
  assert.equal(exerciseIdFor(core, 'flexiones-diamante'), 'plancha')
})

test('intervalo de 28 días y descanso de 2 minutos', () => {
  assert.equal(ASSESSMENT_INTERVAL_DAYS, 28)
  assert.equal(ASSESSMENT_REST_SECONDS, 120)
})

test('los valores admiten más de 50 y el cero, pero no negativos, decimales ni imposibles', () => {
  assert.equal(isValidAssessmentValue(0, 'reps'), true)
  assert.equal(isValidAssessmentValue(51, 'reps'), true)
  assert.equal(isValidAssessmentValue(180, 'seconds'), true)
  assert.equal(isValidAssessmentValue(-1, 'reps'), false)
  assert.equal(isValidAssessmentValue(12.5, 'reps'), false)
  assert.equal(isValidAssessmentValue(Number.NaN, 'seconds'), false)
  assert.equal(isValidAssessmentValue('14', 'reps'), false)
  assert.equal(isValidAssessmentValue(10_000, 'seconds'), false)
})

test('el dominio del test no conoce IndexedDB, el store, la interfaz ni AXIS', () => {
  const dir = import.meta.dirname
  const sources = readdirSync(dir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  assert.ok(sources.length >= 5)
  for (const file of sources) {
    const text = readFileSync(join(dir, file), 'utf8')
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1])
    for (const path of imports) {
      assert.ok(
        !/indexeddb|lib\/data|\/data\/|state\/|components|react|next|\/axis\//i.test(path),
        `${file} importa ${path}`,
      )
    }
  }
})

test('entrenamiento, progresión, rotación, récords y Carga no leen los tests', () => {
  const root = join(import.meta.dirname, '..')
  const files = [
    'workouts/history.ts',
    'workouts/load.ts',
    'workouts/active-workout.ts',
    'axis/session-builder.ts',
    'history/stats.ts',
  ]
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8')
    assert.ok(!text.includes('assessment'), `${file} menciona assessment`)
  }
})
