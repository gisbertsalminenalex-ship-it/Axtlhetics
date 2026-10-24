/**
 * Sesiones mínimas para los tests de XP (D-071). Solo para tests.
 */

import type { CompletedSet, WorkoutSession } from '../workouts/types'

export function session(
  dayKey: string,
  options: { reps?: number; deload?: boolean; id?: string; status?: 'completed' | 'abandoned'; time?: string } = {},
): WorkoutSession {
  const sets: CompletedSet[] = [{ reps: options.reps ?? 10, weightKg: null, completed: true }]
  const time = options.time ?? '18:00:00'
  return {
    id: options.id ?? `${dayKey}-${time}`,
    dayKey,
    startedAt: `${dayKey}T${time}.000Z`,
    completedAt: `${dayKey}T${time}.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: '',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [{ exerciseId: 'flexiones', name: 'Flexiones', sets }],
    totalVolumeKg: 0,
    status: options.status ?? 'completed',
    perceivedEffort: null,
    effort: 3,
    proposal: {
      proposalId: 'p',
      type: 'TRAINING',
      headline: '',
      reason: '',
      focus: 'tren_superior',
      intensity: 'moderada',
      ...(options.deload ? { deload: true } : {}),
    },
    modifications: [],
    notes: null,
  }
}
