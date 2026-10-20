/**
 * Días fuertes y la semana a la vista (D-048).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { ExperienceLevel, ScheduledActivity, UserProfile } from '../profile/types'
import type { WorkoutSession } from '../workouts/types'
import { proposeAction } from './action-engine'
import { validateAction } from './actions'
import { buildAxisContext } from './context'
import { decide } from './engine'
import { HARD_DAYS_PER_WEEK, hardDaysThisWeek } from './hard-day'
import { projectWeek } from './week-view'

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

function session(dayKey: string, partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 1800,
    focus: 'tren_inferior',
    title: 'Hipertrofia · Tren inferior',
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
    ...partial,
  }
}

function activity(partial: Partial<ScheduledActivity>): ScheduledActivity {
  return {
    id: 'a',
    name: 'Baloncesto',
    weekday: 1,
    date: null,
    startMinute: null,
    endMinute: null,
    intensity: 'media',
    loadsMuscleGroups: ['piernas'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function day(options: { experience?: ExperienceLevel; sessions?: WorkoutSession[]; activities?: ScheduledActivity[]; goals?: UserProfile['goals'] } = {}) {
  const context = buildAxisContext({
    profile: profile({ experience: options.experience ?? 'intermedio', ...(options.goals ? { goals: options.goals } : {}) }),
    recoveryInputs: GREAT,
    recentSessions: options.sessions ?? [],
    activities: options.activities ?? [],
    now: MONDAY,
  })
  return { context, decision: decide(context) }
}

test('con todo a favor, un intermedio tiene día fuerte: intensidad alta, explicado, con la versión normal a mano', () => {
  const { decision } = day()
  const primary = decision.primary
  assert.equal(primary.session?.intensity, 'alta')
  assert.match(primary.headline, /^Día fuerte/)
  assert.ok(primary.factors.some((factor) => factor.key === 'hard_day'))
  assert.match(primary.reason, /día fuerte/)

  const normal = decision.alternatives.find((item) => item.rule === 'alternative_normal')
  assert.ok(normal, 'falta la versión normal')
  assert.equal(normal!.session?.intensity, 'moderada')
  assert.equal(normal!.session?.focus, primary.session?.focus)
})

test('«Prefiero la versión normal» es un cambio válido que lleva a la sesión normal', () => {
  const { context, decision } = day()
  const target = decision.alternatives.find((item) => item.rule === 'alternative_normal')!
  // El mismo camino que el botón: el motor de acciones propone el cambio (D-012).
  const action = proposeAction(
    { context, decision, selected: decision.primary },
    { proposedTarget: { type: target.type, focus: target.session!.focus }, proposedReason: 'Hoy prefiero la versión normal.' },
  )
  assert.ok(action && action.type === 'change_training')
  const check = validateAction(action, decision, context, decision.primary)
  assert.ok(check.ok)
  if (check.ok) assert.equal(check.target.session?.intensity, 'moderada')
})

test('el día fuerte lleva una serie más que la versión normal', () => {
  const { decision } = day()
  const normal = decision.alternatives.find((item) => item.rule === 'alternative_normal')!
  const setsOf = (exercises: { sets: number; phase?: string }[]) =>
    exercises.filter((item) => !item.phase).reduce((total, item) => total + item.sets, 0) /
    Math.max(1, exercises.filter((item) => !item.phase).length)
  assert.ok(setsOf(decision.primary.session!.exercises) > setsOf(normal.session!.exercises))
})

test('un principiante no tiene días fuertes; los límites por experiencia viven en un solo sitio', () => {
  assert.deepEqual(HARD_DAYS_PER_WEEK, { principiante: 0, intermedio: 1, avanzado: 2 })
  assert.notEqual(day({ experience: 'principiante' }).decision.primary.session?.intensity, 'alta')
})

test('nunca dos días fuertes seguidos, ni más de los de la semana', () => {
  // Domingo de la semana pasada, fuerte: hoy es otra semana pero es ayer.
  const yesterdayHard = day({ sessions: [session('2026-09-06', { intensity: 'alta' })] })
  assert.notEqual(yesterdayHard.decision.primary.session?.intensity, 'alta')

  // Un intermedio con su día fuerte ya hecho esta semana.
  const wednesday = new Date(2026, 8, 9, 10, 0)
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: { ...GREAT, dayKey: '2026-09-09' },
    recentSessions: [session('2026-09-07', { intensity: 'alta' })],
    activities: [],
    now: wednesday,
  })
  assert.equal(hardDaysThisWeek(context.recentSessions, context.dayKey), 1)
  assert.notEqual(decide(context).primary.session?.intensity, 'alta')

  // Un avanzado aún tiene el segundo.
  const advanced = buildAxisContext({ ...context, profile: profile({ experience: 'avanzado' }), recoveryInputs: { ...GREAT, dayKey: '2026-09-09' }, recentSessions: context.recentSessions, activities: [], now: wednesday })
  assert.equal(decide(advanced).primary.session?.intensity, 'alta')
})

test('con un deporte hoy o mañana no hay día fuerte', () => {
  assert.notEqual(day({ activities: [activity({ weekday: 0 })] }).decision.primary.session?.intensity, 'alta')
  assert.notEqual(day({ activities: [activity({ weekday: 1 })] }).decision.primary.session?.intensity, 'alta')
  // Un deporte suave no lo impide.
  assert.equal(day({ activities: [activity({ weekday: 1, intensity: 'baja' })] }).decision.primary.session?.intensity, 'alta')
})

// ---------------------------------------------------------------------------
// La semana a la vista
// ---------------------------------------------------------------------------

test('la semana va de lunes a domingo: hoy, lo previsto en los días disponibles y descanso en los demás', () => {
  const { context, decision } = day()
  const week = projectWeek(context, decision.primary)
  assert.equal(week.length, 7)
  assert.equal(week[0].dayKey, '2026-09-07')
  assert.equal(week[0].status, 'today')
  assert.equal(week[0].hard, true)
  // Disponibles: lunes, miércoles, viernes y sábado.
  assert.deepEqual(week.map((item) => item.status), ['today', 'rest', 'planned', 'rest', 'planned', 'planned', 'rest'])
  // Lo previsto tiene título y nunca se da por fuerte.
  for (const item of week.filter((entry) => entry.status === 'planned')) {
    assert.ok(item.title)
    assert.equal(item.hard, false)
  }
})

test('lo hecho se ve como hecho, y los deportes de cada día aparecen', () => {
  const wednesday = new Date(2026, 8, 9, 10, 0)
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: { ...GREAT, dayKey: '2026-09-09' },
    recentSessions: [session('2026-09-07')],
    activities: [activity({ weekday: 3, intensity: 'alta' })],
    now: wednesday,
  })
  const week = projectWeek(context, decide(context).primary)
  assert.equal(week[0].status, 'done')
  assert.equal(week[0].title, 'Hipertrofia · Tren inferior')
  assert.equal(week[1].status, 'rest')
  assert.deepEqual(week[3].activities, ['Baloncesto'])
})

test('lo previsto no mueve nada real: el contexto queda igual', () => {
  const { context, decision } = day()
  const before = JSON.stringify(context)
  projectWeek(context, decision.primary)
  assert.equal(JSON.stringify(context), before)
})
