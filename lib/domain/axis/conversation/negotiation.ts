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

import type { SessionFocus } from '../../workouts/types'
import { MUSCLE_GROUP_LABELS } from '../../workouts/types'
import type { AxisBriefing, BriefingAlternative } from '../briefing'
import { detectFocus, normalizeQuestion } from './intents'

// ---------------------------------------------------------------------------
// Lo que el usuario pide
// ---------------------------------------------------------------------------

export type ChangeRequestKind =
  | 'avoid_focus'
  | 'want_focus'
  | 'shorter'
  | 'easier'
  | 'harder'
  | 'rest'
  | 'unclear'

/**
 * Carga que el usuario dice haber hecho y que no consta en ningún sitio.
 *
 * Cuenta para decidir —ignorarla sería absurdo— pero se marca como no registrada,
 * porque AXIS no puede presentarla como un hecho comprobado.
 */
export type ReportedLoad = {
  /** Lo que el usuario escribió, tal cual, recortado. */
  quote: string
  /** Grupos que esa actividad carga, si se puede deducir. */
  muscleGroups: string[]
  demanding: boolean
}

export type ChangeRequest = {
  kind: ChangeRequestKind
  focus: SessionFocus | null
  reportedLoad: ReportedLoad | null
}

const AVOID_TERMS = [
  'no hacer', 'no quiero', 'sin ', 'evitar', 'evita', 'saltarme', 'saltar', 'nada de',
  'no me apetece', 'dejar', 'no toquemos', 'no cargar', 'podemos no',
]
const WANT_TERMS = ['quiero hacer', 'prefiero', 'me apetece', 'hagamos', 'mejor hacer', 'cambiar a']
const SHORTER_TERMS = [
  'menos tiempo', 'mas corto', 'más corto', 'mas corta', 'más corta', 'poco tiempo',
  'voy justo', 'solo tengo', 'no me da tiempo', '20 minutos', '15 minutos', '30 minutos', 'media hora',
]
const EASIER_TERMS = [
  'mas suave', 'más suave', 'mas ligero', 'más ligero', 'mas ligera', 'más ligera',
  'menos intenso', 'menos intensa', 'mas facil', 'más fácil', 'bajar la intensidad', 'algo tranquilo',
]
const HARDER_TERMS = [
  'mas duro', 'más duro', 'mas dura', 'más dura', 'mas intenso', 'más intenso',
  'mas fuerte', 'más fuerte', 'subir la intensidad', 'exigente', 'mas volumen', 'más volumen',
]
const REST_TERMS = ['descansar', 'no entrenar', 'dia libre', 'día libre', 'parar hoy', 'saltarme el dia', 'saltarme el día']

/** Actividades que el usuario puede contar, y lo que cargan. */
const REPORTED_ACTIVITIES: readonly { terms: readonly string[]; muscleGroups: string[] }[] = [
  { terms: ['bici', 'bicicleta', 'ciclismo', 'spinning'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['corr', 'running', 'trote', 'maraton', 'maratón'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['andar', 'caminar', 'senderismo', 'montaña', 'montana'], muscleGroups: ['piernas'] },
  { terms: ['partido', 'baloncesto', 'futbol', 'fútbol', 'basket', 'tenis', 'padel', 'pádel'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['natacion', 'natación', 'nadar', 'piscina'], muscleGroups: ['espalda', 'hombros'] },
  { terms: ['escalada', 'escalar'], muscleGroups: ['espalda', 'brazos'] },
]

/** Señales de que lo contado fue exigente. */
const DEMANDING_TERMS = ['km', 'kilometro', 'kilómetro', 'montaña', 'montana', 'intenso', 'duro', 'fuerte', 'largo', 'competicion', 'competición', 'partido']

/** Marcas de que el usuario está contando algo que hizo, no preguntando. */
const REPORT_TERMS = ['hice', 'he hecho', 'hicimos', 'estuve', 'me hice', 'ayer', 'esta manana', 'esta mañana', 'antes', 'vengo de', 'acabo de']

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalizeQuestion(term)))
}

