/**
 * AXIS habla como un entrenador, no como una app (D-074).
 *
 * Las frases que AXIS dice sin modelo viven en estos módulos. Ninguna habla de
 * registros, de «tus datos» ni de lo que «le consta»: un entrenador dice «no sé
 * cómo llegas hoy», no «no tengo tu recuperación registrada».
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const VOICE_FILES = [
  'conversation/deterministic.ts',
  'conversation/negotiation.ts',
  'conversation/assessment-answer.ts',
  'conversation/scan-answer.ts',
  'conversation/reorganization.ts',
  'conversation/social.ts',
  'closing.ts',
  'proactive.ts',
  'rules.ts',
  'actions.ts',
  'hard-day.ts',
  'weekly-review.ts',
]

const SYSTEM_TALK = /registrad|no me consta|no me conste|tus datos|vuelvo a decidir|son los datos|el motor/i

/** Las cadenas de una línea de código, sin los comentarios. */
function literals(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .flatMap((line) => line.match(/'[^']*'|`[^`]*`/g) ?? [])
}

test('las frases de AXIS no hablan de registros ni de «tus datos»', () => {
  for (const file of VOICE_FILES) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    for (const text of literals(source)) {
      assert.doesNotMatch(text, SYSTEM_TALK, `${file}: ${text}`)
    }
  }
})
