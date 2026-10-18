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

import { ACTIVITY_INTENSITY_LABELS, TRAINING_GOAL_LABELS, type ActivityIntensity } from '../../profile/types'
import { RECOVERY_BAND_LABELS } from '../../recovery/types'
import { formatTotalTime, formatVolume } from '../../history/stats'
import { addDays, formatDayInSentence, formatDuration, formatRelativeDay, formatShortDate, WEEKDAY_LABELS } from '../../shared/dates'
import { listNames } from '../../shared/text'
import { TRAINING_LOAD_BAND_LABELS } from '../../workouts/load'
import { describeFocus, type SessionFocus } from '../knowledge/focus'
import { muscleGroupLabel } from '../knowledge/muscles'
import type { AxisBriefing, BriefingActivity } from '../briefing'
import {
  asksForMoreTime,
  looksLikeQuestion,
  looksLikeRequest,
  matchIntent,
  resolveExercise,
  type ExerciseResolution,
  type IntentMatch,
} from './intents'
import { matchName } from '../actions'
import { answerAssessment, asksAboutAssessment } from './assessment-answer'
import { answerScan, asksAboutScan } from './scan-answer'
import { answerSocial, detectSocial } from './social'
import { understandMessage } from './understand'
import { detectDiscomfortZone, detectPreference, type ExercisePreference } from './preferences'
import {
  evaluateBlockReason,
  evaluateChange,
  FATIGUE_NOT_REGISTERED,
  parseChangeRequest,
  type ChangeRequest,
  type ChangeVerdict,
} from './negotiation'
import {
  asksToMoveToTomorrow,
  detectBlockReason,
  detectIntensity,
  saysCannotDoPlanned,
  saysCannotTrainToday,
  saysMatchTomorrow,
  saysMissedYesterday,
  statedMinutes,
} from './reorganization'
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
  message: string,
  briefing: AxisBriefing,
  memory?: AxisConversationMemory,
): AxisAnswer {
  /*
   * Charla (D-042): un «hola» o un «gracias» se contestan como tal, también
   * con «Cambiar entrenamiento» abierto. Ahí un «vale» o un «venga» sí pueden
   * ser parte de la negociación, así que esos siguen su camino.
   */
  const social = detectSocial(message)
  if (social && !(memory?.changeMode && social === 'ack')) {
    return answerSocial(social, message, briefing, { turn: memory?.turn ?? 0, changeMode: memory?.changeMode ?? false })
  }

  // Todos los detectores leen el mensaje con las faltas corregidas (D-026).
  const question = understandMessage(message, briefing)
  const match = matchIntent(question, memory?.lastIntent ?? null)

  /*
   * Lo que se cuenta, no se pide (D-022): «ayer no pude entrenar» y «mañana
   * tengo partido». Se responde igual se esté negociando o no: leído como
   * petición, «ayer no pude entrenar» sería pedir descanso. Una molestia o algo
   * ajeno siguen yendo antes.
   */
  if (match.intent !== 'medical' && match.intent !== 'out_of_scope') {
    // «No me gustan las zancadas»: se apunta antes de leerlo como un cambio (D-037).
    const preference = detectPreference(question)
    if (preference) return answerPreference(preference)

    const statement = answerStatement(question, briefing, memory)
    if (statement) return statement
  }

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

    /*
     * AXIS preguntó por qué no puede hacer lo previsto (D-022). La respuesta es
     * un motivo, no una petición: «no tengo material para entrenar» lleva un
     * «no» y «entrenar», y leído como petición sería descansar.
     */
    if (
      !isMedicalOrForeign &&
      memory.lastChangeRequest?.kind === 'cannot_planned' &&
      (request.kind === 'unclear' || request.kind === 'rest')
    ) {
      const reason = detectBlockReason(question)
      if (reason) {
        return answerVerdict(evaluateBlockReason(reason, request, briefing), {
          ...request,
          kind: 'cannot_planned',
        })
      }
    }
    /*
     * Una pregunta no es una petición. «¿Qué músculos trabajan las
     * sentadillas?» nombra piernas y «¿por qué necesito descansar?» contiene
     * «descansar», pero ninguna pide cambiar nada: se responden como lo que
     * son. Una pregunta sí se negocia cuando pide algo («¿podemos no hacer
     * piernas?», «¿puedes cambiarlo?») o cuando trae una carga que contar.
     */
    const isQuestion =
      looksLikeQuestion(question) &&
      !looksLikeRequest(question) &&
      request.reportedLoad === null &&
      match.intent !== 'change' &&
      match.intent !== 'shorten'
    const asksForChange =
      !isQuestion &&
      (request.kind !== 'unclear' ||
        request.reportedLoad !== null ||
        match.intent === 'change' ||
        match.intent === 'unknown')

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
          minutes: request.minutes,
        }
        return negotiate(pending, briefing, request.reportedLoad === null)
      }

      return negotiate(request, briefing)
    }
  } else {
    /*
     * Fuera del modo cambio, una petición inequívoca de modificar la sesión
     * abre la negociación igual que si se hubiera pulsado «Cambiar
     * entrenamiento». Lo que no sea inequívoco sigue necesitando el botón.
     */
    const request = explicitChangeRequest(question, match, briefing)
    if (request) return negotiate(request, briefing)
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
    case 'missed_yesterday':
      return answerMissedYesterday(briefing)
    case 'match_tomorrow':
      return answerMatchTomorrow(briefing, detectIntensity(question))
    case 'assessment':
      return answerAssessment(question, briefing)
    case 'scan':
      return answerScan(briefing)
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
    case 'exercise':
      return answerExercise(briefing, match.exercise ?? resolveExercise(question))
    case 'medical':
      return { ...answerMedical(), discomfort: detectDiscomfortZone(question) }
    case 'out_of_scope':
      return answerOutOfScope()
    // Las preferencias (D-037) y la charla (D-042) se reconocen antes de llegar aquí.
    case 'preference':
    case 'social':
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
    const { exercises, warmup, cooldown } = proposal.session
    parts.push(`Serían unos ${proposal.session.estimatedMinutes} minutos: ${listExercises(exercises)}.`)
    // El calentamiento y la vuelta a la calma se nombran aparte, sin series (D-032).
    if (warmup.length > 0) parts.push(`Antes, calienta con ${listNames(warmup.map((name) => name.toLowerCase()))}.`)
    if (cooldown.length > 0) parts.push(`Al acabar, ${listNames(cooldown.map((name) => name.toLowerCase()))} para soltar.`)
  }
  return say('today', parts)
}

