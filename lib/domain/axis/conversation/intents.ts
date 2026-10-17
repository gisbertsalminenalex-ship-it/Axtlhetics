/**
 * Detección de intención.
 *
 * Coincidencia por palabras clave, deliberadamente explícita: se puede leer y
 * discutir. No pretende entender lenguaje natural — pretende no equivocarse en lo
 * que AXIS sabe responder y admitir el resto.
 *
 * Dos cosas la hacen algo más que una lista de `if`:
 *
 * 1. Reconoce **temas** («piernas», «tren superior») además de intenciones, para
 *    poder responder a «¿y por qué no piernas?».
 * 2. Usa la **última intención** como contexto, de modo que una pregunta corta de
 *    seguimiento se resuelve contra lo último que se habló.
 */

import { EXERCISE_CATALOG } from '../../workouts/catalog'
import type { Exercise } from '../../workouts/types'
import { FOCUS_TERMS, type SessionFocus } from '../knowledge/focus'
import { SPORT_TERMS } from '../knowledge/sports'
import type { AxisIntent } from './types'

type IntentRule = {
  intent: AxisIntent
  any: readonly string[]
  /** Si se indica, además debe aparecer alguno de estos. */
  and?: readonly string[]
}

/** El orden importa: la primera regla que encaja gana. Las más específicas, antes. */
const RULES: readonly IntentRule[] = [
  // Fuera de ámbito antes que nada: cortar pronto lo que no es de AXTHLETICS.
  {
    intent: 'out_of_scope',
    any: ['capital de', 'quien es', 'quién es', 'que tiempo hace', 'receta', 'pelicula', 'película', 'traduce', 'noticia'],
  },
  {
    intent: 'medical',
    any: ['lesion', 'lesión', 'me duele', 'dolor', 'molest', 'medico', 'médico', 'fisio', 'estoy enfermo', 'rodilla', 'hombro me'],
  },

  // Antes que 'change': preguntar qué se cambió no es pedir otro cambio.
  {
    intent: 'changed',
    any: ['que hemos cambiado', 'qué hemos cambiado', 'que cambiamos', 'qué cambiamos', 'que has cambiado', 'qué has cambiado', 'por que lo cambiamos', 'por qué lo cambiamos', 'que cambiaste', 'qué cambiaste', 'lo hemos cambiado'],
  },
  { intent: 'change', any: ['cambiar', 'cambia', 'otra sesion', 'otra sesión', 'otro entrenamiento', 'algo distinto', 'algo diferente'] },
  { intent: 'shorten', any: ['20 minutos', '15 minutos', '10 minutos', 'media hora', 'mas corto', 'más corto', 'menos tiempo', 'poco tiempo', 'solo hago', 'solo tengo'] },

  { intent: 'tired', any: ['cansado', 'cansada', 'fatigado', 'fatigada', 'agotado', 'agotada', 'reventado', 'sin fuerzas', 'hecho polvo', 'no puedo mas', 'no puedo más'] },

  { intent: 'factors', any: ['tienes en cuenta', 'has tenido en cuenta', 'como decides', 'cómo decides', 'en que te basas', 'en qué te basas', 'que miras', 'qué miras'] },

  { intent: 'why_not', any: ['por que no', 'porque no', 'por qué no', 'y no ', 'en vez de', 'en lugar de'] },
  { intent: 'why', any: ['por que', 'porque', 'por qué', 'razon', 'razón', 'explica', 'motivo', 'has elegido', 'elegiste'] },

  { intent: 'can_train', any: ['puedo entrenar', 'deberia entrenar', 'debería entrenar', 'tiene sentido entrenar', 'aunque tenga', 'aunque tengo'] },

  { intent: 'sport_impact', any: ['afecta', 'influye', 'condiciona'] },
  // Los nombres de deporte salen del conocimiento compartido con la negociación:
  // si AXIS entiende «básquet» al negociar, también lo entiende al clasificar.
  { intent: 'sport_today', any: ['deporte', 'partido', 'entreno de', 'actividad', ...SPORT_TERMS] },

  { intent: 'last_session', any: ['ultimo', 'último', 'ayer', 'anterior', 'hice', 'entrene', 'entrené'] },
  { intent: 'week', any: ['semana', 'progres', 'evolucion', 'evolución', 'llevo', 'racha'] },
  { intent: 'load', any: ['carga', 'acumulad', 'volumen'] },

  {
    intent: 'recovery',
    any: ['recuper', 'recovery', 'descans', 'sueño', 'sueno', 'dormid', 'fatiga', 'energia', 'energía', 'estres', 'estrés', 'hidrat'],
  },

  { intent: 'goals', any: ['objetivo', 'meta', 'priorizar', 'prioridad'] },

  {
    intent: 'today',
    any: ['hoy', 'ahora', 'deberia', 'debería', 'toca', 'entreno', 'entrenar', 'sesion', 'sesión', 'que hago', 'qué hago'],
  },
]

