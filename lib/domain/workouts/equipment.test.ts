/**
 * El material del usuario (D-046): qué requisitos del catálogo cumple, qué kilos
 * se pueden sugerir para cada ejercicio y cómo se lee lo guardado.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { isUserProfile } from '../profile/types'
import { findExercise } from './catalog'
import {
  availableEquipment,
  describeWeight,
  equipmentOf,
  heaviestLoad,
  isUserEquipment,
  LEGACY_EQUIPMENT,
  loadsFor,
  nextLoad,
  NO_EQUIPMENT,
  normalizeEquipment,
  startingLoad,
  type UserEquipment,
} from './equipment'

const HOME: UserEquipment = {
  items: ['barra_dominadas', 'gomas'],
  weights: [
    { kind: 'mancuerna', kg: 4, pair: true },
    { kind: 'mancuerna', kg: 10, pair: true },
    { kind: 'mancuerna', kg: 15, pair: false },
    { kind: 'kettlebell', kg: 12, pair: false },
  ],
}

test('un perfil sin material se lee como una pesa de 5 kg: el de antes de D-046', () => {
  assert.deepEqual(equipmentOf(null), LEGACY_EQUIPMENT)
  assert.deepEqual(equipmentOf({}), LEGACY_EQUIPMENT)
  assert.deepEqual(equipmentOf({ equipment: NO_EQUIPMENT }), NO_EQUIPMENT)
  assert.deepEqual(availableEquipment(LEGACY_EQUIPMENT).sort(), ['ninguno', 'pesa', 'superficie_elevada'])
})

test('el cuerpo y una silla siempre; cada requisito de pesa, solo con lo que lo cumple', () => {
  assert.deepEqual(availableEquipment(NO_EQUIPMENT), ['ninguno', 'superficie_elevada'])
  const home = availableEquipment(HOME)
  for (const item of ['barra_dominadas', 'gomas', 'pesa', 'par_pesas', 'kettlebell'] as const) assert.ok(home.includes(item), item)
  assert.ok(!home.includes('banco'))
  // Una pesa suelta no es un par.
  assert.ok(!availableEquipment(LEGACY_EQUIPMENT).includes('par_pesas'))
})

test('los kilos de cada ejercicio salen de lo que pide: una pesa, un par o una kettlebell', () => {
  // Una pesa: cualquiera, mancuerna o kettlebell, suelta o de un par.
  assert.deepEqual(loadsFor(findExercise('remo-unilateral')!, HOME), [4, 10, 12, 15])
  // Un par: solo los pares.
  assert.deepEqual(loadsFor(findExercise('press-suelo-mancuernas')!, HOME), [4, 10])
  // Kettlebell: solo kettlebells.
  assert.deepEqual(loadsFor(findExercise('swing-kettlebell')!, HOME), [12])
  // Sin carga, nada.
  assert.deepEqual(loadsFor(findExercise('flexiones')!, HOME), [])
})

test('el peso de partida: el más pesado que no pasa la referencia, según la experiencia', () => {
  const remo = findExercise('remo-unilateral')! // referencia: 8 kg
  const loads = [4, 10, 12, 15]
  assert.equal(startingLoad(remo, loads, 'principiante'), 4)
  assert.equal(startingLoad(remo, loads, 'intermedio'), 12) // 8 × 1,5 = 12
  assert.equal(startingLoad(remo, loads, 'avanzado'), 15) // 8 × 2 = 16
  // Si todos pasan la referencia, el más ligero.
  assert.equal(startingLoad(findExercise('elevaciones-laterales')!, [5, 10], 'principiante'), 5)
  // Con una sola pesa, esa pesa: como antes de D-046.
  assert.equal(startingLoad(remo, [5], 'principiante'), 5)
  assert.equal(startingLoad(remo, [], 'principiante'), null)
})

test('el siguiente peso es el inmediatamente mayor, y no hay más allá del último', () => {
  assert.equal(nextLoad([4, 10, 15], 4), 10)
  assert.equal(nextLoad([4, 10, 15], 7), 10, 'un peso que no está en la lista sube al siguiente que sí')
  assert.equal(nextLoad([4, 10, 15], 15), null)
  assert.equal(heaviestLoad(HOME), 15)
  assert.equal(heaviestLoad(NO_EQUIPMENT), null)
})

test('la forma canónica junta pesas repetidas (el par gana) y ordena', () => {
  const messy: UserEquipment = {
    items: ['gomas', 'barra_dominadas', 'gomas'],
    weights: [
      { kind: 'kettlebell', kg: 8, pair: false },
      { kind: 'mancuerna', kg: 10, pair: false },
      { kind: 'mancuerna', kg: 5, pair: false },
      { kind: 'mancuerna', kg: 10, pair: true },
    ],
  }
  assert.deepEqual(normalizeEquipment(messy), {
    items: ['barra_dominadas', 'gomas'],
    weights: [
      { kind: 'mancuerna', kg: 5, pair: false },
      { kind: 'mancuerna', kg: 10, pair: true },
      { kind: 'kettlebell', kg: 8, pair: false },
    ],
  })
})

test('cómo se nombra cada pesa', () => {
  assert.equal(describeWeight({ kind: 'mancuerna', kg: 12.5, pair: true }), 'Mancuernas de 12,5 kg (par)')
  assert.equal(describeWeight({ kind: 'kettlebell', kg: 16, pair: false }), 'Kettlebell de 16 kg')
})

test('lo guardado se comprueba: material desconocido o pesos imposibles no entran', () => {
  assert.ok(isUserEquipment(HOME))
  assert.ok(isUserEquipment(NO_EQUIPMENT))
  assert.equal(isUserEquipment({ items: ['rack'], weights: [] }), false)
  assert.equal(isUserEquipment({ items: [], weights: [{ kind: 'mancuerna', kg: 0, pair: false }] }), false)
  assert.equal(isUserEquipment({ items: [], weights: [{ kind: 'barra', kg: 20, pair: false }] }), false)
  assert.equal(isUserEquipment({ items: [] }), false)
})

test('un perfil con material válido se acepta; con material roto, no', () => {
  const profile = {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 170,
    weightKg: 60,
    goals: ['fuerza'],
    experience: 'principiante',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }
  assert.ok(isUserProfile(profile), 'sin material: perfil anterior a D-046')
  assert.ok(isUserProfile({ ...profile, equipment: HOME }))
  assert.equal(isUserProfile({ ...profile, equipment: { items: ['rack'], weights: [] } }), false)
})
