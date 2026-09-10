/**
 * Briefing de AXIS: el contexto que se usa para conversar.
 *
 * Es una **vista tipada y reducida** del `AxisContext` más la decisión que ya ha
 * tomado el motor determinista. No es el estado de la aplicación serializado: cada
 * campo está aquí porque alguna pregunta lo necesita, y nada se duplica.
 *
 * Todo lo que contiene viene del dominio, nunca de una interpretación:
 *
 * - Recovery Score → `computeRecoveryScore`
 * - Training Load → `computeTrainingLoad`
 * - Propuesta del día → `AxisEngine.decide`
 * - Historial y calendario → repositorios
 *
 * Cuando un dato no existe, el campo es `null`. **Nunca se rellena con una
 * estimación**: es lo que permite que AXIS diga «no lo sé» en lugar de inventar.
 */

import type { TrainingGoal } from '../profile/types'
import type { ScheduledActivity } from '../profile/types'
import { sportsFromActivities } from '../profile/types'
import type { RecoveryBand } from '../recovery/types'
import { computeHistoryStats } from '../history/stats'
import { RECOVERY_FACTOR_LABELS } from '../recovery/types'
import { formatMinutesOfDay, type DayKey } from '../shared/dates'
import { computeTrainingLoad, type TrainingLoadBand } from '../workouts/load'
import type { SessionFocus, WorkoutSession } from '../workouts/types'
import { deriveFacts } from './facts'
import type { AxisContext, AxisDecision, AxisRecommendationType } from './types'

export type BriefingRecovery =
  | { known: false; missing: string[]; reason: string }
  | {
      known: true
      value: number
      band: RecoveryBand
      /** Factores registrados que peor están, en lenguaje de usuario. */
      weakest: string[]
      sleepHours: number | null
      hydrationGlasses: number | null
    }

export type BriefingLoad =
  | { known: false }
  | { known: true; value: number; band: TrainingLoadBand; sessionCount: number; windowDays: number }

export type BriefingSession = {
  dayKey: DayKey
  title: string
  focus: SessionFocus
  durationSeconds: number
  totalVolumeKg: number
  exerciseCount: number
  /** Diferencias respecto a lo que AXIS había propuesto. */
  modifications: string[]
}

export type BriefingActivity = {
  name: string
  weekday: number
  /** Franja horaria, o null si el usuario no la registró. */
  window: string | null
  intensity: string
  /** `true` si ocurre hoy y todavía no ha terminado. */
  today: boolean
  minutesUntilStart: number | null
}

export type BriefingProposal = {
  type: AxisRecommendationType
  headline: string
  reason: string
  /** Factores que decidieron, tal y como los expone el motor determinista. */
  factors: { label: string; detail: string }[]
  session: {
    title: string
    focus: SessionFocus
    estimatedMinutes: number
    exercises: { name: string; sets: number; reps: number; isTimed: boolean; weightKg: number | null }[]
  } | null
  alternatives: string[]
}

export type BriefingWeek = {
  sessionCount: number
  totalSeconds: number
  totalVolumeKg: number
  /** Variación respecto a la semana anterior. `null` si no hay con qué comparar. */
  performancePercent: number | null
}

export type AxisBriefing = {
  dayKey: DayKey
  /** `null` cuando todavía no hay perfil. */
  profile: {
    name: string
    age: number
    goals: TrainingGoal[]
    experience: string
    availableToday: boolean
    typicalSessionMinutes: number
    availableMinutesToday: number
    sports: { name: string; weekdays: number[]; intensity: string }[]
  } | null
  recovery: BriefingRecovery
  load: BriefingLoad
  proposal: BriefingProposal | null
  lastSession: BriefingSession | null
  week: BriefingWeek
  activitiesToday: BriefingActivity[]
  /** Deportes de mañana: influyen en cuánta carga conviene meter hoy. */
  activitiesTomorrow: BriefingActivity[]
  daysSinceLastWorkout: number | null
  trainedToday: boolean
  recentMuscleGroups: string[]
}

/**
 * Construye el briefing a partir del mismo contexto y la misma decisión que usa la
 * pantalla de Inicio. Es lo que garantiza que la conversación no pueda contradecir
 * a la recomendación mostrada.
 */
