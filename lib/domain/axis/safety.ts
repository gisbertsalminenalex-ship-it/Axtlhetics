/**
 * Seguridad de AXIS: la puerta de salida del modelo de lenguaje.
 *
 * El modelo redacta; no decide. Pero un texto puede decir lo contrario de lo que
 * el dominio decidió, y hasta ahora nadie lo comprobaba. Esta puerta lo hace
 * antes de que el texto llegue al usuario. Si no pasa, no se enseña: responde
 * el determinista, que ya tenía la respuesta correcta.
 *
 * Las comprobaciones son deliberadamente **pocas, literales y explicables**.
 * Cada rechazo lleva un motivo que se puede leer y discutir. No hay puntuación,
 * ni umbrales de parecido, ni heurísticas que nadie pueda predecir: o el texto
 * contiene algo de la lista, o no lo contiene.
 *
 * Lo que se comprueba sale de dos sitios: la forma, de `personality.ts` (la
 * misma tabla que genera el prompt), y el fondo, del veredicto y la propuesta
 * que el dominio ya emitió.
 */

import { normalizeQuestion } from './conversation/intents'
import type { AxisAnswer, AxisIntent } from './conversation/types'
import { HYDRATION_GLASS_COUNT } from '../recovery/types'
import { FOCUS_TERMS, type SessionFocus } from './knowledge/focus'
import { AXIS_PERSONALITY, type AxisPersonality } from './personality'

export type ModelTextRejection =
  | 'empty'
  | 'too_long'
  | 'emoji'
  | 'exclamation'
  | 'medical_language'
  | 'forbidden_opener'
  /** El dominio dijo que no y el texto dice que sí. */
  | 'contradicts_verdict'
  /** El dominio aprobó una opción y el texto anuncia otra, o se niega. */
  | 'contradicts_proposal'
  /** El texto da una cifra que no está en el briefing ni en la respuesta del dominio. */
  | 'invented_number'
  /**
   * El texto afirma algo del usuario —historial, recuperación, molestias o
   * preferencias— que no está en la respuesta del dominio ni en el briefing.
   */
  | 'unsupported_claim'
  /** En una respuesta de datos, el texto se deja una cifra que el dominio sí dio (D-027). */
  | 'omitted_number'

export type ModelTextCheck =
  | { ok: true }
  | { ok: false; reason: ModelTextRejection; detail: string }

/** Lo que la puerta necesita saber de la respuesta del dominio. */
export type DomainAnswerForSafety = Pick<AxisAnswer, 'text' | 'intent' | 'verdict' | 'proposedTarget'>

/**
 * Frases con las que un texto concede un cambio.
 *
 * Solo se miran cuando el dominio ha dicho que **no**: en un «sí» son la
 * redacción normal. Están en la forma normalizada (sin acentos).
 */
const ACCEPTANCE_MARKERS: readonly string[] = [
  'de acuerdo',
  'cambio a ',
  'cambiamos a ',
  'pasamos a ',
  'adelante con',
  'hagamos ',
  'vale, ',
  'esta bien, ',
  'te lo cambio',
  'lo cambio',
]

/** Frases con las que un texto se niega. Solo se miran cuando el dominio dijo que sí. */
const REFUSAL_MARKERS: readonly string[] = [
  'no lo cambio',
  'no voy a cambiar',
  'no cambio la sesion',
  'sigo pensando lo mismo',
  'se queda como esta',
  'no lo quitaria',
  'mantengo la recomendacion',
  'mantengo la sesion',
  'hoy no lo cambiaria',
]

/** Con qué se anuncia un cambio de sesión. Sirve para leer a qué foco se cambia. */
const CHANGE_ANNOUNCEMENTS: readonly string[] = ['cambio a', 'cambiamos a', 'pasamos a', 'te propongo']

const EMOJI = /\p{Extended_Pictographic}/u
const EXCLAMATION = /[!¡]/

/** Frases de un texto. Los decimales («2.5 kg») no cuentan como punto final. */
export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length
}

