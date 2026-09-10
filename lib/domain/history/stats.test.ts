import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkoutSession } from '../workouts/types'
import {
  computeHistoryStats,
  computePerformanceDelta,
  formatTotalTime,
  formatVolume,
  weeklyActivityFor,
} from './stats'

// 2026-09-07 es lunes; la semana va del 7 al 13.
const MONDAY = '2026-09-07'
const TUESDAY = '2026-09-08'
const WEDNESDAY = '2026-09-09'
const PREVIOUS_MONDAY = '2026-08-31'

function session(dayKey: string, volumeKg: number, seconds = 3600): WorkoutSession {
  return {
    id: `session-${dayKey}-${volumeKg}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: seconds,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [],
    totalVolumeKg: volumeKg,
    status: 'completed',
    perceivedEffort: 4,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

// ---------------------------------------------------------------------------
// Robustez del gráfico
// ---------------------------------------------------------------------------

test('sin ninguna sesión no produce NaN ni Infinity', () => {
  const stats = computeHistoryStats([], 'semana', WEDNESDAY)
  assert.equal(stats.sessionCount, 0)
  assert.equal(stats.totalVolumeKg, 0)
  assert.equal(stats.performance.available, false)
  assert.equal(stats.performance.percent, null)
  for (const point of stats.points) {
    assert.ok(Number.isFinite(point.value), `punto no finito: ${point.value}`)
  }
})

test('la semana siempre devuelve siete puntos, haya datos o no', () => {
  assert.equal(computeHistoryStats([], 'semana', WEDNESDAY).points.length, 7)
  assert.equal(
    computeHistoryStats([session(MONDAY, 1000)], 'semana', WEDNESDAY).points.length,
    7,
  )
})

test('con un único entrenamiento el resto de puntos vale cero, no indefinido', () => {
  const stats = computeHistoryStats([session(MONDAY, 1000)], 'semana', WEDNESDAY)
  const values = stats.points.map((point) => point.value)
  assert.equal(values[0], 1000)
  assert.deepEqual(values.slice(1), [0, 0, 0, 0, 0, 0])
})

test('con todos los valores iguales no se divide entre cero', () => {
  const sessions = [session(MONDAY, 500), session(TUESDAY, 500), session(WEDNESDAY, 500)]
  const stats = computeHistoryStats(sessions, 'semana', WEDNESDAY)
  for (const point of stats.points) {
    assert.ok(Number.isFinite(point.value))
  }
  assert.equal(stats.totalVolumeKg, 1500)
})

test('el mes y el año también devuelven puntos finitos sin datos', () => {
  for (const range of ['mes', 'anio'] as const) {
    const stats = computeHistoryStats([], range, WEDNESDAY)
    assert.ok(stats.points.length > 1, `${range} necesita más de un punto`)
    for (const point of stats.points) {
      assert.ok(Number.isFinite(point.value))
    }
  }
})

// ---------------------------------------------------------------------------
// Variación de rendimiento
// ---------------------------------------------------------------------------

test('sin semana anterior no se muestra porcentaje', () => {
  const delta = computePerformanceDelta([session(MONDAY, 1000)], 'semana', WEDNESDAY)
  assert.equal(delta.available, false)
  assert.equal(delta.percent, null)
})

test('con semana anterior calcula la variación real', () => {
  const sessions = [session(PREVIOUS_MONDAY, 1000), session(MONDAY, 1120)]
  const delta = computePerformanceDelta(sessions, 'semana', WEDNESDAY)
  assert.equal(delta.available, true)
  assert.equal(delta.percent, 12)
  assert.equal(delta.comparisonLabel, 'vs. semana pasada')
})

test('una caída se expresa como porcentaje negativo', () => {
  const sessions = [session(PREVIOUS_MONDAY, 1000), session(MONDAY, 800)]
  const delta = computePerformanceDelta(sessions, 'semana', WEDNESDAY)
  assert.equal(delta.percent, -20)
})

test('un volumen anterior de cero no genera Infinity', () => {
  const sessions = [session(PREVIOUS_MONDAY, 0), session(MONDAY, 900)]
  const delta = computePerformanceDelta(sessions, 'semana', WEDNESDAY)
  assert.equal(delta.available, false)
  assert.equal(delta.percent, null)
})

// ---------------------------------------------------------------------------
// Tira semanal y formatos
// ---------------------------------------------------------------------------

test('la tira semanal marca los días con sesión y localiza hoy', () => {
  const activity = weeklyActivityFor([session(MONDAY, 100), session(WEDNESDAY, 100)], WEDNESDAY)
  assert.deepEqual(activity.completedDays, [true, false, true, false, false, false, false])
  assert.equal(activity.todayIndex, 2)
})

test('las sesiones abandonadas no cuentan como entrenamiento hecho', () => {
  const abandoned: WorkoutSession = { ...session(MONDAY, 500), status: 'abandoned' }
  const stats = computeHistoryStats([abandoned], 'semana', WEDNESDAY)
  assert.equal(stats.sessionCount, 0)
  assert.equal(weeklyActivityFor([abandoned], WEDNESDAY).completedDays[0], false)
})

test('los formatos de tiempo y volumen no rompen con valores límite', () => {
  assert.equal(formatTotalTime(0), '0m')
  assert.equal(formatTotalTime(3600), '1h 00m')
  assert.equal(formatTotalTime(67_500), '18h 45m')
  assert.equal(formatTotalTime(-10), '0m')
  assert.equal(formatVolume(0), '0 kg')
  assert.equal(formatVolume(Number.NaN), '0 kg')
})
