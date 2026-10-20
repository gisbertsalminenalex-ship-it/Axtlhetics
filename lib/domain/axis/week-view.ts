/**
 * La semana a la vista (D-048): lo hecho, lo de hoy y lo previsto, de lunes a
 * domingo.
 *
 * Lo previsto sale del mismo motor que decide cada día: se recorren los días
 * que quedan suponiendo una recuperación normal y que lo anterior se hace como
 * está previsto. No es un compromiso: AXIS vuelve a decidir cada día con los
 * datos de ese día, y por eso no se prevén días fuertes.
 */

import { activityOccursOn, isAvailableOn } from '../profile/types'
import { bandFor } from '../recovery/weights'
import type { RecoveryScore } from '../recovery/types'
import { addDays, startOfWeek, weekdayOfKey, type DayKey } from '../shared/dates'
import type { PlannedSession, WorkoutSession } from '../workouts/types'
import { decide } from './engine'
import type { AxisContext, AxisProposal } from './types'
import { isTrainingRecommendation } from './types'

/** La recuperación que se supone a un día futuro: buena, pero sin llegar a día fuerte. */
export const ASSUMED_RECOVERY = 78

export type WeekDayStatus = 'done' | 'today' | 'planned' | 'rest'

export type WeekDayView = {
  dayKey: DayKey
  status: WeekDayStatus
  isToday: boolean
  /** Lo que se hizo, se hace hoy o se prevé. `null` en un día de descanso. */
  title: string | null
  /** Hoy es día fuerte (D-048). Solo hoy: los demás no se prevén. */
  hard: boolean
  /** Deportes y partidos de ese día. */
  activities: string[]
}

function assumedScore(): RecoveryScore {
  return { status: 'ok', value: ASSUMED_RECOVERY, band: bandFor(ASSUMED_RECOVERY), factors: [], strongest: [], weakest: [] }
}

/** Una sesión prevista, como si se hubiera hecho tal cual: para que el día siguiente la tenga en cuenta. */
function asDone(session: PlannedSession, dayKey: DayKey): WorkoutSession {
  const exercises = session.exercises.map((planned) => ({
    exerciseId: planned.exerciseId,
    name: planned.name,
    sets: Array.from({ length: planned.sets }, () => ({ reps: planned.reps, weightKg: planned.suggestedWeightKg, completed: true })),
    targetSets: planned.sets,
    targetReps: planned.reps,
    ...(planned.phase ? { phase: planned.phase } : {}),
    ...(planned.warmupPart ? { warmupPart: planned.warmupPart } : {}),
  }))
  return {
    id: `prevista-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: session.estimatedMinutes * 60,
    focus: session.focus,
    title: session.title,
    intensity: session.intensity,
    muscleGroups: session.muscleGroups,
    exercises,
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    effort: 3,
    proposal: { proposalId: 'prevista', type: 'TRAINING', headline: '', reason: '', focus: session.focus, intensity: session.intensity, ...(session.deload ? { deload: true } : {}) },
    modifications: [],
    notes: null,
    ...(session.goal ? { goal: session.goal } : {}),
  }
}

export function projectWeek(
  context: AxisContext,
  /** La propuesta que el usuario tiene seleccionada hoy. */
  selected: AxisProposal | null,
  options: {
    /** Si el entrenamiento de hoy se movió a mañana (D-022), mañana es día disponible. */
    movedTo?: DayKey | null
  } = {},
): WeekDayView[] {
  const today = context.dayKey
  const monday = startOfWeek(today)
  const completed = context.recentSessions.filter((session) => session.status === 'completed')
  // Lo que se va dando por hecho, de lo más nuevo a lo más antiguo, como el historial.
  let simulated = [...context.recentSessions]

  const activitiesOn = (dayKey: DayKey) =>
    context.activities.filter((activity) => activityOccursOn(activity, dayKey)).map((activity) => activity.name)

  const days: WeekDayView[] = []
  for (let i = 0; i < 7; i += 1) {
    const dayKey = addDays(monday, i)
    const isToday = dayKey === today
    const done = completed.filter((session) => session.dayKey === dayKey)
    const base = { dayKey, isToday, activities: activitiesOn(dayKey) }

    if (done.length > 0) {
      days.push({ ...base, status: 'done', title: done.map((session) => session.title).join(' + '), hard: false })
      continue
    }

    if (dayKey < today) {
      days.push({ ...base, status: 'rest', title: null, hard: false })
      continue
    }

    if (isToday) {
      const session = selected && isTrainingRecommendation(selected.type) ? selected.session : null
      days.push({
        ...base,
        status: session ? 'today' : 'rest',
        title: session?.title ?? null,
        hard: session?.intensity === 'alta',
      })
      if (session) simulated = [asDone(session, dayKey), ...simulated]
      continue
    }

    const available =
      (context.profile ? isAvailableOn(context.profile, weekdayOfKey(dayKey)) : true) || options.movedTo === dayKey
    if (!available) {
      days.push({ ...base, status: 'rest', title: null, hard: false })
      continue
    }

    const decision = decide({
      ...context,
      dayKey,
      minuteOfDay: 10 * 60,
      recoveryInputs: null,
      recoveryScore: assumedScore(),
      recentSessions: simulated,
      cancelledToday: [],
      availableMinutesToday: null,
      movedFromYesterday: options.movedTo === dayKey,
      withoutEquipmentToday: false,
    })
    const session = isTrainingRecommendation(decision.primary.type) ? decision.primary.session : null
    days.push({ ...base, status: session ? 'planned' : 'rest', title: session?.title ?? null, hard: false })
    if (session) simulated = [asDone(session, dayKey), ...simulated]
  }
  return days
}
