/**
 * Guía de alimentación del escáner (D-023, enmienda del 2026-10-14): general,
 * según la prioridad, y sin déficit ni cifras para menores de 18 años.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { nutritionGuide, type NutritionInput } from './nutrition'

const adult: NutritionInput = { priority: 'musculo', age: 25, weightKg: 70, sex: 'hombre', bodyFatPct: 16 }

test('sin prioridad declarada no hay guía', () => {
  assert.equal(nutritionGuide({ ...adult, priority: null }), null)
})

test('adulto que quiere ganar músculo: ligero superávit y proteína en gramos según su peso', () => {
  const text = nutritionGuide(adult)!
  assert.match(text, /ligero superávit de unas 200–300 kcal al día/)
  // 70 kg × 1,6–2,0 g → 110–140 g.
  assert.match(text, /unos 110–140 g de proteína al día/)
  assert.match(text, /no sustituye a un profesional/)
})

test('adulto que quiere que se note el músculo: déficit salvo que su grasa estimada ya sea baja', () => {
  assert.match(nutritionGuide({ ...adult, priority: 'definir' })!, /ligero déficit de unas 300–500 kcal/)
  const lean = nutritionGuide({ ...adult, priority: 'definir', bodyFatPct: 11 })!
  assert.match(lean, /ya es baja/)
  assert.doesNotMatch(lean, /déficit/)
  // Para una mujer, el umbral es otro.
  assert.match(nutritionGuide({ ...adult, priority: 'definir', sex: 'mujer', bodyFatPct: 18 })!, /ya es baja/)
})

test('sin peso, la proteína se dice en comidas, sin gramos', () => {
  const text = nutritionGuide({ ...adult, weightKg: null })!
  assert.match(text, /proteína en cada comida/)
  assert.doesNotMatch(text, /\d+–\d+ g/)
})

test('menores de 18: nunca déficit ni cifras, y sí comer algo más si quieren ganar músculo', () => {
  for (const priority of ['musculo', 'definir', 'fuerza', 'equilibrio'] as const) {
    const text = nutritionGuide({ ...adult, priority, age: 16, bodyFatPct: 30 })!
    assert.doesNotMatch(text, /déficit|kcal|calor[ií]as|\d/, `${priority}: ${text}`)
    assert.match(text, /no sustituye a un profesional/)
  }
  assert.match(nutritionGuide({ ...adult, age: 16 })!, /come algo más de lo habitual/)
  assert.match(nutritionGuide({ ...adult, priority: 'definir', age: 16 })!, /no hace falta comer menos/)
})

test('con la edad desconocida se trata como menor: sin cifras', () => {
  assert.doesNotMatch(nutritionGuide({ ...adult, age: null })!, /kcal|\d/)
})
