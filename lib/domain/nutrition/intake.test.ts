/**
 * Lo que se come (D-066): el día apuntado, la proteína por los gramos, las
 * medias y el día que se comió poco, que AXIS convierte en una sesión suave.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAxisContext } from '../axis/context'
import { decide } from '../axis/engine'
import { isBodyMeasurement, withMeal, withoutMeal, type BodyMeasurement } from '../body/measurements'
import type { UserProfile } from '../profile/types'
import { averageIntake, dayIntake, lowIntakeYesterday, proteinReached, type MealEntry, type MealSlot } from './intake'

const meal = (slot: MealSlot, kcal: number, proteinG = 30, carbsG = 50, fatG = 15): MealEntry => ({
  id: `${slot}-${kcal}`,
  slot,
  kcal,
  proteinG,
  carbsG,
  fatG,
  createdAt: '2026-09-06T12:00:00.000Z',
})

const day = (dayKey: string, meals: MealEntry[], protein?: boolean): BodyMeasurement => ({
  dayKey,
  weightKg: null,
  perimeters: {},
  meals,
  ...(protein !== undefined ? { protein } : {}),
  updatedAt: `${dayKey}T22:00:00.000Z`,
})

test('el día suma sus comidas y está completo con la cena o tres comidas', () => {
  const intake = dayIntake([meal('desayuno', 400, 20, 50, 10), meal('comida', 700, 40, 80, 25)])
  assert.deepEqual(intake, { kcal: 1100, proteinG: 60, carbsG: 130, fatG: 35, meals: 2, complete: false })
  assert.equal(dayIntake([meal('cena', 600)]).complete, true)
  assert.equal(dayIntake([meal('desayuno', 1), meal('comida', 1), meal('snack', 1)]).complete, true)
  assert.deepEqual(dayIntake(undefined), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: 0, complete: false })
})

test('con comidas, la proteína la dicen los gramos; sin ellas, la respuesta', () => {
  assert.equal(proteinReached(day('2026-09-06', [meal('comida', 700, 140)]), 130), true)
  // A medias y sin llegar todavía: no es un «no».
  assert.equal(proteinReached(day('2026-09-06', [meal('comida', 700, 40)]), 130), null)
  assert.equal(proteinReached(day('2026-09-06', [meal('cena', 700, 40)]), 130), false)
  assert.equal(proteinReached(day('2026-09-06', [], true), 130), true)
  assert.equal(proteinReached(day('2026-09-06', []), 130), null)
})

test('la media solo cuenta días completos', () => {
  const records = [
    day('2026-09-01', [meal('cena', 2000)]),
    day('2026-09-02', [meal('desayuno', 300)]),
    day('2026-09-03', [meal('cena', 2400)]),
  ]
  assert.deepEqual(averageIntake(records, '2026-09-01', '2026-09-07'), { averageKcal: 2200, averageProteinG: 30, days: 2 })
  assert.equal(averageIntake(records, '2026-09-10', '2026-09-12'), null)
})

test('ayer se comió poco: un día completo por debajo del 70 % del objetivo', () => {
  const targets = { kcal: 2500 }
  assert.deepEqual(lowIntakeYesterday([day('2026-09-06', [meal('cena', 1500)])], '2026-09-07', targets), { kcal: 1500, targetKcal: 2500 })
  assert.equal(lowIntakeYesterday([day('2026-09-06', [meal('cena', 1900)])], '2026-09-07', targets), null)
  // Un día a medias no dice que se comiera poco.
  assert.equal(lowIntakeYesterday([day('2026-09-06', [meal('desayuno', 500)])], '2026-09-07', targets), null)
  assert.equal(lowIntakeYesterday([day('2026-09-06', [meal('cena', 500)])], '2026-09-07', null), null)
})

test('AXIS propone hoy una sesión suave y lo explica', () => {
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
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
  const great = {
    dayKey: '2026-09-07',
    sleepHours: 9,
    energy: 5 as const,
    muscleFatigue: 1 as const,
    stress: 1 as const,
    hydrationGlasses: 8,
    updatedAt: '2026-09-07T08:00:00.000Z',
  }
  const decideWith = (lowIntake: { kcal: number; targetKcal: number } | null) =>
    decide(
      buildAxisContext({
        profile,
        recoveryInputs: great,
        recentSessions: [],
        activities: [],
        lowIntakeYesterday: lowIntake,
        now: new Date(2026, 8, 7, 10, 0),
      }),
    ).primary

  assert.notEqual(decideWith(null).type, 'LIGHT_TRAINING')
  const light = decideWith({ kcal: 1500, targetKcal: 2650 })
  assert.equal(light.type, 'LIGHT_TRAINING')
  assert.ok(light.factors.some((factor) => factor.key === 'low_intake' && /1500 kcal, muy por debajo de tus 2650/.test(factor.detail)))
})

test('las comidas se guardan en el registro del día', () => {
  const base: BodyMeasurement = { dayKey: '2026-09-06', weightKg: 80, perimeters: {}, updatedAt: '2026-09-06T08:00:00.000Z' }
  const withTwo = withMeal(withMeal(base, meal('desayuno', 400), 't1'), meal('cena', 600), 't2')
  assert.equal(withTwo.meals?.length, 2)
  assert.equal(withTwo.weightKg, 80)
  assert.deepEqual(withoutMeal(withTwo, 'desayuno-400', 't3').meals?.map((item) => item.slot), ['cena'])
  assert.ok(isBodyMeasurement(JSON.parse(JSON.stringify(withTwo))))
  assert.ok(!isBodyMeasurement({ ...withTwo, meals: [{ ...meal('cena', 600), slot: 'brunch' }] }))
  assert.ok(!isBodyMeasurement({ ...withTwo, meals: [{ ...meal('cena', 600), kcal: -5 }] }))
})
