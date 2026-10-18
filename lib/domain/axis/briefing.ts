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

import { fixedPushUpVariant } from '../assessment/assessment'
import { summarizeScan, type ScanPriority, type ScanZone } from '../scanner/summary'
import { compareScans } from '../scanner/compare'
import { sortScans } from '../scanner/types'
import { recommendedPushUpVariant } from '../assessment/protocol'
import { assessmentStatusFor, type AxisAssessmentStatus } from './assessment'
import type { TrainingGoal } from '../profile/types'
import type { ScheduledActivity } from '../profile/types'
import { isDatedActivity, sportsFromActivities } from '../profile/types'
import type { RecoveryBand } from '../recovery/types'
import { computeHistoryStats } from '../history/stats'
import { RECOVERY_FACTOR_LABELS } from '../recovery/types'
import { formatMinutesOfDay, type DayKey } from '../shared/dates'
import { computeTrainingLoad, type TrainingLoadBand } from '../workouts/load'
import type { SessionFocus, WorkoutSession } from '../workouts/types'
import { isMainExercise, MUSCLE_GROUP_LABELS } from '../workouts/types'
import { EXERCISE_CATALOG, findExercise } from '../workouts/catalog'
import { targetProgress, type TargetStatus } from '../workouts/targets'
import { physiquePlan, planSummary } from '../scanner/physique'
import { laggingGroup, weeklyVolume } from '../workouts/weekly-volume'
import { deriveFacts } from './facts'
import type { ReportedLoadMemory } from './memory'
import type { AxisContext, AxisDecision, AxisFacts, AxisProposal, AxisRecommendationType } from './types'
import { isTrainingRecommendation } from './types'

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

/** Una actividad de un día concreto que todavía no ha llegado (D-018). */
export type BriefingUpcomingActivity = {
  name: string
  /** Día local, `YYYY-MM-DD`. */
  date: string
  intensity: string
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
    /** El entrenamiento, sin el calentamiento ni la vuelta a la calma (D-032). */
    exercises: { name: string; sets: number; reps: number; isTimed: boolean; weightKg: number | null }[]
    /** Nombres del calentamiento y de la vuelta a la calma, sin series: no son datos que razonar (D-032). */
    warmup: string[]
    cooldown: string[]
  } | null
  /**
   * Las alternativas que AXIS ya ha preparado, con lo necesario para poder
   * aplicarlas: sin el `id` la conversación solo podría hablar de ellas, no
   * cambiar la sesión.
   */
  alternatives: BriefingAlternative[]
  /**
   * De qué se cambió, si el usuario aceptó una propuesta de AXIS hoy.
   *
   * `null` cuando la sesión es la que AXIS recomendaba. Permite responder a
   * «¿qué hemos cambiado?» sin que AXIS lo mencione en cada respuesta.
   */
  changedFrom: { headline: string; reason: string } | null
}

export type BriefingAlternative = {
  id: string
  label: string
  type: AxisRecommendationType
  /** `null` cuando la alternativa es no entrenar. */
  focus: SessionFocus | null
  estimatedMinutes: number | null
}

