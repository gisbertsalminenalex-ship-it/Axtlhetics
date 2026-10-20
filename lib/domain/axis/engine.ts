/**
 * Motor determinista de AXIS.
 *
 * Es una función pura del contexto: mismo contexto, misma decisión. No toca React,
 * ni IndexedDB, ni la red. Implementa `AxisEngine`, que es la costura por la que un
 * motor con IA externa podrá entrar más adelante sin tocar la aplicación.
 */

import { createId, nowIso } from '../shared/ids'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import { gearToday } from './context'
import { DELOAD_AFTER_WEEKS, isDeloadWeek } from '../workouts/deload'
import { JUMP_SPORT_TERMS } from './knowledge/sports'
import { planSummary, type PhysiquePlan } from '../scanner/physique'
import { isOpenTarget, targetProgress } from '../workouts/targets'
import { frequentlySkipped } from '../workouts/history'
import {
  describeQuota,
  focusForGoal,
  GOAL_NOUNS,
  goalForToday,
  isStrengthGoal,
  weekIndexOf,
  weeklyQuota,
  weekProgress,
  type GoalProgress,
} from '../workouts/weekly-plan'
import type { TrainingGoal } from '../profile/types'
import type { PlannedSession, SessionFocus } from '../workouts/types'
import { SESSION_FOCUS_LABELS } from '../workouts/types'
import { deriveFacts, MIN_SESSION_MINUTES } from './facts'
import {
  chooseFocus,
  describeFocus,
  evaluateRules,
  intensityFor,
  muscleGroupsToAvoid,
} from './rules'
import { buildSession, DEFAULT_EXPERIENCE, DEFAULT_GOALS } from './session-builder'
import type {
  AxisContext,
  AxisDecision,
  AxisEngine,
  AxisFactor,
  AxisFacts,
  AxisProposal,
  AxisRecommendationType,
} from './types'
import { isTrainingRecommendation } from './types'

/** Duración de la alternativa corta que se ofrece en un día de recuperación. */
const SHORT_SESSION_MINUTES = 25

export const DETERMINISTIC_ENGINE_ID = 'axis-deterministic-v1'

export function createDeterministicAxisEngine(): AxisEngine {
  return {
    id: DETERMINISTIC_ENGINE_ID,
    decide,
  }
}

export function decide(context: AxisContext): AxisDecision {
  const facts = deriveFacts(context)
  const outcome = evaluateRules(facts)
  const week = weekPlanFor(context)
  const goal = goalOfTheDay(context, facts, outcome.type, week)
  const plan: DayPlan = { week, goal }

  // La descarga no cambia qué se decide hoy, sino cuánto: se explica la primera (D-031).
  const training = isTrainingRecommendation(outcome.type)
  const scanFactor = training && facts.physique ? physiqueFactor(facts.physique) : null
  const weekFactor = training ? weeklyGoalFactor(week, goal) : null
  const [firstRule, ...otherRules] = outcome.factors
  const factors = [
    ...(isDeloadWeek(context.recentSessions, context.dayKey) && training ? [deloadFactor()] : []),
    ...(firstRule ? [firstRule] : []),
    // Qué toca hoy de la semana (D-047), justo después de por qué se entrena así.
    ...(weekFactor ? [weekFactor] : []),
    ...otherRules,
    // El escaneo va después: explica cómo se ajusta la sesión, no por qué se entrena hoy (D-041).
    ...(scanFactor ? [scanFactor] : []),
  ]

  const primary = buildProposal(context, facts, plan, outcome.type, factors, 'Recomendada', outcome.rule)
  const alternatives = buildAlternatives(context, facts, plan, outcome.type, primary)

  return { primary, alternatives }
}

// ---------------------------------------------------------------------------
// El reparto de la semana (D-047)
// ---------------------------------------------------------------------------

