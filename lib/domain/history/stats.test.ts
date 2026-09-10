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
// El mes: todos los días del mes natural, numerados
// ---------------------------------------------------------------------------

test('el mes tiene un punto por cada día que tenga ese mes', () => {
  // Septiembre 30, octubre 31, febrero 28, febrero bisiesto 29.
  assert.equal(computeHistoryStats([], 'mes', '2026-09-09').points.length, 30)
  assert.equal(computeHistoryStats([], 'mes', '2026-10-09').points.length, 31)
  assert.equal(computeHistoryStats([], 'mes', '2026-02-09').points.length, 28)
  assert.equal(computeHistoryStats([], 'mes', '2028-02-09').points.length, 29)
})

test('los puntos del mes se etiquetan 1, 2, 3… hasta el último día', () => {
  const labels = computeHistoryStats([], 'mes', '2026-10-09').points.map((p) => p.label)
  assert.equal(labels[0], '1')
  assert.equal(labels[1], '2')
  assert.equal(labels[2], '3')
  assert.equal(labels.at(-1), '31')
  assert.deepEqual(labels, Array.from({ length: 31 }, (_, i) => String(i + 1)))
})

test('el volumen del mes cae en el día que le corresponde', () => {
  const sessions = [session('2026-09-01', 700), session('2026-09-30', 300)]
  const points = computeHistoryStats(sessions, 'mes', '2026-09-30').points

  assert.equal(points[0].value, 700, 'el día 1')
  assert.equal(points[29].value, 300, 'el día 30')
  assert.equal(points[14].value, 0, 'un día sin entrenar vale cero')
})

test('los días del mes que aún no han llegado se marcan como futuros', () => {
  const points = computeHistoryStats([], 'mes', '2026-09-09').points

  assert.equal(points[8].future, false, 'hoy, día 9, no es futuro')
  assert.equal(points[7].future, false, 'ayer tampoco')
  assert.equal(points[9].future, true, 'mañana sí')
  assert.equal(points.at(-1)?.future, true, 'el último día del mes sí')
})

test('el último día del mes ya no queda nada en futuro', () => {
  const points = computeHistoryStats([], 'mes', '2026-09-30').points
  assert.equal(points.filter((p) => p.future).length, 0)
})

test('una sesión de otro mes no entra en el mes actual', () => {
  const sessions = [session('2026-08-31', 5000), session('2026-10-01', 5000)]
  const stats = computeHistoryStats(sessions, 'mes', '2026-09-09')
  assert.equal(stats.sessionCount, 0)
  assert.equal(stats.totalVolumeKg, 0)
})

// ---------------------------------------------------------------------------
// El año: los doce meses
// ---------------------------------------------------------------------------

test('el año tiene doce puntos, de enero a diciembre', () => {
  const points = computeHistoryStats([], 'anio', '2026-09-09').points
  assert.equal(points.length, 12)
  assert.deepEqual(
    points.map((p) => p.label),
    ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  )
})

test('el volumen del año se agrupa en el mes correcto', () => {
  const sessions = [
    session('2026-01-15', 400),
    session('2026-01-20', 600),
    session('2026-09-05', 250),
  ]
  const points = computeHistoryStats(sessions, 'anio', '2026-09-09').points

  assert.equal(points[0].value, 1000, 'enero suma sus dos sesiones')
  assert.equal(points[8].value, 250, 'septiembre')
  assert.equal(points[5].value, 0, 'junio, sin entrenar')
})

test('los meses posteriores al actual son futuros; el actual no', () => {
  const points = computeHistoryStats([], 'anio', '2026-09-09').points
  assert.equal(points[8].future, false, 'septiembre está en curso')
  assert.equal(points[9].future, true, 'octubre no ha llegado')
  assert.equal(points.filter((p) => p.future).length, 3, 'quedan octubre, noviembre y diciembre')
})

test('una sesión de otro año no entra en el año actual', () => {
  const stats = computeHistoryStats([session('2025-12-31', 5000)], 'anio', '2026-09-09')
  assert.equal(stats.sessionCount, 0)
})

// ---------------------------------------------------------------------------
// El periodo se nombra
// ---------------------------------------------------------------------------

test('cada rango dice qué periodo está mirando', () => {
  assert.equal(computeHistoryStats([], 'mes', '2026-09-09').periodLabel, 'Septiembre de 2026')
  assert.equal(computeHistoryStats([], 'anio', '2026-09-09').periodLabel, '2026')
  assert.equal(computeHistoryStats([], 'semana', '2026-09-09').periodLabel, '7–13 de septiembre de 2026')
})

// ---------------------------------------------------------------------------
// Variación de rendimiento
// ---------------------------------------------------------------------------

test('un mes recién empezado se compara contra lo mismo del mes pasado', () => {
  // Estamos a día 3. Lo justo es medir contra los días 1 a 3 del mes anterior,
  // no contra el mes anterior entero, que siempre saldría ganando.
  const sessions = [
    session('2026-08-02', 1000), // dentro de la ventana comparable
    session('2026-08-20', 9000), // fuera: el mes pasado ya iba por el día 20
    session('2026-09-02', 1500),
  ]
  const delta = computePerformanceDelta(sessions, 'mes', '2026-09-03')

  assert.equal(delta.available, true)
  assert.equal(delta.percent, 50, '1500 contra 1000')
  assert.equal(delta.comparisonLabel, 'vs. mes pasado')
})

test('el año en curso se compara contra el mismo tramo del año pasado', () => {
  const sessions = [
    session('2025-03-10', 2000),
    session('2025-11-10', 8000), // fuera de la ventana: aún no hemos llegado a noviembre
    session('2026-03-10', 1000),
  ]
  const delta = computePerformanceDelta(sessions, 'anio', '2026-09-09')

  assert.equal(delta.percent, -50, '1000 contra 2000')
  assert.equal(delta.comparisonLabel, 'vs. año pasado')
})

test('comparar el 31 con el mes anterior más corto no se desborda a marzo', () => {
  const sessions = [session('2026-02-28', 1000), session('2026-03-31', 1000)]
  const delta = computePerformanceDelta(sessions, 'mes', '2026-03-31')

  // La ventana anterior es febrero entero, del 1 al 28. Si el desplazamiento se
  // desbordase al 3 de marzo, la sesión del 28 de febrero se perdería.
  assert.equal(delta.available, true)
  assert.equal(delta.percent, 0)
})


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
