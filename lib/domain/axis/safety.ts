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
import type { AxisAnswer } from './conversation/types'
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

/** Una cifra escrita: entera o con decimales, con punto o con coma. */
const NUMBER = /\d+(?:[.,]\d+)?/g

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
  return (text.match(NUMBER) ?? []).map((raw) => Number(raw.replace(',', '.')))
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
  return found.find((raw) => !supported.has(numberKey(Number(raw.replace(',', '.'))))) ?? null
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
  },
  {
    label: 'molestias',
    markers: ['te duele', 'te dolia', 'dolor', 'molestia', 'te lastimaste', 'te hiciste dano', 'sobrecarga', 'agujetas'],
  },
  {
    label: 'preferencias',
    markers: ['prefieres', 'preferiste', 'te gusta', 'te gustan', 'te encanta', 'odias', 'como siempre', 'sueles', 'tu favorit', 'tu preferencia'],
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
    if (family.backedByBriefing?.(briefing)) continue
    return { family: family.label, claim }
  }
  return null
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
  if (sentences > personality.limits.maxSentences || trimmed.length > personality.limits.maxCharacters) {
    return {
      ok: false,
      reason: 'too_long',
      detail: `${sentences} frases y ${trimmed.length} caracteres; el máximo es ${personality.limits.maxSentences} frases y ${personality.limits.maxCharacters} caracteres.`,
    }
  }

  return { ok: true }
}