/** Lo que se reparte esta semana y lo que ya está hecho. */
function weekPlanFor(context: AxisContext): GoalProgress[] {
  const goals = context.profile?.goals ?? DEFAULT_GOALS
  const days = context.profile?.availableWeekdays.length ?? 3
  const quota = weeklyQuota(goals, days, weekIndexOf(context.dayKey))
  return weekProgress(quota, context.recentSessions, context.dayKey)
}

/**
 * El objetivo de hoy. Un día suave con la movilidad pendiente es de movilidad;
 * el acondicionamiento no toca si hoy hay que evitar las piernas ni en un día
 * de recuperación o descanso, cuya sesión corta tiene que ser tranquila.
 */
function goalOfTheDay(
  context: AxisContext,
  facts: AxisFacts,
  type: AxisRecommendationType,
  week: readonly GoalProgress[],
): TrainingGoal {
  const legsBusy = muscleGroupsToAvoid(facts).includes('piernas')
  const resting = !isTrainingRecommendation(type)
  return goalForToday(week, context.recentSessions, {
    light: type === 'LIGHT_TRAINING' || resting,
    exclude: legsBusy || resting ? ['resistencia'] : [],
  })
}

/** El reparto y el objetivo de hoy, que comparten la propuesta y sus alternativas. */
type DayPlan = { week: GoalProgress[]; goal: TrainingGoal }

/**
 * El objetivo de una sesión con un foco elegido: el propio del foco, o, en uno
 * de fuerza, el de hoy si es de fuerza y si no el de fuerza que más falte.
 */
function goalForFocus(focus: SessionFocus, plan: DayPlan, context: AxisContext): TrainingGoal {
  if (focus === 'acondicionamiento') return 'resistencia'
  if (focus === 'core_movilidad') return 'movilidad'
  if (isStrengthGoal(plan.goal)) return plan.goal
  return goalForToday(plan.week, context.recentSessions, { exclude: ['resistencia', 'movilidad'] })
}

/**
 * «Esta semana: 2 de fuerza y 1 de resistencia. Hoy toca resistencia: llevas
 * 0 de 1.» Solo cuando la semana tiene más de un tipo de sesión.
 */
function weeklyGoalFactor(week: readonly GoalProgress[], goal: TrainingGoal): AxisFactor | null {
  if (week.length <= 1) return null
  const today = week.find((item) => item.goal === goal)
  const count = today ? ` llevas ${today.done} de ${today.sessions}.` : ''
  return {
    key: 'goal',
    label: `Hoy, ${GOAL_NOUNS[goal]}`,
    detail: `Esta semana: ${describeQuota(week)}. Hoy toca ${GOAL_NOUNS[goal]}${count ? ':' + count : '.'}`,
    direction: 'neutral',
  }
}

// ---------------------------------------------------------------------------
// Construcción de propuestas
// ---------------------------------------------------------------------------

function buildProposal(
  context: AxisContext,
  facts: AxisFacts,
  plan: DayPlan,
  type: AxisRecommendationType,
  factors: AxisFactor[],
  label: string,
  rule: string,
  overrides: { focus?: SessionFocus; minutes?: number } = {},
): AxisProposal {
  const session = isTrainingRecommendation(type)
    ? planSession(context, facts, plan, type, overrides)
    : null

  return {
    id: createId(),
    dayKey: context.dayKey,
    createdAt: nowIso(),
    type,
    headline: headlineFor(type, session),
    reason: reasonFor(type, factors),
    session,
    factors,
    label,
    rule,
  }
}

