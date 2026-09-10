/**
 * Motor determinista de AXIS.
 *
 * Es una función pura del contexto: mismo contexto, misma decisión. No toca React,
 * ni IndexedDB, ni la red. Implementa `AxisEngine`, que es la costura por la que un
 * motor con IA externa podrá entrar más adelante sin tocar la aplicación.
 */

import { createId, nowIso } from '../shared/ids'
import { EXERCISE_CATALOG } from '../workouts/catalog'
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

  const primary = buildProposal(context, facts, outcome.type, outcome.factors, 'Recomendada')
  const alternatives = buildAlternatives(context, facts, outcome.type)

  return { primary, alternatives }
}

// ---------------------------------------------------------------------------
// Construcción de propuestas
// ---------------------------------------------------------------------------

function buildProposal(
  context: AxisContext,
  facts: AxisFacts,
  type: AxisRecommendationType,
  factors: AxisFactor[],
  label: string,
  overrides: { focus?: SessionFocus; minutes?: number } = {},
): AxisProposal {
  const session = isTrainingRecommendation(type)
    ? planSession(context, facts, type, overrides)
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
  }
}

function planSession(
  context: AxisContext,
  facts: AxisFacts,
  type: AxisRecommendationType,
  overrides: { focus?: SessionFocus; minutes?: number },
): PlannedSession {
  const focus = overrides.focus ?? chooseFocus(facts)
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
    experience: context.profile?.experience ?? DEFAULT_EXPERIENCE,
    avoidMuscleGroups: muscleGroupsToAvoid(facts),
    catalog: context.catalog.length > 0 ? context.catalog : EXERCISE_CATALOG,
    history: context.recentSessions,
  })
}

/**
 * Alternativas para «Cambiar entrenamiento».
 *
 * Todas las genera AXIS. No hay edición manual de ejercicios: el usuario elige
 * entre propuestas, no construye una rutina.
 */
function buildAlternatives(
  context: AxisContext,
  facts: AxisFacts,
  primaryType: AxisRecommendationType,
): AxisProposal[] {
  const alternatives: AxisProposal[] = []
  const primaryFocus = chooseFocus(facts)

  if (isTrainingRecommendation(primaryType)) {
    if (primaryType !== 'LIGHT_TRAINING') {
      alternatives.push(
        buildProposal(context, facts, 'LIGHT_TRAINING', lighterFactors(), 'Más ligera'),
      )
    }

    const otherFocus = alternateFocus(primaryFocus)
    alternatives.push(
      buildProposal(
        context,
        facts,
        primaryType === 'LIGHT_TRAINING' ? 'LIGHT_TRAINING' : 'MODIFIED_TRAINING',
        otherFocusFactors(otherFocus),
        SESSION_FOCUS_LABELS[otherFocus],
        { focus: otherFocus },
      ),
    )

    alternatives.push(
      buildProposal(context, facts, 'RECOVERY', recoveryChoiceFactors(), 'Recuperación'),
    )
  } else {
    alternatives.push(
      buildProposal(
        context,
        facts,
        'LIGHT_TRAINING',
        shortSessionFactors(),
        'Sesión corta',
        { minutes: SHORT_SESSION_MINUTES },
      ),
    )
    alternatives.push(
      buildProposal(
        context,
        facts,
        'LIGHT_TRAINING',
        mobilityFactors(),
        'Movilidad',
        { focus: 'core_movilidad', minutes: SHORT_SESSION_MINUTES },
      ),
    )
  }

  return alternatives
}

function alternateFocus(focus: SessionFocus): SessionFocus {
  if (focus === 'tren_superior') return 'tren_inferior'
  if (focus === 'tren_inferior') return 'tren_superior'
  return 'tren_superior'
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