/**
 * Normaliza para que acentos, mayúsculas y puntuación no cambien el resultado.
 *
 * La apertura de interrogación importa: sin quitarla, «¿y eso?» no empieza por
 * «y eso» y las preguntas de seguimiento no se reconocerían.
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[¿¡"'\s]+/, '')
    .replace(/[?!."'\s]+$/, '')
    .trim()
}

/** Preguntas de seguimiento muy cortas: «¿y por qué?», «¿y eso?», «¿por qué no?». */
const FOLLOW_UP_MARKERS = ['y por que', 'y eso', 'y entonces', 'y si', 'por que no', 'y ademas']

export type IntentMatch = {
  intent: AxisIntent
  /** Foco mencionado explícitamente por el usuario, si lo hay. */
  focus: SessionFocus | null
  /** `true` si la pregunta se apoya en lo dicho justo antes. */
  isFollowUp: boolean
  /**
   * El ejercicio por el que se pregunta, resuelto una sola vez. Solo cuando el
   * intent es `exercise`: la respuesta lo reutiliza en vez de volver a buscarlo.
   */
  exercise?: ExerciseResolution
}

/**
 * Qué ejercicio del catálogo nombra una pregunta.
 *
 * - `found`: uno, sin dudas.
 * - `ambiguous`: varios con la misma evidencia y ninguno es la base de los
 *   demás. AXIS pregunta cuál, no adivina.
 * - `not_found`: ninguno. `query` es lo que se preguntaba si la pregunta tenía
 *   forma de preguntar por un ejercicio («¿cómo hago el press banca?»), o `null`
 *   si no la tenía: entonces no es una pregunta de ejercicios.
 */
export type ExerciseResolution =
  | { kind: 'found'; exercise: Exercise }
  | { kind: 'ambiguous'; options: Exercise[] }
  | { kind: 'not_found'; query: string | null }

/**
 * `true` si `term` aparece como palabra (o principio de palabra) en `text`.
 *
 * Por principio de palabra y no por subcadena: «core» está dentro de «score» y
 * «Recovery Score» no es una pregunta sobre el core. «pierna» sí debe encontrar
 * «piernas».
 */
function includesWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}`).test(text)
}

export function detectFocus(question: string): SessionFocus | null {
  const text = normalizeQuestion(question)
  for (const entry of FOCUS_TERMS) {
    if (entry.terms.some((term) => includesWord(text, normalizeQuestion(term)))) {
      return entry.focus
    }
  }
  return null
}

/** Saludos y muletillas con las que suele empezar un mensaje; no cambian lo que pide. */
const GREETINGS = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'oye', 'axis', 'una pregunta', 'pregunta']

/** Con qué empieza una pregunta informativa. */
const QUESTION_OPENERS = [
  'que ', 'para que', 'por que', 'como ', 'cuanto', 'cuanta', 'cual', 'cuales', 'donde',
  'cuando', 'quien', 'es cierto', 'es verdad', 'es bueno', 'es malo', 'sirve', 'me explicas',
  'explicame', 'puedes explicar', 'sabes ',
]

/**
 * `true` si el mensaje tiene forma de pregunta, no de petición.
 *
 * Lo decide la forma —signos de interrogación o un arranque interrogativo tras
 * el saludo—, no el tema: «¿qué músculos trabajan las sentadillas?» es una
 * pregunta aunque nombre piernas; «hoy piernas no» es una petición aunque no
 * lleve verbo.
 */
export function looksLikeQuestion(question: string): boolean {
  if (/[?¿]/.test(question)) return true

  let text = normalizeQuestion(question)
  let stripped = true
  while (stripped) {
    stripped = false
    for (const greeting of GREETINGS) {
      if (text.startsWith(greeting)) {
        text = text.slice(greeting.length).replace(/^[\s,.!;:]+/, '')
        stripped = true
      }
    }
  }
  return QUESTION_OPENERS.some((opener) => text.startsWith(opener))
}

/**
 * Con qué se pide algo, aunque vaya entre signos de interrogación.
 *
 * Las últimas no son verbos de pedir sino límites que se cuentan —«tengo menos
 * tiempo hoy»— y que piden lo mismo que «hazme algo más corto» sin decirlo.
 */
const REQUEST_MARKERS = [
  'podemos', 'puedes', 'puedo', 'podrias', 'quiero', 'prefiero', 'hazme', 'ponme', 'dame',
  'cambia', 'me apetece', 'no hacer', 'evitar', 'saltar', 'dejar', 'mejor hacer', 'y si hago',
  'tengo menos tiempo', 'tengo poco tiempo', 'no me da tiempo', 'voy justo',
]

/**
 * `true` si el mensaje pide algo. «¿Podemos no hacer piernas?» es una
 * petición aunque lleve interrogación; «¿qué músculos trabajan las
 * sentadillas?» no pide nada.
 */
export function looksLikeRequest(question: string): boolean {
  const text = normalizeQuestion(question)
  return REQUEST_MARKERS.some((marker) => includesWord(text, marker))
}

/**
 * Pedir más tiempo, no menos.
 *
 * Una cifra suelta es un límite: «solo tengo 15 minutos». Con «más», «extra» o
 * un «+» delante es lo contrario: «15 minutos más». Las cifras se leían siempre
 * como acortar, y AXIS contestaba a quien pedía más que no tenía una versión
 * más corta. Por eso esto se mira antes que cualquier término de acortar.
 *
 * «Más» a secas no basta: «más intensidad» o «más volumen» piden otra cosa.
 */
const MORE_TIME_TERMS = ['mas larga', 'mas largo', 'mas tiempo', 'mas rato', 'alarg']
const MORE_MINUTES_PATTERNS: readonly RegExp[] = [
  /\+\s*\d+\s*min/, // «+15 min»
  /\d+\s*min(uto)?s?\s+(de\s+)?(mas|extra)\b/, // «15 minutos más», «10 minutos extra»
  /\banad\w*\b[^.,;]*\d+\s*min/, // «añade 10 minutos»
]

/**
 * «No tengo más tiempo» o «no quiero una sesión más larga» dicen lo contrario.
 * Cuenta como negada si hay un «no» antes dentro del mismo tramo de frase: sin
 * una coma ni un punto de por medio, para que «no tengo partido, quiero más
 * tiempo» siga siendo pedir más.
 */
function negatedBefore(text: string, at: number): boolean {
  return /\bno\b[^,.;]*$/.test(text.slice(0, at))
}

export function asksForMoreTime(question: string): boolean {
  const text = normalizeQuestion(question)
  const patterns = [
    ...MORE_TIME_TERMS.map((term) => new RegExp(`(^|[^a-z0-9])${term}`)),
    ...MORE_MINUTES_PATTERNS,
  ]
  return patterns.some((pattern) => {
    const found = pattern.exec(text)
    return found !== null && !negatedBefore(text, found.index)
  })
}

// ---------------------------------------------------------------------------
// Resolución de ejercicios (D-020)
//
// Determinista y sacada solo del catálogo: sin alias, sin excepciones por
// ejercicio y sin modelo de lenguaje. Que el catálogo crezca no obliga a tocarla.
// ---------------------------------------------------------------------------

/** Palabras que no identifican nada: artículos, preposiciones, conjunciones. */
const NAME_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por',
  'sin', 'sobre', 'u', 'un', 'una', 'unas', 'uno', 'unos', 'y',
])

/**
 * El nombre de cada ejercicio como frase: sus palabras seguidas, con plurales
 * sencillos y cualquier artículo o preposición entre ellas («flexión de
 * rodillas», «flexiones con las rodillas»). Las palabras sueltas y separadas no
 * son el nombre: «las rodillas me molestan con las flexiones» no lo contiene.
 * Del nombre más largo al más corto, para que «Flexiones» no se coma el
 * principio de «Flexiones con rodillas».
 */
const EXERCISE_NAME_PATTERNS: readonly RegExp[] = [...EXERCISE_CATALOG]
  .sort((a, b) => b.name.length - a.name.length)
  .map((exercise) => {
    const words = normalizeQuestion(exercise.name)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 0 && !NAME_STOPWORDS.has(word))
    const between = `(?:[^a-z0-9]+(?:${[...NAME_STOPWORDS].join('|')}))*[^a-z0-9]+`
    const body = words
      .map((word) => `${word.length >= 4 ? word.replace(/(es|s)$/, '') : word}(?:es|s)?`)
      .join(between)
    return new RegExp(`(^|[^a-z0-9])${body}(?![a-z0-9])`, 'g')
  })

/**
 * El texto sin los nombres de ejercicio que contiene. Lo usa la regla médica:
 * «rodilla» en «flexiones con rodillas» es el nombre de un ejercicio, no una
 * molestia (D-025). Lo dicho fuera del nombre sigue contando: «me duele la
 * rodilla con las flexiones con rodillas» es médico.
 */
function withoutExerciseNames(text: string): string {
  return EXERCISE_NAME_PATTERNS.reduce((rest, pattern) => rest.replace(pattern, '$1 '), text)
}

/** Con más candidatos igual de probables, la pregunta es demasiado vaga para preguntar «¿cuál?». */
const MAX_AMBIGUOUS_OPTIONS = 3

/**
 * Las palabras significativas de un texto, en la forma en que se comparan.
 *
 * Sin acentos ni mayúsculas. Los guiones entre letras sueltas se unen («y-t-w»
 * → «ytw»); los demás separan («gato-camello» → «gato camello»). Los plurales
 * sencillos se quitan para que «gemelos» encuentre «gemelo» y «talones»,
 * «talón». Se aplica igual a la pregunta y a los nombres: lo que importa es que
 * los dos lados queden iguales, no que la palabra sea correcta.
 */
export function exerciseWords(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b[a-z](?:-[a-z]\b)+/g, (letters) => letters.replace(/-/g, ''))
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !NAME_STOPWORDS.has(word))
    .map((word) => (word.length >= 4 ? word.replace(/(es|s)$/, '') : word))
}

/** `true` si `variant` llega a `base` bajando por su cadena de regresiones. */
function regressesTo(variant: Exercise, base: Exercise, catalog: readonly Exercise[]): boolean {
  let current: Exercise | undefined = variant
  for (let step = 0; step < catalog.length && current; step += 1) {
    if (current.regressionId === null) return false
    if (current.regressionId === base.id) return true
    current = catalog.find((exercise) => exercise.id === current!.regressionId)
  }
  return false
}

/**
 * Qué se pregunta cuando la pregunta tiene forma de preguntar por un ejercicio:
 * «cómo hago / cómo se hace / qué trabaja / para qué sirve» + artículo + algo.
 * El artículo es lo que separa «¿cómo hago el press banca?» de «¿cómo hago para
 * dormir mejor?».
 */
const EXERCISE_QUESTION =
  /^(?:como (?:se )?(?:hago|hace|hacen|hacer|realizo|realiza|ejecuto|ejecuta)|que (?:musculos )?trabajan?|para que sirven?|en que consisten?) (?:el|la|los|las|un|una|unos|unas) (.+)$/

function exerciseQuestionQuery(question: string): string | null {
  const text = normalizeQuestion(question).replace(/[?!.]+$/, '').trim()
  return EXERCISE_QUESTION.exec(text)?.[1]?.trim() ?? null
}

/**
 * El ejercicio que nombra una pregunta (D-020).
 *
 * 1. **Nombre completo** en la pregunta: gana, y si hay varios, el más largo
 *    («flexiones diamante» antes que «flexiones»).
 * 2. **Por palabras**: es candidato quien tenga en la pregunta su primera
 *    palabra significativa (el núcleo: «press», «puente», «hip») o al menos dos
 *    de sus palabras. Una palabra secundaria suelta («hombro», «pared») no basta.
 * 3. Gana quien más palabras suyas tenga en la pregunta. Si empatan varios:
 *    - el único que la pregunta nombra entero («flexión» → «Flexiones»);
 *    - si no, la base de la familia: el ejercicio al que regresan todos los
 *      demás según el catálogo («puente» → «Puente de glúteos», del que regresa
 *      «Puente con talones en silla»);
 *    - si no, es ambiguo y se pregunta («press» → ¿de hombro o de suelo?).
 *
 * Todas las palabras del nombre cuentan, también «unilateral» o «pesa»: son lo
 * que distingue «Curl de bíceps» de «Curl de bíceps unilateral».
 */
export function resolveExercise(
  question: string,
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
): ExerciseResolution {
  const text = normalizeQuestion(question)
  const byLength = [...catalog].sort((a, b) => b.name.length - a.name.length)
  const fullName = byLength.find((exercise) => includesWord(text, normalizeQuestion(exercise.name))) ?? null

  const asked = new Set(exerciseWords(question))
  const scored = catalog
    .map((exercise) => {
      const words = [...new Set(exerciseWords(exercise.name))]
      const matched = words.filter((word) => asked.has(word))
      return { exercise, words, matched }
    })
    .filter(({ words, matched }) => words.length > 0 && (matched.includes(words[0]) || matched.length >= 2))

  // Sin ejercicio: `query` dice si al menos se preguntaba por uno.
  const query = exerciseQuestionQuery(question)
  const notFound = (): ExerciseResolution => ({ kind: 'not_found', query })

  if (scored.length === 0) return fullName ? { kind: 'found', exercise: fullName } : notFound()

  const best = Math.max(...scored.map((item) => item.matched.length))

  /*
   * El nombre completo manda, salvo que otro ejercicio coincida con más
   * palabras de las que tiene ese nombre: en «sentadilla isométrica» está el
   * nombre «Sentadilla», pero lo que se nombra es «Sentadilla isométrica en
   * pared». En «flexiones diamante» o «elevación de gemelos» nadie lo supera.
   */
  if (fullName && best <= exerciseWords(fullName.name).length) return { kind: 'found', exercise: fullName }

  const top = scored.filter((item) => item.matched.length === best)
  if (top.length === 1) return { kind: 'found', exercise: top[0].exercise }

  const named = top.filter((item) => item.matched.length === item.words.length)
  if (named.length === 1) return { kind: 'found', exercise: named[0].exercise }

  const base = top.find((candidate) =>
    top.every((other) => other === candidate || regressesTo(other.exercise, candidate.exercise, catalog)),
  )
  if (base) return { kind: 'found', exercise: base.exercise }

  /*
   * Antes de preguntar «¿cuál?»: si se preguntaba por un ejercicio y nombra
   * algo que ninguna de las opciones tiene («press banca»), no es una duda
   * entre ellas, es uno que no está en el catálogo.
   */
  if (query !== null) {
    const offered = new Set(top.flatMap((item) => item.words))
    if (exerciseWords(query).some((word) => !offered.has(word))) return notFound()
  }

  if (top.length <= MAX_AMBIGUOUS_OPTIONS) {
    return { kind: 'ambiguous', options: top.map((item) => item.exercise) }
  }
  return notFound()
}

/** El ejercicio que nombra el mensaje, solo si no hay dudas. */
export function detectExercise(question: string, catalog: readonly Exercise[] = EXERCISE_CATALOG): Exercise | null {
  const resolution = resolveExercise(question, catalog)
  return resolution.kind === 'found' ? resolution.exercise : null
}

export function detectIntent(question: string, previous: AxisIntent | null = null): AxisIntent {
  return matchIntent(question, previous).intent
}

export function matchIntent(
  question: string,
  previous: AxisIntent | null = null,
): IntentMatch {
  const text = normalizeQuestion(question)
  const focus = detectFocus(question)
  const isFollowUp = FOLLOW_UP_MARKERS.some((marker) => text.startsWith(marker))

  if (text.length === 0) return { intent: 'unknown', focus, isFollowUp: false }

  for (const rule of RULES) {
    // Una parte del cuerpo dentro del nombre de un ejercicio no es una molestia.
    const haystack = rule.intent === 'medical' ? withoutExerciseNames(text) : text
    const matchesAny = rule.any.some((term) => haystack.includes(normalizeQuestion(term)))
    if (!matchesAny) continue
    if (rule.and && !rule.and.some((term) => text.includes(normalizeQuestion(term)))) continue

    // «15 minutos más» nombra una cifra de acortar, pero pide lo contrario.
    if (rule.intent === 'shorten' && asksForMoreTime(question)) continue

    // «¿Y por qué no piernas?» es un «por qué no» con foco, no un «por qué» suelto.
    if (rule.intent === 'why' && focus !== null) {
      return { intent: 'why_not', focus, isFollowUp }
    }
    return { intent: rule.intent, focus, isFollowUp }
  }

  /*
   * Preguntar por un ejercicio se responde con el catálogo. Va después de las
   * reglas: «me duele el hombro» es médico aunque «hombro» esté en un nombre.
   * Se resuelve aquí una sola vez y la respuesta reutiliza el resultado. Es
   * pregunta de ejercicio si hay ejercicio, si hay dudas sobre cuál, o si tiene
   * la forma de una y no está en el catálogo.
   */
  const exercise = resolveExercise(question)
  if (exercise.kind !== 'not_found' || exercise.query !== null) {
    return { intent: 'exercise', focus, isFollowUp, exercise }
  }

  // Nada ha encajado. Si es un seguimiento corto, se hereda el tema anterior.
  if (isFollowUp && previous) {
    return { intent: previous === 'today' ? 'why' : previous, focus, isFollowUp }
  }

  // Mencionar solo un grupo muscular tras hablar de la sesión es preguntar por él.
  if (focus !== null && previous !== null) {
    return { intent: 'why_not', focus, isFollowUp }
  }

  return { intent: 'unknown', focus, isFollowUp }
}
