/**
 * AXIS conversacional determinista.
 *
 * Compone las respuestas a partir del briefing: no hay frases guardadas esperando a
 * ser devueltas, hay hechos que se encadenan según lo que el usuario pregunta y lo
 * que realmente se sabe de su día.
 *
 * Tres reglas gobiernan todo:
 *
 * 1. **La decisión no se recalcula aquí.** La propuesta viene del `AxisEngine`. La
 *    conversación la explica; no la sustituye ni la contradice.
 * 2. **Si el dato no está, se dice.** Nunca se estima un valor para redondear una
 *    frase.
 * 3. **AXIS no es médico** y no opina sobre el cuerpo del usuario.
 */

import { TRAINING_GOAL_LABELS } from '../../profile/types'
import { RECOVERY_BAND_LABELS } from '../../recovery/types'
import { formatTotalTime, formatVolume } from '../../history/stats'
import { formatDuration, formatRelativeDay, WEEKDAY_LABELS } from '../../shared/dates'
import { listNames } from '../../shared/text'
import { TRAINING_LOAD_BAND_LABELS } from '../../workouts/load'
import { describeFocus, type SessionFocus } from '../knowledge/focus'
import type { AxisBriefing, BriefingActivity } from '../briefing'
import { matchIntent } from './intents'
import { evaluateChange, parseChangeRequest, type ChangeRequest } from './negotiation'
import type {
  AxisAnswer,
  AxisConversationEngine,
  AxisConversationMemory,
  AxisIntent,
  AxisSuggestion,
} from './types'

export const DETERMINISTIC_CONVERSATION_ID = 'axis-conversation-deterministic-v1'

/** El ámbito de AXIS, en sus propias palabras. */
const SCOPE = 'tu entrenamiento, tu recuperación, tu carga, tus deportes y tu planificación física'

export function createDeterministicConversation(): AxisConversationEngine {
  return {
    id: DETERMINISTIC_CONVERSATION_ID,
    async isAvailable() {
      return true
    },
    async answer(question, briefing, memory) {
      return answerFromBriefing(question, briefing, memory)
    },
  }
}

export function answerFromBriefing(
  question: string,
  briefing: AxisBriefing,
  memory?: AxisConversationMemory,
): AxisAnswer {
  const match = matchIntent(question, memory?.lastIntent ?? null)

  if (memory?.changeMode) {
    /*
     * En modo cambio la conversación está acotada a la sesión de hoy, pero no
     * todo lo que se escriba ahí es una petición de cambio: una molestia física
     * o algo ajeno a AXTHLETICS siguen su camino.
     *
     * El corte no puede hacerse por intención. «Ayer hice 20 km de bici, hoy
     * piernas no» parece una pregunta por la última sesión y es exactamente el
     * contexto que la negociación necesita. Se mira lo que el mensaje pide.
     */
    const isMedicalOrForeign = match.intent === 'medical' || match.intent === 'out_of_scope'
    // Los deportes de hoy, para reconocer cuando el usuario dice que uno se cae.
    const request = parseChangeRequest(
      question,
      briefing.activitiesToday.map((activity) => activity.name),
    )
    const asksForChange =
      request.kind !== 'unclear' ||
      request.reportedLoad !== null ||
      match.intent === 'change' ||
      match.intent === 'unknown'

    if (!isMedicalOrForeign && asksForChange) {
      /*
       * Un mensaje que no pide nada concreto, viniendo de una petición anterior,
       * es una de dos cosas, y la diferencia lo es todo:
       *
       * - «venga, porfa» no aporta nada. Se vuelve a juzgar lo mismo y sale lo
       *   mismo: AXIS no cede por insistencia.
       * - «ayer estuve corriendo 12 km» sí aporta. Es la evidencia que faltaba,
       *   así que se juzga otra vez la petición pendiente, ahora con ese dato.
       *   AXIS sí cede por evidencia.
       */
      const previous = memory.lastChangeRequest
      if (request.kind === 'unclear' && previous != null) {
        const pending: ChangeRequest = {
          kind: previous.kind as ChangeRequest['kind'],
          focus: previous.focus as ChangeRequest['focus'],
          reportedLoad: request.reportedLoad,
          cancelledActivities: request.cancelledActivities,
        }
        return negotiate(pending, briefing, request.reportedLoad === null)
      }

      return negotiate(request, briefing)
    }
  }

  switch (match.intent) {
    case 'today':
      return answerToday(briefing)
    case 'why':
      return answerWhy(briefing)
    case 'why_not':
      return answerWhyNot(briefing, match.focus)
    case 'factors':
      return answerFactors(briefing)
    case 'recovery':
      return answerRecovery(briefing)
    case 'last_session':
      return answerLastSession(briefing)
    case 'week':
      return answerWeek(briefing)
    case 'load':
      return answerLoad(briefing)
    case 'goals':
      return answerGoals(briefing)
    case 'sport_today':
      return answerSportToday(briefing)
    case 'sport_impact':
      return answerSportImpact(briefing)
    case 'can_train':
      return answerCanTrain(briefing)
    case 'tired':
      return answerTired(briefing)
    case 'change':
      return answerChange(briefing)
    case 'changed':
      return answerChanged(briefing)
    case 'shorten':
      return answerShorten(briefing)
    case 'medical':
      return answerMedical()
    case 'out_of_scope':
      return answerOutOfScope()
    case 'unknown':
      return answerUnknown()
  }
}

