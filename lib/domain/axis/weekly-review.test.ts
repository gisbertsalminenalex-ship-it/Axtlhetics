/**
 * La revisión de la semana (D-059).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import type { CompletedSet, WorkoutSession } from '../workouts/types'
import { proactiveNote } from './proactive'
import { describeImprovement, reviewHeadline, weeklyReview } from './weekly-review'

// Lunes 19 de octubre de 2026: se revisa la semana del 12 al 18.
const TODAY = '2026-10-19'

const PROFILE: Pick<UserProfile, 'age' | 'availableWeekdays' | 'experience'> = {
  age: 25,
  availableWeekdays: [0, 2, 4],
  experience: 'intermedio',
}

function session(dayKey: string, exercises: { id: string; sets: CompletedSet[] }[]): WorkoutSession {
  return {
    id: dayKey,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: '',
    intensity: 'moderada',
    muscleGroups: ['espalda'],
    exercises: exercises.map(({ id, sets }) => ({ exerciseId: id, name: id, sets })),
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: 3,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

const set = (reps: number, weightKg: number | null = null, reserve?: CompletedSet['reserve']): CompletedSet => ({
  reps,
  weightKg,
  completed: true,
  ...(reserve ? { reserve } : {}),
})

function recovery(dayKey: string, sleepHours: number): RecoveryInputs {
  return { dayKey, sleepHours, energy: 4, muscleFatigue: 2, stress: 2, hydrationGlasses: 6, updatedAt: `${dayKey}T08:00:00.000Z` }
}

const HISTORY = [
  // La semana revisada.
  session('2026-10-16', [{ id: 'remo-unilateral', sets: [set(12, 8, 'tres_mas')] }, { id: 'flexiones', sets: [set(12)] }]),
  session('2026-10-13', [{ id: 'flexiones', sets: [set(11)] }]),
  // Antes.
  session('2026-10-09', [{ id: 'remo-unilateral', sets: [set(12, 8, 'una_dos')] }, { id: 'flexiones', sets: [set(10)] }]),
]

function review(sessions = HISTORY, days: RecoveryInputs[] = []) {
  return weeklyReview({ today: TODAY, profile: PROFILE as UserProfile, sessions, recovery: days, catalog: EXERCISE_CATALOG })
}

test('sin sesiones la semana pasada no hay revisión', () => {
  assert.equal(review([HISTORY[2]]), null)
})

test('sesiones hechas de las previstas, y lo que mejoró frente a la última vez antes de la semana', () => {
  const result = review()!
  assert.equal(result.weekStart, '2026-10-12')
  assert.equal(result.sessions, 2)
  assert.equal(result.planned, 3)
  // Remo: 8 × (12 + 1) → 11,5 kg; 8 × (12 + 3) → 12 kg. Flexiones: 10 → 12 (la mejor de la semana).
  assert.deepEqual(
    result.improvements.map(describeImprovement),
    ['Flexiones: 10 → 12 reps', 'Remo unilateral con pesa: 1RM estimado 11,5 → 12 kg'],
  )
})

test('el sueño y la recuperación de la semana; poco sueño se dice', () => {
  const result = review(HISTORY, [recovery('2026-10-13', 6), recovery('2026-10-15', 6.5), recovery('2026-10-20', 9)])!
  assert.equal(result.averageSleepHours, 6.3)
  assert.ok(result.averageRecovery !== null)
  assert.ok(result.next.some((line) => line.startsWith('Dormiste 6,3 h de media')))
})

test('lo que AXIS hará: el bloque, la sesión que faltó', () => {
  const result = review()!
  assert.match(result.next[0], /^Semana 3 del bloque/)
  assert.ok(result.next.some((line) => line.startsWith('Te faltó una sesión')))
})

test('el lunes, la nota de AXIS es el resumen de la revisión', () => {
  const result = review()!
  assert.equal(
    reviewHeadline(result),
    'La semana pasada: 2 de 3 sesiones. Mejoraste en flexiones y remo unilateral con pesa. Tienes la revisión completa en Entrenamiento.',
  )
  const note = proactiveNote({
    dayKey: TODAY,
    profile: null,
    sessions: HISTORY,
    catalog: EXERCISE_CATALOG,
    discomfortsYesterday: [],
    recoveryRegistered: true,
    review: result,
  })
  assert.equal(note?.text, reviewHeadline(result))
})