export function buildBriefing(
  context: AxisContext,
  decision: AxisDecision | null,
  sessions: readonly WorkoutSession[],
): AxisBriefing {
  const facts = deriveFacts(context)
  const load = computeTrainingLoad(sessions, context.dayKey)
  const week = computeHistoryStats(sessions, 'semana', context.dayKey)

  const lastCompleted =
    sessions.find((session) => session.status === 'completed' && session.dayKey !== context.dayKey) ??
    sessions.find((session) => session.status === 'completed') ??
    null

  return {
    dayKey: context.dayKey,
    profile: context.profile
      ? {
          name: context.profile.name,
          age: context.profile.age,
          goals: [...context.profile.goals],
          experience: context.profile.experience,
          availableToday: facts.isAvailableToday,
          typicalSessionMinutes: context.profile.typicalSessionMinutes,
          availableMinutesToday: facts.availableMinutes,
          sports: sportsFromActivities(context.activities).map((sport) => ({
            name: sport.name,
            weekdays: [...sport.weekdays],
            intensity: sport.intensity,
          })),
        }
      : null,
    recovery: briefingRecovery(context),
    load:
      load.status === 'ok'
        ? {
            known: true,
            value: load.value,
            band: load.band,
            sessionCount: load.sessionCount,
            windowDays: load.windowDays,
          }
        : { known: false },
    proposal: decision ? briefingProposal(decision) : null,
    lastSession: lastCompleted ? briefingSession(lastCompleted) : null,
    week: {
      sessionCount: week.sessionCount,
      totalSeconds: week.totalSeconds,
      totalVolumeKg: week.totalVolumeKg,
      performancePercent: week.performance.available ? week.performance.percent : null,
    },
    activitiesToday: facts.todayActivities.map((activity) =>
      toBriefingActivity(activity, facts.minutesUntilActivity, context.minuteOfDay),
    ),
    activitiesTomorrow: facts.tomorrowActivities.map((activity) =>
      toBriefingActivity(activity, null, context.minuteOfDay),
    ),
    daysSinceLastWorkout: facts.daysSinceLastWorkout,
    trainedToday: facts.trainedToday,
    recentMuscleGroups: [...facts.recentMuscleGroups],
  }
}

function briefingRecovery(context: AxisContext): BriefingRecovery {
  const score = context.recoveryScore

  if (!score || score.status !== 'ok') {
    return {
      known: false,
      missing: (score?.missing ?? []).map((key) => RECOVERY_FACTOR_LABELS[key].toLowerCase()),
      reason: score?.reason ?? 'Todavía no has registrado tu recuperación de hoy.',
    }
  }

  return {
    known: true,
    value: score.value,
    band: score.band,
    weakest: score.weakest.map((key) => RECOVERY_FACTOR_LABELS[key].toLowerCase()),
    sleepHours: context.recoveryInputs?.sleepHours ?? null,
    hydrationGlasses: context.recoveryInputs?.hydrationGlasses ?? null,
  }
}

function briefingProposal(decision: AxisDecision): BriefingProposal {
  const { primary } = decision

  return {
    type: primary.type,
    headline: primary.headline,
    reason: primary.reason,
    factors: primary.factors.map((factor) => ({ label: factor.label, detail: factor.detail })),
    session: primary.session
      ? {
          title: primary.session.title,
          focus: primary.session.focus,
          estimatedMinutes: primary.session.estimatedMinutes,
          exercises: primary.session.exercises.map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            isTimed: exercise.isTimed,
            weightKg: exercise.suggestedWeightKg,
          })),
        }
      : null,
    alternatives: decision.alternatives.map((alternative) => alternative.label),
  }
}

function briefingSession(session: WorkoutSession): BriefingSession {
  return {
    dayKey: session.dayKey,
    title: session.title,
    focus: session.focus,
    durationSeconds: session.durationSeconds,
    totalVolumeKg: session.totalVolumeKg,
    exerciseCount: session.exercises.length,
    modifications: session.modifications.map((modification) => modification.detail),
  }
}

/** Traduce una actividad guardada a la vista que usa la conversación. */
function toBriefingActivity(
  activity: ScheduledActivity,
  minutesUntilStart: number | null,
  minuteOfDay: number,
): BriefingActivity {
  return {
    name: activity.name,
    weekday: activity.weekday,
    window:
      activity.startMinute === null || activity.endMinute === null
        ? null
        : `${formatMinutesOfDay(activity.startMinute)}–${formatMinutesOfDay(activity.endMinute)}`,
    intensity: activity.intensity,
    today: activity.endMinute === null || activity.endMinute > minuteOfDay,
    minutesUntilStart,
  }
}
