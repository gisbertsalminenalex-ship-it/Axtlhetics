/**
 * Reglas de decisión de AXIS.
 *
 * Reglas explícitas, conservadoras y ordenadas por prioridad. Nada de fisiología
 * inventada ni de afirmaciones médicas: son heurísticas de sentido común sobre los
 * datos que el usuario ha registrado, y cada una explica por qué se aplica.
 *
 * La primera regla que se cumple decide el tipo de recomendación.
 */

import { RECOVERY_BAND_THRESHOLDS } from '../recovery/weights'
import { formatMinutesOfDay } from '../shared/dates'
import type { MuscleGroup, SessionFocus, SessionIntensity } from '../workouts/types'
import { MIN_SESSION_MINUTES } from './facts'
import { describeFocus, FOCUS_MUSCLE_GROUPS } from './knowledge/focus'
import { isMuscleGroup } from './knowledge/muscles'
import type { AxisFacts, AxisFactor, AxisRecommendationType } from './types'

/** Nivel de fatiga a partir del cual AXIS deja de proponer una sesión normal. */
export const HIGH_FATIGUE_LEVEL = 4

/** Nivel de fatiga que, por sí solo, empuja a recuperar. */
export const VERY_HIGH_FATIGUE_LEVEL = 5

/** Margen mínimo antes de una actividad exigente para que quepa entrenar. */
export const ACTIVITY_CONFLICT_MINUTES = 90

export type RuleOutcome = {
  type: AxisRecommendationType
  /** Regla que ha decidido. Se guarda para poder depurar y para los tests. */
  rule: string
  factors: AxisFactor[]
}

type Rule = {
  id: string
  evaluate(facts: AxisFacts): RuleOutcome | null
}

// ---------------------------------------------------------------------------
// Reglas, en orden de prioridad
// ---------------------------------------------------------------------------

const alreadyTrainedToday: Rule = {
  id: 'already_trained_today',
  evaluate(facts) {
    if (!facts.trainedToday) return null
    return {
      type: 'REST',
      rule: 'already_trained_today',
      factors: [
        {
          key: 'trained_today',
          label: 'Ya has entrenado hoy',
          detail: 'Has completado una sesión hoy.',
          direction: 'limits',
        },
      ],
    }
  },
}

const lowRecovery: Rule = {
  id: 'low_recovery',
  evaluate(facts) {
    const veryFatigued = facts.fatigueLevel !== null && facts.fatigueLevel >= VERY_HIGH_FATIGUE_LEVEL
    const lowScore =
      facts.recoveryValue !== null && facts.recoveryValue < RECOVERY_BAND_THRESHOLDS.moderate

    if (!veryFatigued && !lowScore) return null

    const factors: AxisFactor[] = []
    if (lowScore) {
      factors.push({
        key: 'recovery_score',
        label: 'Recuperación baja',
        detail: `Tu recuperación de hoy está en ${facts.recoveryValue}.`,
        direction: 'limits',
      })
    }
    if (veryFatigued) {
      factors.push({
        key: 'muscle_fatigue',
        label: 'Fatiga muscular muy alta',
        detail: 'Has registrado fatiga muscular muy alta.',
        direction: 'limits',
      })
    }
    return { type: 'RECOVERY', rule: 'low_recovery', factors }
  },
}

const notAvailableToday: Rule = {
  id: 'not_available_today',
  evaluate(facts) {
    if (facts.isAvailableToday) return null
    return {
      type: 'REST',
      rule: 'not_available_today',
      factors: [
        {
          key: 'availability',
          label: 'Día sin entrenamiento',
          detail: 'Hoy no es uno de los días que has marcado para entrenar.',
          direction: 'limits',
        },
      ],
    }
  },
}

/**
 * Describe una actividad con el detalle que realmente se conoce.
 *
 * Si hay horas registradas se dicen; si no, se dice el día. Nunca se inventa una
 * hora para que la frase quede más redonda.
 */
export function describeActivity(activity: {
  name: string
  startMinute: number | null
  endMinute: number | null
}): string {
  const name = activity.name.toLowerCase()
  if (activity.startMinute === null || activity.endMinute === null) {
    return `Hoy tienes ${name}.`
  }
  return `Hoy tienes ${name} de ${formatMinutesOfDay(activity.startMinute)} a ${formatMinutesOfDay(activity.endMinute)}.`
}

