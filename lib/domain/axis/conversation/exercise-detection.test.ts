/**
 * AXIS resuelve por qué ejercicio se pregunta (D-020).
 *
 * Determinista y sacado solo del catálogo: nombre completo, palabras del nombre
 * y las cadenas de regresión. Sin alias por ejercicio ni modelo de lenguaje.
 * Tres resultados: encontrado, ambiguo (AXIS pregunta cuál) o no encontrado.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG, findExercise } from '../../workouts/catalog'
import type { Exercise } from '../../workouts/types'
import type { AxisBriefing } from '../briefing'
import { benefitsFromAi } from './ai'
import { answerFromBriefing } from './deterministic'
import { detectExercise, exerciseWords, matchIntent, resolveExercise, type ExerciseResolution } from './intents'

function resolved(question: string, catalog?: readonly Exercise[]): string {
  const result: ExerciseResolution = resolveExercise(question, catalog)
  if (result.kind === 'found') return result.exercise.id
  if (result.kind === 'ambiguous') return `ambiguo:${result.options.map((item) => item.id).join('|')}`
  return result.query === null ? 'ninguno' : `no-catalogo:${result.query}`
}

// ---------------------------------------------------------------------------
// Encontrados
// ---------------------------------------------------------------------------

test('cada ejercicio del catálogo se reconoce por su nombre completo', () => {
  for (const exercise of EXERCISE_CATALOG) {
    const question = `¿Cómo se hace ${exercise.name.toLowerCase()}?`
    assert.equal(matchIntent(question).intent, 'exercise', question)
    assert.equal(resolved(question), exercise.id, question)
  }
})

test('nombres parciales: las palabras que distinguen un ejercicio bastan', () => {
  const cases: [string, string][] = [
    ['¿Cómo hago el press de suelo?', 'press-suelo-unilateral'],
    ['¿Cómo hago el press de hombro?', 'press-hombro-unilateral'],
    ['¿Cómo hago el curl martillo?', 'curl-martillo-unilateral'],
    ['¿Cómo hago la flexión pica?', 'flexion-pica'],
    ['¿Cómo hago el pullover?', 'pullover-con-pesa'],
    ['¿Cómo hago el hip thrust?', 'hip-thrust-con-pesa'],
    ['¿Cómo hago el peso muerto?', 'peso-muerto-unilateral'],
    ['¿Cómo hago la subida al escalón?', 'subida-escalon'],
    ['¿Cómo hago la plancha con toque de hombro?', 'plancha-toque-hombro'],
    ['¿Cómo hago el toque de hombro?', 'plancha-toque-hombro'],
    ['¿Cómo hago el flexor de cadera?', 'estiramiento-flexor-cadera'],
    ['¿Cómo hago el gato camello?', 'gato-camello'],
    ['¿Cómo hago los gemelos a una pierna?', 'elevacion-gemelos-una-pierna'],
  ]
  for (const [question, id] of cases) assert.equal(resolved(question), id, question)
})

test('nombrar la variante lleva a la variante, nunca al básico', () => {
  const cases: [string, string][] = [
    ['¿Cómo hago la sentadilla isométrica?', 'sentadilla-isometrica-pared'],
    ['¿Cómo hago la sentadilla en pared?', 'sentadilla-isometrica-pared'],
    ['¿Cómo hago el puente con talones?', 'puente-talones-silla'],
    ['¿Cómo hago el puente con talones en silla?', 'puente-talones-silla'],
    ['¿Cómo hago las flexiones diamante?', 'flexiones-diamante'],
    ['¿Cómo hago la zancada búlgara?', 'zancada-bulgara'],
    ['¿Cómo hago el remo renegado?', 'remo-renegado'],
  ]
  for (const [question, id] of cases) assert.equal(resolved(question), id, question)
})

test('nombrar solo el núcleo lleva al básico de la familia', () => {
  const cases: [string, string][] = [
    ['¿Cómo hago el puente?', 'puente-gluteos'], // base de la cadena de regresión
    ['¿Cómo hago el remo?', 'remo-unilateral'], // el renegado regresa a él
    ['¿Cómo hago la elevación?', 'elevacion-gemelos'],
    ['¿Cómo hago la sentadilla?', 'sentadilla'],
    ['¿Cómo hago la plancha?', 'plancha'],
    ['¿Cómo hago una flexión?', 'flexiones'], // el único que se nombra entero
    ['¿Cómo hago flexiones?', 'flexiones'],
    ['¿Cómo hago la zancada?', 'zancadas'],
  ]
  for (const [question, id] of cases) assert.equal(resolved(question), id, question)
})

test('acentos, mayúsculas, plurales y guiones no cambian el resultado', () => {
  assert.equal(resolved('¿Qué músculos trabajan las sentadillas?'), 'sentadilla')
  assert.equal(resolved('¿CÓMO HAGO EL HIP THRUST?'), 'hip-thrust-con-pesa')
  assert.equal(resolved('¿Cómo hago el gato-camello?'), 'gato-camello')
  assert.equal(resolved('¿Cómo hago el y-t-w?'), 'ytw-boca-abajo')
})

// ---------------------------------------------------------------------------
// Colisiones: ambiguo, AXIS pregunta cuál
// ---------------------------------------------------------------------------

test('con la misma evidencia y sin relación entre ellos, es ambiguo', () => {
  assert.equal(resolved('¿Cómo hago el press?'), 'ambiguo:press-hombro-unilateral|press-suelo-unilateral')
  assert.equal(resolved('¿Cómo hago el press unilateral?'), 'ambiguo:press-hombro-unilateral|press-suelo-unilateral')
  assert.equal(resolved('¿Cómo hago el curl?'), 'ambiguo:curl-biceps-unilateral|curl-martillo-unilateral')
})

test('ambiguo se responde preguntando cuál, de forma determinista y sin pasar por el modelo', () => {
  const answer = answerFromBriefing('¿Cómo hago el press?', {} as AxisBriefing)
  assert.equal(
    answer.text,
    '¿Te refieres a «Press de hombro unilateral» o a «Press de suelo unilateral con pesa»?',
  )
  assert.equal(answer.unknown, true)
  assert.equal(benefitsFromAi(answer.intent), false, 'un modelo no elige por el usuario')
})

// ---------------------------------------------------------------------------
// No encontrado
// ---------------------------------------------------------------------------

test('preguntar por un ejercicio que no está en el catálogo se dice tal cual', () => {
  for (const question of ['¿Cómo hago el press banca?', '¿Cómo se hace el burpee?', '¿Qué trabaja el press militar?']) {
    assert.ok(resolved(question).startsWith('no-catalogo:'), question)
    const answer = answerFromBriefing(question, {} as AxisBriefing)
    assert.equal(answer.text, 'No tengo ese ejercicio en tu catálogo.', question)
    assert.equal(benefitsFromAi(answer.intent), false, question)
  }
})

test('una palabra secundaria o un descriptor sueltos no inventan un ejercicio', () => {
  for (const question of ['hombro', '¿y la pierna?', 'pared', 'cadera', 'con pesa', 'unilateral']) {
    assert.equal(resolved(question), 'ninguno', question)
    assert.notEqual(matchIntent(question).intent, 'exercise', question)
  }
})

test('«cómo hago para…» no es preguntar por un ejercicio', () => {
  assert.equal(resolved('¿Cómo hago para dormir mejor?'), 'ninguno')
})

// ---------------------------------------------------------------------------
// Los intents prioritarios van antes
// ---------------------------------------------------------------------------

test('médico, hoy, recuperación, deporte o por qué no se convierten en pregunta de ejercicio', () => {
  const cases: [string, string][] = [
    ['¿Me duele el hombro haciendo press?', 'medical'],
    ['¿Qué hago hoy?', 'today'],
    ['¿Cómo está mi recuperación?', 'recovery'],
    ['¿Tengo partido hoy?', 'sport_today'],
    ['¿Por qué me recomiendas este entrenamiento?', 'why'],
  ]
  for (const [question, intent] of cases) assert.equal(matchIntent(question).intent, intent, question)
})

test('el ejercicio se resuelve una vez y la respuesta reutiliza esa resolución', () => {
  const match = matchIntent('¿Cómo hago el press de suelo?')
  assert.equal(match.intent, 'exercise')
  assert.equal(match.exercise?.kind, 'found')
  if (match.exercise?.kind === 'found') assert.equal(match.exercise.exercise.id, 'press-suelo-unilateral')
})

test('`detectExercise` solo devuelve un ejercicio cuando no hay dudas', () => {
  assert.equal(detectExercise('¿Cómo hago el press de suelo?')?.id, 'press-suelo-unilateral')
  assert.equal(detectExercise('¿Cómo hago el press?'), null)
  assert.equal(detectExercise('¿Cómo hago el press banca?'), null)
})

// ---------------------------------------------------------------------------
// El resolvedor crece con el catálogo sin excepciones
// ---------------------------------------------------------------------------

test('con un catálogo futuro, «unilateral» y «pesa» distinguen variantes sin ninguna regla especial', () => {
  const base = findExercise('curl-biceps-unilateral')!
  const make = (id: string, name: string, regressionId: string | null = null): Exercise => ({
    ...base,
    id,
    name,
    regressionId,
    progressionId: null,
  })
  const future: Exercise[] = [
    make('curl-biceps', 'Curl de bíceps'),
    make('curl-biceps-uni', 'Curl de bíceps unilateral'),
    make('remo-pesa', 'Remo con pesa'),
    make('remo-uni-pesa', 'Remo unilateral con pesa', 'remo-pesa'),
    make('press-hombro', 'Press de hombro'),
    make('press-hombro-uni', 'Press de hombro unilateral', 'press-hombro'),
  ]

  const cases: [string, string][] = [
    ['¿Cómo hago el curl de bíceps?', 'curl-biceps'],
    ['¿Cómo hago el curl de bíceps unilateral?', 'curl-biceps-uni'],
    ['¿Cómo hago el curl unilateral?', 'curl-biceps-uni'],
    ['¿Cómo hago el curl?', 'ambiguo:curl-biceps|curl-biceps-uni'], // sin relación declarada
    ['¿Cómo hago el remo con pesa?', 'remo-pesa'],
    ['¿Cómo hago el remo unilateral?', 'remo-uni-pesa'],
    ['¿Cómo hago el remo?', 'remo-pesa'], // la variante regresa a él
    ['¿Cómo hago el press de hombro?', 'press-hombro'],
    ['¿Cómo hago el press unilateral?', 'press-hombro-uni'],
    ['¿Cómo hago el press?', 'press-hombro'],
  ]
  for (const [question, id] of cases) assert.equal(resolved(question, future), id, question)
})

test('las palabras se comparan igual en la pregunta y en los nombres', () => {
  assert.deepEqual(exerciseWords('Elevación de gemelos a una pierna'), ['elevacion', 'gemelo', 'pierna'])
  assert.deepEqual(exerciseWords('Y-T-W boca abajo'), ['ytw', 'boca', 'abajo'])
  assert.deepEqual(exerciseWords('Gato-camello'), ['gato', 'camello'])
})