function planSession(
  context: AxisContext,
  facts: AxisFacts,
  plan: DayPlan,
  type: AxisRecommendationType,
  overrides: { focus?: SessionFocus; minutes?: number },
): PlannedSession {
  // El objetivo decide el tipo de sesión (D-047); la fuerza elige su zona como siempre.
  const focus = overrides.focus ?? focusForGoal(plan.goal) ?? chooseFocus(facts)
  const goal = overrides.focus ? goalForFocus(overrides.focus, plan, context) : plan.goal
  const intensity = intensityFor(type)

  const baseMinutes = overrides.minutes ?? facts.availableMinutes
  const minutes =
    type === 'LIGHT_TRAINING'
      ? Math.max(MIN_SESSION_MINUTES, Math.round(baseMinutes * 0.7))
      : baseMinutes

  return buildSession({
    focus,
    intensity,
    availableMinutes: minutes,
    goals: context.profile?.goals ?? DEFAULT_GOALS,
    goal,
    experience: context.profile?.experience ?? DEFAULT_EXPERIENCE,
    // Lo que se puede hacer con su material, y con qué kilos (D-046).
    gear: gearToday(context),
    avoidMuscleGroups: muscleGroupsToAvoid(facts),
    catalog: context.catalog.length > 0 ? context.catalog : EXERCISE_CATALOG,
    history: context.recentSessions,
    // Para que la señal de un ejercicio saltado caduque en la rotación (D-020).
    today: context.dayKey,
    deload: isDeloadWeek(context.recentSessions, context.dayKey),
    jumpSport: practicesJumpSport(context.activities),
    // Los objetivos medibles abiertos tienen preferencia en su zona (D-035).
    priorityExerciseIds: (context.profile?.targets ?? [])
      .map((target) => targetProgress(target, context.recentSessions, context.dayKey, context.assessments ?? []))
      .filter(isOpenTarget)
      .map((progress) => progress.target.exerciseId),
    // Lo que el escaneo pide (D-041).
    warmupExtras: facts.physique?.warmupExtras ?? [],
    preferUnilateral: facts.physique?.unilateral ?? false,
    // Lo que no gusta: lo dicho y lo que se salta a menudo (D-037).
    dislikedExerciseIds: [
      ...(context.profile?.dislikedExercises ?? []),
      ...frequentlySkipped(context.recentSessions, context.dayKey, context.catalog.length > 0 ? context.catalog : EXERCISE_CATALOG),
    ],
  })
}

/**
 * `true` si alguna actividad del calendario es un deporte de salto o de cambio
 * de dirección (D-033). Se mira el nombre, sin tildes ni mayúsculas.
 */
export function practicesJumpSport(activities: readonly { name: string }[]): boolean {
  return activities.some((activity) => {
    const name = activity.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return JUMP_SPORT_TERMS.some((term) => name.includes(term))
  })
}

/**
 * Alternativas para «Cambiar entrenamiento».
 *
 * Todas las genera AXIS. No hay edición manual de ejercicios: el usuario elige
 * entre propuestas, no construye una rutina.
 *
 * Desde D-030 cubren cada cosa que se puede pedir —más suave, más intensa, cada
 * zona, movilidad, recuperar—, porque AXIS cede salvo riesgo y solo puede ceder
 * con una sesión que exista. Cada una es un tipo y un foco distintos: es lo que
 * las identifica (`findProposal`).
 */
