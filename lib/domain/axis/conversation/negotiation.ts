/**
 * Negociación del entrenamiento del día.
 *
 * «Cambiar entrenamiento» no baraja alternativas al azar: abre una conversación
 * con AXIS acotada a ese cambio. El usuario expone lo que quiere y por qué, y
 * AXIS responde con un veredicto razonado.
 *
 * La regla que gobierna todo este módulo:
 *
 *   **AXIS no cede por insistencia, cede por evidencia.**
 *
 * Una petición se acepta cuando algo la respalda —un dato registrado, o una carga
 * que el usuario acaba de contar— y se rechaza cuando lo único que la sostiene es
 * la preferencia. Un entrenador que dice «tienes razón» a todo no sirve de nada:
 * el usuario ya sabe lo que le apetece, lo que necesita es un criterio.
 *
 * Tres cosas que este módulo nunca hace:
 *
 * - Abrir con «tienes razón», «buena idea» o «claro». La primera frase es el
 *   veredicto, no un cumplido.
 * - Inventar datos. Lo que el usuario cuenta y no está registrado se trata como
 *   lo que es: su palabra, y se dice.
 * - Decidir por su cuenta. Elige entre las alternativas que el motor ya generó.
 */

import { listNames } from '../../shared/text'
import type { AxisActionEffect, AxisActionTarget } from '../actions'
import { MIN_SESSION_MINUTES, RECENT_HISTORY_DAYS } from '../facts'
import type { AxisBriefing, BriefingAlternative } from '../briefing'
import { describeFocus, FOCUS_MUSCLE_GROUPS, type SessionFocus } from '../knowledge/focus'
import type { ReportedLoad } from '../memory'
import { muscleGroupLabel } from '../knowledge/muscles'
import {
  ACTIVITY_MENTION_TERMS,
  EFFORT_TERMS,
  REPORTED_ACTIVITY_LOADS,
} from '../knowledge/sports'
import { isTrainingRecommendation } from '../types'
import { asksForMoreTime, detectFocus, normalizeQuestion } from './intents'
import {
  asksToMoveToTomorrow,
  saysCannotDoPlanned,
  saysCannotTrainToday,
  saysTooTired,
  statedMinutes,
  type BlockReason,
} from './reorganization'
import type { AxisVerdict } from './types'

// ---------------------------------------------------------------------------
// Lo que el usuario pide
// ---------------------------------------------------------------------------

export type ChangeRequestKind =
  | 'avoid_focus'
  | 'want_focus'
  | 'shorter'
  /** Más tiempo. Se juzga como subir la carga: más minutos son más volumen. */
  | 'longer'
  | 'easier'
  | 'harder'
  | 'rest'
  /** Quiere entrenar cuando AXIS había recomendado no hacerlo, o hacer más. */
  | 'train_anyway'
  /** «Hoy no puedo entrenar»: un límite, no una preferencia (D-022). */
  | 'cannot_today'
  /** «Muévelo a mañana» (D-022). */
  | 'move_tomorrow'
  /** «No puedo hacer el entrenamiento previsto»: falta saber por qué (D-022). */
  | 'cannot_planned'
  /** Cansancio contado en la conversación (D-022). */
  | 'tired'
  | 'unclear'

/**
 * La carga contada vive en la memoria del día (`memory.ts`): se reexporta para
 * quien ya la importaba de aquí.
 */
export type { ReportedLoad }

export type ChangeRequest = {
  kind: ChangeRequestKind
  focus: SessionFocus | null
  reportedLoad: ReportedLoad | null
  /**
   * Actividades del calendario que hoy no van a pasar.
   *
   * El calendario dice lo que suele ocurrir, no lo que ocurre. Si el partido se
   * ha cancelado, la razón por la que AXIS frenaba desaparece, y seguir frenando
   * no sería firmeza: sería no escuchar.
   */
  cancelledActivities: string[]
  /** Minutos que el usuario dice tener hoy, si los dice (D-022). */
  minutes: number | null
}

const AVOID_TERMS = [
  'no hacer', 'no quiero', 'sin ', 'evitar', 'evita', 'saltarme', 'saltar', 'nada de',
  'no me apetece', 'dejar', 'no toquemos', 'no cargar', 'podemos no',
]
const WANT_TERMS = ['quiero hacer', 'prefiero', 'me apetece', 'hagamos', 'mejor hacer', 'cambiar a']
const SHORTER_TERMS = [
  'menos tiempo', 'mas corto', 'más corto', 'mas corta', 'más corta', 'poco tiempo',
  'voy justo', 'solo tengo', 'no me da tiempo', '20 minutos', '15 minutos', '30 minutos', 'media hora',
  'menos ejercicios',
]
const EASIER_TERMS = [
  'mas suave', 'más suave', 'mas ligero', 'más ligero', 'mas ligera', 'más ligera',
  'menos intenso', 'menos intensa', 'mas facil', 'más fácil', 'bajar la intensidad', 'algo tranquilo',
]
const HARDER_TERMS = [
  'mas duro', 'más duro', 'mas dura', 'más dura', 'mas intenso', 'más intenso',
  'mas fuerte', 'más fuerte', 'subir la intensidad', 'exigente', 'mas volumen', 'más volumen',
  'mas intensidad', 'más intensidad',
]
const REST_TERMS = ['descansar', 'no entrenar', 'dia libre', 'día libre', 'parar hoy', 'saltarme el dia', 'saltarme el día']

/** Querer entrenar, cuando AXIS había recomendado no hacerlo o hacer poco. */
const TRAIN_ANYWAY_TERMS = [
  'me apetece entrenar', 'quiero entrenar', 'si quiero entrenar', 'sí quiero entrenar',
  'me apetece', 'quiero moverme', 'quiero hacer algo', 'puedo entrenar', 'deberia entrenar',
  'debería entrenar', 'hoy si', 'hoy sí', 'me encuentro bien', 'estoy bien', 'con ganas',
  'igualmente quiero', 'aun asi quiero', 'aun así quiero',
]

/** Que algo del calendario hoy no va a ocurrir. */
const CANCELLED_TERMS = [
  'no tengo', 'no tenia', 'no tenía', 'no hay', 'no hubo', 'se ha cancelado', 'se cancelo',
  'se canceló', 'cancelado', 'cancelada', 'no voy a ir', 'no he ido', 'no fui', 'al final no',
  'me lo han quitado', 'se ha suspendido', 'suspendido', 'no toca',
]

