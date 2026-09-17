import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { AXIS_PERSONALITY, AXIS_SYSTEM_PROMPT, buildSystemPrompt } from './personality'

test('el prompt de sistema se genera desde la personalidad, línea a línea', () => {
  const prompt = buildSystemPrompt()
  assert.equal(prompt, AXIS_SYSTEM_PROMPT)

  const lines = [
    ...AXIS_PERSONALITY.identity,
    ...AXIS_PERSONALITY.tone,
    ...AXIS_PERSONALITY.register,
    ...AXIS_PERSONALITY.explanation,
    ...AXIS_PERSONALITY.disagreement,
  ]
  for (const line of lines) {
    assert.ok(prompt.includes(line), `falta: ${line.slice(0, 60)}`)
  }
  assert.match(prompt, /^Eres AXIS/, 'la identidad va primero')
  assert.match(prompt, /\nFIRMEZA\. /, 'la firmeza tiene su bloque')
})

test('otra personalidad produce otro prompt: no hay texto escrito aparte', () => {
  const prompt = buildSystemPrompt({
    ...AXIS_PERSONALITY,
    identity: ['Eres PRUEBA.'],
    tone: [],
    register: [],
    explanation: [],
    disagreement: ['Sin firmeza.'],
  })
  assert.equal(prompt, 'Eres PRUEBA.\n\nFIRMEZA. Sin firmeza.')
})

test('el prompt no contiene reglas de producto: no es el cerebro', () => {
  // Umbrales, pesos y reglas viven en el motor. Si aparecen aquí, alguien ha
  // empezado a decidir desde el prompt.
  assert.doesNotMatch(AXIS_SYSTEM_PROMPT, /\b\d{2,3}\s*%/)
  assert.doesNotMatch(AXIS_SYSTEM_PROMPT, /recovery score\s*[<>]/i)
  assert.doesNotMatch(AXIS_SYSTEM_PROMPT, /si la recuperaci[oó]n (es|est[aá]) (menor|mayor|inferior|superior)/i)
  assert.match(AXIS_SYSTEM_PROMPT, /ya está decidida por el motor determinista/)
})

test('los límites son coherentes con lo que el prompt pide', () => {
  const { limits } = AXIS_PERSONALITY
  assert.equal(limits.allowEmojis, false)
  assert.equal(limits.allowExclamations, false)
  assert.ok(limits.maxSentences >= 3, 'el objetivo es 1–3 frases; el techo no puede ser menor')
  assert.match(AXIS_SYSTEM_PROMPT, /Sin emojis, sin exclamaciones/)
})

test('las aperturas y términos prohibidos están en forma normalizada', () => {
  for (const phrase of [...AXIS_PERSONALITY.forbiddenOpeners, ...AXIS_PERSONALITY.forbiddenMedicalTerms]) {
    assert.equal(phrase, phrase.toLowerCase(), phrase)
    assert.equal(phrase.normalize('NFD').replace(/[̀-ͯ]/g, ''), phrase, `${phrase} lleva acentos`)
  }
})

test('la personalidad es la única fuente del prompt: nadie más lo escribe', () => {
  const ai = readFileSync(new URL('./conversation/ai.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(ai, /const AXIS_SYSTEM_PROMPT/, 'ai.ts ya no define el prompt')
  assert.match(ai, /from '\.\.\/personality'/)
})