/** Lee lo que el usuario cuenta haber hecho y que no está registrado. */
export function detectReportedLoad(message: string): ReportedLoad | null {
  const text = normalizeQuestion(message)
  if (!includesAny(text, REPORT_TERMS)) return null

  const matched = REPORTED_ACTIVITIES.filter((entry) => includesAny(text, entry.terms))
  if (matched.length === 0) return null

  const muscleGroups = [...new Set(matched.flatMap((entry) => entry.muscleGroups))]
  // Un número seguido de «km» o una mención a montaña bastan para tomárselo en serio.
  const demanding = includesAny(text, DEMANDING_TERMS) || /\d+\s*(km|k)\b/.test(text)

  return { quote: message.trim(), muscleGroups, demanding }
}

export function parseChangeRequest(message: string): ChangeRequest {
  const text = normalizeQuestion(message)
  const focus = detectFocus(message)
  const reportedLoad = detectReportedLoad(message)

  /*
   * Querer parar del todo, antes que nada. Sin zona de por medio, cualquier «no»
   * junto a «entrenar» es eso: «no quiero entrenar», «hoy no entreno», «paso de
   * entrenar». Con zona («no quiero hacer piernas») no es parar, es evitar, y por
   * eso se exige que no haya foco.
   */
  const wantsToStop =
    includesAny(text, REST_TERMS) ||
    (focus === null && /\bno\b/.test(text) && text.includes('entren'))
  if (wantsToStop) return { kind: 'rest', focus, reportedLoad }

  /*
   * Evitar una zona se dice de muchas formas, y la mayoría no son una frase
   * hecha: «hoy piernas no» no contiene ninguno de los giros de AVOID_TERMS.
   * Un «no» suelto junto a una zona, sin que se pida esa zona, es una negativa.
   */
  const hasBareNo = /\bno\b/.test(text)
  const wantsIt = includesAny(text, WANT_TERMS)
  if (focus !== null && (includesAny(text, AVOID_TERMS) || (hasBareNo && !wantsIt))) {
    return { kind: 'avoid_focus', focus, reportedLoad }
  }
  if (includesAny(text, SHORTER_TERMS)) return { kind: 'shorter', focus, reportedLoad }
  if (includesAny(text, HARDER_TERMS)) return { kind: 'harder', focus, reportedLoad }
  if (includesAny(text, EASIER_TERMS)) return { kind: 'easier', focus, reportedLoad }
  if (focus !== null && includesAny(text, WANT_TERMS)) {
    return { kind: 'want_focus', focus, reportedLoad }
  }
  if (focus !== null) return { kind: 'want_focus', focus, reportedLoad }

  return { kind: 'unclear', focus, reportedLoad }
}

// ---------------------------------------------------------------------------
// Lo que AXIS responde
// ---------------------------------------------------------------------------

export type ChangeOutcome =
  /** Se cambia: la evidencia lo respalda. */
  | 'accept'
  /** Ni lo uno ni lo otro: se ofrece un punto intermedio. */
  | 'compromise'
  /** No se cambia, y se explica por qué. */
  | 'decline'
  /** Falta saber algo para poder decidir. */
  | 'need_info'

export type ChangeVerdict = {
  outcome: ChangeOutcome
  text: string
  /** Alternativa que la aplicación debe seleccionar, si la hay. */
  applyProposalId: string | null
}

const FOCUS_LABELS: Record<SessionFocus, string> = {
  tren_superior: 'tren superior',
  tren_inferior: 'tren inferior',
  core_movilidad: 'core y movilidad',
  cuerpo_completo: 'cuerpo completo',
}

/** Grupos musculares que carga cada foco, para cruzarlos con lo ya trabajado. */
const FOCUS_MUSCLE_GROUPS: Record<SessionFocus, string[]> = {
  tren_superior: ['pecho', 'espalda', 'hombros', 'brazos'],
  tren_inferior: ['piernas', 'gluteos'],
  core_movilidad: ['core'],
  cuerpo_completo: ['pecho', 'espalda', 'piernas', 'gluteos', 'core'],
}

function groupLabel(group: string): string {
  return MUSCLE_GROUP_LABELS[group as keyof typeof MUSCLE_GROUP_LABELS] ?? group
}

function listNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
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