/** Marcas de que el usuario está contando algo que hizo, no preguntando. */
const REPORT_TERMS = ['hice', 'he hecho', 'hicimos', 'estuve', 'me hice', 'ayer', 'esta manana', 'esta mañana', 'antes', 'vengo de', 'acabo de']

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalizeQuestion(term)))
}

/**
 * Como `includesAny`, pero descartando las apariciones negadas.
 *
 * «No quiero entrenar» contiene literalmente «quiero entrenar». Buscar la
 * subcadena a secas hacía que AXIS entendiera exactamente lo contrario de lo que
 * le decían. Se considera negada si hay un «no» pegado justo antes, dentro de
 * unas pocas palabras.
 */
function includesAnyNotNegated(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    const needle = normalizeQuestion(term)
    let from = 0

    for (;;) {
      const at = text.indexOf(needle, from)
      if (at === -1) return false

      const before = text.slice(Math.max(0, at - 24), at)
      if (!/\bno\b[\w\s]{0,15}$/.test(before)) return true

      from = at + needle.length
    }
  })
}

/** Lee lo que el usuario cuenta haber hecho y que no está registrado. */
export function detectReportedLoad(message: string): ReportedLoad | null {
  const text = normalizeQuestion(message)
  if (!includesAny(text, REPORT_TERMS)) return null

  const matched = REPORTED_ACTIVITY_LOADS.filter((entry) => includesAny(text, entry.terms))
  if (matched.length === 0) return null

  const muscleGroups = [...new Set(matched.flatMap((entry) => entry.muscleGroups))]
  // Un número seguido de «km» o una mención a montaña bastan para tomárselo en serio.
  const demanding = includesAny(text, EFFORT_TERMS) || /\d+\s*(km|k)\b/.test(text)

  return { quote: message.trim(), muscleGroups, demanding }
}

/**
 * Qué actividades de hoy dice el usuario que no van a ocurrir.
 *
 * Se le pasan los nombres que hay en el calendario para poder reconocerlos —
 * «básquet», «natación»— además de las palabras genéricas con las que se nombra
 * una actividad.
 */
export function detectCancelledActivities(
  message: string,
  todayActivityNames: readonly string[] = [],
): string[] {
  const text = normalizeQuestion(message)
  if (!includesAny(text, CANCELLED_TERMS)) return []

  const named = todayActivityNames.filter((name) => text.includes(normalizeQuestion(name)))
  if (named.length > 0) return named

  // «hoy no tengo entreno»: no nombra el deporte, pero se refiere al del día.
  if (includesAny(text, ACTIVITY_MENTION_TERMS)) return [...todayActivityNames]

  return []
}

export function parseChangeRequest(
  message: string,
  todayActivityNames: readonly string[] = [],
): ChangeRequest {
  const text = normalizeQuestion(message)
  const focus = detectFocus(message)
  const reportedLoad = detectReportedLoad(message)
  const cancelledActivities = detectCancelledActivities(message, todayActivityNames)

  const minutes = statedMinutes(message)
  const base = { focus, reportedLoad, cancelledActivities, minutes }

  /*
   * Los límites reales van antes que nada (D-022): «hoy no puedo, muévelo a
   * mañana» es mover; «no puedo hacer el entrenamiento» pide un motivo; «hoy no
   * puedo entrenar» es no poder, que no es lo mismo que no querer.
   */
  if (asksToMoveToTomorrow(message)) return { kind: 'move_tomorrow', ...base }
  if (saysCannotDoPlanned(message) && focus === null) return { kind: 'cannot_planned', ...base }
  if (saysCannotTrainToday(message) && focus === null) return { kind: 'cannot_today', ...base }

  /*
   * Primero lo que se pide de forma explícita. Que un partido se haya cancelado
   * es contexto, no la petición: si además dice «hoy piernas no», lo que pide es
   * evitar piernas, y la cancelación solo sirve para juzgarlo.
   */
  if (includesAny(text, REST_TERMS)) return { kind: 'rest', ...base }

  /*
   * Evitar una zona se dice de muchas formas, y la mayoría no son una frase
   * hecha: «hoy piernas no» no contiene ninguno de los giros de AVOID_TERMS.
   * Un «no» suelto junto a una zona, sin que se pida esa zona, es una negativa.
   */
  const hasBareNo = /\bno\b/.test(text)
  const wantsIt = includesAny(text, WANT_TERMS)
  if (focus !== null && (includesAny(text, AVOID_TERMS) || (hasBareNo && !wantsIt))) {
    return { kind: 'avoid_focus', ...base }
  }
  // Antes que acortar: «15 minutos más» contiene «15 minutos» y pide lo contrario.
  if (asksForMoreTime(message)) return { kind: 'longer', ...base }
  // Decir cuántos minutos se tienen es acortar a esos minutos (D-022).
  if (minutes !== null || includesAny(text, SHORTER_TERMS)) return { kind: 'shorter', ...base }
  if (includesAny(text, HARDER_TERMS)) return { kind: 'harder', ...base }
  if (includesAny(text, EASIER_TERMS)) return { kind: 'easier', ...base }
  if (saysTooTired(message)) return { kind: 'tired', ...base }
  if (focus !== null) return { kind: 'want_focus', ...base }

  /*
   * Querer entrenar, y va antes que la regla heurística de descanso de abajo.
   *
   * «Hoy no tenía entreno de básquet y me apetece entrenar» tiene un «no» y la
   * palabra «entreno», que es exactamente el patrón de «no quiero entrenar».
   * Leído así, AXIS entendía lo contrario de lo que le decían y se negaba a
   * dejar entrenar a alguien que quería entrenar.
   */
  if (includesAnyNotNegated(text, TRAIN_ANYWAY_TERMS) || cancelledActivities.length > 0) {
    return { kind: 'train_anyway', ...base }
  }

  /*
   * Querer parar sin decirlo con todas las letras: un «no» junto a «entrenar»,
   * sin zona de por medio. Con zona («no quiero hacer piernas») no es parar, es
   * evitar, y eso ya se ha resuelto arriba.
   */
  if (focus === null && /\bno\b/.test(text) && text.includes('entren')) {
    return { kind: 'rest', ...base }
  }

  /*
   * Contar un esfuerzo grande sin pedir nada concreto es pedir que la sesión se
   * adapte. «He corrido muchísimo y hoy me toca entrenar» no es una pregunta:
   * es información para que hoy sea más llevadero.
   */
  if (reportedLoad?.demanding) return { kind: 'easier', ...base }

  return { kind: 'unclear', ...base }
}