function answerWhy(briefing: AxisBriefing): AxisAnswer {
  const { proposal } = briefing
  if (!proposal) {
    return unknown('why', 'Todavía no he hecho ninguna recomendación que explicar.')
  }

  const reasons = proposal.factors.map((factor) => factor.detail).filter((detail) => detail.length > 0)
  if (reasons.length === 0) return say('why', [proposal.headline, proposal.reason])

  /*
   * Los factores dicen qué pesó; el cierre de la razón dice qué se busca con
   * eso («mejor estimular sin sobrecargar»). Con los dos, y lo que dura, la
   * explicación ya es la de un entrenador y no solo un dato (D-030).
   */
  const closing = reasons.reduce((rest, detail) => rest.replace(detail, ''), proposal.reason).trim()
  const minutes = proposal.session ? `Serían unos ${proposal.session.estimatedMinutes} min.` : ''
  return say('why', [proposal.headline, ...reasons, closing, minutes])
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

/** Cuántas actividades con fecha se nombran como mucho al decir lo próximo. */
const MAX_UPCOMING_NAMED = 3

function answerSportToday(briefing: AxisBriefing): AxisAnswer {
  const today = briefing.activitiesToday

  if (today.length === 0) {
    const sports = briefing.profile?.sports ?? []
    // Un partido de un día concreto también es un deporte registrado (D-018).
    const dated = briefing.upcomingDatedActivities
    if (sports.length === 0 && dated.length === 0) {
      return unknown(
        'sport_today',
        'No tienes ningún deporte registrado. Puedes añadirlo desde tu perfil y lo tendré en cuenta.',
      )
    }
    const recurring = sports
      .filter((sport) => sport.weekdays.length > 0)
      .map((sport) => `${sport.name} los ${listNames(sport.weekdays.map((day) => WEEKDAY_LABELS[day as 0].toLowerCase()))}`)

    // Cuándo es cada uno, para que «hoy no» y «el sábado sí» no se confundan.
    const tomorrow = addDays(briefing.dayKey, 1)
    const next = dated
      .slice(0, MAX_UPCOMING_NAMED)
      .map((activity) => `${activity.name} ${activity.date === tomorrow ? 'mañana' : `el ${formatDayInSentence(activity.date)}`}`)

    // «Registrado» no: sí lo está, solo que hoy no toca. Decir lo contrario y
    // acto seguido enumerar sus deportes se contradice en la misma frase.
    return say('sport_today', [
      'Hoy no tienes deporte.',
      recurring.length > 0 ? `Tienes ${listNames(recurring)}.` : '',
      next.length > 0 ? `Lo próximo con fecha: ${listNames(next)}.` : '',
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
  if (briefing.fatigueLevel === null) parts.push(FATIGUE_NOT_REGISTERED)

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
 * Lo que se puede pedir sin estar ya negociando: cambios con nombre propio.
 *
 * Quedan fuera `want_focus` a secas, `train_anyway` y `unclear`: los tres se
 * deducen de mencionar una zona o de querer entrenar, que fuera del modo
 * cambio son con mucha más frecuencia una pregunta o un comentario que una
 * petición. Ahí sigue haciendo falta el botón.
 */
const EXPLICIT_CHANGE_KINDS: ReadonlySet<ChangeRequest['kind']> = new Set([
  'shorter',
  'longer',
  'easier',
  'harder',
  'rest',
  'avoid_focus',
  // Límites reales (D-022): se dicen sin pedir, y son inequívocos.
  'cannot_today',
  'move_tomorrow',
  'cannot_planned',
])

/**
 * La petición de cambio que hay en un mensaje escrito fuera del modo cambio,
 * o `null` si no es inequívoca.
 *
 * Inequívoca quiere decir dos cosas a la vez: que el mensaje **pide** algo
 * (`looksLikeRequest`: «quiero», «hazme», «podemos», «tengo menos tiempo»…) y
 * que lo que pide tiene **nombre**: más corta, más larga, más ligera, más dura, descansar
 * o evitar una zona. Ninguna de las dos basta sola. «¿Es mejor una sesión más
 * corta?» nombra el cambio pero pregunta, y se responde como pregunta; «quiero
 * cambiar el entrenamiento» pide pero no dice qué, y AXIS pregunta el motivo.
 * Un «¿y si…?» tampoco cuenta: es una hipótesis, no una orden.
 *
 * Pedir más tiempo es la excepción a la primera condición: «+15 min» o «10
 * minutos extra» no llevan verbo y ya lo dicen todo. Cuentan como petición
 * mientras no tengan forma de pregunta; «¿+15 min?» se responde como pregunta.
 */
function explicitChangeRequest(
  question: string,
  match: IntentMatch,
  briefing: AxisBriefing,
): ChangeRequest | null {
  if (match.intent === 'medical' || match.intent === 'out_of_scope') return null
  if (match.isFollowUp) return null
  const statesMoreTime = asksForMoreTime(question) && !looksLikeQuestion(question)
  /*
   * Un límite contado tampoco necesita verbo de pedir (D-022): «solo tengo 20
   * minutos», «hoy no puedo entrenar», «muévelo a mañana». Preguntado
   * («¿y si solo tengo 20 minutos?») sigue siendo una pregunta.
   */
  const statesLimit =
    !looksLikeQuestion(question) &&
    (statedMinutes(question) !== null ||
      saysCannotTrainToday(question) ||
      asksToMoveToTomorrow(question) ||
      saysCannotDoPlanned(question))
  if (!looksLikeRequest(question) && !statesMoreTime && !statesLimit) return null

  const request = parseChangeRequest(
    question,
    briefing.activitiesToday.map((activity) => activity.name),
  )
  return EXPLICIT_CHANGE_KINDS.has(request.kind) ? request : null
}

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
      reportedLoad: request.reportedLoad,
    }
  }

  return answerVerdict(verdict, request)
}

/** La respuesta a una petición ya juzgada. Se propone, no se aplica. */
function answerVerdict(verdict: ChangeVerdict, request: ChangeRequest): AxisAnswer {
  return {
    text: verdict.text,
    intent: 'change',
    unknown: verdict.outcome === 'need_info',
    verdict: verdict.outcome,
    // Se propone, no se aplica: hace falta que el usuario pulse el botón.
    proposedTarget: verdict.proposedTarget,
    proposedEffect: verdict.proposedEffect ?? null,
    proposedReason: verdict.text,
    changeRequest: { kind: request.kind, focus: request.focus },
    cancelledActivities: request.cancelledActivities,
    reportedLoad: request.reportedLoad,
  }
}

// ---------------------------------------------------------------------------
// Lo que se cuenta (D-022)
// ---------------------------------------------------------------------------

/** Una intensidad dicha sola, como respuesta a la pregunta por el partido. */
const SHORT_REPLY_WORDS = 6

function answerStatement(
  question: string,
  briefing: AxisBriefing,
  memory?: AxisConversationMemory,
): AxisAnswer | null {
  if (saysMissedYesterday(question)) return answerMissedYesterday(briefing)

  // El test de evolución, solo porque el usuario pregunta por él (D-021).
  if (asksAboutAssessment(question, memory?.lastIntent ?? null)) return answerAssessment(question, briefing)

  // El escáner corporal, solo porque el usuario pregunta por él (D-023).
  if (asksAboutScan(question, memory?.lastIntent ?? null)) return answerScan(briefing)

  // «Hoy no puedo porque mañana tengo partido» pide algo para hoy: eso negocia.
  const asksForToday = asksToMoveToTomorrow(question) || saysCannotTrainToday(question)
  if (!asksForToday && saysMatchTomorrow(question)) {
    return answerMatchTomorrow(briefing, detectIntensity(question))
  }

  // La respuesta a «¿cómo de exigente es?»: una intensidad, en pocas palabras.
  if (memory?.lastIntent === 'match_tomorrow' && !looksLikeQuestion(question)) {
    const intensity = detectIntensity(question)
    const short = question.trim().split(/\s+/).length <= SHORT_REPLY_WORDS
    if (intensity && short) return answerMatchTomorrow(briefing, intensity)
  }
  return null
}

/**
 * «Ayer no pude entrenar.» No se recupera acumulando: hoy no hay sesión doble,
 * y el foco ya mira lo que más tiempo lleva sin trabajarse. No cambia nada.
 */
function answerMissedYesterday(briefing: AxisBriefing): AxisAnswer {
  const parts: string[] = []
  if (briefing.daysSinceLastWorkout === 1) {
    parts.push('En tu historial sí consta un entrenamiento ayer.')
  }
  parts.push('Un día sin entrenar no se recupera acumulando: hoy no hay sesión doble.')

  const proposal = briefing.proposal
  if (proposal?.session) {
    parts.push(`Hoy sigue lo previsto. ${proposal.headline}`)
    parts.push('El foco ya prioriza lo que más tiempo lleva sin trabajarse.')
  } else if (proposal) {
    parts.push(proposal.headline)
  }
  return say('missed_yesterday', parts)
}

/**
 * «Mañana tengo un partido.» Registrado, AXIS lo confirma. Si no, propone
 * registrarlo, y antes pregunta la intensidad si no la sabe: sin ella no sabe
 * qué hacer con el día de hoy.
 */
function answerMatchTomorrow(briefing: AxisBriefing, intensity: ActivityIntensity | null): AxisAnswer {
  const registered = briefing.activitiesTomorrow
  if (registered.length > 0) {
    const names = listNames(registered.map((activity) => activity.name.toLowerCase()))
    const parts = [`Lo tengo: mañana tienes ${names}.`]
    if (briefing.proposal) parts.push(`Ya lo he tenido en cuenta para hoy. ${briefing.proposal.headline}`)
    return say('match_tomorrow', parts)
  }

  if (!intensity) {
    return {
      text: 'No tengo ningún partido registrado para mañana. ¿Cómo de exigente es: suave, normal o exigente? Con eso lo registro y replanteo el día de hoy.',
      intent: 'match_tomorrow',
      unknown: false,
      verdict: 'need_info',
      proposedTarget: null,
    }
  }

  const name = matchName(briefing.profile?.sports.map((sport) => sport.name) ?? []).toLowerCase()
  const label = ACTIVITY_INTENSITY_LABELS[intensity].toLowerCase()
  const text = `Lo registro como ${name} mañana, de intensidad ${label}. Al confirmarlo, vuelvo a decidir el día de hoy contando con él.`
  return {
    text,
    intent: 'match_tomorrow',
    unknown: false,
    verdict: 'accept',
    proposedTarget: null,
    proposedReason: text,
    proposedEffect: { kind: 'add_dated_activity', intensity },
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
  // Lo que más falta de la semana, en series (D-034): es lo próximo que conviene trabajar.
  if (week.lagging) {
    parts.push(
      `Lo que más va por detrás: ${week.lagging.group.toLowerCase()}, con ${formatSetCount(week.lagging.sets)} de ${week.lagging.target} series esta semana.`,
    )
  }

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
    ...(briefing.profile?.targets ?? []).map(describeTarget),
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

/** Una preferencia sobre un ejercicio (D-037). Se apunta; no cambia la sesión de hoy. */
function answerPreference(preference: ExercisePreference): AxisAnswer {
  const name = preference.name.toLowerCase()
  return {
    text: preference.liked
      ? `Hecho: ${name} vuelve a entrar en tus sesiones cuando toque.`
      : `Apuntado: no te propondré ${name} mientras tenga alternativas. La sesión de hoy no cambia; si quieres quitarlo ya, pídeme el cambio. Y si cambias de idea, dime «ya me gusta ${name}».`,
    intent: 'preference',
    unknown: false,
    preference: { exerciseId: preference.exerciseId, liked: preference.liked },
  }
}

function answerOutOfScope(): AxisAnswer {
  return unknown(
    'out_of_scope',
    `Eso queda fuera de lo que puedo ayudarte a decidir. Puedo ayudarte con ${SCOPE}.`,
  )
}

const CATEGORY_LABELS = { empuje: 'empuje', tiron: 'tirón', piernas: 'piernas', core: 'core', movilidad: 'movilidad', pliometria: 'saltos' } as const

/**
 * «¿Para qué sirven las flexiones?»
 *
 * Se responde con lo que el catálogo sabe de ese ejercicio: patrón, músculos e
 * instrucciones. Nada más: AXIS no es una enciclopedia de fisiología, y lo que
 * no está en el catálogo no se inventa.
 */
/**
 * Responde por un ejercicio con la resolución que ya hizo `matchIntent`: no se
 * vuelve a buscar (D-020).
 *
 * Las dudas y los que no existen se responden con intent `unknown`, que no pasa
 * por la capa de lenguaje: un modelo no debe elegir por el usuario entre dos
 * ejercicios ni inventar uno que no está en el catálogo.
 */
function answerExercise(briefing: AxisBriefing, resolution: ExerciseResolution): AxisAnswer {
  if (resolution.kind === 'ambiguous') {
    const names = resolution.options.map((option) => `«${option.name}»`)
    return unknown('unknown', `¿Te refieres a ${names.slice(0, -1).join(', a ')} o a ${names[names.length - 1]}?`)
  }
  if (resolution.kind === 'not_found') {
    return resolution.query === null
      ? answerUnknown()
      : unknown('unknown', 'No tengo ese ejercicio en tu catálogo.')
  }

  const exercise = resolution.exercise
  const primary = listNames(exercise.primaryMuscles.map(muscleGroupLabel))
  const secondary = exercise.secondaryMuscles.map(muscleGroupLabel)
  const parts = [
    `${exercise.name}: ejercicio de ${CATEGORY_LABELS[exercise.category]}. Trabaja sobre todo ${primary}${secondary.length > 0 ? `, y de paso ${listNames(secondary)}` : ''}.`,
    exercise.instructions,
  ]

  const inSession = briefing.proposal?.session?.exercises.some((item) => item.name === exercise.name) ?? false
  if (inSession) parts.push('Hoy está en tu sesión.')

  return say('exercise', parts)
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

/** Un objetivo medible y cómo va (D-035): «Flexiones, 12 reps antes del lun, 1 mar: llevas 9, vas bien». */
function describeTarget(target: NonNullable<AxisBriefing['profile']>['targets'][number]): string {
  const status = {
    achieved: 'conseguido',
    on_track: 'vas bien',
    behind: 'vas por detrás de lo que tocaría a estas alturas',
    expired: 'la fecha ya pasó sin llegar',
  }[target.status]
  return `${target.exercise}, ${target.target} ${target.unit} antes del ${formatShortDate(target.deadline).toLowerCase()}: llevas ${target.current}, ${status}.`
}

/** Series de la semana, que pueden ser medias: «7,5». */
function formatSetCount(sets: number): string {
  return sets.toLocaleString('es-ES', { maximumFractionDigits: 1 })
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
