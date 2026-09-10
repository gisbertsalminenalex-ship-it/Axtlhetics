import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeTrainingLoad,
  effortFactorFor,
  KG_PER_LOAD_UNIT,
  loadBandFor,
  LOAD_FULL_SCALE_UNITS,
  sessionLoadUnits,
  sessionsInLoadWindow,
  TRAINING_LOAD_WINDOW_DAYS,
} from './load'
import type { SessionIntensity, WorkoutSession } from './types'

const TODAY = '2026-09-08'
const YESTERDAY = '2026-09-07'
const LAST_WEEK = '2026-08-30'

function session(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `session-${Math.random()}`,
    dayKey: TODAY,
    startedAt: `${TODAY}T18:00:00.000Z`,
    completedAt: `${TODAY}T19:00:00.000Z`,
    durationSeconds: 45 * 60,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada' as SessionIntensity,
    muscleGroups: ['pecho'],
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: 3,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Datos insuficientes
// ---------------------------------------------------------------------------

test('sin ningún entrenamiento no se calcula una carga', () => {
  const load = computeTrainingLoad([], TODAY)
  assert.equal(load.status, 'insufficient_data')
  if (load.status !== 'insufficient_data') return
  assert.ok(load.reason.length > 0)
  assert.equal(load.windowDays, TRAINING_LOAD_WINDOW_DAYS)
})

test('un entrenamiento fuera de la ventana no cuenta', () => {
  const load = computeTrainingLoad([session({ dayKey: LAST_WEEK })], TODAY)
  assert.equal(load.status, 'insufficient_data')
})

test('una sesión abandonada no genera carga', () => {
  const load = computeTrainingLoad([session({ status: 'abandoned' })], TODAY)
  assert.equal(load.status, 'insufficient_data')
})

test('una sesión futura no entra en la ventana', () => {
  const load = computeTrainingLoad([session({ dayKey: '2026-09-20' })], TODAY)
  assert.equal(load.status, 'insufficient_data')
})

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

test('con un solo entrenamiento ya se calcula una carga baja', () => {
  const load = computeTrainingLoad([session()], TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.equal(load.sessionCount, 1)
  assert.equal(load.band, 'baja')
  assert.ok(load.value > 0 && load.value < 40, `carga inesperada: ${load.value}`)
})

test('varios entrenamientos suman carga', () => {
  const one = computeTrainingLoad([session()], TODAY)
  const three = computeTrainingLoad(
    [session(), session({ dayKey: YESTERDAY }), session({ dayKey: '2026-09-06' })],
    TODAY,
  )
  assert.equal(one.status, 'ok')
  assert.equal(three.status, 'ok')
  if (one.status !== 'ok' || three.status !== 'ok') return
  assert.ok(three.value > one.value)
  assert.equal(three.sessionCount, 3)
})

test('una semana muy exigente llega a carga alta', () => {
  const hard = Array.from({ length: 5 }, (_, i) =>
    session({
      dayKey: `2026-09-0${4 + i}`,
      durationSeconds: 70 * 60,
      intensity: 'alta',
      perceivedEffort: 5,
    }),
  )
  const load = computeTrainingLoad(hard, TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.equal(load.band, 'alta')
  assert.ok(load.value >= 75)
})

test('la carga nunca pasa de 100 por muchas sesiones que haya', () => {
  const absurd = Array.from({ length: 20 }, () =>
    session({ durationSeconds: 180 * 60, intensity: 'alta', perceivedEffort: 5 }),
  )
  const load = computeTrainingLoad(absurd, TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.equal(load.value, 100)
})

test('la misma sesión repetida da siempre el mismo resultado', () => {
  const sessions = [session(), session({ dayKey: YESTERDAY })]
  const first = computeTrainingLoad(sessions, TODAY)
  const second = computeTrainingLoad(sessions, TODAY)
  assert.deepEqual(first, second)
})

test('sesiones idénticas producen unidades idénticas', () => {
  const a = session()
  const b = session()
  assert.equal(sessionLoadUnits(a), sessionLoadUnits(b))
})

// ---------------------------------------------------------------------------
// Factores y valores límite
// ---------------------------------------------------------------------------

test('la intensidad registrada pesa en la carga', () => {
  const light = sessionLoadUnits(session({ intensity: 'ligera' }))
  const moderate = sessionLoadUnits(session({ intensity: 'moderada' }))
  const hard = sessionLoadUnits(session({ intensity: 'alta' }))
  assert.ok(light < moderate)
  assert.ok(moderate < hard)
})

test('el esfuerzo percibido modula la carga y sin dato no penaliza', () => {
  assert.ok(effortFactorFor(1) < effortFactorFor(3))
  assert.ok(effortFactorFor(3) < effortFactorFor(5))
  assert.equal(effortFactorFor(null), 1)
  assert.equal(effortFactorFor(99), 1, 'un valor fuera de escala no rompe el cálculo')
})

test('el volumen aporta a la carga sin dominarla', () => {
  const withoutVolume = sessionLoadUnits(session({ totalVolumeKg: 0 }))
  const withVolume = sessionLoadUnits(session({ totalVolumeKg: KG_PER_LOAD_UNIT }))
  assert.equal(withVolume - withoutVolume, 1)
})

test('una sesión de duración cero no rompe el cálculo', () => {
  const units = sessionLoadUnits(session({ durationSeconds: 0, totalVolumeKg: 0 }))
  assert.equal(units, 0)
  const load = computeTrainingLoad([session({ durationSeconds: 0, totalVolumeKg: 0 })], TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.equal(load.value, 0)
  assert.equal(load.band, 'baja')
})

test('valores corruptos no producen NaN ni Infinity', () => {
  const broken = session({
    durationSeconds: Number.NaN,
    totalVolumeKg: Number.POSITIVE_INFINITY,
  })
  const units = sessionLoadUnits(broken)
  assert.ok(Number.isFinite(units), `unidades no finitas: ${units}`)

  const load = computeTrainingLoad([broken], TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.ok(Number.isFinite(load.value))
  assert.ok(load.value >= 0 && load.value <= 100)
})

test('una duración negativa no resta carga', () => {
  assert.equal(sessionLoadUnits(session({ durationSeconds: -3600, totalVolumeKg: 0 })), 0)
})

// ---------------------------------------------------------------------------
// Bandas y ventana
// ---------------------------------------------------------------------------

test('las bandas de carga respetan sus umbrales', () => {
  assert.equal(loadBandFor(0), 'baja')
  assert.equal(loadBandFor(39), 'baja')
  assert.equal(loadBandFor(40), 'moderada')
  assert.equal(loadBandFor(74), 'moderada')
  assert.equal(loadBandFor(75), 'alta')
  assert.equal(loadBandFor(100), 'alta')
})

test('la ventana solo recoge los últimos días completados', () => {
  const sessions = [
    session({ dayKey: TODAY }),
    session({ dayKey: YESTERDAY }),
    session({ dayKey: LAST_WEEK }),
  ]
  const inWindow = sessionsInLoadWindow(sessions, TODAY)
  assert.equal(inWindow.length, 2)
})

test('la escala de referencia es la que convierte unidades en 0-100', () => {
  const single = session({
    durationSeconds: LOAD_FULL_SCALE_UNITS * 60,
    intensity: 'ligera',
    perceivedEffort: 3,
    totalVolumeKg: 0,
  })
  const load = computeTrainingLoad([single], TODAY)
  assert.equal(load.status, 'ok')
  if (load.status !== 'ok') return
  assert.equal(load.value, 100)
})