// ---------------------------------------------------------------------------
// Lo que AXIS responde
// ---------------------------------------------------------------------------

/** El veredicto de una petición. Es el mismo tipo que viaja en la respuesta. */
export type ChangeOutcome = AxisVerdict

export type ChangeVerdict = {
  outcome: ChangeOutcome
  text: string
  /**
   * La opción que AXIS propone, si la hay.
   *
   * No es un id: los ids se regeneran en cada decisión. Es la elección en
   * términos estables, y solo se convierte en un cambio real cuando el usuario
   * pulsa el botón de confirmar.
   */
  proposedTarget: AxisActionTarget | null
  /** Una reorganización del día (D-022). Tampoco se aplica sola. */
  proposedEffect?: AxisActionEffect | null
}

/** La carga contada más reciente del día. */
function latestReportedLoad(loads: readonly (ReportedLoad & { reportedAt: string })[]): ReportedLoad {
  const latest = loads.reduce((best, item) => (item.reportedAt > best.reportedAt ? item : best))
  return { quote: latest.quote, muscleGroups: [...latest.muscleGroups], demanding: latest.demanding }
}

/** Alternativa que entrena algo distinto del foco que se quiere evitar. */
function alternativeAvoiding(
  alternatives: readonly BriefingAlternative[],
  focus: SessionFocus,
): BriefingAlternative | null {
  return (
    alternatives.find((a) => a.focus !== null && a.focus !== focus && a.focus !== 'cuerpo_completo') ??
    null
  )
}

function alternativeWithFocus(
  alternatives: readonly BriefingAlternative[],
  focus: SessionFocus,
): BriefingAlternative | null {
  return alternatives.find((a) => a.focus === focus) ?? null
}

function shortestAlternative(
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): BriefingAlternative | null {
  const timed = alternatives.filter(
    (a) => a.estimatedMinutes !== null && (currentMinutes === null || a.estimatedMinutes < currentMinutes),
  )
  if (timed.length === 0) return null
  return timed.reduce((best, a) => (a.estimatedMinutes! < best.estimatedMinutes! ? a : best))
}

/**
 * La alternativa de entrenamiento más larga que la sesión actual, si el motor
 * preparó alguna. Sin sesión actual no hay con qué comparar: no se alarga nada.
 */
function longestAlternative(
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): BriefingAlternative | null {
  if (currentMinutes === null) return null
  const longer = alternatives.filter(
    (a) =>
      isTrainingRecommendation(a.type) && a.estimatedMinutes !== null && a.estimatedMinutes > currentMinutes,
  )
  if (longer.length === 0) return null
  return longer.reduce((best, a) => (a.estimatedMinutes! > best.estimatedMinutes! ? a : best))
}

/**
 * Una sesión más suave, sin tocar lo que el usuario acaba de castigar.
 *
 * `avoidGroups` importa más de lo que parece: tras contar 20 km corriendo, la
 * alternativa «más suave» que el motor tenía preparada podía ser justamente de
 * piernas. Ofrecerla contradice el motivo por el que se está bajando el listón,
 * así que antes que eso se prefiere no cambiar la sesión y decirle cómo rebajarla.
 */
function lighterAlternative(
  alternatives: readonly BriefingAlternative[],
  avoidGroups: readonly string[] = [],
): BriefingAlternative | null {
  const isLighter = (a: BriefingAlternative) =>
    a.type === 'LIGHT_TRAINING' || a.type === 'MODIFIED_TRAINING'

  const clashes = (a: BriefingAlternative) =>
    a.focus !== null && FOCUS_MUSCLE_GROUPS[a.focus].some((group) => avoidGroups.includes(group))

  return alternatives.find((a) => isLighter(a) && !clashes(a)) ?? null
}

/**
 * La elección, en términos que sobreviven a un recálculo.
 *
 * El id de una alternativa solo vale dentro de la decisión que la generó. Lo que
 * se propone es el tipo y el foco, que se pueden volver a buscar en la decisión
 * vigente en el momento de confirmar.
 */
function asTarget(alternative: BriefingAlternative | null | undefined): AxisActionTarget | null {
  if (!alternative) return null
  return { type: alternative.type, focus: alternative.focus }
}

/**
 * Cómo se nombra una alternativa dentro de una frase.
 *
 * La principal se llama «Recomendada», que leído en «cambio a "Recomendada"»
 * suena a nombre de archivo. En una frase se dice de otra manera.
 */
function nameOf(alternative: BriefingAlternative): string {
  if (alternative.label.toLowerCase() === 'recomendada') return 'la sesión que te recomendaba'
  return `«${alternative.label}»`
}

function restAlternative(alternatives: readonly BriefingAlternative[]): BriefingAlternative | null {
  return alternatives.find((a) => a.type === 'RECOVERY' || a.type === 'REST') ?? null
}

/**
 * Cómo se nombra lo que el usuario acaba de contar.
 *
 * Cuenta para decidir, pero se dice que no está registrado: AXIS no puede
 * presentar como comprobado algo que solo tiene de oídas.
 */
const REPORTED_CLAUSE = 'Me fío de lo que me cuentas, aunque no me conste registrado'

// ---------------------------------------------------------------------------
// El veredicto
// ---------------------------------------------------------------------------

/**
 * Evalúa la petición de cambio contra los datos.
 *
 * No recalcula nada: la decisión del día sigue siendo la del motor. Aquí solo se
 * juzga si hay motivo para escoger otra de las alternativas que ese motor ya
 * había preparado.
 */