const demandingActivityToday: Rule = {
  id: 'demanding_activity_today',
  evaluate(facts) {
    const activity = facts.todayActivity
    if (!activity || activity.intensity !== 'alta') return null

    // Con hora registrada se sabe si ya ha terminado; sin ella se asume que el
    // deporte sigue pendiente, que es lo conservador.
    const finished = facts.minutesUntilActivity !== null && facts.minutesUntilActivity < 0
    if (finished) return null

    const factors: AxisFactor[] = [
      {
        key: 'scheduled_activity',
        label: activity.name,
        detail: describeActivity(activity),
        direction: 'limits',
      },
    ]

    // Solo se puede hablar de «queda poco margen» si hay hora.
    const tight =
      facts.minutesUntilActivity !== null &&
      facts.minutesUntilActivity < ACTIVITY_CONFLICT_MINUTES

    if (tight) {
      return { type: 'RECOVERY', rule: 'activity_too_close', factors }
    }
    return { type: 'MODIFIED_TRAINING', rule: 'demanding_activity_today', factors }
  },
}

/**
 * Deporte exigente mañana.
 *
 * No impide entrenar hoy, pero sí baja el listón: llegar fundido a un partido es
 * peor que haber entrenado un poco menos el día antes.
 */
const demandingActivityTomorrow: Rule = {
  id: 'demanding_activity_tomorrow',
  evaluate(facts) {
    const activity = facts.tomorrowActivity
    if (!activity || activity.intensity !== 'alta') return null

    // Si la recuperación es mala, deciden las reglas de arriba; si no hay dato,
    // tampoco corresponde a esta regla resolver el día.
    if (!facts.recoveryKnown) return null

    return {
      type: 'LIGHT_TRAINING',
      rule: 'demanding_activity_tomorrow',
      factors: [
        {
          key: 'activity_tomorrow',
          label: activity.name,
          detail: `Mañana tienes ${activity.name.toLowerCase()}, así que hoy conviene no vaciarse.`,
          direction: 'limits',
        },
      ],
    }
  },
}

const notEnoughTime: Rule = {
  id: 'not_enough_time',
  evaluate(facts) {
    if (facts.availableMinutes > MIN_SESSION_MINUTES) return null
    return {
      type: 'MODIFIED_TRAINING',
      rule: 'not_enough_time',
      factors: [
        {
          key: 'session_duration',
          label: 'Poco tiempo disponible',
          detail: `Hoy dispones de unos ${facts.availableMinutes} minutos.`,
          direction: 'limits',
        },
      ],
    }
  },
}

const unknownRecovery: Rule = {
  id: 'unknown_recovery',
  evaluate(facts) {
    if (facts.recoveryKnown) return null
    return {
      type: 'LIGHT_TRAINING',
      rule: 'unknown_recovery',
      factors: [
        {
          key: 'recovery_unknown',
          label: 'Sin datos de recuperación',
          detail: 'Todavía no has registrado tu recuperación de hoy.',
          direction: 'neutral',
        },
      ],
    }
  },
}

const moderateRecovery: Rule = {
  id: 'moderate_recovery',
  evaluate(facts) {
    if (facts.recoveryValue === null) return null
    if (facts.recoveryValue >= RECOVERY_BAND_THRESHOLDS.good) return null

    const factors: AxisFactor[] = [
      {
        key: 'recovery_score',
        label: 'Recuperación moderada',
        detail: `Tu recuperación de hoy está en ${facts.recoveryValue}.`,
        direction: 'limits',
      },
    ]
    if (facts.fatigueLevel !== null && facts.fatigueLevel >= HIGH_FATIGUE_LEVEL) {
      factors.push({
        key: 'muscle_fatigue',
        label: 'Fatiga alta',
        detail: 'Has registrado fatiga muscular alta.',
        direction: 'limits',
      })
    }
    return { type: 'LIGHT_TRAINING', rule: 'moderate_recovery', factors }
  },
}

