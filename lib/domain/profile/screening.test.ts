/**
 * La evaluación inicial (D-058): salud, historia y lo que cambian en AXIS.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAxisContext } from '../axis/context'
import { decide } from '../axis/engine'
import { proactiveNote } from '../axis/proactive'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import type { WorkoutSession } from '../workouts/types'
import { evaluationSteps, isRampUp, needsMedicalClearance, RAMP_UP_SESSIONS } from './screening'
import { isUserProfile, type UserProfile } from './types'

// Lunes 7 de septiembre de 2026.
const MONDAY = new Date(2026, 8, 7, 10, 0)

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4, 5],
    typicalSessionMinutes: 45,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

const GREAT = {
  dayKey: '2026-09-07',
  sleepHours: 9,
  energy: 5 as const,
  muscleFatigue: 1 as const,
  stress: 1 as const,
  hydrationGlasses: 8,
  updatedAt: '2026-09-07T08:00:00.000Z',
}

function done(dayKey: string): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 1800,
    focus: 'tren_inferior',
    title: '',
    intensity: 'moderada',
    muscleGroups: ['piernas'],
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: 3,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

function decideFor(user: UserProfile, sessions: WorkoutSession[] = []) {
  return decide(buildAxisContext({ profile: user, recoveryInputs: GREAT, recentSessions: sessions, activities: [], now: MONDAY }))
}

test('un «sí» de salud pide visto bueno; con él, o todo «no», nada cambia', () => {
  assert.equal(needsMedicalClearance(profile()), false, 'sin contestar no se supone nada')
  assert.equal(needsMedicalClearance(profile({ health: { flags: [], cleared: false } })), false)
  assert.equal(needsMedicalClearance(profile({ health: { flags: ['mareos'], cleared: false } })), true)
  assert.equal(needsMedicalClearance(profile({ health: { flags: ['mareos'], cleared: true } })), false)
})

test('empezar con margen: quien nunca entrenó o vuelve de un parón largo, en sus primeras sesiones', () => {
  const sessions = (count: number) => Array.from({ length: count }, (_, i) => done(`2026-08-${String(10 + i).padStart(2, '0')}`))
  assert.equal(isRampUp(profile({ background: { history: 'nunca', status: 'parado_largo' } }), []), true)
  assert.equal(isRampUp(profile({ background: { history: 'mas_2_anos', status: 'parado_largo' } }), sessions(2)), true)
  assert.equal(isRampUp(profile({ background: { history: 'mas_2_anos', status: 'entrenando' } }), []), false)
  assert.equal(isRampUp(profile({ background: { history: 'nunca', status: 'parado_largo' } }), sessions(RAMP_UP_SESSIONS)), false)
  assert.equal(isRampUp(profile(), []), false, 'sin contestar no se supone nada')
})

test('sin visto bueno del médico no hay día fuerte, y AXIS lo dice', () => {
  assert.equal(decideFor(profile()).primary.session?.intensity, 'alta', 'el mismo día, sin el «sí», es fuerte')
  const primary = decideFor(profile({ health: { flags: ['corazon'], cleared: false } })).primary
  assert.equal(primary.session?.intensity, 'moderada')
  assert.ok(primary.factors.some((factor) => factor.key === 'health_check'))
  assert.ok(!primary.factors.some((factor) => factor.key === 'hard_day'))
})

test('quien empieza entrena ligero, con margen y explicado', () => {
  const primary = decideFor(profile({ background: { history: 'nunca', status: 'parado_largo' } })).primary
  assert.equal(primary.session?.intensity, 'ligera')
  assert.ok(primary.factors.some((factor) => factor.key === 'ramp_up'))
})

test('la nota de AXIS recuerda el visto bueno antes que nada', () => {
  const note = proactiveNote({
    dayKey: '2026-09-07',
    profile: profile({ health: { flags: ['medicacion'], cleared: false } }),
    sessions: [],
    catalog: EXERCISE_CATALOG,
    discomfortsYesterday: ['rodilla'],
    recoveryRegistered: false,
  })
  assert.equal(note?.kind, 'health_check')
})

test('los cuatro pasos de la evaluación y la forma guardada', () => {
  const steps = (user: UserProfile, completedTests = 0, scans = 0) =>
    evaluationSteps({ profile: user, completedTests, scans }).filter((step) => step.done).map((step) => step.key)
  assert.deepEqual(steps(profile()), [])
  const answered = profile({ health: { flags: [], cleared: false }, background: { history: 'hasta_2_anos', status: 'entrenando' } })
  assert.deepEqual(steps(answered, 1, 1), ['salud', 'historia', 'test', 'escaneo'])
  assert.ok(isUserProfile(JSON.parse(JSON.stringify(answered))))
  assert.ok(!isUserProfile({ ...answered, health: { flags: ['inventada'], cleared: false } }))
  assert.ok(!isUserProfile({ ...answered, background: { history: 'siempre', status: 'entrenando' } }))
})