export function evaluateChange(
  incoming: ChangeRequest,
  briefing: AxisBriefing,
): ChangeVerdict {
  const proposal = briefing.proposal
  if (!proposal) {
    return {
      outcome: 'need_info',
      text: 'Todavía no tengo una sesión propuesta para hoy, así que no hay nada que cambiar.',
      proposedTarget: null,
    }
  }

  /*
   * Lo que el usuario contó antes en el día sigue siendo cierto. Si este mensaje
   * no trae una carga nueva, cuenta la última que contó: «ayer hice 20 km» y, un
   * mensaje después, «hoy piernas no» es una sola conversación, no dos. Sigue
   * sin estar registrada, y se dice igual.
   */
  const request: ChangeRequest =
    incoming.reportedLoad === null && briefing.reportedLoads.length > 0
      ? { ...incoming, reportedLoad: latestReportedLoad(briefing.reportedLoads) }
      : incoming

  const alternatives = proposal.alternatives
  const currentFocus = proposal.session?.focus ?? null
  const currentMinutes = proposal.session?.estimatedMinutes ?? null

  switch (request.kind) {
    case 'avoid_focus':
      return evaluateAvoid(request, briefing, currentFocus, alternatives)
    case 'want_focus':
      return evaluateWant(request, briefing, currentFocus, alternatives)
    case 'shorter':
      return request.minutes !== null
        ? evaluateMinutes(request.minutes, briefing, alternatives, currentMinutes)
        : evaluateShorter(alternatives, currentMinutes)
    case 'longer':
      return evaluateLonger(briefing, alternatives, currentMinutes)
    case 'easier':
      return evaluateEasier(request, briefing, alternatives)
    case 'harder':
      return evaluateHarder(briefing, alternatives)
    case 'rest':
      return evaluateRest(briefing, alternatives)
    case 'train_anyway':
      return evaluateTrainAnyway(request, briefing, alternatives)
    case 'cannot_today':
      return evaluateCannotToday(briefing, alternatives)
    case 'move_tomorrow':
      return evaluateMoveTomorrow(briefing, alternatives)
    case 'cannot_planned':
      return askBlockReason(briefing)
    case 'tired':
      return evaluateTired(request, briefing, alternatives)
    default:
      return {
        outcome: 'need_info',
        text: 'Dime qué quieres cambiar y por qué: menos tiempo, otra zona, algo más suave o más exigente. Con el motivo puedo decidir mejor.',
        proposedTarget: null,
      }
  }
}

/**
 * Evitar una zona.
 *
 * Es la petición donde más fácil sería ceder y donde menos conviene hacerlo sin
 * más: saltarse una zona porque no apetece, repetido, es exactamente lo que frena
 * el progreso hacia el objetivo.
 */
function evaluateAvoid(
  request: ChangeRequest,
  briefing: AxisBriefing,
  currentFocus: SessionFocus | null,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const focus = request.focus!
  const label = describeFocus(focus)

  // Puede que ni siquiera sea lo que hay previsto.
  if (currentFocus !== focus && currentFocus !== 'cuerpo_completo') {
    return {
      outcome: 'accept',
      text: `Hoy no tocaba ${label}: la sesión es de ${describeFocus(currentFocus ?? 'cuerpo_completo')}. No hay nada que quitar.`,
      proposedTarget: null,
    }
  }

  const groups: readonly string[] = FOCUS_MUSCLE_GROUPS[focus]
  const evidence: string[] = []

  // 1. Lo que el usuario acaba de contar.
  const reported = request.reportedLoad
  const reportedHitsFocus =
    reported !== null && reported.muscleGroups.some((group) => groups.includes(group))
  if (reportedHitsFocus && reported!.demanding) {
    evidence.push('lo que me cuentas que hiciste')
  }

  // 2. Lo que ya está trabajado estos días.
  const recent = briefing.recentMuscleGroups.filter((group) => groups.includes(group))
  if (recent.length > 0) {
    evidence.push(`ya llevas ${listNames(recent.map(muscleGroupLabel))} trabajado estos días`)
  }

  // 3. Deporte de hoy o de mañana que carga esa zona. El que el usuario acaba de
  //    decir que se ha cancelado ya no cuenta: el calendario no manda sobre él.
  const cancelled = request.cancelledActivities.map((name) => name.toLowerCase())
  const sportToday = briefing.activitiesToday.some(
    (activity) => !cancelled.includes(activity.name.toLowerCase()),
  )
  const sportTomorrow = briefing.activitiesTomorrow.length > 0
  if (focus === 'tren_inferior' && (sportToday || sportTomorrow)) {
    evidence.push(sportToday ? 'tienes deporte hoy' : 'mañana tienes deporte')
  }

  // 4. Recuperación baja.
  if (briefing.recovery.known && briefing.recovery.band === 'low') {
    evidence.push(`tu recuperación está en ${briefing.recovery.value}`)
  }

  const swap = alternativeAvoiding(alternatives, focus)

  if (evidence.length > 0) {
    const head = reportedHitsFocus && reported!.demanding
      ? `${REPORTED_CLAUSE}: con eso encima, cargar ${label} hoy no suma, resta.`
      : `De acuerdo, y no por gusto: ${listNames(evidence)}.`

    if (swap) {
      return {
        outcome: 'accept',
        text: `${head} Cambio a ${nameOf(swap)}, que deja esa zona tranquila.`,
        proposedTarget: asTarget(swap),
      }
    }
    return {
      outcome: 'accept',
      text: `${head} No tengo preparada otra sesión que evite esa zona, así que hoy lo razonable es recuperar en lugar de forzar.`,
      proposedTarget: asTarget(restAlternative(alternatives)),
    }
  }

  // Sin evidencia: se dice que no, con el motivo y una salida razonable.
  const recoveryClause = briefing.recovery.known
    ? `tu recuperación está en ${briefing.recovery.value}`
    : 'no tengo tu recuperación de hoy registrada, pero tampoco nada que desaconseje entrenar'

  const goalClause =
    briefing.profile && briefing.profile.goals.length > 0
      ? ' y es la zona que más pesa en lo que quieres conseguir'
      : ''

  const lighter = lighterAlternative(alternatives)
  const offer = lighter
    ? ` Si lo que te frena son las ganas y no el cuerpo, cambio a ${nameOf(lighter)}: hacemos algo, más suave, y no perdemos el día.`
    : ' Si me cuentas algo que no tenga registrado —una carga de ayer, una molestia— lo reviso.'

  // Dos puntos y no un punto: lo que sigue empieza en minúscula a propósito,
  // porque es la explicación de la negativa, no una frase nueva.
  return {
    outcome: 'decline',
    text: `Hoy no lo quitaría: ${recoveryClause}${goalClause}, y no encuentro en tus datos nada que justifique saltar ${label}.${offer}`,
    proposedTarget: null,
  }
}

