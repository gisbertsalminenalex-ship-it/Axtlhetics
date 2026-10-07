/**
 * Leer las frases de reorganización (D-022).
 *
 * Solo lectura: qué está diciendo el usuario. No decide nada; eso lo hacen la
 * negociación y las respuestas. Como el resto de la detección de intención, son
 * palabras clave explícitas que se pueden leer y discutir, no un intento de
 * entender lenguaje natural.
 *
 * Lo que distingue a estas frases es que cuentan un **límite** («no puedo», «solo
 * tengo 20 minutos») o un **hecho** («mañana tengo partido»), no una preferencia.
 * Un límite real se acomoda; una preferencia se juzga (D-010).
 */

import type { ActivityIntensity } from '../../profile/types'
import { asksForMoreTime, normalizeQuestion } from './intents'

/** «Esta mañana» y «por la mañana» hablan de hoy, no del día siguiente. */
function mentionsTomorrow(text: string): boolean {
  const cleaned = text.replace(/\b(esta|por la|de la|a la) manana\b/g, ' ')
  return /\bmanana\b/.test(cleaned)
}

// ---------------------------------------------------------------------------
// Minutos
// ---------------------------------------------------------------------------

const SPOKEN_DURATIONS: readonly { pattern: RegExp; minutes: number }[] = [
  { pattern: /\bhora y media\b/, minutes: 90 },
  { pattern: /\btres cuartos de hora\b/, minutes: 45 },
  { pattern: /\bun cuarto de hora\b/, minutes: 15 },
  { pattern: /\bmedia hora\b/, minutes: 30 },
  { pattern: /\b(una|1) hora\b/, minutes: 60 },
]

/**
 * Los minutos que el usuario dice tener, o `null`.
 *
 * «Solo tengo 20 minutos», «tengo media hora», «15 min». Pedir más tiempo
 * («15 minutos más») no es decir cuánto se tiene: eso es `longer` (D-017).
 */
export function statedMinutes(message: string): number | null {
  if (asksForMoreTime(message)) return null
  const text = normalizeQuestion(message)

  const numeric = /\b(\d{1,3})\s*(minutos|minuto|mins|min)\b/.exec(text)
  if (numeric) return Number(numeric[1])

  for (const spoken of SPOKEN_DURATIONS) {
    if (spoken.pattern.test(text)) return spoken.minutes
  }
  return null
}

// ---------------------------------------------------------------------------
// «Hoy no puedo entrenar»
// ---------------------------------------------------------------------------

const CANNOT_TODAY_PATTERNS: readonly RegExp[] = [
  /\bno (puedo|podre|voy a poder) entrenar\b/,
  /\bno (tengo|hay) tiempo (para|de) entrenar\b/,
  /\bno me (da|va a dar) tiempo a entrenar\b/,
  /\bimposible entrenar\b/,
  // «Hoy no puedo», sola o con un motivo detrás, pero no «no puedo más» ni
  // «no puedo hacer…»: eso es cansancio o una petición sobre la sesión.
  /\bhoy no puedo\b(?!\s+(mas|hacer|con))/,
]

/** «Hoy no puedo entrenar», «no voy a poder entrenar», «no tengo tiempo para entrenar». */
export function saysCannotTrainToday(message: string): boolean {
  const text = normalizeQuestion(message)
  if (mentionsTomorrow(text)) return false
  return CANNOT_TODAY_PATTERNS.some((pattern) => pattern.test(text))
}

// ---------------------------------------------------------------------------
// «Muévelo a mañana»
// ---------------------------------------------------------------------------

// En masculino («el entrenamiento») y en femenino («la sesión»): AXIS ofrece
// «puedo moverla a mañana», así que «muévela a mañana» tiene que entenderse.
const MOVE_VERBS =
  '(mover|muevelo|muevela|moverlo|moverla|mueve|mueva|pasar|pasarlo|pasarla|pasalo|pasala|dejar|dejarlo|dejarla|dejalo|dejala|aplazar|aplazarlo|aplazarla|aplazalo|aplazala|posponer|posponerlo|posponerla|posponlo|posponla|cambiar|cambiarlo|cambiarla|hacerlo|hacerla|hacer|entrenar)'

/** «Muévelo a mañana», «déjalo para mañana», «prefiero entrenar mañana en vez de hoy». */
export function asksToMoveToTomorrow(message: string): boolean {
  const text = normalizeQuestion(message)
  if (!mentionsTomorrow(text)) return false
  if (new RegExp(`\\b${MOVE_VERBS}\\b[^.;]*\\bmanana\\b`).test(text)) return true
  return /\bmejor manana\b/.test(text)
}

// ---------------------------------------------------------------------------
// «No puedo hacer el entrenamiento previsto»
// ---------------------------------------------------------------------------