// ---------------------------------------------------------------------------
// La decisión del día
// ---------------------------------------------------------------------------

function answerToday(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('today', 'Todavía no tengo una propuesta para hoy. Completa tu perfil y vuelvo a mirarlo.')
  }

  const parts = [proposal.headline, proposal.reason]
  if (proposal.session) {
    parts.push(
      `Serían unos ${proposal.session.estimatedMinutes} minutos: ${listExercises(proposal.session.exercises)}.`,
    )
  }
  return say('today', parts)
}

function answerWhy(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('why', 'Todavía no he hecho ninguna recomendación que explicar.')
  }

  const reasons = proposal.factors.map((factor) => factor.detail)
  return say('why', [proposal.headline, ...(reasons.length > 0 ? reasons : [proposal.reason])])
}

/**
 * «¿Y por qué no piernas?»
 *
 * Se responde con lo que de verdad descartó ese foco: un deporte que ya carga esos
 * grupos, haberlos trabajado hace poco, o simplemente que el foco elegido tocaba.
 */
function answerWhyNot(briefing: AxisBriefing, focus: SessionFocus | null): AxisAnswer {
  const { proposal } = briefing

  if (!proposal) {
    return unknown('why_not', 'Todavía no he propuesto nada, así que no hay nada que descartar.')
  }
  if (!focus) return answerWhy(briefing)

  const asked = describeFocus(focus)

  if (proposal.session && proposal.session.focus === focus) {
    return say('why_not', [`Justo eso es lo que te propongo hoy: ${proposal.session.title}.`, proposal.reason])
  }

  const parts: string[] = []
  const sportsLoading = briefing.activitiesToday.filter((activity) => activity.today)

  if (focus === 'tren_inferior' && sportsLoading.length > 0) {
    const activity = sportsLoading[0]
    parts.push(
      `Porque hoy tienes ${activity.name.toLowerCase()}${activity.window ? ` (${activity.window})` : ''} y prefiero no añadir una carga importante a las piernas antes.`,
    )
  }

  if (parts.length === 0 && briefing.recentMuscleGroups.length > 0) {
    parts.push(
      `Porque has trabajado ${listNames(briefing.recentMuscleGroups)} hace poco y toca dejarlo descansar.`,
    )
  }

  if (parts.length === 0) {
    parts.push(`Hoy he priorizado ${describeProposalFocus(proposal)} en lugar de ${asked}.`)
  }

  // La razón completa solo se añade si no repite lo que ya se ha dicho.
  parts.push(withoutOverlap(proposal.reason, parts))
  return say('why_not', parts)
}