/** Querer una zona concreta. Se acepta salvo que esa zona esté cargada. */
function evaluateWant(
  request: ChangeRequest,
  briefing: AxisBriefing,
  currentFocus: SessionFocus | null,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const focus = request.focus!
  const label = describeFocus(focus)

  if (currentFocus === focus) {
    return {
      outcome: 'accept',
      text: `Es justo lo que hay previsto: la sesión de hoy ya es de ${label}.`,
      proposedTarget: null,
    }
  }

  const groups: readonly string[] = FOCUS_MUSCLE_GROUPS[focus]
  const recent = briefing.recentMuscleGroups.filter((group) => groups.includes(group))

  if (recent.length > 0) {
    return {
      outcome: 'decline',
      text: `No hoy. Ya llevas ${listNames(recent.map(muscleGroupLabel))} trabajado estos días, y repetir esa zona sin recuperarla no la hace crecer, la desgasta. Lo dejamos para dentro de un día o dos.`,
      proposedTarget: null,
    }
  }

  /*
   * Que no haya sesiones de esa zona registradas no significa que no se haya
   * trabajado: puede no haber historial, o el usuario puede haber contado algo
   * que no está registrado. El texto dice lo que registran los datos, nunca
   * convierte su ausencia en un hecho (D-016).
   */
  const reported = request.reportedLoad
  const reportedHitsFocus =
    reported !== null && reported.muscleGroups.some((group) => groups.includes(group))
  const basis = `${recordedAbsenceOfFocus(briefing)}${reportedHitsFocus ? UNRECORDED_REPORT_CLAUSE : ''}`

  const match = alternativeWithFocus(alternatives, focus)
  if (match) {
    return {
      outcome: 'accept',
      text: `${basis}. Cambio a ${nameOf(match)}.`,
      proposedTarget: asTarget(match),
    }
  }

  return {
    outcome: 'compromise',
    text: `${basis}, pero hoy no tengo preparada una sesión de ${label} entre las alternativas. La de hoy sigue teniendo sentido; mañana entra sola si la dejas descansada.`,
    proposedTarget: null,
  }
}

/**
 * Lo que los datos dicen de una zona que no aparece en las sesiones recientes.
 *
 * Con sesiones registradas en la ventana, se puede afirmar que ninguna la tocó.
 * Sin ellas, solo que no hay nada registrado: no que la zona esté libre.
 */
function recordedAbsenceOfFocus(briefing: AxisBriefing): string {
  const hasRecentSessions =
    briefing.daysSinceLastWorkout !== null && briefing.daysSinceLastWorkout <= RECENT_HISTORY_DAYS
  return hasRecentSessions
    ? `En tus sesiones registradas de los últimos ${RECENT_HISTORY_DAYS} días no aparece esa zona`
    : 'No tengo registrada ninguna sesión estos días que haya cargado esa zona'
}

/** Lo que el usuario contó y afecta a esa zona: se reconoce, pero no se da por comprobado. */
const UNRECORDED_REPORT_CLAUSE =
  '; lo que me cuentas que hiciste no está registrado, así que decido solo con lo que tengo'

/** Menos tiempo. Es una restricción real, no una preferencia: se acomoda. */
function evaluateShorter(
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): ChangeVerdict {
  const shorter = shortestAlternative(alternatives, currentMinutes)
  if (shorter) {
    return {
      outcome: 'accept',
      text: `El tiempo es un límite real, no una excusa. Cambio a ${nameOf(shorter)}${shorter.estimatedMinutes !== null ? `, unos ${shorter.estimatedMinutes} min` : ''}. Prefiero una sesión corta hecha que una larga a medias.`,
      proposedTarget: asTarget(shorter),
    }
  }
  return {
    outcome: 'compromise',
    text: `No tengo una versión más corta preparada, pero haz los primeros ejercicios y deja el resto: el orden ya está puesto de más a menos importante. Media sesión cuenta; saltarla entera, no.`,
    proposedTarget: null,
  }
}

/**
 * Que la carga acumulada permite subir, solo si se conoce. Quien llega aquí ya
 * pasó el freno de carga alta; sin sesiones en la ventana no hay carga que
 * citar, y su ausencia no se convierte en un permiso (D-016).
 */
function loadAllowsClause(briefing: AxisBriefing): string {
  return briefing.load.known ? ' y la carga acumulada lo permite' : ''
}

/**
 * Más tiempo. No es un límite como el de acortar: es más volumen, y se juzga
 * con los mismos frenos que subir la carga. Si pasa, solo se elige entre lo
 * que el motor ya preparó; si no hay nada más largo, se dice. Nunca se rellena
 * con ejercicios o series que nadie ha planificado.
 */
function evaluateLonger(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): ChangeVerdict {
  if (briefing.recovery.known && briefing.recovery.band === 'low') {
    return {
      outcome: 'decline',
      text: `No. Tu recuperación está en ${briefing.recovery.value}${briefing.recovery.weakest.length > 0 ? ` y lo que peor está es ${listNames(briefing.recovery.weakest)}` : ''}. Más tiempo hoy no es más entrenamiento, es más fatiga que pagarás en las próximas sesiones. No alargo el entrenamiento: hoy toca priorizar la recuperación.`,
      proposedTarget: null,
    }
  }

  if (briefing.load.known && briefing.load.band === 'alta') {
    return {
      outcome: 'decline',
      text: `Hoy no. Llevas ${briefing.load.sessionCount} sesiones en ${briefing.load.windowDays} días y tu carga acumulada ya está alta. Alargar la sesión ahora suma volumen justo cuando toca asimilar el que ya llevas.`,
      proposedTarget: null,
    }
  }

  if (!briefing.recovery.known) {
    return {
      outcome: 'need_info',
      text: 'Antes de alargar la sesión necesito saber cómo estás: registra tu recuperación de hoy y lo decido con datos. A ciegas no te voy a mandar más volumen.',
      proposedTarget: null,
    }
  }

  const longer = longestAlternative(alternatives, currentMinutes)
  if (longer) {
    return {
      outcome: 'accept',
      text: `Hoy sí: tu recuperación está en ${briefing.recovery.value}${loadAllowsClause(briefing)}. Cambio a ${nameOf(longer)}, unos ${longer.estimatedMinutes} min.`,
      proposedTarget: asTarget(longer),
    }
  }

  return {
    outcome: 'compromise',
    text: 'No tengo una versión más larga preparada para hoy. La sesión se queda como está: no voy a inventarte ejercicios ni volumen que no he planificado.',
    proposedTarget: null,
  }
}

