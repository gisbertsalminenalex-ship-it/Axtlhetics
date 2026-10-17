/**
 * Tolerancia a faltas del chat de AXIS (D-026).
 *
 * Los detectores de AXIS reconocen palabras clave: si el usuario escribe
 * «cansao» en vez de «cansado», ninguno lo entiende y la pregunta ni siquiera
 * llega a la capa de lenguaje, que solo se llama cuando el determinista
 * reconoce la intención. Aquí se corrige el mensaje **una sola vez, al
 * entrar**, antes de cualquier detector, hacia el vocabulario que AXIS ya
 * reconoce. Determinista, sin red y sin modelo.
 *
 * Tres pasos por palabra, en este orden:
 *
 * 1. **Abreviaturas del chat**: «xq» → «por que», «q» → «que», «toy» → «estoy».
 * 2. **Misma pronunciación**: «rodiya», «recuperasion», «kiero», «cansao»
 *    suenan igual que una palabra del vocabulario (ll/y, c/s/z, qu/k, b/v,
 *    h muda, «-ao» por «-ado»). Desde 4 letras: en las de 3, «ves» y «vez»
 *    suenan igual y son palabras distintas.
 * 3. **Una letra de diferencia**, según el largo de la palabra:
 *    - de 7 letras o más, una letra cambiada, quitada, de más o dos cruzadas;
 *    - de 6, también la letra que falta («partdo» → «partido»);
 *    - de 5 y 6, dos letras cruzadas («semnaa» → «semana»).
 *    Cambiar una letra en una palabra corta cambia la palabra («hombre» y
 *    «hombro»): eso solo se admite en las largas.
 *
 * Solo se corrige si hay **un único** candidato. Una palabra que ya está en el
 * vocabulario no se toca, ni una que empieza por una palabra del vocabulario
 * («tranquilo» empieza por el «tranquil» de un patrón): ya se reconoce.
 */

/** Sin tildes ni mayúsculas, igual que `normalizeQuestion`. La ñ queda como n. */
function plain(word: string): string {
  return word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Abreviaturas y formas de chat, palabra por palabra. */
export const CHAT_SHORTHANDS: Readonly<Record<string, string>> = {
  xq: 'por que', pq: 'por que', porq: 'por que', porqe: 'por que', porke: 'por que', xk: 'por que', pk: 'por que',
  q: 'que', qe: 'que', k: 'que', ke: 'que',
  tb: 'tambien', tmb: 'tambien', tbn: 'tambien',
  toy: 'estoy', tas: 'estas', ta: 'esta', pa: 'para', x: 'por', d: 'de', m: 'me', bn: 'bien', ns: 'no se', oy: 'hoy',
}

/**
 * Cómo suena una palabra, para comparar sin las faltas que no cambian el sonido.
 * Exportada para los tests.
 */
export function soundOf(word: string): string {
  return plain(word)
    .replace(/ch/g, '§')
    .replace(/h/g, '')
    .replace(/ll/g, 'y')
    .replace(/qu/g, 'k')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/y$/, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/ado$/, 'ao')
    .replace(/ido$/, 'io')
    .replace(/§/g, 'ch')
}

/** `true` si `a` y `b` se diferencian en una sola edición, contando dos letras cruzadas como una. */
export function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 1) return true
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i += 1
  return short.slice(i) === long.slice(i + 1)
}

export type SpellingVocabulary = {
  readonly words: ReadonlySet<string>
  readonly bySound: ReadonlyMap<string, readonly string[]>
}

/**
 * Las palabras de una lista de términos («me duele», «mas corto») y de las
 * fuentes de los patrones. En los patrones se quitan los escapes (`\b`, `\w`) y
 * las clases negadas (`[^a-z0-9]`); de una clase de letras se toma la primera
 * («intens[oa]» → «intenso»), y una letra opcional da las dos formas
 * («tests?» → «test» y «tests»).
 */
export function wordsOf(sources: readonly (string | RegExp)[]): string[] {
  return sources.flatMap((source) => {
    const text = plain(typeof source === 'string' ? source : source.source)
      .replace(/\\[a-z]/g, ' ')
      .replace(/\[\^[^\]]*\]/g, ' ')
      .replace(/\[([a-z])[^\]]*\]/g, '$1')
    const forms = text.includes('?') ? [text.replace(/([a-z])\?/g, '$1'), text.replace(/[a-z]\?/g, '')] : [text]
    return forms.flatMap((form) => form.split(/[^a-z]+/).filter((word) => word.length > 0))
  })
}

export function buildVocabulary(words: readonly string[]): SpellingVocabulary {
  const set = new Set(words.map(plain).filter((word) => word.length > 0))
  const bySound = new Map<string, string[]>()
  for (const word of set) {
    if (word.length < 3) continue
    const key = soundOf(word)
    bySound.set(key, [...(bySound.get(key) ?? []), word])
  }
  return { words: set, bySound }
}

/** Palabras de 7 letras o más: las únicas que admiten cualquier edición de una letra. */
const MIN_EDIT_LENGTH = 7
/** Desde 4 letras se compara cómo suenan. */
const MIN_SOUND_LENGTH = 4

/** `true` si `a` y `b` solo se diferencian en dos letras seguidas cruzadas. */
function swapApart(a: string, b: string): boolean {
  return a.length === b.length && oneEditApart(a, b) && [...a].sort().join('') === [...b].sort().join('')
}

/** Qué diferencia de una letra se admite entre lo escrito y un candidato, según el largo. */
function closeEnough(word: string, candidate: string): boolean {
  if (word.length >= MIN_EDIT_LENGTH) return candidate.length >= MIN_EDIT_LENGTH - 1 && oneEditApart(word, candidate)
  if (word.length === 6 && candidate.length === 7 && oneEditApart(word, candidate)) return true
  return word.length >= 5 && swapApart(word, candidate)
}

function correctWord(word: string, vocabulary: SpellingVocabulary): string | null {
  if (Object.hasOwn(CHAT_SHORTHANDS, word)) return CHAT_SHORTHANDS[word]
  if (vocabulary.words.has(word)) return null
  // Ya se reconoce por su principio: una forma de una palabra conocida, no una falta.
  for (let end = word.length - 1; end >= 4; end -= 1) {
    if (vocabulary.words.has(word.slice(0, end))) return null
  }

  if (word.length >= MIN_SOUND_LENGTH) {
    const same = vocabulary.bySound.get(soundOf(word)) ?? []
    if (same.length === 1) return same[0]
    if (same.length > 1) return null
  }

  const near: string[] = []
  for (const candidate of vocabulary.words) {
    if (closeEnough(word, candidate)) near.push(candidate)
    if (near.length > 1) return null
  }
  return near[0] ?? null
}

/**
 * El mensaje con las faltas corregidas hacia el vocabulario de AXIS.
 *
 * Solo cambian las palabras corregidas; la puntuación, los signos de
 * interrogación y las cifras quedan como estaban, porque también los miran los
 * detectores. Una palabra con cifras («3x10») no se toca.
 */
export function correctSpelling(message: string, vocabulary: SpellingVocabulary): string {
  return message.replace(/[\p{L}\p{N}]+/gu, (token) => {
    if (/\d/.test(token)) return token
    return correctWord(plain(token), vocabulary) ?? token
  })
}