export type BriefingWeek = {
  sessionCount: number
  totalSeconds: number
  totalVolumeKg: number
  /** Variación respecto a la semana anterior. `null` si no hay con qué comparar. */
  performancePercent: number | null
  /**
   * El grupo que más va por detrás de su objetivo semanal de series (D-034), o
   * `null` si todos lo han cumplido. Las series pueden ser medias.
   */
  lagging: { group: string; sets: number; target: number } | null
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
    /** Objetivos medibles con su progreso (D-035): la mejor serie frente a la cifra. */
    targets: {
      exercise: string
      unit: 'reps' | 's'
      target: number
      current: number
      deadline: DayKey
      status: TargetStatus
    }[]
  } | null
  recovery: BriefingRecovery
  load: BriefingLoad
  proposal: BriefingProposal | null
  lastSession: BriefingSession | null
  week: BriefingWeek
  activitiesToday: BriefingActivity[]
  /** Deportes de mañana: influyen en cuánta carga conviene meter hoy. */
  activitiesTomorrow: BriefingActivity[]
  /**
   * Partidos y demás actividades de un día concreto posteriores a hoy, por
   * fecha (D-018). No deciden nada hoy —eso es `activitiesToday` y
   * `activitiesTomorrow`—; sirven para no decir que no hay deporte registrado
   * cuando hay un partido el sábado.
   */
  upcomingDatedActivities: BriefingUpcomingActivity[]
  daysSinceLastWorkout: number | null
  trainedToday: boolean
  recentMuscleGroups: string[]
  /**
   * Cargas que el usuario ha contado hoy y que no están registradas.
   *
   * Vienen de la memoria del día. La conversación las usa como evidencia; el
   * motor no las mira: no son datos, son lo que el usuario dice.
   */
  reportedLoads: ReportedLoadMemory[]
  /** Fatiga muscular registrada hoy (1–5), o `null` si no está registrada. */
  fatigueLevel: number | null
  /** Lo reorganizado hoy (D-022). Lo usa la conversación; no decide nada. */
  reorganization: BriefingReorganization
  /**
   * El test de evolución (D-021). Solo se usa para responder cuando el usuario
   * pregunta por él: AXIS no lo menciona por su cuenta.
   */
  assessment: BriefingAssessment
  /**
   * El último escaneo corporal (D-023), o `null` si no hay. Como el test, solo
   * se usa cuando el usuario pregunta por él, y **nunca** se envía a la capa de
   * lenguaje (`toAiBriefing` lo quita).
   */
  scan: BriefingScan | null
}

export type BriefingScan = {
  dayKey: DayKey
  index: number | null
  /** La conclusión del resumen, en la voz de AXIS. */
  overview: string
  strongZones: ScanZone[]
  weakZones: ScanZone[]
  priority: ScanPriority | null
  improvements: string[]
  /** Los pasos de acción del resumen, solo el texto. */
  actions: string[]
  /** Frente al escaneo anterior, si lo hay: el titular y lo que se movió más que su margen. */
  comparison: { headline: string; changes: string[] } | null
  /** Lo que el escaneo ya cambia en las sesiones (D-041), en una frase; `null` si no pide nada. */
  plan: string | null
}

export type BriefingAssessment = {
  completedToday: boolean
  inProgressToday: boolean
  interruptedToday: boolean
  status: AxisAssessmentStatus['status']
  reasons: AxisAssessmentStatus['reasons']
  lastCompletedDay: DayKey | null
  nextEligibleDay: DayKey | null
  completedCount: number
  /**
   * La variante de flexiones del próximo test: la fijada por el último test
   * completado o, si no hay ninguno, la recomendada para el nivel (principiante →
   * inclinadas; intermedio y avanzado → estándar). `null` sin perfil.
   */
  pushUp: { name: string; fixed: boolean } | null
  /** Por qué el motor decide descansar hoy, si lo decide. Es su explicación, no una nueva. */
  restReason: string | null
}