/** «¿Qué tienes en cuenta para decidir?» — se enumera lo que realmente se miró. */
function answerFactors(briefing: AxisBriefing): AxisAnswer {
  const looked: string[] = []

  looked.push(
    briefing.recovery.known
      ? `tu recuperación de hoy (${briefing.recovery.value})`
      : 'tu recuperación, que hoy no tengo registrada',
  )

  if (briefing.load.known) looked.push(`tu carga de los últimos ${briefing.load.windowDays} días (${briefing.load.value})`)
  if (briefing.daysSinceLastWorkout !== null) looked.push(`los días desde tu último entrenamiento (${briefing.daysSinceLastWorkout})`)
  if (briefing.recentMuscleGroups.length > 0) looked.push(`los grupos que ya has trabajado (${listNames(briefing.recentMuscleGroups)})`)
  if (briefing.activitiesToday.length > 0) looked.push(`tus deportes de hoy (${listNames(briefing.activitiesToday.map((a) => a.name))})`)
  if (briefing.activitiesTomorrow.length > 0) looked.push(`lo que tienes mañana (${listNames(briefing.activitiesTomorrow.map((a) => a.name))})`)
  if (briefing.profile) {
    looked.push(`tus objetivos (${listNames(briefing.profile.goals.map((goal) => TRAINING_GOAL_LABELS[goal].toLowerCase()))})`)
    looked.push(`el tiempo del que sueles disponer (${briefing.profile.typicalSessionMinutes} min)`)
  }

  const parts = [`Para decidir hoy he mirado ${listNames(looked)}.`]
  if (briefing.proposal) parts.push(`Con eso: ${briefing.proposal.headline.toLowerCase()}`)

  return say('factors', parts)
}

// ---------------------------------------------------------------------------
// Deporte
// ---------------------------------------------------------------------------

function answerSportToday(briefing: AxisBriefing): AxisAnswer {
  const today = briefing.activitiesToday

  if (today.length === 0) {
    const sports = briefing.profile?.sports ?? []
    if (sports.length === 0) {
      return unknown(
        'sport_today',
        'No tienes ningún deporte registrado. Puedes añadirlo desde tu perfil y lo tendré en cuenta.',
      )
    }
    const upcoming = sports
      .filter((sport) => sport.weekdays.length > 0)
      .map((sport) => `${sport.name} los ${listNames(sport.weekdays.map((day) => WEEKDAY_LABELS[day as 0].toLowerCase()))}`)

    // «Registrado» no: sí lo está, solo que hoy no toca. Decir lo contrario y
    // acto seguido enumerar sus deportes se contradice en la misma frase.
    return say('sport_today', [
      'Hoy no tienes deporte.',
      upcoming.length > 0 ? `Tienes ${listNames(upcoming)}.` : '',
    ])
  }

  // Si la razón de la propuesta ya nombra el deporte, basta con confirmar.
  const reason = briefing.proposal?.reason ?? ''
  const alreadyNamed = today.every((activity) =>
    reason.toLowerCase().includes(activity.name.toLowerCase()),
  )

  const opening = alreadyNamed ? 'Sí.' : `Sí: ${listNames(today.map(describeActivityForUser))}.`
  return say('sport_today', [opening, withoutOverlap(reason, [opening])])
}

function answerSportImpact(briefing: AxisBriefing): AxisAnswer {
  const today = briefing.activitiesToday.filter((activity) => activity.today)
  const tomorrow = briefing.activitiesTomorrow

  if (today.length === 0 && tomorrow.length === 0) {
    return unknown(
      'sport_impact',
      'Hoy y mañana no tienes deporte registrado, así que no está condicionando la sesión.',
    )
  }

  const parts: string[] = []

  if (today.length > 0) {
    const hard = today.filter((activity) => activity.intensity === 'alta')
    parts.push(
      hard.length > 0
        ? `${listNames(hard.map((a) => a.name))} es exigente, así que hoy bajo el volumen y evito encadenar los mismos grupos.`
        : `${listNames(today.map((a) => a.name))} no es muy exigente, así que apenas cambia lo que te propongo.`,
    )
  }

  if (tomorrow.length > 0) {
    parts.push(`Mañana tienes ${listNames(tomorrow.map((a) => a.name.toLowerCase()))}, así que hoy prefiero que no acabes vaciado.`)
  }

  if (briefing.proposal) parts.push(briefing.proposal.headline)
  return say('sport_impact', parts)
}

function answerCanTrain(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('can_train', 'Todavía no tengo datos suficientes para decírtelo.')
  }

  const trains = proposal.type !== 'RECOVERY' && proposal.type !== 'REST'
  const opening = trains
    ? 'Sí, puedes entrenar.'
    : 'Hoy no te lo recomendaría.'

  return say('can_train', [opening, proposal.reason, trains ? proposal.headline : ''])
}

// ---------------------------------------------------------------------------
// Estado del usuario
// ---------------------------------------------------------------------------

/**
 * «Estoy cansado, ¿qué hago?»
 *
 * AXIS no puede medir un cansancio que no está registrado, así que lo dice y
 * ofrece lo que sí puede hacer: la alternativa suave que ya ha generado.
 */
