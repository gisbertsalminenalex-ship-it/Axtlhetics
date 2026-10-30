/**
 * Resúmenes semanales para la app AXIS (D-076, contrato axis.snapshot.v1).
 *
 * Función pura: recibe los datos del dispositivo y devuelve un snapshot por semana,
 * desde la primera semana con algún dato hasta la actual. Solo lleva las métricas
 * que el usuario ha activado; nunca registros sueltos, nombres ni texto libre.
 */
import type { BackupContents } from '../backup/backup'
import { computeRecoveryScore } from '../recovery/score'
import type { RecoveryInputs } from '../recovery/types'
import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import { findExercise } from '../workouts/catalog'
import { targetProgress } from '../workouts/targets'
import { SNAPSHOT_SCHEMA, type MetricValue, type Snapshot, type SnapshotGoal } from './contract'
import type { AxthleticsMetric } from './sharing'

export type SnapshotInput = {
  data: Pick<BackupContents, 'profile' | 'sessions' | 'recovery' | 'measurements' | 'assessments'>
  metrics: readonly AxthleticsMetric[]
  today: DayKey
  generatedAt: string
  appVersion: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Media de los valores registrados, con su cobertura. Sin ninguno: `null`, nunca 0. */
function average(values: readonly (number | null)[], round: (n: number) => number = round1): MetricValue {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return { value: null, n: 0 }
  return { value: round(present.reduce((a, b) => a + b, 0) / present.length), n: present.length }
}

function inWeek(dayKey: DayKey, weekStart: DayKey): boolean {
  return dayKey >= weekStart && dayKey <= addDays(weekStart, 6)
}

function weekMetrics(weekStart: DayKey, input: SnapshotInput): Partial<Record<AxthleticsMetric, MetricValue>> {
  const { data } = input
  const sessions = data.sessions.filter((s) => inWeek(s.dayKey, weekStart))
  const completed = sessions.filter((s) => s.status === 'completed')
  const recovery: RecoveryInputs[] = data.recovery.filter((r) => inWeek(r.dayKey, weekStart))
  const age = data.profile?.age
  const weights = data.measurements
    .filter((m) => inWeek(m.dayKey, weekStart) && m.weightKg !== null)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))

  const all: Record<AxthleticsMetric, () => MetricValue> = {
    sessions_completed: () => ({ value: completed.length }),
    sessions_abandoned: () => ({ value: sessions.filter((s) => s.status === 'abandoned').length }),
    training_minutes: () => ({ value: Math.round(completed.reduce((sum, s) => sum + s.durationSeconds, 0) / 60) }),
    volume_kg: () => ({ value: Math.round(completed.reduce((sum, s) => sum + s.totalVolumeKg, 0)) }),
    sessions_modified: () => ({ value: completed.filter((s) => s.modifications.length > 0).length }),
    sleep_hours_avg: () => average(recovery.map((r) => r.sleepHours)),
    energy_avg: () => average(recovery.map((r) => r.energy)),
    stress_avg: () => average(recovery.map((r) => r.stress)),
    muscle_fatigue_avg: () => average(recovery.map((r) => r.muscleFatigue)),
    recovery_score_avg: () =>
      average(
        recovery.map((r) => {
          const score = computeRecoveryScore(r, { age })
          return score.status === 'ok' ? score.value : null
        }),
        Math.round,
      ),
    weight_kg: () => ({ value: weights.length > 0 ? weights[weights.length - 1].weightKg : null }),
  }

  const metrics: Partial<Record<AxthleticsMetric, MetricValue>> = {}
  for (const key of input.metrics) metrics[key] = all[key]()
  return metrics
}

/** Los objetivos medibles (D-035) tal como están hoy. Solo van en el snapshot de la semana actual. */
function currentGoals(input: SnapshotInput): SnapshotGoal[] {
  const { profile, sessions, assessments } = input.data
  return (profile?.targets ?? []).map((target) => {
    const progress = targetProgress(target, sessions, input.today, assessments)
    const span = target.target - target.startValue
    const ratio = span > 0 ? (progress.current - target.startValue) / span : progress.current >= target.target ? 1 : 0
    const name = findExercise(target.exerciseId)?.name ?? 'Objetivo'
    return {
      id: target.id,
      title: `${name}: ${target.target}`,
      progress: Math.min(1, Math.max(0, Math.round(ratio * 100) / 100)),
      target: target.target,
      deadline: target.deadline,
      status: progress.status === 'achieved' ? 'completed' : 'active',
    }
  })
}

/** La primera semana con algún dato que interese a AXIS, o la actual si no hay ninguno. */
function firstWeek(input: SnapshotInput): DayKey {
  const days = [
    ...input.data.sessions.map((s) => s.dayKey),
    ...input.data.recovery.map((r) => r.dayKey),
    ...input.data.measurements.filter((m) => m.weightKg !== null).map((m) => m.dayKey),
  ].filter((day) => day <= input.today)
  const first = days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : input.today
  return startOfWeek(first)
}

export function buildWeeklySnapshots(input: SnapshotInput): Snapshot[] {
  const current = startOfWeek(input.today)
  const snapshots: Snapshot[] = []
  for (let week = firstWeek(input); week <= current; week = addDays(week, 7)) {
    snapshots.push({
      schema: SNAPSHOT_SCHEMA,
      app: 'axthletics',
      appVersion: input.appVersion,
      weekStart: week,
      complete: addDays(week, 6) < input.today,
      generatedAt: input.generatedAt,
      metrics: weekMetrics(week, input),
      goals: week === current ? currentGoals(input) : [],
    })
  }
  return snapshots
}