export type BriefingReorganization = {
  /** El entrenamiento de hoy se movió a ese día. */
  movedTo: DayKey | null
  /** El de ayer se movió a hoy: no se puede volver a aplazar. */
  movedFromYesterday: boolean
  /** Minutos que el usuario dijo tener hoy y confirmó. */
  statedMinutes: number | null
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
  /**
   * La propuesta que el usuario tiene realmente seleccionada.
   *
   * Sin esto, el briefing describiría siempre la principal y AXIS hablaría de una
   * sesión distinta de la que muestra Inicio en cuanto se acepta un cambio.
   */
  selected?: AxisProposal | null,
  /** La elección confirmada de hoy, si la hay. */
  override?: { originHeadline: string; reason: string } | null,
  /** Lo que el usuario ha contado hoy. Por defecto, nada. */
  reportedLoads: readonly ReportedLoadMemory[] = [],
  /** A qué día se movió hoy el entrenamiento, si se movió (D-022). */
  movedTo: DayKey | null = null,
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
          targets: (context.profile.targets ?? []).map((target) => {
            const progress = targetProgress(target, sessions, context.dayKey, context.assessments ?? [])
            const exercise = findExercise(target.exerciseId)
            return {
              exercise: exercise?.name ?? target.exerciseId,
              unit: exercise?.work.isTimed ? ('s' as const) : ('reps' as const),
              target: target.target,
              current: progress.current,
              deadline: target.deadline,
              status: progress.status,
            }
          }),
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
    proposal: decision ? briefingProposal(decision, selected ?? null, override ?? null) : null,
    lastSession: lastCompleted ? briefingSession(lastCompleted) : null,
    week: {
      sessionCount: week.sessionCount,
      totalSeconds: week.totalSeconds,
      totalVolumeKg: week.totalVolumeKg,
      performancePercent: week.performance.available ? week.performance.percent : null,
      lagging: (() => {
        const behind = laggingGroup(
          weeklyVolume(
            sessions,
            context.dayKey,
            context.catalog.length > 0 ? context.catalog : EXERCISE_CATALOG,
            context.profile?.experience ?? 'intermedio',
          ),
        )
        return behind ? { group: MUSCLE_GROUP_LABELS[behind.group], sets: behind.sets, target: behind.target } : null
      })(),
    },
    activitiesToday: facts.todayActivities.map((activity) =>
      toBriefingActivity(activity, facts.minutesUntilActivity, context.minuteOfDay),
    ),
    activitiesTomorrow: facts.tomorrowActivities.map((activity) =>
      toBriefingActivity(activity, null, context.minuteOfDay),
    ),
    upcomingDatedActivities: upcomingDated(context.activities, context.dayKey),
    daysSinceLastWorkout: facts.daysSinceLastWorkout,
    trainedToday: facts.trainedToday,
    recentMuscleGroups: [...facts.recentMuscleGroups],
    reportedLoads: [...reportedLoads],
    fatigueLevel: facts.fatigueLevel,
    reorganization: {
      movedTo,
      movedFromYesterday: context.movedFromYesterday === true,
      statedMinutes: context.availableMinutesToday ?? null,
    },
    assessment: briefingAssessment(context, facts, decision),
    scan: briefingScan(context, sessions),
  }
}

/** El último escaneo, resumido con el dominio del escáner y la fuerza y el entrenamiento de ahora. */
function briefingScan(context: AxisContext, sessions: readonly WorkoutSession[]): BriefingScan | null {
  const [last, previous] = sortScans(context.scans ?? [])
  if (!last) return null
  const summary = summarizeScan({
    shots: last.measurements,
    assessments: context.assessments ?? [],
    sessions,
    experience: context.profile?.experience ?? null,
    selfReport: last.selfReport,
    body: context.profile ? { heightCm: context.profile.heightCm, age: context.profile.age, weightKg: context.profile.weightKg } : null,
    previous: previous ?? null,
    today: last.dayKey,
  })
  return {
    dayKey: last.dayKey,
    index: summary.index,
    overview: summary.overview,
    strongZones: [...last.selfReport.strongZones],
    weakZones: [...last.selfReport.weakZones],
    priority: last.selfReport.priority,
    improvements: summary.improvements,
    actions: summary.actions.map((action) => action.text),
    plan: planSummary(physiquePlan(last)),
    comparison: previous
      ? (() => {
          const c = compareScans(
            {
              shots: last.measurements,
              index: summary.index,
              scores: Object.fromEntries(summary.categories.map((x) => [x.key, x.score])),
              bodyFatPct: last.result.bodyFatPct ?? null,
            },
            previous,
          )
          return { headline: c.headline, changes: c.changes.filter((x) => x.trend === 'better' || x.trend === 'worse').map((x) => x.text) }
        })()
      : null,
  }
}

