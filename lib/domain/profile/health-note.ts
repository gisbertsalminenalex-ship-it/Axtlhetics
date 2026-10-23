/**
 * La nota de salud (D-064): lo que el usuario escribe sobre su salud, leído por
 * AXIS para tenerlo en cuenta.
 *
 * El modelo de lenguaje no decide nada: **clasifica**. Devuelve qué zonas hay
 * que cuidar y qué señales de las siete del PAR-Q+ aparecen, y todo lo demás
 * —dejar fuera ejercicios, pedir el visto bueno del médico, no proponer días
 * fuertes— lo siguen haciendo las reglas de siempre (D-051, D-058).
 *
 * Del dispositivo sale solo la nota, por la misma ruta que el resto del
 * lenguaje de AXIS (`/api/axis-ai`), sin nombre ni briefing, y no se guarda en
 * ningún servidor. Si la ruta falla, no hay red o el modelo responde algo que no
 * se entiende, la nota se lee aquí con una lista de palabras (`detectHealthNote`).
 */

import { listNames } from '../shared/text'
import { CARE_ZONE_LABELS, CARE_ZONE_ORDER, type CareZone } from './types'
import { HEALTH_QUESTION_LABELS, HEALTH_QUESTION_ORDER, MAX_HEALTH_NOTE_LENGTH, type HealthQuestion } from './screening'

export type HealthReading = {
  zones: CareZone[]
  flags: HealthQuestion[]
  /** `model`: la leyó el modelo; `local`: la lista de palabras, sin conexión o con la ruta caída. */
  source: 'model' | 'local'
}

/** La intención con la que viaja por la ruta: no es ninguna de la conversación. */
export const HEALTH_NOTE_INTENT = 'health_note'

/** Cuánto se espera al modelo antes de leer la nota en el dispositivo. */
export const HEALTH_NOTE_TIMEOUT_MS = 8000

export function healthNoteSystemPrompt(): string {
  return [
    'Eres el lector de notas de salud de AXIS, el entrenador de AXTHLETICS. No diagnosticas ni aconsejas: clasificas.',
    'Recibes un JSON con `question`: lo que el usuario ha escrito sobre su salud antes de empezar a entrenar.',
    `Zonas a cuidar (molestias, dolores o lesiones de una zona concreta): ${CARE_ZONE_ORDER.map((zone) => `${zone} (${CARE_ZONE_LABELS[zone].toLowerCase()})`).join(', ')}. Cualquier zona de la espalda cuenta como espalda_baja; la zona cervical, como cuello.`,
    `Señales que piden ver a un médico: ${HEALTH_QUESTION_ORDER.map((flag) => `${flag} (${HEALTH_QUESTION_LABELS[flag]})`).join(', ')}.`,
    'Una molestia o un dolor de una zona es solo una zona. Añade huesos_articulaciones únicamente si habla de una lesión diagnosticada, una operación, una fractura, una hernia, artrosis o algo que empeora al hacer ejercicio. medicacion es tomar medicación de forma habitual, no un analgésico suelto.',
    'Solo cuenta lo que el usuario dice que le pasa. Lo que niega («no tengo nada del corazón») o lo que le pasó a otra persona no cuenta. No supongas nada.',
    'Devuelve SOLO un objeto JSON con esta forma, usando solo los identificadores de las listas:',
    '{"message": "ok", "action": {"zones": ["rodilla"], "flags": []}}',
  ].join('\n')
}

export type HealthNoteRequest = {
  system: string
  question: string
  briefing: Record<string, never>
  domain: { text: string; intent: typeof HEALTH_NOTE_INTENT; proposedTarget: null }
}

/** La petición: el contrato de la ruta, con la nota como pregunta y nada más. */
export function buildHealthNoteRequest(note: string): HealthNoteRequest {
  return {
    system: healthNoteSystemPrompt(),
    question: note.trim().slice(0, MAX_HEALTH_NOTE_LENGTH),
    briefing: {},
    domain: { text: '', intent: HEALTH_NOTE_INTENT, proposedTarget: null },
  }
}

/**
 * Lo que devuelve la ruta (`{text, action}`), o `null` si no vale.
 *
 * Se aceptan solo identificadores conocidos, y en el orden estable de cada
 * lista; lo demás se ignora. Una respuesta sin las dos listas no se intenta
 * arreglar: la nota se lee en el dispositivo.
 */