function lighterAlternative(alternatives: readonly BriefingAlternative[]): BriefingAlternative | null {
  return alternatives.find((a) => a.type === 'LIGHT_TRAINING' || a.type === 'MODIFIED_TRAINING') ?? null
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
export function evaluateChange(request: ChangeRequest, briefing: AxisBriefing): ChangeVerdict {
  const proposal = briefing.proposal
  if (!proposal) {
    return {
      outcome: 'need_info',
      text: 'Todavía no tengo una sesión propuesta para hoy, así que no hay nada que cambiar.',
      applyProposalId: null,
    }
  }

  const alternatives = proposal.alternatives
  const currentFocus = proposal.session?.focus ?? null
  const currentMinutes = proposal.session?.estimatedMinutes ?? null

  switch (request.kind) {
    case 'avoid_focus':
      return evaluateAvoid(request, briefing, currentFocus, alternatives)
    case 'want_focus':
      return evaluateWant(request, briefing, currentFocus, alternatives)
    case 'shorter':
      return evaluateShorter(alternatives, currentMinutes)
    case 'easier':
      return evaluateEasier(briefing, alternatives)
    case 'harder':
      return evaluateHarder(briefing, alternatives)
    case 'rest':
      return evaluateRest(briefing, alternatives)
    default:
      return {
        outcome: 'need_info',
        text: 'Dime qué quieres cambiar y por qué: menos tiempo, otra zona, algo más suave o más exigente. Con el motivo puedo decidir mejor.',
        applyProposalId: null,
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
  const label = FOCUS_LABELS[focus]

  // Puede que ni siquiera sea lo que hay previsto.
  if (currentFocus !== focus && currentFocus !== 'cuerpo_completo') {
    return {
      outcome: 'accept',
      text: `Hoy no tocaba ${label}: la sesión es de ${FOCUS_LABELS[currentFocus ?? 'cuerpo_completo']}. No hay nada que quitar.`,
      applyProposalId: null,
    }
  }

  const groups = FOCUS_MUSCLE_GROUPS[focus]
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
    evidence.push(`ya llevas ${listNames(recent.map(groupLabel).map((g) => g.toLowerCase()))} trabajado estos días`)
  }

  // 3. Deporte de hoy o de mañana que carga esa zona.
  const sportToday = briefing.activitiesToday.length > 0
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
        text: `${head} Cambio a «${swap.label}», que deja esa zona tranquila.`,
        applyProposalId: swap.id,
      }
    }
    return {
      outcome: 'accept',
      text: `${head} No tengo preparada otra sesión que evite esa zona, así que hoy lo razonable es recuperar en lugar de forzar.`,
      applyProposalId: restAlternative(alternatives)?.id ?? null,
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
    ? ` Si lo que te frena son las ganas y no el cuerpo, cambio a «${lighter.label}»: hacemos algo, más suave, y no perdemos el día.`
    : ' Si me cuentas algo que no tenga registrado —una carga de ayer, una molestia— lo reviso.'

  // Dos puntos y no un punto: lo que sigue empieza en minúscula a propósito,
  // porque es la explicación de la negativa, no una frase nueva.
  return {
    outcome: 'decline',
    text: `Hoy no lo quitaría: ${recoveryClause}${goalClause}, y no encuentro en tus datos nada que justifique saltar ${label}.${offer}`,
    applyProposalId: null,
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
  const label = FOCUS_LABELS[focus]

  if (currentFocus === focus) {
    return {
      outcome: 'accept',
      text: `Es justo lo que hay previsto: la sesión de hoy ya es de ${label}.`,
      applyProposalId: null,
    }
  }

  const groups = FOCUS_MUSCLE_GROUPS[focus]
  const recent = briefing.recentMuscleGroups.filter((group) => groups.includes(group))

  if (recent.length > 0) {
    return {
      outcome: 'decline',
      text: `No hoy. Ya llevas ${listNames(recent.map(groupLabel).map((g) => g.toLowerCase()))} trabajado estos días, y repetir esa zona sin recuperarla no la hace crecer, la desgasta. Lo dejamos para dentro de un día o dos.`,
      applyProposalId: null,
    }
  }

  const match = alternativeWithFocus(alternatives, focus)
  if (match) {
    return {
      outcome: 'accept',
      text: `Se puede: esa zona no la has tocado estos días. Cambio a «${match.label}».`,
      applyProposalId: match.id,
    }
  }

  return {
    outcome: 'compromise',
    text: `Esa zona está libre, pero hoy no tengo preparada una sesión de ${label} entre las alternativas. La de hoy sigue teniendo sentido; mañana entra sola si la dejas descansada.`,
    applyProposalId: null,
  }
}

/** Menos tiempo. Es una restricción real, no una preferencia: se acomoda. */
function evaluateShorter(
  alternatives: readonly BriefingAlternative[],
  currentMinutes: number | null,
): ChangeVerdict {
  const shorter = shortestAlternative(alternatives, currentMinutes)
  if (shorter) {
    return {
      outcome: 'accept',
      text: `El tiempo es un límite real, no una excusa. Cambio a «${shorter.label}»${shorter.estimatedMinutes !== null ? `, unos ${shorter.estimatedMinutes} min` : ''}. Prefiero una sesión corta hecha que una larga a medias.`,
      applyProposalId: shorter.id,
    }
  }
  return {
    outcome: 'compromise',
    text: `No tengo una versión más corta preparada, pero haz los primeros ejercicios y deja el resto: el orden ya está puesto de más a menos importante. Media sesión cuenta; saltarla entera, no.`,
    applyProposalId: null,
  }
}

/** Algo más suave. Se concede si hay con qué, sin fingir que da igual. */
function evaluateEasier(
  briefing: AxisBriefing,
  alternatives: readonly BriefingAlternative[],
): ChangeVerdict {
  const lighter = lighterAlternative(alternatives)
  const recoveryGood = briefing.recovery.known && briefing.recovery.band === 'good'

  if (lighter) {
    const caveat = recoveryGood
      ? ' Aunque hoy tu recuperación da para más, así que si a mitad te encuentras bien, sube el ritmo.'
      : ''
    return {
      outcome: 'accept',
      text: `Cambio a «${lighter.label}».${caveat}`,
      applyProposalId: lighter.id,
    }
  }

  return {
    outcome: 'compromise',
    text: 'No tengo una versión más suave preparada. Baja el peso y quédate a dos repeticiones del fallo: misma sesión, bastante menos desgaste.',
    applyProposalId: null,
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
      applyProposalId: null,
    }
  }

  if (briefing.load.known && briefing.load.band === 'alta') {
    return {
      outcome: 'decline',
      text: `Hoy no. Llevas ${briefing.load.sessionCount} sesiones en ${briefing.load.windowDays} días y tu carga acumulada ya está alta. Meter más ahora es como pisar el acelerador cuesta abajo: la mejora se construye entre sesión y sesión, no dentro de una.`,
      applyProposalId: null,
    }
  }

  if (!briefing.recovery.known) {
    return {
      outcome: 'need_info',
      text: 'Antes de subir la carga necesito saber cómo estás: registra tu recuperación de hoy y lo decido con datos. A ciegas no te voy a mandar una sesión más dura.',
      applyProposalId: null,
    }
  }

  const harder = alternatives.find((a) => a.type === 'TRAINING')
  return {
    outcome: 'accept',
    text: `Hoy sí: tu recuperación está en ${briefing.recovery.value} y la carga acumulada lo permite.${harder ? ` Cambio a «${harder.label}».` : ' Sube el peso hasta quedarte a una o dos repeticiones del fallo en las últimas series.'}`,
    applyProposalId: harder?.id ?? null,
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
      applyProposalId: rest?.id ?? null,
    }
  }

  if (briefing.trainedToday) {
    return {
      outcome: 'accept',
      text: 'Hoy ya has entrenado. No hay nada que negociar: toca recuperar.',
      applyProposalId: rest?.id ?? null,
    }
  }

  const days = briefing.daysSinceLastWorkout
  if (days !== null && days >= 3) {
    return {
      outcome: 'decline',
      text: `Llevas ${days} días sin entrenar y tus datos no dan ningún motivo para parar hoy. Lo que se pierde ahí no es una sesión, es la continuidad, que es lo que de verdad mueve tus objetivos. Si el problema es el tiempo o las ganas, dímelo y recorto la sesión.`,
      applyProposalId: null,
    }
  }

  const lighter = lighterAlternative(alternatives)
  if (lighter) {
    return {
      outcome: 'compromise',
      text: `Antes de dar el día por perdido: cambio a «${lighter.label}». Si a los diez minutos sigues sin poder, lo dejas y no ha pasado nada. Pero tus datos de hoy no piden descanso.`,
      applyProposalId: lighter.id,
    }
  }

  return {
    outcome: 'decline',
    text: 'Tus datos de hoy no piden descanso. Si hay algo que no tengo registrado —dormiste mal, estás con molestias, vienes de un esfuerzo largo— cuéntamelo y lo reviso.',
    applyProposalId: null,
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