function answerTired(briefing: AxisBriefing): AxisAnswer {
  const parts: string[] = []

  if (briefing.recovery.known) {
    parts.push(
      `Tus datos de hoy dan ${briefing.recovery.value} de recuperación (${RECOVERY_BAND_LABELS[briefing.recovery.band].toLowerCase()}).`,
    )
    if (briefing.recovery.band === 'good') {
      parts.push('Si te notas peor de lo que dicen los números, hazles caso a las sensaciones antes que a mí.')
    }
  } else {
    parts.push('No tengo tu recuperación de hoy registrada, así que no puedo medirlo.')
  }

  const softer = briefing.proposal?.alternatives.find(
    (alternative) =>
      alternative.type === 'LIGHT_TRAINING' ||
      alternative.type === 'RECOVERY' ||
      alternative.type === 'REST',
  )

  if (softer) {
    parts.push(`Puedes cambiar a la opción «${softer.label}» desde la tarjeta de Inicio.`)
  } else if (briefing.proposal) {
    parts.push(briefing.proposal.headline)
  }

  return say('tired', parts, !briefing.recovery.known)
}

// ---------------------------------------------------------------------------
// Cambiar la propuesta
// ---------------------------------------------------------------------------

/**
 * Negocia un cambio de la sesión de hoy.
 *
 * No baraja alternativas al azar: juzga la petición contra los datos y responde
 * con un veredicto, que puede ser que no. La sesión solo cambia si AXIS lo
 * acepta, y siempre eligiendo entre las alternativas que el motor ya preparó:
 * nada se inventa desde el chat.
 */
function negotiate(
  request: ChangeRequest,
  briefing: AxisBriefing,
  insisting = false,
): AxisAnswer {
  const verdict = evaluateChange(request, briefing)

  /*
   * Al insistir sin argumentos nuevos, AXIS mantiene el criterio y lo dice en
   * corto. Repetir el párrafo entero sería peor que ceder: suena a bucle, y el
   * usuario deja de leerlo. Lo que se le pide es información concreta, que es lo
   * único que puede cambiar la respuesta.
   */
  if (insisting && verdict.outcome === 'decline') {
    return {
      text: 'Sigo pensando lo mismo, y no por llevarte la contraria: nada de lo que me has dicho cambia tus datos, y son los datos los que deciden. Si hay algo que no tengo registrado —un esfuerzo de ayer, una molestia, que duermes mal esta semana—, dímelo concreto y lo reviso.',
      intent: 'change',
      unknown: false,
      verdict: verdict.outcome,
      proposedTarget: null,
      changeRequest: { kind: request.kind, focus: request.focus },
      cancelledActivities: request.cancelledActivities,
    }
  }

  return {
    text: verdict.text,
    intent: 'change',
    unknown: verdict.outcome === 'need_info',
    verdict: verdict.outcome,
    // Se propone, no se aplica: hace falta que el usuario pulse el botón.
    proposedTarget: verdict.proposedTarget,
    proposedReason: verdict.text,
    changeRequest: { kind: request.kind, focus: request.focus },
    cancelledActivities: request.cancelledActivities,
  }
}

/**
 * «¿Qué hemos cambiado?»
 *
 * Solo aquí se menciona el cambio. En el resto de respuestas AXIS habla de la
 * sesión que hay hoy, sin arrastrar de dónde viene: al usuario le interesa qué
 * hacer, no el historial de la conversación.
 */
function answerChanged(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('changed', 'Todavía no tengo una sesión para hoy.')
  }
  if (!proposal.changedFrom) {
    return say('changed', [
      'Nada: la sesión de hoy es la que te recomendé.',
      proposal.headline,
    ])
  }

  return say('changed', [
    `Cambiamos «${proposal.changedFrom.headline}» por «${proposal.headline}».`,
    proposal.changedFrom.reason,
  ])
}

/** Fuera del modo cambio, «¿puedo cambiarlo?» abre la negociación explicando cómo. */
function answerChange(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('change', 'Todavía no tengo una sesión propuesta para hoy.')
  }

  return say('change', [
    'Puedo cambiarla, pero no a ciegas: dime qué quieres cambiar y por qué.',
    'Si me cuentas algo que no tenga registrado —un esfuerzo de ayer, una molestia, que vas justo de tiempo— lo tengo en cuenta. Si no hay motivo, te lo diré.',
  ])
}