export function readHealthNoteReply(payload: unknown): HealthReading | null {
  if (typeof payload !== 'object' || payload === null) return null
  const action = (payload as Record<string, unknown>).action
  if (typeof action !== 'object' || action === null) return null
  const { zones, flags } = action as Record<string, unknown>
  if (!Array.isArray(zones) || !Array.isArray(flags)) return null
  return {
    zones: CARE_ZONE_ORDER.filter((zone) => zones.includes(zone)),
    flags: HEALTH_QUESTION_ORDER.filter((flag) => flags.includes(flag)),
    source: 'model',
  }
}

// ---------------------------------------------------------------------------
// Sin modelo: una lista de palabras
// ---------------------------------------------------------------------------

const ZONE_TERMS: Record<CareZone, RegExp> = {
  rodilla: /rodill|menisco|rotula|ligamento cruzado/,
  tobillo: /tobillo/,
  cadera: /cadera/,
  espalda_baja: /espalda|lumbar|lumbago|ciatic|hernia discal|hernia de disco/,
  hombro: /hombro|manguito/,
  codo: /\bcodo|epicondil/,
  muneca: /muneca|carpiano/,
  cuello: /cuello|cervical/,
}

const FLAG_TERMS: Record<HealthQuestion, RegExp> = {
  corazon: /corazon|cardi|arritmi|taquicardi|infarto|hipertens|tension alta|tension arterial|marcapasos|soplo/,
  dolor_pecho: /dolor (en el |de )?pecho|duele el pecho|opresion en el pecho/,
  mareos: /mareo|desmay|vertigo|conocimiento/,
  enfermedad_cronica: /diabet|asma|epileps|cancer|cronic|tiroid|renal/,
  medicacion: /medicac|medicament|pastillas|insulina/,
  huesos_articulaciones: /osteopor|artrosis|artritis|fractur|rotura|\broto\b|operad|operacion|cirugia|protesis|hernia/,
  supervision: /supervis/,
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** La lectura del dispositivo: sencilla y sin entender negaciones, pero nunca deja la nota sin leer. */
export function detectHealthNote(note: string): HealthReading {
  const text = normalize(note)
  return {
    zones: CARE_ZONE_ORDER.filter((zone) => ZONE_TERMS[zone].test(text)),
    flags: HEALTH_QUESTION_ORDER.filter((flag) => FLAG_TERMS[flag].test(text)),
    source: 'local',
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

/**
 * Lee una nota contra la ruta propia del mismo origen; ante cualquier fallo,
 * en el dispositivo. Nunca lanza: la nota siempre acaba leída.
 */
export function createHealthNoteReader(
  endpoint: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): (note: string) => Promise<HealthReading> {
  return async (note) => {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), HEALTH_NOTE_TIMEOUT_MS)
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildHealthNoteRequest(note)),
        signal: timeout.signal,
      })
      if (response.ok) {
        const reading = readHealthNoteReply(await response.json())
        if (reading) return reading
      }
    } catch {
      // Sin red, ruta caída o tiempo agotado: se lee aquí.
    } finally {
      clearTimeout(timer)
    }
    return detectHealthNote(note)
  }
}

// ---------------------------------------------------------------------------
// Aplicar y contar lo leído
// ---------------------------------------------------------------------------

/** Las zonas leídas se suman a las que ya había, en el orden estable. */
export function mergeZones(current: readonly CareZone[], read: readonly CareZone[]): CareZone[] {
  return CARE_ZONE_ORDER.filter((zone) => current.includes(zone) || read.includes(zone))
}

/** `true` si la lectura trae una señal que antes no estaba: pide un visto bueno nuevo. */
export function hasNewFlag(before: readonly HealthQuestion[], after: readonly HealthQuestion[]): boolean {
  return after.some((flag) => !before.includes(flag))
}

/** Lo que AXIS ha entendido, en frases cortas para enseñar debajo de la nota. */
export function describeHealthReading(reading: Pick<HealthReading, 'zones' | 'flags'>): string[] {
  const lines: string[] = []
  if (reading.zones.length > 0) {
    const zones = listNames(reading.zones.map((zone) => `tu ${CARE_ZONE_LABELS[zone].toLowerCase()}`))
    lines.push(`Cuidaré ${zones}: dejo fuera los ejercicios que ${reading.zones.length === 1 ? 'cargan esa zona' : 'cargan esas zonas'}.`)
  }
  if (reading.flags.length > 0) {
    lines.push(`Me cuentas algo de ${listNames(reading.flags.map((flag) => HEALTH_QUESTION_LABELS[flag]))}.`)
  }
  if (lines.length === 0) {
    lines.push('No he encontrado nada que cambie tus entrenos. Si es importante, cuéntalo con más detalle.')
  }
  return lines
}