function briefingAssessment(
  context: AxisContext,
  facts: AxisFacts,
  decision: AxisDecision | null,
): BriefingAssessment {
  const assessments = context.assessments ?? []
  const status = decision ? assessmentStatusFor(context, facts, decision) : null

  const fixed = fixedPushUpVariant(assessments)
  const variantId = fixed ?? (context.profile ? recommendedPushUpVariant(context.profile.experience) : null)
  const variant = variantId ? findExercise(variantId, context.catalog) : null

  return {
    completedToday: facts.assessmentCompletedToday,
    inProgressToday: facts.assessmentInProgressToday,
    interruptedToday: facts.assessmentInterruptedToday,
    // Sin decisión del motor no se sabe si hoy toca descansar: no se da por disponible.
    status: status?.status ?? 'unavailable',
    reasons: status?.reasons ?? [],
    lastCompletedDay: status?.lastCompletedDay ?? null,
    nextEligibleDay: status?.nextEligibleDay ?? null,
    completedCount: status?.completedCount ?? 0,
    pushUp: variant ? { name: variant.name, fixed: fixed !== null } : null,
    restReason: decision && !isTrainingRecommendation(decision.primary.type) ? decision.primary.reason : null,
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

function briefingProposal(
  decision: AxisDecision,
  selected: AxisProposal | null,
  override: { originHeadline: string; reason: string } | null,
): BriefingProposal {
  const all = [decision.primary, ...decision.alternatives]
  // La activa es la seleccionada, o la principal si el usuario no ha cambiado nada.
  const primary = all.find((item) => item.id === selected?.id) ?? decision.primary

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
          // El entrenamiento; el calentamiento y la vuelta a la calma no son datos que razonar (D-032).
          exercises: primary.session.exercises.filter(isMainExercise).map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            isTimed: exercise.isTimed,
            weightKg: exercise.suggestedWeightKg,
          })),
          warmup: primary.session.exercises.filter((exercise) => exercise.phase === 'calentamiento').map((exercise) => exercise.name),
          cooldown: primary.session.exercises.filter((exercise) => exercise.phase === 'vuelta_calma').map((exercise) => exercise.name),
        }
      : null,
    // Todo lo que no es la sesión activa. Si el usuario ya cambió a una de las
    // alternativas, la principal vuelve a estar disponible como opción.
    alternatives: all
      .filter((item) => item.id !== primary.id)
      .map((alternative) => ({
        id: alternative.id,
        label: alternative.label,
        type: alternative.type,
        focus: alternative.session?.focus ?? null,
        estimatedMinutes: alternative.session?.estimatedMinutes ?? null,
      })),
    changedFrom: override
      ? { headline: override.originHeadline, reason: override.reason }
      : null,
  }
}

function briefingSession(session: WorkoutSession): BriefingSession {
  return {
    dayKey: session.dayKey,
    title: session.title,
    focus: session.focus,
    durationSeconds: session.durationSeconds,
    totalVolumeKg: session.totalVolumeKg,
    exerciseCount: session.exercises.filter(isMainExercise).length,
    modifications: session.modifications.map((modification) => modification.detail),
  }
}

/**
 * Las actividades de un día concreto posteriores a `dayKey`, de la más cercana
 * a la más lejana. Las pasadas no cuentan, y las de hoy ya están en
 * `activitiesToday`. Los `DayKey` locales se ordenan bien como texto.
 */
function upcomingDated(
  activities: readonly ScheduledActivity[],
  dayKey: string,
): BriefingUpcomingActivity[] {
  return activities
    .filter((activity): activity is ScheduledActivity & { date: string } =>
      isDatedActivity(activity) && activity.date > dayKey,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((activity) => ({ name: activity.name, date: activity.date, intensity: activity.intensity }))
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