const goodRecovery: Rule = {
  id: 'good_recovery',
  evaluate(facts) {
    if (facts.recoveryValue === null) return null
    if (facts.recoveryValue < RECOVERY_BAND_THRESHOLDS.good) return null

    const factors: AxisFactor[] = [
      {
        key: 'recovery_score',
        label: 'Buena recuperación',
        detail: `Tu recuperación de hoy está en ${facts.recoveryValue}.`,
        direction: 'supports',
      },
    ]
    if (facts.daysSinceLastWorkout !== null && facts.daysSinceLastWorkout >= 1) {
      factors.push({
        key: 'days_since_last_workout',
        label: 'Descanso suficiente',
        detail: describeRest(facts.daysSinceLastWorkout),
        direction: 'supports',
      })
    }
    return { type: 'TRAINING', rule: 'good_recovery', factors }
  },
}

/** Última red: si ninguna regla anterior aplica, la opción conservadora es la ligera. */
const fallback: Rule = {
  id: 'fallback_light',
  evaluate() {
    return {
      type: 'LIGHT_TRAINING',
      rule: 'fallback_light',
      factors: [
        {
          key: 'recovery_unknown',
          label: 'Sin señales claras',
          detail: 'Sin datos suficientes para ajustar la intensidad, empezamos suave.',
          direction: 'neutral',
        },
      ],
    }
  },
}

/** El orden **es** la prioridad. La primera regla que devuelve algo decide. */
export const AXIS_RULES: readonly Rule[] = [
  alreadyTrainedToday,
  lowRecovery,
  notAvailableToday,
  demandingActivityToday,
  demandingActivityTomorrow,
  notEnoughTime,
  unknownRecovery,
  moderateRecovery,
  goodRecovery,
  fallback,
]

export function evaluateRules(facts: AxisFacts): RuleOutcome {
  for (const rule of AXIS_RULES) {
    const outcome = rule.evaluate(facts)
    if (outcome) return outcome
  }
  // `fallback` siempre responde, así que esto es inalcanzable en la práctica.
  return fallback.evaluate(facts) as RuleOutcome
}

// ---------------------------------------------------------------------------
// Selección de foco
// ---------------------------------------------------------------------------

const FOCUS_ROTATION: readonly SessionFocus[] = [
  'tren_superior',
  'tren_inferior',
  'cuerpo_completo',
]

/**
 * Elige el foco cuyos grupos musculares llevan más tiempo sin trabajarse, y evita
 * los grupos que carga una actividad fija de hoy.
 */
export function chooseFocus(facts: AxisFacts): SessionFocus {
  const avoid = muscleGroupsToAvoid(facts)

  const scored = FOCUS_ROTATION.map((focus) => {
    const groups = FOCUS_MUSCLE_GROUPS[focus]
    const recentOverlap = groups.filter((group) =>
      facts.recentMuscleGroups.includes(group),
    ).length
    const conflict = groups.filter((group) => avoid.includes(group)).length
    return { focus, penalty: recentOverlap + conflict * 10 }
  })

  scored.sort((a, b) => a.penalty - b.penalty)
  return scored[0].focus
}

/** Grupos que conviene no cargar hoy por una actividad con horario fijo. */
export function muscleGroupsToAvoid(facts: AxisFacts): MuscleGroup[] {
  const finished = facts.minutesUntilActivity !== null && facts.minutesUntilActivity < 0
  if (finished) return []

  // Se suman los grupos de todas las actividades de hoy que carguen de verdad.
  const groups = new Set<MuscleGroup>()
  for (const activity of facts.todayActivities) {
    if (activity.intensity === 'baja') continue
    for (const group of activity.loadsMuscleGroups.filter(isMuscleGroup)) {
      groups.add(group)
    }
  }
  return [...groups]
}

export function intensityFor(type: AxisRecommendationType): SessionIntensity {
  switch (type) {
    case 'TRAINING':
      return 'moderada'
    case 'MODIFIED_TRAINING':
      return 'moderada'
    case 'LIGHT_TRAINING':
      return 'ligera'
    default:
      return 'ligera'
  }
}

// ---------------------------------------------------------------------------
// Redacción
// ---------------------------------------------------------------------------

export function describeRest(days: number): string {
  if (days <= 0) return 'Has entrenado hoy.'
  if (days === 1) return 'Ayer entrenaste, hoy llegas con un día de margen.'
  return `Han pasado ${days} días desde tu último entrenamiento.`
}

export { describeFocus }