/** Algo más suave. Se concede si hay con qué, sin fingir que da igual. */
function evaluateEasier(
  request: ChangeRequest,
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const lighter = lighterAlternative(alternatives, request.reportedLoad?.muscleGroups ?? [])
  const recoveryGood = briefing.recovery.known && briefing.recovery.band === 'good'

  // Si viene de contar un esfuerzo, la razón se nombra: no es que se le conceda
  // un capricho, es que hay un motivo y AXIS lo reconoce.
  const head = request.reportedLoad?.demanding
    ? `${REPORTED_CLAUSE}. Con eso detrás, hoy toca bajar el listón. `
    : ''

  if (lighter) {
    const caveat = recoveryGood && !request.reportedLoad
      ? ' Aunque hoy tu recuperación da para más, así que si a mitad te encuentras bien, sube el ritmo.'
      : ''
    return {
      outcome: 'accept',
      text: `${head}Cambio a ${nameOf(lighter)}.${caveat}`,
      proposedTarget: asTarget(lighter),
    }
  }

  return {
    outcome: 'compromise',
    text: `${head}No tengo una versión más suave preparada. Baja el peso y quédate a dos repeticiones del fallo: misma sesión, bastante menos desgaste.`,
    proposedTarget: null,
  }
}

/** Más caña. Aquí es donde AXIS tiene que saber decir que no. */
function evaluateHarder(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  if (briefing.recovery.known && briefing.recovery.band === 'low') {
    return {
      outcome: 'decline',
      text: `No. Tu recuperación está en ${briefing.recovery.value}${briefing.recovery.weakest.length > 0 ? ` y lo que peor está es ${listNames(briefing.recovery.weakest)}` : ''}. Subir la carga ahí no entrena más, solo acumula fatiga que pagarás en las próximas sesiones. Hoy la sesión se queda como está.`,
      proposedTarget: null,
    }
  }

  if (briefing.load.known && briefing.load.band === 'alta') {
    return {
      outcome: 'decline',
      text: `Hoy no. Llevas ${briefing.load.sessionCount} sesiones en ${briefing.load.windowDays} días y tu carga acumulada ya está alta. Meter más ahora es como pisar el acelerador cuesta abajo: la mejora se construye entre sesión y sesión, no dentro de una.`,
      proposedTarget: null,
    }
  }

  if (!briefing.recovery.known) {
    return {
      outcome: 'need_info',
      text: 'Antes de subir la carga necesito saber cómo estás: registra tu recuperación de hoy y lo decido con datos. A ciegas no te voy a mandar una sesión más dura.',
      proposedTarget: null,
    }
  }

  const harder = alternatives.find((a) => a.type === 'TRAINING')
  return {
    outcome: 'accept',
    text: `Hoy sí: tu recuperación está en ${briefing.recovery.value}${loadAllowsClause(briefing)}.${harder ? ` Cambio a ${nameOf(harder)}.` : ' Sube el peso hasta quedarte a una o dos repeticiones del fallo en las últimas series.'}`,
    proposedTarget: asTarget(harder),
  }
}

/** No entrenar. Se concede con motivo y se discute sin él. */
function evaluateRest(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const rest = restAlternative(alternatives)

  if (briefing.recovery.known && briefing.recovery.band === 'low') {
    return {
      outcome: 'accept',
      text: `Sí, y hoy es lo correcto: tu recuperación está en ${briefing.recovery.value}. Descansar hoy es parte del entrenamiento, no una interrupción.`,
      proposedTarget: asTarget(rest),
    }
  }

  if (briefing.trainedToday) {
    return {
      outcome: 'accept',
      text: 'Hoy ya has entrenado. No hay nada que negociar: toca recuperar.',
      proposedTarget: asTarget(rest),
    }
  }

  const days = briefing.daysSinceLastWorkout
  if (days !== null && days >= 3) {
    return {
      outcome: 'decline',
      text: `Llevas ${days} días sin entrenar y tus datos no dan ningún motivo para parar hoy. Lo que se pierde ahí no es una sesión, es la continuidad, que es lo que de verdad mueve tus objetivos. Si el problema es el tiempo o las ganas, dímelo y recorto la sesión.`,
      proposedTarget: null,
    }
  }

  const lighter = lighterAlternative(alternatives)
  if (lighter) {
    return {
      outcome: 'compromise',
      text: `Antes de dar el día por perdido: cambio a ${nameOf(lighter)}. Si a los diez minutos sigues sin poder, lo dejas y no ha pasado nada. Pero tus datos de hoy no piden descanso.`,
      proposedTarget: asTarget(lighter),
    }
  }

  return {
    outcome: 'decline',
    text: 'Tus datos de hoy no piden descanso. Si hay algo que no tengo registrado —dormiste mal, estás con molestias, vienes de un esfuerzo largo— cuéntamelo y lo reviso.',
    proposedTarget: null,
  }
}

/**
 * Lo que AXIS dice cuando algo del calendario se cae.
 *
 * No promete una sesión concreta, y no es por prudencia: es que todavía no la
 * sabe. La aplicación descarta la actividad y el motor replantea el día entero,
 * y eso ocurre después de componer esta frase. Prometer aquí «la sesión
 * completa» sería arriesgarse a que la tarjeta diga otra cosa.
 */
function cancelledText(names: readonly string[]): string {
  const listed = listNames(names.map((name) => name.toLowerCase()))
  return `Bien saberlo: había contado con ${listed} para decidir el día, y eso cambia las cuentas. Replanteo la sesión sin ese compromiso.`
}

/**
 * El usuario quiere entrenar cuando AXIS había frenado.
 *
 * Aquí es donde la firmeza se puede confundir con rigidez, y no es lo mismo.
 * AXIS frena por un motivo concreto, y cada motivo se sostiene solo mientras sea
 * cierto:
 *
 * - Si frenaba por un partido y el partido se ha cancelado, el motivo ya no
 *   existe. Seguir frenando no es criterio, es no escuchar.
 * - Si frenaba porque hoy no era un día marcado como disponible, eso es una
 *   preferencia del propio usuario, no un límite del cuerpo. Manda él.
 * - Si frenaba por recuperación baja o porque ya ha entrenado hoy, el motivo
 *   sigue en pie y AXIS mantiene el no.
 *
 * Y si viene de un esfuerzo grande pero quiere moverse, la respuesta no es «no»:
 * es una sesión más suave.
 */
