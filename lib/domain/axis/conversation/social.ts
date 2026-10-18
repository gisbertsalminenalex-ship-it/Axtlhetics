/**
 * Charla (D-042): saludos, «¿qué tal?», «gracias», «jaja», despedidas.
 *
 * Un entrenador no contesta a un «hola» con «dime qué quieres cambiar» ni con
 * «no he entendido». Estos mensajes no piden nada del entrenamiento: se
 * responden como en una conversación, con el nombre del usuario y, si viene a
 * cuento, lo que le toca hoy.
 *
 * Lo normal es que la respuesta la escriba el modelo, con libertad (ver
 * `aiSystemPrompt`). Lo de aquí es lo que dice AXIS sin red o si el modelo
 * falla: varias formas de decir cada cosa, que cambian de un mensaje a otro,
 * para que nunca suene a plantilla.
 *
 * Solo cuenta como charla un mensaje que es **entero** charla: «hola, estoy
 * reventado» no es un saludo, es cansancio con un hola delante.
 */

import type { AxisBriefing } from '../briefing'
import { describeFocus } from '../knowledge/focus'
import { normalizeQuestion } from './intents'
import type { AxisAnswer } from './types'

/** Lo que se recuerda en «Cambiar entrenamiento». La charla del modelo lo conserva. */
export const CHANGE_INVITATION = 'Cuando quieras, dime qué te gustaría cambiar de la sesión de hoy.'

export type SocialKind = 'greeting' | 'how_are_you' | 'thanks' | 'bye' | 'praise' | 'ack'

/** Frases normalizadas (minúsculas, sin tildes). Se prueban de la más larga a la más corta. */
const PHRASES: Record<SocialKind, readonly string[]> = {
  greeting: [
    'hola', 'holi', 'holis', 'buenas', 'wenas', 'buenos dias', 'buen dia', 'buenas tardes', 'buenas noches', 'hey', 'ey',
    'hello', 'hi', 'saludos', 'axis', 'que pasa', 'que hay', 'que onda', 'hola axis',
  ],
  how_are_you: [
    'que tal', 'que tal estas', 'que tal todo', 'que tal va', 'que tal vas', 'que tal tu', 'como estas', 'como estas tu',
    'como vas', 'como andas', 'como te va', 'como va', 'como va todo', 'todo bien', 'y tu', 'tu que tal', 'como te encuentras',
  ],
  thanks: ['gracias', 'muchas gracias', 'mil gracias', 'gracias axis', 'thanks', 'thx', 'grax', 'te lo agradezco', 'graciass'],
  bye: ['adios', 'hasta luego', 'hasta manana', 'hasta pronto', 'nos vemos', 'chao', 'chau', 'bye', 'me voy', 'luego hablamos'],
  praise: [
    'me caes bien', 'eres el mejor', 'eres un crack', 'que crack', 'crack', 'buen trabajo', 'te quiero', 'mola', 'molas',
    'eres genial', 'muy bien axis', 'buena esa', 'que bien',
  ],
  ack: [
    'ok', 'okey', 'okay', 'oki', 'vale', 'genial', 'perfecto', 'guay', 'bien', 'muy bien', 'entendido', 'de acuerdo',
    'si', 'claro', 'venga', 'dale', 'top', 'buenisimo', 'estupendo', 'jaja', 'jeje', 'jajaja', 'lol', 'xd', 'ah vale',
    'ya', 'entiendo', 'ah', 'oh', 'm', 'okis', 'pues vale', 'vale gracias', 'ok gracias',
  ],
}

/** Cuando un mensaje mezcla varias cosas («hola, ¿qué tal?»), la que más pide respuesta. */
const PRIORITY: readonly SocialKind[] = ['how_are_you', 'thanks', 'bye', 'praise', 'greeting', 'ack']

const ALL = (Object.keys(PHRASES) as SocialKind[])
  .flatMap((kind) => PHRASES[kind].map((phrase) => ({ kind, phrase })))
  .sort((a, b) => b.phrase.length - a.phrase.length)

