/**
 * Zonas a cuidar y sexo (D-051).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { isUserProfile, type UserProfile } from '../profile/types'
import { EXERCISE_CATALOG, findExercise } from '../workouts/catalog'
import { EXERCISE_JOINTS, loadsCareZone } from '../workouts/joints'
import { isMainExercise } from '../workouts/types'
import { buildAxisContext } from './context'
import { decide } from './engine'
import { buildSession, restFor, suggestWorkFor } from './session-builder'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const GOOD = {
  dayKey: '2026-09-07',
  sleepHours: 8.5,
  energy: 4 as const,
  muscleFatigue: 2 as const,
  stress: 2 as const,
  hydrationGlasses: 6,
  updatedAt: '2026-09-07T08:00:00.000Z',
}

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'principiante',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

test('todo el catálogo dice qué articulaciones carga, y no hay entradas de ejercicios que no existen', () => {
  for (const exercise of EXERCISE_CATALOG) assert.ok(exercise.id in EXERCISE_JOINTS, `falta ${exercise.id}`)
  for (const id of Object.keys(EXERCISE_JOINTS)) assert.ok(findExercise(id), `sobra ${id}`)
})

test('con la rodilla marcada, ninguna sesión lleva nada que la cargue: ni entreno, ni salto, ni calentamiento', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'acondicionamiento'] as const) {
    const session = buildSession({
      focus,
      intensity: 'moderada',
      availableMinutes: 45,
      goals: ['rendimiento_deportivo'],
      experience: 'intermedio',
      jumpSport: true,
      careZones: ['rodilla'],
    })
    for (const item of session.exercises) {
      assert.ok(!loadsCareZone(item.exerciseId, ['rodilla']), `${focus}: ${item.exerciseId}`)
    }
  }
})

test('con la rodilla marcada, las piernas se trabajan con lo que no la carga', () => {
  const session = buildSession({ focus: 'tren_inferior', intensity: 'moderada', availableMinutes: 45, goals: ['hipertrofia'], experience: 'intermedio', careZones: ['rodilla'] })
  const main = session.exercises.filter(isMainExercise)
  assert.ok(main.length >= 2, main.map((item) => item.exerciseId).join(', '))
})

test('AXIS lo explica, no diagnostica, y no elige un foco que la zona deja sin ejercicios', () => {
  const context = buildAxisContext({
    profile: profile({ careZones: ['hombro', 'muneca'] }),
    recoveryInputs: GOOD,
    recentSessions: [],
    activities: [],
    now: MONDAY,
  })
  const decision = decide(context)
  const factor = decision.primary.factors.find((item) => item.key === 'care_zones')
  assert.ok(factor)
  assert.match(factor!.detail, /Cuido tu hombro y muñeca/)
  assert.match(factor!.detail, /profesional/)
  // Hombro y muñeca dejan el tren superior sin ejercicios: hoy no toca.
  assert.notEqual(decision.primary.session?.focus, 'tren_superior')
})

test('sin zonas a cuidar, nada cambia', () => {
  const context = buildAxisContext({ profile: profile(), recoveryInputs: GOOD, recentSessions: [], activities: [], now: MONDAY })
  assert.ok(!decide(context).primary.factors.some((item) => item.key === 'care_zones'))
})

test('con «mujer», descansos de fuerza un 15 % más cortos (mínimo 45 s) y los intervalos igual', () => {
  const flexiones = findExercise('flexiones')! // 90 s
  assert.equal(restFor(flexiones, 'salud_general', 'mujer'), 77)
  assert.equal(restFor(flexiones, 'salud_general', 'hombre'), 90)
  assert.equal(restFor(flexiones, 'salud_general', null), 90)
  const gemelos = findExercise('elevacion-gemelos')! // 45 s
  assert.equal(restFor(gemelos, 'salud_general', 'mujer'), 45)
  const intervalos = findExercise('burpees')!
  assert.equal(restFor(intervalos, 'resistencia', 'mujer'), intervalos.work.restSeconds)
})

test('con «mujer», el peso de partida del tren superior es menor; el de piernas, igual', () => {
  const gear = { items: [], weights: [2, 4, 6, 8, 10].map((kg) => ({ kind: 'mancuerna' as const, kg, pair: true })) }
  const base = { intensity: 'moderada' as const, goal: 'hipertrofia' as const, experience: 'principiante' as const, gear }
  const remo = findExercise('remo-unilateral')! // referencia 8 kg
  assert.equal(suggestWorkFor(remo, { ...base, sex: null }).weightKg, 8)
  assert.equal(suggestWorkFor(remo, { ...base, sex: 'mujer' }).weightKg, 4) // 8 × 0,7 = 5,6 → 4
  const sentadilla = findExercise('sentadilla-con-pesa')!
  assert.equal(suggestWorkFor(sentadilla, { ...base, sex: 'mujer' }).weightKg, suggestWorkFor(sentadilla, { ...base, sex: null }).weightKg)
})

test('el perfil guarda sexo y zonas, y rechaza valores que no existen', () => {
  const base = profile()
  assert.ok(isUserProfile(base))
  assert.ok(isUserProfile({ ...base, sex: 'mujer', careZones: ['rodilla', 'espalda_baja'] }))
  assert.ok(isUserProfile({ ...base, sex: null, careZones: [] }))
  assert.equal(isUserProfile({ ...base, sex: 'otro' }), false)
  assert.equal(isUserProfile({ ...base, careZones: ['pie'] }), false)
})