/** Como la normalización de preguntas, pero sin comillas ni signos delante. */
function normalize(text: string): string {
  return normalizeQuestion(text).replace(/^[^a-z0-9]+/, '')
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalize(term)))
}

function focusMentionedIn(sentence: string): SessionFocus | null {
  for (const entry of FOCUS_TERMS) {
    if (entry.terms.some((term) => sentence.includes(normalize(term)))) return entry.focus
  }
  return null
}

/**
 * A qué foco dice el texto que cambia, si lo anuncia.
 *
 * Solo se lee lo que sigue al anuncio, hasta la siguiente pausa: en «cambio a
 * tren superior: las piernas ya las cargaste», el destino es tren superior y
 * las piernas son la explicación.
 */
function announcedFocus(text: string): SessionFocus | null {
  const normalized = normalize(text)
  for (const announcement of CHANGE_ANNOUNCEMENTS) {
    let from = 0
    for (;;) {
      const at = normalized.indexOf(announcement, from)
      if (at === -1) break
      const clause = normalized.slice(at + announcement.length).split(/[,:;.!?…]/)[0]
      const focus = focusMentionedIn(clause)
      if (focus) return focus
      from = at + announcement.length
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

/**
 * Una cifra escrita: entera o con decimales, con punto o con coma, o con punto
 * de millares español («12.450», como escribe `formatVolume`).
 */
const NUMBER = /\d{1,3}(?:\.\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?/g

/** Grupos de tres tras un punto: millares, no decimales. «12.450» son 12450 kg. */
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/

function parseNumber(raw: string): number {
  return THOUSANDS.test(raw) ? Number(raw.replace(/\./g, '')) : Number(raw.replace(',', '.'))
}

/**
 * Referencias de escala que no son un dato del usuario: el «/100» del Recovery
 * Score y la Carga, y los 8 vasos de hidratación. Solo en esas formas exactas;
 * un «100» o un «8» sueltos siguen teniendo que estar respaldados.
 */
const SCALE_REFERENCES: readonly RegExp[] = [
  /\/\s*100\b/g,
  /\bde\s+100\b/gi,
  new RegExp(`\\/\\s*${HYDRATION_GLASS_COUNT}\\b`, 'g'),
  new RegExp(`\\bde\\s+${HYDRATION_GLASS_COUNT}\\s+vasos\\b`, 'gi'),
]

/** Campos del briefing que no son datos del usuario: ids (`id`, `messageId`) y marcas de tiempo (`reportedAt`). */
const NOT_USER_DATA_KEY = /^id$|Id$|At$/

/** Clave de comparación: dos decimales, sin signo. «-12 %» y «12 %» son la misma cifra. */
function numberKey(value: number): string {
  return String(Math.round(Math.abs(value) * 100) / 100)
}

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(parseNumber)
}

/**
 * Las cifras que respaldan una respuesta: las de la respuesta del dominio y
 * todas las del briefing, incluidas las que van dentro de textos («18:00»).
 *
 * Dos equivalencias, las dos explicables: un decimal redondeado a entero es el
 * mismo dato (67,6 → «68»), y una duración en segundos
 * se puede decir en minutos.
 */
function supportedNumbers(domainText: string, briefing: unknown): Set<string> {
  const supported = new Set<string>()
  const add = (value: number) => {
    supported.add(numberKey(value))
    supported.add(numberKey(Math.round(value)))
  }

  numbersIn(domainText).forEach(add)

  const visit = (value: unknown, key: string | null) => {
    // Los identificadores y las marcas de tiempo técnicas no son datos que
    // AXIS pueda contar: sus dígitos respaldarían cifras al azar.
    if (key !== null && NOT_USER_DATA_KEY.test(key)) return
    if (typeof value === 'number' && Number.isFinite(value)) {
      add(value)
      if (key !== null && /seconds$/i.test(key)) add(Math.round(value / 60))
    } else if (typeof value === 'string') {
      numbersIn(value).forEach(add)
    } else if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key))
    } else if (typeof value === 'object' && value !== null) {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey)
    }
  }
  visit(briefing, null)

  return supported
}