const PLANNED_TERMS =
  '(entrenamiento|entreno|sesion|rutina|previsto|planeado|programado|que toca|que tocaba|de hoy)'

/** «No puedo hacer el entrenamiento previsto», «no puedo hacer la sesión de hoy». */
export function saysCannotDoPlanned(message: string): boolean {
  const text = normalizeQuestion(message)
  return new RegExp(`\\bno (puedo|podre|voy a poder) hacer\\b[^.;]*\\b${PLANNED_TERMS}\\b`).test(text)
}

export type BlockReason = 'time' | 'zone' | 'material' | 'other'

const TIME_TERMS = /\b(tiempo|prisa|justo|minutos|min|hora|rato)\b/
const ZONE_TERMS = /\b(zona|musculo|musculos|grupo)\b/
const MATERIAL_TERMS =
  /\b(material|pesa|mancuerna|silla|banco|equipo|sitio|lugar|espacio|casa|fuera|viaje|viajando|hotel|gimnasio)\b/
const OTHER_TERMS = /\b(otro motivo|otra cosa|otro|otra razon|por otra)\b/

/**
 * El motivo que da el usuario cuando AXIS le pregunta por qué no puede hacer lo
 * previsto. La zona concreta («piernas») la reconoce `detectFocus`: aquí solo
 * se mira si habla de zonas en general.
 */
export function detectBlockReason(message: string): BlockReason | null {
  const text = normalizeQuestion(message)
  if (statedMinutes(message) !== null || TIME_TERMS.test(text)) return 'time'
  if (MATERIAL_TERMS.test(text)) return 'material'
  if (ZONE_TERMS.test(text)) return 'zone'
  if (OTHER_TERMS.test(text)) return 'other'
  return null
}

// ---------------------------------------------------------------------------
// Cansancio contado en la conversación
// ---------------------------------------------------------------------------

const TIRED_PATTERNS: readonly RegExp[] = [
  /\b(estoy|ando|voy|me siento|me noto) (muy |demasiado |super |bastante )?(cansad|fatigad|agotad|reventad)\w*/,
  /\b(demasiado|muy) (cansad|fatigad)\w*/,
  /\bsin fuerzas\b/,
  /\bsin energia\b/,
  /\bhecho polvo\b/,
  /\bno puedo mas\b/,
]

/** «Estoy demasiado fatigado», «hoy estoy reventado», «no puedo más». */
export function saysTooTired(message: string): boolean {
  const text = normalizeQuestion(message)
  return TIRED_PATTERNS.some((pattern) => pattern.test(text))
}

// ---------------------------------------------------------------------------
// «Ayer no pude entrenar»
// ---------------------------------------------------------------------------

const MISSED_YESTERDAY_PATTERNS: readonly RegExp[] = [
  /\bayer no (pude|entrene|he entrenado|hice nada|me dio tiempo|fui)\b/,
  /\bno (pude entrenar|entrene|he entrenado) ayer\b/,
  /\bme salte (el entreno|el entrenamiento|la sesion) de ayer\b/,
  /\bayer me (lo |la )?salte\b/,
]

export function saysMissedYesterday(message: string): boolean {
  const text = normalizeQuestion(message)
  return MISSED_YESTERDAY_PATTERNS.some((pattern) => pattern.test(text))
}

// ---------------------------------------------------------------------------
// «Mañana tengo un partido»
// ---------------------------------------------------------------------------

const MATCH_TERMS = /\b(partido|competicion|torneo|campeonato)\b/

/**
 * «Mañana tengo partido», «tengo un torneo mañana», «mañana juego».
 *
 * Decir que mañana **no** hay partido no cuenta: cancelar una actividad de
 * mañana por conversación sigue fuera de alcance (D-018).
 */
export function saysMatchTomorrow(message: string): boolean {
  const text = normalizeQuestion(message)
  if (!mentionsTomorrow(text)) return false
  if (/\bno (tengo|hay|juego)\b/.test(text)) return false
  return MATCH_TERMS.test(text) || /\bmanana juego\b/.test(text)
}

const INTENSITY_TERMS: readonly { intensity: ActivityIntensity; pattern: RegExp }[] = [
  { intensity: 'alta', pattern: /\b(exigente|intens[oa]|dur[oa]|fuerte|importante|competitiv[oa]|oficial|alta)\b/ },
  { intensity: 'media', pattern: /\b(normal|moderad[oa]|media|regular)\b/ },
  { intensity: 'baja', pattern: /\b(suave|tranquil[oa]|liger[oa]|amistoso|facil|baja)\b/ },
]

/** La intensidad que el usuario da a una actividad, o `null` si no la dice. */
export function detectIntensity(message: string): ActivityIntensity | null {
  const text = normalizeQuestion(message)
  return INTENSITY_TERMS.find((entry) => entry.pattern.test(text))?.intensity ?? null
}