function answerShorten(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal?.session) {
    return unknown('shorten', 'Hoy no te he propuesto una sesión que acortar.')
  }

  const minutes = proposal.session.estimatedMinutes
  const shorter = proposal.alternatives.find(
    (alternative) => alternative.estimatedMinutes !== null && alternative.estimatedMinutes < minutes,
  )

  return say('shorten', [
    `Sí. La sesión de hoy son ${minutes} minutos.`,
    shorter
      ? `Si quieres menos, cambia a «${shorter.label}»: unos ${shorter.estimatedMinutes} min, mismo criterio.`
      : 'Puedes hacer los primeros ejercicios y dejar el resto: se guardará lo que hayas hecho de verdad.',
  ])
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

function answerRecovery(briefing: AxisBriefing): AxisAnswer {
  const { recovery } = briefing

  if (!recovery.known) {
    return unknown('recovery', `No puedo calcular tu recuperación de hoy. ${recovery.reason}`)
  }

  const parts = [
    `Tu recuperación de hoy está en ${recovery.value} sobre 100: ${RECOVERY_BAND_LABELS[recovery.band].toLowerCase()}.`,
  ]
  if (recovery.sleepHours !== null) parts.push(`Has registrado ${recovery.sleepHours} h de sueño.`)
  if (recovery.hydrationGlasses !== null) parts.push(`Vas por ${recovery.hydrationGlasses} de 8 vasos.`)
  if (recovery.band !== 'good' && recovery.weakest.length > 0) {
    parts.push(`Lo que más pesa hoy: ${recovery.weakest[0]}.`)
  }

  return say('recovery', parts)
}

function answerLastSession(briefing: AxisBriefing): AxisAnswer {
  const session = briefing.lastSession
  if (!session) {
    return unknown('last_session', 'Todavía no tengo ningún entrenamiento guardado, así que no puedo decirte qué hiciste.')
  }

  const parts = [
    `Tu último entrenamiento fue ${formatRelativeDay(session.dayKey, briefing.dayKey).toLowerCase()}: ${session.title}.`,
    `${session.exerciseCount} ejercicios en ${formatDuration(session.durationSeconds)}, ${formatVolume(session.totalVolumeKg)} de volumen.`,
  ]
  if (session.modifications.length > 0) parts.push(session.modifications.join(' '))

  return say('last_session', parts)
}

function answerWeek(briefing: AxisBriefing): AxisAnswer {
  const { week } = briefing

  if (week.sessionCount === 0) {
    return unknown('week', 'Esta semana todavía no has completado ningún entrenamiento, así que no hay nada que resumir.')
  }

  const parts = [
    `Esta semana llevas ${week.sessionCount} ${week.sessionCount === 1 ? 'entrenamiento' : 'entrenamientos'}, ${formatTotalTime(week.totalSeconds)} y ${formatVolume(week.totalVolumeKg)} de volumen.`,
  ]
  parts.push(
    week.performancePercent === null
      ? 'Todavía no tengo semana anterior con la que compararlo.'
      : `Respecto a la semana pasada: ${week.performancePercent > 0 ? '+' : ''}${week.performancePercent} % de volumen.`,
  )

  return say('week', parts)
}

function answerLoad(briefing: AxisBriefing): AxisAnswer {
  const { load } = briefing
  if (!load.known) {
    return unknown('load', 'No tengo entrenamientos recientes suficientes para calcular tu carga.')
  }

  return say('load', [
    `Tu carga de los últimos ${load.windowDays} días está en ${load.value} sobre 100: ${TRAINING_LOAD_BAND_LABELS[load.band].toLowerCase()}.`,
    `Sale de ${load.sessionCount} ${load.sessionCount === 1 ? 'sesión' : 'sesiones'}.`,
  ])
}

function answerGoals(briefing: AxisBriefing): AxisAnswer {
  const goals = briefing.profile?.goals ?? []
  if (goals.length === 0) {
    return unknown('goals', 'Todavía no has elegido ningún objetivo en tu perfil.')
  }

  return say('goals', [
    `Tus objetivos son ${listNames(goals.map((goal) => TRAINING_GOAL_LABELS[goal].toLowerCase()))}.`,
    'Los tengo todos en cuenta a la vez al preparar la sesión, sin dar prioridad a ninguno.',
  ])
}

