/**
 * Calentamiento por cargas (D-063): la rampa hacia el peso de trabajo.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserEquipment } from '../workouts/equipment'
import { buildSession, rampTo } from './session-builder'

test('la rampa sube hacia el peso de trabajo con los pesos del usuario', () => {
  assert.deepEqual(rampTo(10, [5, 8, 10, 12]), [
    { kg: 5, reps: 8 },
    { kg: 8, reps: 4 },
  ])
  // Con un solo peso más ligero, una sola serie de rampa.
  assert.deepEqual(rampTo(8, [5, 8]), [{ kg: 5, reps: 8 }])
  // Sin pesos más ligeros, ninguna: queda la serie de 5 de siempre.
  assert.deepEqual(rampTo(5, [5, 8]), [])
  assert.deepEqual(rampTo(20, [2, 4, 6, 10, 15, 20]), [
    { kg: 10, reps: 8 },
    { kg: 15, reps: 4 },
  ])
})

test('en la sesión, solo el primer ejercicio con carga va por rampa; los demás, una serie de 5', () => {
  const gear: UserEquipment = {
    items: ['banco'],
    weights: [5, 8, 10, 12, 16].map((kg) => ({ kind: 'mancuerna' as const, kg, pair: true })),
  }
  const session = buildSession({
    focus: 'tren_inferior',
    intensity: 'moderada',
    availableMinutes: 60,
    goals: ['hipertrofia'],
    experience: 'avanzado',
    gear,
  })
  const approach = session.exercises.filter((item) => item.warmupPart === 'aproximacion')
  const main = session.exercises.filter((item) => !item.phase)
  const firstLoaded = main.find((item) => item.suggestedWeightKg !== null && !item.isTimed)
  assert.ok(firstLoaded, 'la sesión debería llevar un ejercicio con carga')
  const ramp = approach.filter((item) => item.exerciseId === firstLoaded!.exerciseId)
  assert.ok(ramp.length >= 1)
  for (const step of ramp) assert.ok(step.suggestedWeightKg! < firstLoaded!.suggestedWeightKg!, 'la rampa va por debajo del peso de trabajo')
  const weights = ramp.map((item) => item.suggestedWeightKg!)
  assert.deepEqual(weights, [...weights].sort((a, b) => a - b), 'y sube')
  // Los demás ejercicios del calentamiento siguen con una serie de 5.
  const others = approach.filter((item) => item.exerciseId !== firstLoaded!.exerciseId)
  for (const item of others) assert.equal(item.reps, 5)
  assert.ok(new Set(approach.map((item) => item.exerciseId)).size <= 3)
})