/**
 * La primera cifra del texto que no está respaldada por el dominio ni por el
 * briefing, o `null` si todas lo están.
 *
 * El modelo redacta con los datos que recibe; una cifra que no está en ellos es
 * una cifra inventada, aunque sea verosímil.
 */
export function findInventedNumber(text: string, domainText: string, briefing: unknown): string | null {
  let stripped = text
  for (const reference of SCALE_REFERENCES) stripped = stripped.replace(reference, ' ')

  const found = stripped.match(NUMBER) ?? []
  if (found.length === 0) return null

  const supported = supportedNumbers(domainText, briefing)
  return found.find((raw) => !supported.has(numberKey(parseNumber(raw)))) ?? null
}

/**
 * Respuestas de datos (D-027): recuperación, semana, carga y último
 * entrenamiento. El modelo las redacta, pero su contenido son las cifras, así
 * que no se puede dejar ninguna.
 */
export const DATA_ANSWER_INTENTS: readonly AxisIntent[] = ['recovery', 'week', 'load', 'last_session']

/**
 * Cuánto puede ocupar una respuesta (D-030): corta para los datos, larga para
 * las explicaciones y los cambios de entrenamiento, donde un entrenador
 * desarrolla el porqué. El resto, corta.
 */
export const LONG_ANSWER_INTENTS: readonly AxisIntent[] = [
  'why',
  'why_not',
  'factors',
  'change',
  'tired',
  'can_train',
  'sport_impact',
  'goals',
  'exercise',
]

export function lengthLimitsFor(
  intent: AxisIntent,
  personality: AxisPersonality = AXIS_PERSONALITY,
): { targetSentences: string; maxSentences: number; maxCharacters: number } {
  return LONG_ANSWER_INTENTS.includes(intent) ? personality.longLimits : personality.limits
}

/** Escalas que el dominio escribe y el modelo puede decir de otra forma («sobre 100» → «/100»). */
const DOMAIN_SCALES: readonly RegExp[] = [...SCALE_REFERENCES, /\bsobre\s+100\b/gi]

/**
 * La primera cifra de la respuesta del dominio que el texto no conserva, o
 * `null` si están todas. Se comparan como en `findInventedNumber`: «7,5» y
 * «7.5» son la misma cifra, «12.450» y «12450» también, y «−12 %» y «12 %».
 */
export function findOmittedNumber(text: string, domainText: string): string | null {
  let stripped = domainText
  for (const scale of DOMAIN_SCALES) stripped = stripped.replace(scale, ' ')
  const kept = new Set(numbersIn(text).map(numberKey))
  return (stripped.match(NUMBER) ?? []).find((raw) => !kept.has(numberKey(parseNumber(raw)))) ?? null
}

// ---------------------------------------------------------------------------
// Afirmaciones sobre el usuario
// ---------------------------------------------------------------------------

/**
 * Una familia de afirmaciones sobre el usuario.
 *
 * Las marcas están en forma normalizada (sin acentos, en minúscula) y se buscan
 * al principio de palabra. Son pocas y literales a propósito, igual que las
 * demás listas de esta puerta: o el texto contiene una, o no.
 */
type ClaimFamily = {
  label: string
  markers: readonly string[]
  patterns?: readonly RegExp[]
  /** Cuándo el briefing, por sí solo, respalda hablar de esto. */
  backedByBriefing?: (briefing: unknown) => boolean
  /**
   * Cómo lo dice el propio usuario, en primera persona (D-074): si lo ha
   * contado él, el modelo puede devolvérselo («ayer jugaste al fútbol»). Solo
   * se busca en lo que respalda, nunca en el texto del modelo.
   */
  selfMarkers?: readonly string[]
}

type BriefingShape = {
  recovery?: { known?: unknown; sleepHours?: unknown }
  lastSession?: unknown
  week?: { performancePercent?: unknown }
} | null

function sleepIsRegistered(briefing: unknown): boolean {
  const recovery = (briefing as BriefingShape)?.recovery
  return recovery?.known === true && typeof recovery.sleepHours === 'number'
}

