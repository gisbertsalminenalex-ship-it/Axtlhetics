import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session } from '../progression/test-fixtures'
import type { RecoveryInputs } from '../recovery/types'
import type { BodyMeasurement } from '../body/measurements'
import { validateSnapshot } from './contract'
import { DEFAULT_METRICS, isEcosystemSharing } from './sharing'
import { buildWeeklySnapshots, type SnapshotInput } from './snapshot'

function recovery(dayKey: string, values: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return { dayKey, sleepHours: null, energy: null, muscleFatigue: null, stress: null, hydrationGlasses: null, updatedAt: `${dayKey}T08:00:00Z`, ...values }
}

function weight(dayKey: string, weightKg: number): BodyMeasurement {
  return { dayKey, weightKg, perimeters: {}, updatedAt: `${dayKey}T08:00:00Z` }
}

function input(overrides: Partial<SnapshotInput['data']> = {}, metrics: SnapshotInput['metrics'] = DEFAULT_METRICS): SnapshotInput {
  return {
    data: { profile: null, sessions: [], recovery: [], measurements: [], assessments: [], ...overrides },
    metrics,
    today: '2026-10-30', // jueves
    generatedAt: '2026-10-30T18:00:00Z',
    appVersion: 'test',
  }
}

test('sin datos hay un solo snapshot, el de la semana actual, sin terminar', () => {
  const snapshots = buildWeeklySnapshots(input())
  assert.equal(snapshots.length, 1)
  assert.equal(snapshots[0].weekStart, '2026-10-26')
  assert.equal(snapshots[0].complete, false)
  assert.deepEqual(snapshots[0].metrics.sessions_completed, { value: 0 })
  assert.deepEqual(snapshots[0].metrics.sleep_hours_avg, { value: null, n: 0 })
})

test('un snapshot por semana desde la primera con datos, también las semanas vacías', () => {
  const snapshots = buildWeeklySnapshots(input({ sessions: [session('2026-10-07')] }))
  assert.deepEqual(
    snapshots.map((s) => [s.weekStart, s.complete]),
    [
      ['2026-10-05', true],
      ['2026-10-12', true],
      ['2026-10-19', true],
      ['2026-10-26', false],
    ],
  )
  assert.deepEqual(snapshots[1].metrics.sessions_completed, { value: 0 })
})

test('las sesiones se cuentan por semana y solo las completadas suman minutos', () => {
  const [week] = buildWeeklySnapshots(
    input({ sessions: [session('2026-10-27'), session('2026-10-29', { status: 'abandoned' }), { ...session('2026-10-30', { id: 'x' }), modifications: [{ kind: 'exercise_skipped', detail: '' }], totalVolumeKg: 1234.6 }] }),
  )
  assert.deepEqual(week.metrics.sessions_completed, { value: 2 })
  assert.deepEqual(week.metrics.sessions_abandoned, { value: 1 })
  assert.deepEqual(week.metrics.training_minutes, { value: 120 })
  assert.deepEqual(week.metrics.volume_kg, { value: 1235 })
  assert.deepEqual(week.metrics.sessions_modified, { value: 1 })
})

test('las medias usan solo los días registrados y dicen cuántos son', () => {
  const [week] = buildWeeklySnapshots(
    input({ recovery: [recovery('2026-10-26', { sleepHours: 7, energy: 4 }), recovery('2026-10-27', { sleepHours: 8.5 }), recovery('2026-10-28')] }),
  )
  assert.deepEqual(week.metrics.sleep_hours_avg, { value: 7.8, n: 2 })
  assert.deepEqual(week.metrics.energy_avg, { value: 4, n: 1 })
  assert.deepEqual(week.metrics.stress_avg, { value: null, n: 0 })
})

test('solo viajan las métricas activadas; el peso no va por defecto', () => {
  const data = { measurements: [weight('2026-10-27', 70), weight('2026-10-29', 70.4)] }
  assert.equal(buildWeeklySnapshots(input(data))[0].metrics.weight_kg, undefined)
  const [week] = buildWeeklySnapshots(input(data, ['weight_kg']))
  assert.deepEqual(Object.keys(week.metrics), ['weight_kg'])
  assert.deepEqual(week.metrics.weight_kg, { value: 70.4 })
})

test('todos los snapshots cumplen el contrato axis.snapshot.v1', () => {
  const snapshots = buildWeeklySnapshots(
    input({ sessions: [session('2026-09-30')], recovery: [recovery('2026-10-01', { sleepHours: 6, energy: 3, muscleFatigue: 2, stress: 2, hydrationGlasses: 5 })] }, [
      ...DEFAULT_METRICS,
      'weight_kg',
    ]),
  )
  for (const snapshot of snapshots) assert.equal(validateSnapshot(snapshot).ok, true, snapshot.weekStart)
})

test('el consentimiento solo admite métricas conocidas', () => {
  assert.equal(isEcosystemSharing({ metrics: ['sessions_completed'], since: '2026-10-30T18:00:00Z' }), true)
  assert.equal(isEcosystemSharing({ metrics: ['mood_avg'], since: '2026-10-30T18:00:00Z' }), false)
  assert.equal(isEcosystemSharing({ metrics: [], since: 'ayer' }), false)
})