function evaluateTrainAnyway(
  request: ChangeRequest,
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const proposal = briefing.proposal!
  const alreadyTraining = proposal.session !== null

  // Motivos que no desaparecen porque el usuario tenga ganas.
  if (briefing.trainedToday) {
    return {
      outcome: 'decline',
      text: 'Hoy ya has entrenado. Las ganas están bien, pero el músculo crece entre sesiones, no dentro de ellas. Mañana lo aprovecharás más.',
      proposedTarget: null,
    }
  }

  if (briefing.recovery.known && briefing.recovery.band === 'low') {
    const weakest =
      briefing.recovery.weakest.length > 0 ? ` Lo que peor está es ${listNames(briefing.recovery.weakest)}.` : ''
    const lighter = lighterAlternative(alternatives)
    return {
      outcome: lighter ? 'compromise' : 'decline',
      text: lighter
        ? `Tu recuperación está en ${briefing.recovery.value}.${weakest} Entrenar fuerte hoy te costaría los próximos días, así que no lo haría. Si necesitas moverte, cambio a ${nameOf(lighter)} y lo dejamos ahí.`
        : `Tu recuperación está en ${briefing.recovery.value}.${weakest} Hoy no. No es falta de ganas, es que el cuerpo no está en condiciones de aprovecharlo.`,
      proposedTarget: asTarget(lighter),
    }
  }

  // Venía de un esfuerzo grande: se entrena, pero más suave.
  if (request.reportedLoad?.demanding) {
    const lighter = lighterAlternative(alternatives, request.reportedLoad?.muscleGroups ?? [])
    if (lighter) {
      return {
        outcome: 'accept',
        text: `${REPORTED_CLAUSE}. Con ese esfuerzo encima entrenar tiene sentido, pero no al mismo nivel: cambio a ${nameOf(lighter)}. Mueves el cuerpo sin cavar más hondo.`,
        proposedTarget: asTarget(lighter),
      }
    }
    return {
      outcome: 'accept',
      text: `${REPORTED_CLAUSE}. Entrena, pero bájale un punto: menos peso y para dos repeticiones antes del fallo. Hoy la sesión es para mantener, no para exprimir.`,
      proposedTarget: null,
    }
  }

  // El motivo por el que AXIS frenaba ya no se sostiene.
  if (!alreadyTraining) {
    const training = alternatives.find((a) => a.type === 'TRAINING' || a.type === 'LIGHT_TRAINING')

    if (request.cancelledActivities.length > 0) {
      return {
        outcome: 'accept',
        text: cancelledText(request.cancelledActivities),
        // Nada que aplicar: la aplicación descarta la actividad y el motor vuelve
        // a decidir el día entero. Fijar aquí una alternativa de la decisión vieja
        // sería aplicar algo calculado con el partido todavía dentro.
        proposedTarget: null,
      }
    }

    if (briefing.profile && !briefing.profile.availableToday) {
      return {
        outcome: 'accept',
        text: training
          ? `Hoy no lo tenías marcado como día de entrenar, pero eso lo decides tú, no tu cuerpo: nada en tus datos lo desaconseja. Cambio a ${nameOf(training)}.`
          : 'Hoy no lo tenías marcado como día de entrenar, pero eso lo decides tú, no tu cuerpo. Nada en tus datos lo desaconseja.',
        proposedTarget: asTarget(training),
      }
    }

    return {
      outcome: 'accept',
      text: training
        ? `Adelante. Nada en tus datos de hoy lo desaconseja. Cambio a ${nameOf(training)}.`
        : 'Adelante: nada en tus datos de hoy lo desaconseja.',
      proposedTarget: asTarget(training),
    }
  }

  // Ya estaba propuesto entrenar, pero contando con el deporte que ahora se cae.
  if (request.cancelledActivities.length > 0) {
    return { outcome: 'accept', text: cancelledText(request.cancelledActivities), proposedTarget: null }
  }

  return {
    outcome: 'accept',
    text: `Es lo que te propongo: ${proposal.headline.toLowerCase()} Adelante.`,
    proposedTarget: null,
  }
}

/** Mensaje con el que AXIS abre la negociación al pulsar «Cambiar entrenamiento». */
export function changeOpeningMessage(briefing: AxisBriefing): string {
  const proposal = briefing.proposal
  if (!proposal) {
    return 'Todavía no tengo una sesión propuesta para hoy.'
  }

  const session = proposal.session
  const what = session
    ? `Hoy te he propuesto ${session.title.toLowerCase()}, unos ${session.estimatedMinutes} min.`
    : `Hoy te he propuesto ${proposal.headline.toLowerCase()}.`

  return `${what} ${proposal.reason} ¿Qué quieres cambiar, y por qué? Cuéntame lo que no tenga registrado y lo tendré en cuenta.`
}


// ---------------------------------------------------------------------------
// Reorganizaciones (D-022)
//
// Un límite real se acomoda; no se juzga como una preferencia. Pero nunca se
// acumula una sesión, nunca se copia de un día a otro y nunca se reorganiza un
// día ya entrenado.
// ---------------------------------------------------------------------------

const ALREADY_TRAINED: ChangeVerdict = {
  outcome: 'accept',
  text: 'Hoy ya has entrenado, así que no hay nada que reorganizar.',
  proposedTarget: null,
}

function isTrainingDay(briefing: AxisBriefing): boolean {
  return briefing.proposal !== null && isTrainingRecommendation(briefing.proposal.type)
}

const NOT_A_TRAINING_DAY: ChangeVerdict = {
  outcome: 'accept',
  text: 'Hoy ya no tocaba entrenar, así que no cambia nada.',
  proposedTarget: null,
}

/** «Hoy no puedo entrenar». No poder es un límite: se acepta y hoy se recupera. */
function evaluateCannotToday(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  if (briefing.trainedToday) return ALREADY_TRAINED
  if (!isTrainingDay(briefing)) return NOT_A_TRAINING_DAY

  const rest = restAlternative(alternatives)
  if (!rest) {
    return {
      outcome: 'compromise',
      text: 'Si hoy no puedes, no entrenes. No acumulo la sesión: mañana vuelvo a decidir con tus datos.',
      proposedTarget: null,
    }
  }
  return {
    outcome: 'accept',
    text: 'Si no puedes, no puedes: hoy no entrenamos. No voy a acumular la sesión en otro día; mañana vuelvo a decidir con tus datos. Si prefieres, puedo moverla a mañana.',
    proposedTarget: asTarget(rest),
  }
}