function buildAlternatives(
  context: AxisContext,
  facts: AxisFacts,
  plan: DayPlan,
  primaryType: AxisRecommendationType,
  primary: AxisProposal,
): AxisProposal[] {
  const alternatives: AxisProposal[] = []
  // El foco de la propuesta, que ya puede no ser de fuerza (D-047); sin sesión, el que tocaría.
  const primaryFocus = primary.session?.focus ?? focusForGoal(plan.goal) ?? chooseFocus(facts)

  if (isTrainingRecommendation(primaryType)) {
    if (primaryType !== 'LIGHT_TRAINING') {
      alternatives.push(
        buildProposal(context, facts, plan, 'LIGHT_TRAINING', lighterFactors(), 'Más ligera', 'alternative_lighter'),
      )
    }
    if (primaryType !== 'TRAINING') {
      alternatives.push(
        buildProposal(context, facts, plan, 'TRAINING', harderFactors(), 'Más intensa', 'alternative_harder'),
      )
    }

    for (const otherFocus of otherFocuses(primaryFocus)) {
      alternatives.push(
        buildProposal(
          context,
          facts,
          plan,
          primaryType === 'LIGHT_TRAINING' ? 'LIGHT_TRAINING' : 'MODIFIED_TRAINING',
          otherFocusFactors(otherFocus),
          SESSION_FOCUS_LABELS[otherFocus],
          'alternative_other_focus',
          { focus: otherFocus },
        ),
      )
    }

    if (primaryFocus !== 'core_movilidad') alternatives.push(mobility(context, facts, plan))

    // Siempre se puede pedir cardio (D-047).
    if (primaryFocus !== 'acondicionamiento') {
      alternatives.push(
        buildProposal(
          context,
          facts,
          plan,
          primaryType === 'LIGHT_TRAINING' ? 'LIGHT_TRAINING' : 'MODIFIED_TRAINING',
          conditioningFactors(),
          SESSION_FOCUS_LABELS.acondicionamiento,
          'alternative_conditioning',
          { focus: 'acondicionamiento' },
        ),
      )
    }

    alternatives.push(
      buildProposal(context, facts, plan, 'RECOVERY', recoveryChoiceFactors(), 'Recuperación', 'alternative_recovery'),
    )
  } else {
    alternatives.push(
      buildProposal(
        context,
        facts,
        plan,
        'LIGHT_TRAINING',
        shortSessionFactors(),
        'Sesión corta',
        'alternative_short',
        { minutes: SHORT_SESSION_MINUTES },
      ),
    )
    // Sesiones cortas de las otras zonas, para quien quiere moverse con una zona en mente.
    for (const otherFocus of otherFocuses(primaryFocus)) {
      alternatives.push(
        buildProposal(
          context,
          facts,
          plan,
          'LIGHT_TRAINING',
          otherFocusFactors(otherFocus),
          SESSION_FOCUS_LABELS[otherFocus],
          'alternative_other_focus',
          { focus: otherFocus, minutes: SHORT_SESSION_MINUTES },
        ),
      )
    }
    if (primaryFocus !== 'core_movilidad') alternatives.push(mobility(context, facts, plan))
  }

  return alternatives
}

function mobility(context: AxisContext, facts: AxisFacts, plan: DayPlan): AxisProposal {
  return buildProposal(
    context,
    facts,
    plan,
    'LIGHT_TRAINING',
    mobilityFactors(),
    'Movilidad',
    'alternative_mobility',
    { focus: 'core_movilidad', minutes: SHORT_SESSION_MINUTES },
  )
}

/** Las zonas de fuerza que no son la de hoy. Movilidad va aparte. */
const STRENGTH_FOCUSES: readonly SessionFocus[] = ['tren_superior', 'tren_inferior', 'cuerpo_completo']

function otherFocuses(focus: SessionFocus): SessionFocus[] {
  return STRENGTH_FOCUSES.filter((other) => other !== focus)
}

// ---------------------------------------------------------------------------
// Factores de las alternativas
// ---------------------------------------------------------------------------

function lighterFactors(): AxisFactor[] {
  return [
    {
      key: 'session_duration',
      label: 'Versión más suave',
      detail: 'Menos series y menos duración que la sesión recomendada.',
      direction: 'neutral',
    },
  ]
}

/** Cómo ajusta el escaneo la sesión (D-041), o `null` si no pide nada. */
function physiqueFactor(plan: PhysiquePlan): AxisFactor | null {
  const summary = planSummary(plan)
  if (!summary) return null
  return {
    key: 'body_scan',
    label: 'Tu escaneo corporal',
    detail: `Por tu escaneo, ${summary}.`,
    direction: 'neutral',
  }
}

function deloadFactor(): AxisFactor {
  return {
    key: 'deload_week',
    label: 'Semana de descarga',
    detail: `Llevas ${DELOAD_AFTER_WEEKS} semanas seguidas entrenando con regularidad: esta semana es de descarga, con una serie menos por ejercicio y sin subir, para asimilar lo acumulado.`,
    direction: 'limits',
  }
}