// ---------------------------------------------------------------------------
// Límites
// ---------------------------------------------------------------------------

function answerMedical(): AxisAnswer {
  return unknown(
    'medical',
    'Eso no puedo evaluarlo: no soy médico y no interpreto dolores ni lesiones. Si te preocupa, consúltalo con un profesional. Puedo ayudarte con la carga y la recuperación cuando quieras retomarlo.',
  )
}

function answerOutOfScope(): AxisAnswer {
  return unknown(
    'out_of_scope',
    `Eso queda fuera de lo que puedo ayudarte a decidir. Puedo ayudarte con ${SCOPE}.`,
  )
}

function answerUnknown(): AxisAnswer {
  return unknown(
    'unknown',
    `No he entendido a qué te refieres. Puedo ayudarte con ${SCOPE}.`,
  )
}

// ---------------------------------------------------------------------------
// Utilidades de redacción
// ---------------------------------------------------------------------------

/**
 * Quita de un texto las frases que ya se han dicho.
 *
 * Las razones del motor y las frases compuestas comparten hechos: sin esto, AXIS
 * repetiría «hoy tienes baloncesto» dos veces en la misma respuesta.
 */
function withoutOverlap(text: string, alreadySaid: readonly string[]): string {
  const saidWords = new Set(contentWords(alreadySaid.join(' ')))

  const kept = text.split(/(?<=\.)\s+/).filter((sentence) => {
    if (sentence.trim().length === 0) return false

    const words = contentWords(sentence)
    if (words.length === 0) return true

    // Se descarta la frase si casi todo lo que aporta ya se ha dicho. Comparar
    // frases enteras no bastaría: «hoy tienes baloncesto» y «porque hoy tienes
    // baloncesto y…» son frases distintas que cuentan lo mismo.
    const repeated = words.filter((word) => saidWords.has(word)).length
    return repeated / words.length < OVERLAP_THRESHOLD
  })

  return kept.join(' ')
}

/** Proporción de palabras repetidas a partir de la cual una frase sobra. */
const OVERLAP_THRESHOLD = 0.8

/** Palabras con contenido: se ignoran las cortas, que no distinguen nada. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
}

function say(intent: AxisIntent, parts: string[], isUnknown = false): AxisAnswer {
  return { text: parts.filter((part) => part.trim().length > 0).join(' '), intent, unknown: isUnknown }
}

function unknown(intent: AxisIntent, text: string): AxisAnswer {
  return { text, intent, unknown: true }
}

function listExercises(
  exercises: { name: string; sets: number; reps: number; isTimed: boolean }[],
): string {
  return exercises
    .map((exercise) => `${exercise.name} ${exercise.sets}×${exercise.reps}${exercise.isTimed ? ' s' : ''}`)
    .join(', ')
}

function describeActivityForUser(activity: BriefingActivity): string {
  return activity.window
    ? `${activity.name.toLowerCase()} (${activity.window})`
    : activity.name.toLowerCase()
}

function describeProposalFocus(proposal: NonNullable<AxisBriefing['proposal']>): string {
  return proposal.session
    ? describeFocus(proposal.session.focus)
    : 'la recuperación'
}

// ---------------------------------------------------------------------------
// Sugerencias
// ---------------------------------------------------------------------------

/** Solo se ofrece lo que AXIS puede responder con los datos que hay ahora mismo. */
export function suggestionsFor(briefing: AxisBriefing): AxisSuggestion[] {
  const suggestions: AxisSuggestion[] = []

  if (briefing.proposal) {
    suggestions.push({ label: '¿Por qué este entrenamiento?', question: '¿Por qué me has puesto este entrenamiento?' })
  }
  suggestions.push({ label: '¿Qué tienes en cuenta hoy?', question: '¿Qué tienes en cuenta para decidir?' })
  suggestions.push({ label: '¿Cómo estoy recuperando?', question: '¿Cómo estoy recuperando?' })

  if (briefing.activitiesToday.length > 0) {
    suggestions.push({ label: '¿Cómo afecta mi deporte?', question: '¿Cómo afecta mi deporte al entrenamiento?' })
  } else if (briefing.lastSession) {
    suggestions.push({ label: '¿Qué entrené la última vez?', question: '¿Qué hice en mi último entrenamiento?' })
  }

  return suggestions.slice(0, 4)
}