/**
 * «Muévelo a mañana». Hoy recuperación y mañana disponible, sin copiar la
 * sesión: mañana decide el motor con lo que haya mañana. Un solo aplazamiento.
 */
function evaluateMoveTomorrow(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  if (briefing.trainedToday) {
    return { outcome: 'decline', text: 'Hoy ya has entrenado: no hay nada que mover a mañana.', proposedTarget: null }
  }
  if (!isTrainingDay(briefing)) {
    return { outcome: 'decline', text: 'Hoy no toca entrenar, así que no hay nada que mover a mañana.', proposedTarget: null }
  }
  if (briefing.reorganization.movedFromYesterday) {
    return {
      outcome: 'decline',
      text: 'Este entrenamiento ya viene movido de ayer y no lo aplazo otra vez: de aplazamiento en aplazamiento se pierde la semana. Si hoy no puedes, dímelo y lo dejamos; mañana decido de nuevo.',
      proposedTarget: null,
    }
  }
  const demanding = briefing.activitiesTomorrow.find((activity) => activity.intensity === 'alta')
  if (demanding) {
    return {
      outcome: 'decline',
      text: `Mañana tienes ${demanding.name.toLowerCase()}, y llegar con un entrenamiento encima no compensa. Si hoy vas justo, dime cuántos minutos tienes y la ajusto.`,
      proposedTarget: null,
    }
  }
  if (briefing.reorganization.movedTo !== null) {
    return { outcome: 'accept', text: 'Ya está movido a mañana.', proposedTarget: null }
  }

  const rest = restAlternative(alternatives)
  if (!rest) {
    return {
      outcome: 'compromise',
      text: 'No puedo dejar hoy como descanso con lo que tengo preparado. Si hoy no puedes, dímelo y lo replanteo.',
      proposedTarget: null,
    }
  }
  return {
    outcome: 'accept',
    text: 'Lo muevo a mañana: hoy descansas y mañana queda como día de entrenamiento. No copio la sesión de hoy; mañana decido con tus datos de mañana.',
    proposedTarget: asTarget(rest),
    proposedEffect: { kind: 'move_to_tomorrow' },
  }
}

/**
 * Minutos concretos. El número se usa de verdad: el motor vuelve a decidir con
 * ese tiempo. Por debajo del mínimo no hay sesión estructurada.
 */
function evaluateMinutes(
  minutes: number,
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): ChangeVerdict {
  if (briefing.trainedToday) return ALREADY_TRAINED
  if (!isTrainingDay(briefing)) return NOT_A_TRAINING_DAY

  if (minutes < MIN_SESSION_MINUTES) {
    const rest = restAlternative(alternatives)
    return {
      outcome: 'compromise',
      text: `Con ${minutes} minutos no preparo una sesión estructurada: no da para hacerla bien. O descansas hoy, o haces movilidad libre a tu aire, que no cuenta como entrenamiento.`,
      proposedTarget: asTarget(rest),
    }
  }
  if (briefing.reorganization.statedMinutes === minutes) {
    return { outcome: 'accept', text: `Ya tengo en cuenta que hoy tienes ${minutes} minutos.`, proposedTarget: null }
  }
  if (currentMinutes !== null && minutes >= currentMinutes) {
    return {
      outcome: 'accept',
      text: `Tu sesión de hoy ya cabe en ${minutes} minutos: dura unos ${currentMinutes}.`,
      proposedTarget: null,
    }
  }
  return {
    outcome: 'accept',
    text: `Ajusto la sesión de hoy a tus ${minutes} minutos. El tiempo es un límite real: prefiero una sesión corta hecha que una larga a medias.`,
    proposedTarget: null,
    proposedEffect: { kind: 'set_available_minutes', minutes },
  }
}

/** «No puedo hacer el entrenamiento previsto»: antes de decidir, el motivo. */
function askBlockReason(briefing: AxisBriefing): ChangeVerdict {
  if (briefing.trainedToday) return ALREADY_TRAINED
  return {
    outcome: 'need_info',
    text: '¿Qué te lo impide: el tiempo, la zona que toca, el material o el sitio, u otro motivo? Con eso decido.',
    proposedTarget: null,
  }
}

/**
 * La respuesta al motivo (D-022). El tiempo se trata como minutos; la zona,
 * como evitar una zona; el material o el sitio no tienen filtro en v1 y se dice.
 */
export function evaluateBlockReason(
  reason: BlockReason,
  request: ChangeRequest,
  briefing: AxisBriefing,
): ChangeVerdict {
  const proposal = briefing.proposal
  const alternatives = proposal?.alternatives ?? []
  const currentMinutes = proposal?.session?.estimatedMinutes ?? null

  switch (reason) {
    case 'time':
      return request.minutes !== null
        ? evaluateMinutes(request.minutes, briefing, alternatives, currentMinutes)
        : evaluateShorter(alternatives, currentMinutes)
    case 'zone':
      if (request.focus !== null) return evaluateChange({ ...request, kind: 'avoid_focus' }, briefing)
      return {
        outcome: 'need_info',
        text: '¿Qué zona prefieres no trabajar hoy? Dímelo así: «hoy piernas no».',
        proposedTarget: null,
      }
    case 'material':
      return {
        outcome: 'compromise',
        text: 'No rehago la sesión por el material. Haz los ejercicios que puedas con lo que tengas y salta los demás: lo saltado queda registrado y la próxima propuesta parte de ahí. Si no tienes sitio para entrenar, dime «hoy no puedo» y lo dejamos.',
        proposedTarget: null,
      }
    case 'other':
      return {
        outcome: 'need_info',
        text: 'Cuéntame qué te lo impide y lo miro.',
        proposedTarget: null,
      }
  }
}

/**
 * Cansancio contado. Sin la fatiga registrada AXIS no decide con una frase:
 * pide registrarla y no la anota él. Registrada, ya cuenta en la decisión y se
 * juzga como pedir algo más suave.
 */
function evaluateTired(
  request: ChangeRequest,
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  if (briefing.fatigueLevel === null) {
    return {
      outcome: 'need_info',
      text: FATIGUE_NOT_REGISTERED,
      proposedTarget: null,
    }
  }
  return evaluateEasier(request, briefing, alternatives)
}

/** Lo que AXIS dice cuando el cansancio no está registrado. Lo comparten las dos vías. */
export const FATIGUE_NOT_REGISTERED =
  'No tengo tu fatiga registrada hoy. Regístrala en Recuperación y decido con ese dato; desde aquí no la anoto.'
