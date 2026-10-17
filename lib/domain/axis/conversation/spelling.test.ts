/**
 * Tolerancia a faltas del chat de AXIS (D-026): el mensaje se corrige una vez,
 * al entrar, hacia el vocabulario que AXIS ya reconoce. Lo que ya se entendía
 * no cambia, y una molestia mal escrita sigue llevando a la respuesta segura.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { matchIntent } from './intents'
import { buildVocabulary, correctSpelling, oneEditApart, soundOf, wordsOf } from './spelling'
import { AXIS_WORDS, understandMessage } from './understand'

const intentOf = (message: string) => matchIntent(understandMessage(message)).intent

test('suenan igual: ll/y, c/s/z, qu/k, b/v, h muda y «-ao» por «-ado»', () => {
  assert.equal(soundOf('rodiya'), soundOf('rodilla'))
  assert.equal(soundOf('recuperasion'), soundOf('recuperación'))
  assert.equal(soundOf('kiero'), soundOf('quiero'))
  assert.equal(soundOf('cansao'), soundOf('cansado'))
  assert.equal(soundOf('aser'), soundOf('hacer'))
  assert.notEqual(soundOf('hombre'), soundOf('hombro'))
})

test('una edición: letra cambiada, quitada, de más o dos cruzadas', () => {
  assert.ok(oneEditApart('entrenamieto', 'entrenamiento'))
  assert.ok(oneEditApart('flexones', 'flexiones'))
  assert.ok(oneEditApart('pirenas', 'piernas'))
  assert.ok(oneEditApart('hombre', 'hombro'))
  assert.ok(!oneEditApart('piernas', 'piernas'))
  assert.ok(!oneEditApart('semana', 'semanal y'))
})

test('las faltas habituales se corrigen y AXIS entiende lo mismo que bien escrito', () => {
  const cases: [string, string, string][] = [
    ['porqe hoy piernas', 'por que hoy piernas', 'why_not'],
    ['xq hoy piernas', 'por que hoy piernas', 'why_not'],
    ['estoy cansao', 'estoy cansado', 'tired'],
    ['toy reventao', 'estoy reventado', 'tired'],
    ['como se hace la sentadiya', 'como se hace la sentadilla', 'exercise'],
    ['como hago las flexones', 'como hago las flexiones', 'exercise'],
    ['k me toca oy', 'que me toca hoy', 'today'],
    ['como va mi semnaa', 'como va mi semana', 'week'],
    ['mañana tengo partdo', 'mañana tengo partido', 'sport_today'],
    ['que tal el entrenamieto de ayer', 'que tal el entrenamiento de ayer', 'last_session'],
  ]
  for (const [written, corrected, intent] of cases) {
    assert.equal(understandMessage(written), corrected, written)
    assert.equal(intentOf(written), intent, written)
  }
})

test('lo que ya se entendía, o no es una falta, no cambia', () => {
  for (const message of [
    '¿Por qué hoy piernas?',
    'hombre, me apetece entrenar', // «hombre» no es «hombro»: palabra corta
    'estoy tranquilo hoy', // empieza por un término conocido
    'lo ves claro?', // «ves» y «vez» suenan igual, pero son de 3 letras
    'hice 3x10 ayer', // con cifras no se toca
    'ayer jugué al pádel',
    'quiero entrenar con mi hermano',
    'tengo baloncesto a las 18:00',
  ]) {
    assert.equal(understandMessage(message), message, message)
  }
})

test('corregir dos veces da lo mismo que una', () => {
  for (const message of ['porqe hoy piernas', 'toy reventao', 'como se hace la sentadiya', 'k me toca oy']) {
    const once = understandMessage(message)
    assert.equal(understandMessage(once), once, message)
  }
})

test('una molestia mal escrita sigue llevando a la respuesta segura', () => {
  for (const message of [
    'me duel el hombro',
    'me dolió el hombro',
    'me duele la rodiya',
    'me duelen las piernas',
    'tengo una lesion en el tobiyo',
    'me molesta la espalda',
  ]) {
    assert.equal(intentOf(message), 'medical', message)
  }
})

test('solo se corrige con un único candidato; el nombre de una actividad del usuario se respeta', () => {
  assert.equal(correctSpelling('mañana tengo partdo', buildVocabulary(['partido'])), 'mañana tengo partido')
  // Dos candidatos igual de cerca: no se adivina.
  assert.equal(correctSpelling('entrenr', buildVocabulary(['entrenar', 'entrene'])), 'entrenr')
  // Si la palabra es del usuario (su deporte), ya está en el vocabulario y no se toca.
  assert.equal(correctSpelling('hoy tengo partida', buildVocabulary(['partido', 'partida'])), 'hoy tengo partida')
})

test('el vocabulario sale de los detectores: test, escáner, reorganización, negociación y catálogo', () => {
  const words = new Set(AXIS_WORDS)
  for (const word of ['cansado', 'partido', 'manana', 'escaner', 'test', 'sentadilla', 'rodillas', 'corto', 'cancelado', 'recuper']) {
    assert.ok(words.has(word), word)
  }
  // De las clases de letras se toma la primera; los escapes no dejan restos.
  assert.deepEqual(wordsOf([/\b(intens[oa]|suave)\w*/]), ['intenso', 'suave'])
})
