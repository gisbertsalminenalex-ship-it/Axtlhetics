/**
 * Alimentación con cifras (D-061).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WeekWeight } from '../body/measurements'
import { isUserProfile, type UserProfile } from '../profile/types'
import {
  activityFactor,
  basalKcal,
  isNutritionPlan,
  MAX_ADJUSTMENT_KCAL,
  nutritionTargets,
  proposeAdjustment,
  withAdjustment,
  type NutritionPlan,
} from './targets'

const ADULT = { age: 30, weightKg: 80, heightCm: 180, sex: 'hombre' as const, trainingDays: 4 }
const plan = (goal: NutritionPlan['goal'], adjustmentKcal = 0): NutritionPlan => ({ goal, adjustmentKcal, since: '2026-09-01' })

test('Mifflin-St Jeor y el factor por días de entreno', () => {
  // 800 + 1125 − 150 + 5
  assert.equal(basalKcal(ADULT), 1780)
  assert.equal(basalKcal({ ...ADULT, sex: 'mujer' }), 1614)
  assert.equal(basalKcal({ ...ADULT, sex: null }), 1697)
  assert.equal(activityFactor(2), 1.375)
  assert.equal(activityFactor(4), 1.5)
  assert.equal(activityFactor(6), 1.65)
})

test('calorías y proteína según el objetivo; el ajuste suma', () => {
  const at = (goal: NutritionPlan['goal'], adjustment = 0) => {
    const result = nutritionTargets({ ...ADULT, plan: plan(goal, adjustment) })
    assert.equal(result.kind, 'adult')
    return result.kind === 'adult' ? result : null
  }
  // Mantenimiento: 1780 × 1,5 = 2670 → 2650.
  assert.equal(at('mantener')!.kcal, 2650)
  assert.equal(at('mantener')!.maintenanceKcal, 2650)
  // Perder: −min(500, 15 %) = −400,5 → 2269,5 → 2250.
  assert.equal(at('perder_grasa')!.kcal, 2250)
  // Ganar: +min(300, 10 %) = +267 → 2937 → 2950.
  assert.equal(at('ganar_musculo')!.kcal, 2950)
  assert.equal(at('mantener', -150)!.kcal, 2500)
  assert.deepEqual(at('perder_grasa')!.proteinGrams, [160, 175])
  assert.deepEqual(at('ganar_musculo')!.proteinGrams, [130, 160])
})

test('nunca por debajo del gasto en reposo', () => {
  const result = nutritionTargets({ ...ADULT, trainingDays: 1, plan: plan('perder_grasa', -500) })
  assert.ok(result.kind === 'adult' && result.kcal >= 1780 - 25)
})

test('menores de 18: sin cifras ni déficit (D-023)', () => {
  const result = nutritionTargets({ ...ADULT, age: 16, plan: plan('perder_grasa') })
  assert.equal(result.kind, 'minor')
  assert.doesNotMatch(result.text, /\d/)
  assert.match(result.text, /no hace falta comer menos/)
  assert.equal(proposeAdjustment({ plan: plan('perder_grasa'), age: 16, weightKg: 60, weeks: [] }), null)
})

function weeks(...averages: number[]): WeekWeight[] {
  const mondays = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
  return averages.map((averageKg, i) => ({ weekStart: mondays[i], averageKg, weighIns: 3 }))
}

test('el ajuste mira la tendencia del peso desde el último ajuste', () => {
  const lose = plan('perder_grasa')
  // −0,2 kg/semana con 80 kg: más lento que −0,4 → baja 150.
  assert.equal(proposeAdjustment({ plan: lose, age: 30, weightKg: 80, weeks: weeks(80.6, 80.4, 80.2, 80) })?.deltaKcal, -150)
  // −0,6 kg/semana: dentro (−0,4 a −0,8).
  assert.equal(proposeAdjustment({ plan: lose, age: 30, weightKg: 80, weeks: weeks(81.8, 81.2, 80.6, 80) }), null)
  // −1 kg/semana: demasiado rápido → sube 150, y lo dice.
  const fast = proposeAdjustment({ plan: lose, age: 30, weightKg: 80, weeks: weeks(83, 82, 81, 80) })
  assert.equal(fast?.deltaKcal, 150)
  assert.match(fast!.reason, /−1 kg por semana y buscamos entre −0,8 kg y −0,4 kg/)
  // Ganar sin subir nada: +150.
  assert.equal(proposeAdjustment({ plan: plan('ganar_musculo'), age: 30, weightKg: 80, weeks: weeks(80, 80, 80, 80) })?.deltaKcal, 150)
  // Con menos de 3 semanas con pesos desde el último ajuste, nada.
  assert.equal(proposeAdjustment({ plan: { ...lose, since: '2026-09-20' }, age: 30, weightKg: 80, weeks: weeks(80.6, 80.4, 80.2, 80) }), null)
  // En el tope de ajustes, no se propone más en esa dirección.
  assert.equal(
    proposeAdjustment({ plan: plan('perder_grasa', -MAX_ADJUSTMENT_KCAL + 100), age: 30, weightKg: 80, weeks: weeks(80.6, 80.4, 80.2, 80) }),
    null,
  )
})

test('aceptar un ajuste lo suma y reinicia la cuenta; la forma guardada', () => {
  const next = withAdjustment(plan('mantener', 150), -150, '2026-10-21')
  assert.deepEqual(next, { goal: 'mantener', adjustmentKcal: 0, since: '2026-10-21' })
  assert.ok(isNutritionPlan(next))
  assert.ok(!isNutritionPlan({ ...next, adjustmentKcal: 900 }))
  const profile: UserProfile = {
    id: 'primary',
    name: 'A',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    nutrition: next,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
  assert.ok(isUserProfile(JSON.parse(JSON.stringify(profile))))
  assert.ok(!isUserProfile({ ...profile, nutrition: { goal: 'adelgazar', adjustmentKcal: 0, since: '2026-10-21' } }))
})
