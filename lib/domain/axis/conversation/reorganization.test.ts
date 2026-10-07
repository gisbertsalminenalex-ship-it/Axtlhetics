/**
 * Lectura de las frases de reorganización (D-022). Solo se comprueba qué se
 * entiende; qué responde AXIS se prueba en la conversación.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asksToMoveToTomorrow,
  detectBlockReason,
  detectIntensity,
  saysCannotDoPlanned,
  saysCannotTrainToday,
  saysMatchTomorrow,
  saysMissedYesterday,
  saysTooTired,
  statedMinutes,
} from './reorganization'

test('minutos dichos: cifras y duraciones habladas', () => {
  assert.equal(statedMinutes('Hoy solo tengo 20 minutos'), 20)
  assert.equal(statedMinutes('tengo 15 min'), 15)
  assert.equal(statedMinutes('solo tengo media hora'), 30)
  assert.equal(statedMinutes('tengo una hora'), 60)
  assert.equal(statedMinutes('me da para tres cuartos de hora'), 45)
  assert.equal(statedMinutes('tengo 10 minutos'), 10)
})

test('pedir más tiempo o no decir cifra no son minutos dichos', () => {
  assert.equal(statedMinutes('quiero 15 minutos más'), null)
  assert.equal(statedMinutes('+10 min'), null)
  assert.equal(statedMinutes('voy justo de tiempo'), null)
  assert.equal(statedMinutes('quiero una sesión más corta'), null)
})

test('«hoy no puedo entrenar» y sus variantes', () => {
  for (const phrase of [
    'Hoy no puedo entrenar',
    'no voy a poder entrenar hoy',
    'hoy no puedo, tengo un examen',
    'hoy no puedo',
    'no tengo tiempo para entrenar',
    'no me va a dar tiempo a entrenar',
    'imposible entrenar hoy',
  ]) {
    assert.equal(saysCannotTrainToday(phrase), true, phrase)
  }
})

test('«no quiero», «no puedo más», «no puedo hacer…» y mañana no son «hoy no puedo»', () => {
  for (const phrase of [
    'no quiero entrenar',
    'no puedo más',
    'hoy no puedo más',
    'hoy no puedo hacer piernas',
    'no puedo hacer el entrenamiento previsto',
    'mañana no puedo entrenar',
    '¿puedo entrenar?',
  ]) {
    assert.equal(saysCannotTrainToday(phrase), false, phrase)
  }
})

test('mover a mañana', () => {
  for (const phrase of [
    'Quiero mover el entrenamiento de hoy a mañana',
    'muévelo a mañana',
    'déjalo para mañana',
    '¿podemos pasarlo a mañana?',
    'prefiero entrenar mañana en vez de hoy',
    'mejor mañana',
    'aplázalo a mañana',
    // En femenino, «la sesión»: es como lo ofrece AXIS («puedo moverla a mañana»).
    'muévela a mañana',
    'sí, muévela a mañana',
    '¿puedes moverla a mañana?',
    'pásala a mañana',
    'déjala para mañana',
    'pospónla a mañana',
  ]) {
    assert.equal(asksToMoveToTomorrow(phrase), true, phrase)
  }
})

test('hablar de mañana sin mover nada, o de esta mañana, no es mover', () => {
  for (const phrase of [
    'mañana tengo un partido',
    'entrené esta mañana',
    'quiero entrenar esta mañana',
    '¿qué toca mañana?',
    'hoy no puedo entrenar',
  ]) {
    assert.equal(asksToMoveToTomorrow(phrase), false, phrase)
  }
})

test('«no puedo hacer el entrenamiento previsto»', () => {
  for (const phrase of [
    'No puedo hacer el entrenamiento previsto',
    'no puedo hacer la sesión de hoy',
    'no voy a poder hacer lo que toca',
    'hoy no puedo hacer el entreno',
  ]) {
    assert.equal(saysCannotDoPlanned(phrase), true, phrase)
  }
  assert.equal(saysCannotDoPlanned('no puedo hacer piernas'), false)
  assert.equal(saysCannotDoPlanned('hoy no puedo entrenar'), false)
})

test('el motivo de no poder hacer lo previsto', () => {
  assert.equal(detectBlockReason('por tiempo'), 'time')
  assert.equal(detectBlockReason('solo tengo 15 minutos'), 'time')
  assert.equal(detectBlockReason('no tengo la pesa'), 'material')
  assert.equal(detectBlockReason('no estoy en casa'), 'material')
  assert.equal(detectBlockReason('no tengo sitio'), 'material')
  assert.equal(detectBlockReason('por la zona'), 'zone')
  assert.equal(detectBlockReason('otro motivo'), 'other')
  assert.equal(detectBlockReason('pues no sé'), null)
})

test('cansancio contado', () => {
  for (const phrase of [
    'Hoy estoy demasiado fatigado',
    'estoy muy cansada',
    'me siento agotado',
    'estoy reventado',
    'no puedo más',
    'voy sin fuerzas',
  ]) {
    assert.equal(saysTooTired(phrase), true, phrase)
  }
  assert.equal(saysTooTired('¿la fatiga cuenta para la recuperación?'), false)
})

test('«ayer no pude entrenar»', () => {
  for (const phrase of [
    'Ayer no pude entrenar',
    'ayer no entrené',
    'no entrené ayer',
    'me salté el entreno de ayer',
  ]) {
    assert.equal(saysMissedYesterday(phrase), true, phrase)
  }
  assert.equal(saysMissedYesterday('ayer hice 20 km de bici'), false)
  assert.equal(saysMissedYesterday('¿qué hice ayer?'), false)
})

test('«mañana tengo un partido»', () => {
  for (const phrase of [
    'Mañana tengo un partido',
    'tengo partido mañana',
    'mañana juego',
    'mañana tengo un torneo importante',
  ]) {
    assert.equal(saysMatchTomorrow(phrase), true, phrase)
  }
  assert.equal(saysMatchTomorrow('mañana no tengo partido'), false)
  assert.equal(saysMatchTomorrow('hoy tengo partido'), false)
  assert.equal(saysMatchTomorrow('tuve partido esta mañana'), false)
})

test('intensidad de una actividad', () => {
  assert.equal(detectIntensity('es exigente'), 'alta')
  assert.equal(detectIntensity('un partido importante'), 'alta')
  assert.equal(detectIntensity('normal'), 'media')
  assert.equal(detectIntensity('suave, un amistoso'), 'baja')
  assert.equal(detectIntensity('mañana tengo un partido'), null)
})