function harderFactors(): AxisFactor[] {
  return [
    {
      key: 'session_duration',
      label: 'Versión más intensa',
      detail: 'La sesión a intensidad normal, en lugar de la versión adaptada de hoy.',
      direction: 'neutral',
    },
  ]
}

function otherFocusFactors(focus: SessionFocus): AxisFactor[] {
  return [
    {
      key: 'recent_muscle_groups',
      label: SESSION_FOCUS_LABELS[focus],
      detail: `Cambia el foco de la sesión a ${describeFocus(focus)}.`,
      direction: 'neutral',
    },
  ]
}

function conditioningFactors(): AxisFactor[] {
  return [
    {
      key: 'goal',
      label: 'Acondicionamiento',
      detail: 'Intervalos por tiempo, con tu peso corporal, para trabajar la resistencia.',
      direction: 'neutral',
    },
  ]
}

function recoveryChoiceFactors(): AxisFactor[] {
  return [
    {
      key: 'recovery_score',
      label: 'Priorizar recuperación',
      detail: 'Dedicar el día a recuperar en lugar de entrenar.',
      direction: 'neutral',
    },
  ]
}

function shortSessionFactors(): AxisFactor[] {
  return [
    {
      key: 'session_duration',
      label: 'Sesión corta',
      detail: 'Una sesión breve y suave si aun así quieres moverte.',
      direction: 'neutral',
    },
  ]
}

function mobilityFactors(): AxisFactor[] {
  return [
    {
      key: 'recent_muscle_groups',
      label: 'Movilidad',
      detail: 'Trabajo de core y movilidad, sin carga.',
      direction: 'neutral',
    },
  ]
}

// ---------------------------------------------------------------------------
// Redacción de la recomendación
// ---------------------------------------------------------------------------

export function headlineFor(
  type: AxisRecommendationType,
  session: PlannedSession | null,
): string {
  const focusName = session ? describeFocus(session.focus) : ''

  // Los intervalos se dicen por su nombre (D-047).
  if (session?.focus === 'acondicionamiento') {
    switch (type) {
      case 'TRAINING':
        return 'Hoy toca acondicionamiento: intervalos.'
      case 'LIGHT_TRAINING':
        return 'Hoy, intervalos suaves de acondicionamiento.'
      case 'MODIFIED_TRAINING':
        return 'Intervalos de acondicionamiento adaptados a tu día.'
    }
  }

  switch (type) {
    case 'TRAINING':
      return `Entrena ${focusName} con intensidad moderada.`
    case 'LIGHT_TRAINING':
      return `Hoy, una sesión ligera de ${focusName}.`
    case 'MODIFIED_TRAINING':
      return `Sesión de ${focusName} adaptada a tu día.`
    case 'RECOVERY':
      return 'Hoy prioriza la recuperación.'
    case 'REST':
      return 'Hoy toca descansar.'
  }
}

/**
 * La explicación se compone a partir de los factores que realmente decidieron.
 * Si AXIS no tiene nada que explicar, lo dice; no rellena con frases genéricas.
 */
export function reasonFor(type: AxisRecommendationType, factors: AxisFactor[]): string {
  const details = factors.map((factor) => factor.detail).filter(Boolean).slice(0, 2)
  const closing = closingFor(type)

  if (details.length === 0) return closing
  return `${details.join(' ')} ${closing}`.trim()
}

function closingFor(type: AxisRecommendationType): string {
  switch (type) {
    case 'TRAINING':
      return 'Es un buen día para entrenar con normalidad.'
    case 'LIGHT_TRAINING':
      return 'Mejor estimular sin sobrecargar.'
    case 'MODIFIED_TRAINING':
      return 'La sesión se ajusta para que encaje sin interferir.'
    case 'RECOVERY':
      return 'Hoy conviene recuperar antes de volver a entrenar.'
    case 'REST':
      return 'Descansar también forma parte del plan.'
  }
}