function lastSessionIsRegistered(briefing: unknown): boolean {
  const last = (briefing as BriefingShape)?.lastSession
  return typeof last === 'object' && last !== null
}

function weekComparisonIsRegistered(briefing: unknown): boolean {
  return typeof (briefing as BriefingShape)?.week?.performancePercent === 'number'
}

/**
 * Lo que el modelo no puede afirmar del usuario por su cuenta.
 *
 * Una afirmación de una familia solo se admite si la respuesta del dominio ya
 * afirma algo de esa misma familia —el dominio solo afirma lo que registran
 * los datos— o, para el sueño, la última sesión y la comparación semanal, si
 * el briefing tiene ese dato registrado. El resto no se respalda con el
 * briefing a secas: «no has tocado piernas» es justo la conclusión que la
 * ausencia de datos no permite sacar.
 *
 * `lesion` no está aquí porque ya es lenguaje médico, que se rechaza siempre.
 */
const CLAIM_FAMILIES: readonly ClaimFamily[] = [
  {
    /*
     * Que algo NO ha ocurrido. Va aparte y primero porque es la afirmación más
     * fácil de sacar de la ausencia de datos: solo la puede hacer el dominio, y
     * que el dominio hable de «estos días» no la respalda.
     */
    label: 'historial (algo que no ha ocurrido)',
    markers: [
      'no la has tocado',
      'no lo has tocado',
      'no las has tocado',
      'no los has tocado',
      'no has tocado',
      'no has entrenado',
      'no has trabajado',
      'no la has trabajado',
      'no lo has trabajado',
      'no has cargado',
      'no la has cargado',
      'no has hecho',
      'esta libre',
    ],
    patterns: [/\bllevas\b[^.]*\bsin (entrenar|cargar|tocar|trabajar)/],
  },
  {
    label: 'historial',
    markers: [
      'has tocado',
      'has entrenado',
      'entrenaste',
      'has trabajado',
      'trabajaste',
      'hiciste',
      'has hecho',
      'ayer',
      'anteayer',
      'hace poco',
      'estos dias',
    ],
    patterns: [/\bllevas\b[^.]*\b(dias|sesiones|semanas|entrenad|trabajad)/, /\bhace \S+ dias\b/],
    selfMarkers: ['entrene', 'he entrenado', 'jugue', 'he jugado', 'hice', 'he hecho', 'corri', 'he corrido', 'trabaje'],
  },
  {
    label: 'la última sesión',
    markers: ['tu ultima sesion', 'la ultima sesion', 'tu sesion anterior'],
    backedByBriefing: lastSessionIsRegistered,
  },
  {
    label: 'la comparación semanal',
    markers: ['la semana pasada', 'la semana anterior'],
    backedByBriefing: weekComparisonIsRegistered,
  },
  {
    label: 'sueño',
    markers: ['dormiste', 'has dormido', 'duermes', 'dormido poco', 'dormido mal'],
    backedByBriefing: sleepIsRegistered,
    selfMarkers: ['dormi', 'he dormido', 'duermo'],
  },
  {
    label: 'estado de recuperación',
    markers: [
      'estas cansad',
      'estas agotad',
      'estas fatigad',
      'estas estresad',
      'estas descansad',
      'estas recuperad',
      'te sientes',
      'tienes fatiga',
      'tienes estres',
      'tienes energia',
    ],
    selfMarkers: [
      'estoy cansad',
      'estoy agotad',
      'estoy fatigad',
      'estoy estresad',
      'estoy reventad',
      'estoy muert',
      'estoy descansad',
      'me siento',
      'tengo fatiga',
      'tengo energia',
    ],
  },
  {
    label: 'molestias',
    markers: ['te duele', 'te dolia', 'dolor', 'molestia', 'te lastimaste', 'te hiciste dano', 'agujetas'],
    // La sobrecarga solo es una afirmación si se le atribuye al usuario: «sin
    // generar sobrecarga» es un principio de entrenamiento, no una molestia.
    patterns: [/\b(tienes|tengas|notas|arrastras|llevas)( una)? sobrecarga/, /\bsobrecarga (en|de) (el|la|los|las|tu|tus)\b/],
  },
  {
    label: 'preferencias',
    markers: ['prefieres', 'preferiste', 'te gusta', 'te gustan', 'te encanta', 'odias', 'como siempre', 'sueles', 'tu favorit', 'tu preferencia'],
    selfMarkers: ['prefiero', 'me gusta', 'me gustan', 'me encanta', 'odio', 'suelo'],
  },
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** La primera marca de la familia que aparece en el texto normalizado, o `null`. */
function claimIn(normalized: string, family: ClaimFamily): string | null {
  const marker = family.markers.find((term) => new RegExp(`\\b${escapeRegExp(term)}`).test(normalized))
  if (marker) return marker
  const pattern = family.patterns?.find((regex) => regex.test(normalized))
  return pattern ? (normalized.match(pattern)?.[0] ?? null) : null
}

/**
 * La primera afirmación sobre el usuario que no está respaldada, o `null`.
 *
 * El modelo redacta la respuesta del dominio; si afirma algo del usuario que
 * el dominio no ha afirmado, lo ha puesto él.
 */
export function findUnsupportedClaim(
  text: string,
  domainText: string,
  briefing: unknown,
): { family: string; claim: string } | null {
  const normalizedText = normalize(text)
  const normalizedDomain = normalize(domainText)

  for (const family of CLAIM_FAMILIES) {
    const claim = claimIn(normalizedText, family)
    if (claim === null) continue
    if (claimIn(normalizedDomain, family) !== null) continue
    if (family.selfMarkers?.some((term) => new RegExp(`\\b${escapeRegExp(term)}`).test(normalizedDomain))) continue
    if (family.backedByBriefing?.(briefing)) continue
    return { family: family.label, claim }
  }
  return null
}

const EMOJI_ALL = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

/**
 * La forma, arreglada en vez de descartada (D-070), como hace un editor: sin
 * emojis, sin exclamaciones, sin el cumplido de apertura y recortada a las
 * frases y caracteres de su intención. El fondo no se toca: eso lo sigue
 * comprobando `checkModelText`, que se aplica después.
 */
export function tidyModelText(text: string, intent: AxisIntent, personality: AxisPersonality = AXIS_PERSONALITY): string {
  let out = text
    .replace(EMOJI_ALL, '')
    .replace(/¡/g, '')
    .replace(/!+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()

  // «Claro, …», «Perfecto. …»: el cumplido se va y la respuesta empieza por lo que importa.
  const opener = personality.forbiddenOpeners.find((phrase) => normalize(out).startsWith(phrase))
  if (opener) {
    const cut = out.slice(opener.length).search(/[,.:;]/)
    if (cut !== -1 && cut <= 20) {
      const rest = out.slice(opener.length + cut + 1).trim()
      if (rest.length > 0) out = rest.charAt(0).toUpperCase() + rest.slice(1)
    }
  }

  // Las frases que sobran se quitan por el final; los decimales («2.5 kg») no parten frases.
  const { maxSentences, maxCharacters } = lengthLimitsFor(intent, personality)
  let sentences = out.split(/(?<=[.?…])\s+/).filter((s) => s.length > 0)
  if (sentences.length > maxSentences) sentences = sentences.slice(0, maxSentences)
  while (sentences.length > 1 && sentences.join(' ').length > maxCharacters) sentences = sentences.slice(0, -1)
  out = sentences.join(' ')
  if (out.length > maxCharacters) out = `${out.slice(0, out.lastIndexOf(' ', maxCharacters - 1))}…`
  return out
}

export type ModelTextCheckOptions = {
  /**
   * El briefing que recibió el modelo. Sin él, las cifras solo pueden venir de
   * la respuesta del dominio.
   */
  briefing?: unknown
  personality?: AxisPersonality
}

/**
 * Comprueba el texto del modelo antes de enseñarlo.
 *
 * Devuelve el primer motivo de rechazo que encuentra, en orden de gravedad
 * decreciente para el usuario: primero el fondo (contradecir al dominio,
 * inventar cifras, afirmar del usuario lo que los datos no dicen), después la
 * forma.
 */
export function checkModelText(
  text: string,
  domain: DomainAnswerForSafety,
  options: ModelTextCheckOptions = {},
): ModelTextCheck {
  const personality = options.personality ?? AXIS_PERSONALITY
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty', detail: 'El modelo no devolvió texto.' }
  }

  const normalized = normalize(trimmed)

  // Fondo: el veredicto no se negocia con la redacción.
  if (domain.verdict === 'decline' && includesAny(normalized, ACCEPTANCE_MARKERS)) {
    return {
      ok: false,
      reason: 'contradicts_verdict',
      detail: 'El dominio rechazó el cambio y el texto lo concede.',
    }
  }

  const target = domain.proposedTarget ?? null
  if (target) {
    if (includesAny(normalized, REFUSAL_MARKERS)) {
      return {
        ok: false,
        reason: 'contradicts_proposal',
        detail: 'El dominio aprobó un cambio y el texto se niega.',
      }
    }
    const announced = announcedFocus(trimmed)
    if (announced !== null && target.focus !== null && announced !== target.focus) {
      return {
        ok: false,
        reason: 'contradicts_proposal',
        detail: `El dominio aprobó ${target.focus} y el texto anuncia ${announced}.`,
      }
    }
  }

  // Fondo: las cifras salen de los datos, no del modelo.
  const invented = findInventedNumber(trimmed, domain.text, options.briefing ?? null)
  if (invented !== null) {
    return {
      ok: false,
      reason: 'invented_number',
      detail: `El texto dice «${invented}», una cifra que no está en el briefing ni en la respuesta del dominio.`,
    }
  }

  // Fondo: una respuesta de datos no pierde ninguna cifra al redactarse (D-027).
  if (DATA_ANSWER_INTENTS.includes(domain.intent)) {
    const omitted = findOmittedNumber(trimmed, domain.text)
    if (omitted !== null) {
      return {
        ok: false,
        reason: 'omitted_number',
        detail: `El dominio da «${omitted}» y el texto no lo conserva.`,
      }
    }
  }

  // Fondo: lo que se afirma del usuario sale de los datos, no del modelo.
  const unsupported = findUnsupportedClaim(trimmed, domain.text, options.briefing ?? null)
  if (unsupported !== null) {
    return {
      ok: false,
      reason: 'unsupported_claim',
      detail: `El texto afirma algo de ${unsupported.family} («${unsupported.claim}») que no está en la respuesta del dominio ni en el briefing.`,
    }
  }

  // Forma: lo que la personalidad no admite.
  const opener = personality.forbiddenOpeners.find((phrase) => normalized.startsWith(normalize(phrase)))
  if (opener) {
    return {
      ok: false,
      reason: 'forbidden_opener',
      detail: `La respuesta abre con «${opener}».`,
    }
  }

  const medical = personality.forbiddenMedicalTerms.find((term) => normalized.includes(normalize(term)))
  if (medical) {
    return {
      ok: false,
      reason: 'medical_language',
      detail: `La respuesta usa lenguaje médico («${medical}»).`,
    }
  }

  if (!personality.limits.allowEmojis && EMOJI.test(trimmed)) {
    return { ok: false, reason: 'emoji', detail: 'La respuesta contiene emojis.' }
  }

  if (!personality.limits.allowExclamations && EXCLAMATION.test(trimmed)) {
    return { ok: false, reason: 'exclamation', detail: 'La respuesta contiene exclamaciones.' }
  }

  const sentences = countSentences(trimmed)
  const length = lengthLimitsFor(domain.intent, personality)
  if (sentences > length.maxSentences || trimmed.length > length.maxCharacters) {
    return {
      ok: false,
      reason: 'too_long',
      detail: `${sentences} frases y ${trimmed.length} caracteres; el máximo es ${length.maxSentences} frases y ${length.maxCharacters} caracteres.`,
    }
  }

  return { ok: true }
}
