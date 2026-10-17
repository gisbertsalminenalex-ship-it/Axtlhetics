import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../profile/types'
import { addDays } from '../shared/dates'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import type { WorkoutSession } from '../workouts/types'
import { proactiveNote, type ProactiveInput } from './proactive'

/** Lunes 2026-10-12 y miércoles 2026-10-14. */
const MONDAY = '2026-10-12'
const WEDNESDAY = '2026-10-14'

function session(dayKey: string, partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_inferior',
    title: 'Fuerza · Tren inferior',
    intensity: 'moderada',
    muscleGroups: ['piernas'],
    exercises: [{ exerciseId: 'sentadilla', name: 'Sentadilla', sets: [1, 2, 3].map(() => ({ reps: 12, weightKg: null, completed: true })) }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

const PROFILE: UserProfile = {
  id: 'primary',
  name: 'Alex',
  age: 15,
  heightCm: 175,
  weightKg: 68,
  goals: ['hipertrofia'],
  experience: 'intermedio',
  availableWeekdays: [0, 2, 4],
  typicalSessionMinutes: 45,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
}

function input(partial: Partial<ProactiveInput> = {}): ProactiveInput {
  return {
    dayKey: WEDNESDAY,
    profile: PROFILE,
    sessions: [],
    catalog: EXERCISE_CATALOG,
    discomfortsYesterday: [],
    recoveryRegistered: true,
    ...partial,
  }
}

test('D-038: sin nada que decir, AXIS no dice nada', () => {
  assert.equal(proactiveNote(input()), null)
})

test('D-038: una molestia de ayer va primero, y nunca diagnostica', () => {
  const note = proactiveNote(input({ discomfortsYesterday: ['rodilla'], recoveryRegistered: false }))
  assert.equal(note?.kind, 'discomfort')
  assert.match(note!.text, /^Ayer me contaste una molestia en la rodilla\. ¿Cómo va\?/)
})

test('D-038: el lunes, el resumen de la semana pasada con la zona más atrasada', () => {
  const note = proactiveNote(input({ dayKey: MONDAY, sessions: [session(addDays(MONDAY, -3)), session(addDays(MONDAY, -5))] }))
  assert.equal(note?.kind, 'weekly_summary')
  assert.match(note!.text, /^La semana pasada: 2 sesiones y 6 series\. Lo que más se quedó atrás: [a-zúé]+/)
})

test('D-038: un objetivo por detrás, y si no, la recuperación sin registrar', () => {
  const target = { id: 't', exerciseId: 'flexiones', target: 20, deadline: '2026-11-30', startValue: 5, createdAt: '2026-09-01T09:00:00.000Z' }
  const behind = proactiveNote(input({ profile: { ...PROFILE, targets: [target] }, recoveryRegistered: false }))
  assert.equal(behind?.kind, 'goal_behind')
  assert.match(behind!.text, /^Tu objetivo de flexiones va por detrás: llevas 0 reps/)

  assert.equal(proactiveNote(input({ recoveryRegistered: false }))?.kind, 'register_recovery')
})

test('D-038: el primer día de una semana de descarga se avisa; el resto de la semana, no', () => {
  const loaded = [1, 2, 3, 4].flatMap((back) => [0, 2].map((offset) => session(addDays(addDays(MONDAY, -7 * back), offset))))
  assert.equal(proactiveNote(input({ dayKey: WEDNESDAY, sessions: loaded }))?.kind, 'deload')
  const trainedThisWeek = [...loaded, session(MONDAY)]
  assert.notEqual(proactiveNote(input({ dayKey: WEDNESDAY, sessions: trainedThisWeek }))?.kind, 'deload')
})
