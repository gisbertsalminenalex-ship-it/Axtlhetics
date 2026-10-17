/**
 * El mensaje del usuario tal como lo leen los detectores de AXIS (D-026).
 *
 * El vocabulario es todo lo que AXIS ya reconoce, sacado de las propias listas
 * de cada detector: añadir un término a cualquiera de ellas lo hace también
 * tolerante a faltas, sin una segunda lista que mantener. A eso se suman las
 * actividades del usuario, para que el nombre de su deporte no se «corrija»
 * hacia otra palabra.
 */

import { EXERCISE_CATALOG } from '../../workouts/catalog'
import type { AxisBriefing } from '../briefing'
import { FOCUS_TERMS } from '../knowledge/focus'
import { ACTIVITY_MENTION_TERMS, EFFORT_TERMS } from '../knowledge/sports'
import { ASSESSMENT_VOCABULARY } from './assessment-answer'
import { INTENT_VOCABULARY } from './intents'
import { NEGOTIATION_VOCABULARY } from './negotiation'
import { REORGANIZATION_VOCABULARY } from './reorganization'
import { SCAN_VOCABULARY } from './scan-answer'
import { PREFERENCE_VOCABULARY } from './preferences'
import { buildVocabulary, correctSpelling, wordsOf, type SpellingVocabulary } from './spelling'

/** Lo que AXIS reconoce, sin depender del usuario. */
export const AXIS_WORDS: readonly string[] = wordsOf([
  ...INTENT_VOCABULARY,
  ...NEGOTIATION_VOCABULARY,
  ...REORGANIZATION_VOCABULARY,
  ...ASSESSMENT_VOCABULARY,
  ...SCAN_VOCABULARY,
  ...PREFERENCE_VOCABULARY,
  ...FOCUS_TERMS.flatMap((entry) => entry.terms),
  ...ACTIVITY_MENTION_TERMS,
  ...EFFORT_TERMS,
  ...EXERCISE_CATALOG.map((exercise) => exercise.name),
])

const BASE_VOCABULARY = buildVocabulary(AXIS_WORDS)

function userActivityNames(briefing: AxisBriefing | undefined): string[] {
  if (!briefing) return []
  return [
    ...(briefing.profile?.sports ?? []).map((sport) => sport.name),
    ...(briefing.activitiesToday ?? []).map((activity) => activity.name),
    ...(briefing.activitiesTomorrow ?? []).map((activity) => activity.name),
    ...(briefing.upcomingDatedActivities ?? []).map((activity) => activity.name),
  ]
}

function vocabularyFor(briefing: AxisBriefing | undefined): SpellingVocabulary {
  const own = wordsOf(userActivityNames(briefing))
  return own.length === 0 ? BASE_VOCABULARY : buildVocabulary([...AXIS_WORDS, ...own])
}

/** El mensaje con las faltas corregidas. Lo que ya se entendía no cambia. */
export function understandMessage(message: string, briefing?: AxisBriefing): string {
  return correctSpelling(message, vocabularyFor(briefing))
}