/** Risas y letras alargadas: «jajajaja» → «jaja», «holaaa» → «hola». */
function tidy(text: string): string {
  return text
    .replace(/\b(?:j[aeiou]){2,}j?\b/g, 'jaja')
    .replace(/\b(?:h[aeiou]){2,}h?\b/g, 'jaja')
    .replace(/(\p{L})\1{2,}/gu, '$1')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El tipo de charla, o `null` si el mensaje dice algo más que eso. */
export function detectSocial(message: string): SocialKind | null {
  let text = tidy(normalizeQuestion(message))
  if (text.length === 0) return null

  const found = new Set<SocialKind>()
  while (text.length > 0) {
    const next = ALL.find(({ phrase }) => text === phrase || text.startsWith(`${phrase} `))
    if (!next) return null
    found.add(next.kind)
    text = text.slice(next.phrase.length).trim()
  }
  return PRIORITY.find((kind) => found.has(kind)) ?? null
}

// ---------------------------------------------------------------------------
// Lo que dice AXIS sin el modelo
// ---------------------------------------------------------------------------

/** Una de varias, distinta según el mensaje y el momento de la conversación. */
function pick<T>(options: readonly T[], seed: number): T {
  return options[Math.abs(seed) % options.length]
}

function seedOf(message: string, turn: number): number {
  let hash = turn * 31
  for (const char of message) hash = (hash * 33 + char.charCodeAt(0)) | 0
  return hash
}

/** Lo que hoy viene a cuento mencionar, en una frase corta, o `null`. */
function todayHook(briefing: AxisBriefing, seed: number): string | null {
  if (briefing.trainedToday) {
    return pick(['Hoy ya has entrenado: buen trabajo.', 'Lo de hoy ya está hecho, y bien hecho.', 'Hoy ya cumpliste con la sesión.'], seed)
  }
  const proposal = briefing.proposal
  if (proposal) {
    // Del tipo y el foco, no del titular: el titular es una frase hecha para la tarjeta de Inicio.
    const focus = proposal.session ? describeFocus(proposal.session.focus) : null
    switch (proposal.type) {
      case 'TRAINING':
        if (focus) return pick([`Hoy te toca ${focus}.`, `Para hoy tengo preparado ${focus}.`], seed)
        break
      case 'LIGHT_TRAINING':
        if (focus) return pick([`Hoy toca algo suave de ${focus}.`, `Para hoy, ${focus} sin apretar demasiado.`], seed)
        break
      case 'MODIFIED_TRAINING':
        if (focus) return pick([`Hoy toca ${focus}, adaptado a tu día.`, `Para hoy, ${focus} ajustado a cómo vienes.`], seed)
        break
      case 'RECOVERY':
        return pick(['Hoy toca recuperar.', 'Hoy lo importante es recuperar bien.'], seed)
      case 'REST':
        return pick(['Hoy toca descansar.', 'Hoy, descanso.'], seed)
    }
  }
  return null
}

export type SocialAnswerOptions = {
  /** Cuántos mensajes lleva la conversación: cambia la forma de decirlo. */
  turn?: number
  /** «Cambiar entrenamiento» está abierto: se recuerda, sin insistir. */
  changeMode?: boolean
}

export function answerSocial(
  kind: SocialKind,
  message: string,
  briefing: AxisBriefing,
  options: SocialAnswerOptions = {},
): AxisAnswer {
  const seed = seedOf(message, options.turn ?? 0)
  const name = briefing.profile?.name?.trim() || null
  const to = (text: string) => (name ? text.replace('{n}', `, ${name}`) : text.replace('{n}', ''))
  const hook = todayHook(briefing, seed >> 3)
  const parts: string[] = []

  switch (kind) {
    case 'greeting':
      parts.push(to(pick(['Hola{n}.', 'Buenas{n}.', 'Hola{n}, aquí estoy.', 'Hey{n}, qué bien verte por aquí.'], seed)))
      if (hook) parts.push(hook)
      parts.push(pick(['¿Cómo te encuentras hoy?', '¿Cómo llegas hoy?', '¿Cómo vas de energía?', '¿En qué te ayudo?'], seed >> 5))
      break
    case 'how_are_you':
      parts.push(to(pick(['Muy bien{n}, gracias por preguntar.', 'Bien{n}, con ganas de verte entrenar.', 'Por aquí, todo en orden{n}.'], seed)))
      if (hook) parts.push(hook)
      parts.push(pick(['¿Y tú, cómo estás?', '¿Y tú qué tal? ¿Cómo te notas el cuerpo?', '¿Y tú? Cuéntame cómo llegas hoy.'], seed >> 5))
      break
    case 'thanks':
      parts.push(to(pick(['De nada{n}.', 'A ti{n}.', 'Para eso estoy{n}.', 'Cuando quieras{n}.'], seed)))
      parts.push(pick(['Si te surge algo más, aquí me tienes.', 'Lo importante lo pones tú.', ''], seed >> 5))
      break
    case 'bye':
      parts.push(to(pick(['Hasta luego{n}.', 'Nos vemos{n}.', 'Venga, hasta pronto{n}.'], seed)))
      parts.push(
        !briefing.trainedToday && briefing.proposal?.session
          ? pick(['Que no se te pase la sesión de hoy.', 'Cuando vayas a entrenar, aquí la tienes.'], seed >> 5)
          : pick(['Descansa bien.', 'Recupera bien, que también cuenta.'], seed >> 5),
      )
      break
    case 'praise':
      parts.push(to(pick(['Gracias{n}, se agradece.', 'Me alegra oírlo{n}.', 'Gracias{n}. Tú pones el trabajo; yo solo lo ordeno.'], seed)))
      if (hook) parts.push(hook)
      break
    case 'ack':
      parts.push(pick(['Hecho.', 'Entendido.', 'Bien.', 'De acuerdo.'], seed))
      parts.push(pick(['Si quieres algo más, dímelo.', 'Aquí sigo para lo que necesites.', 'Cualquier cosa, me dices.'], seed >> 5))
      break
  }

  if (options.changeMode && kind !== 'bye') {
    parts.push(CHANGE_INVITATION)
  }

  return { text: parts.filter(Boolean).join(' '), intent: 'social', unknown: false }
}
