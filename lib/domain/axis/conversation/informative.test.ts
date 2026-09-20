/**
 * Una pregunta no es una petición.
 *
 * Regresión del fallo visto en producción: «hola buenas para que sirve las
 * flexiones», hecho dentro del modo cambio, recibía «Dime qué quieres cambiar y
 * por qué…». Lo informativo se responde como informativo, en modo cambio o
 * fuera de él, y nunca produce una acción ejecutable.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../../profile/types'
import type { RecoveryInputs } from '../../recovery/types'
import type { WorkoutSession } from '../../workouts/types'
import { proposeAction, type AxisDay } from '../action-engine'
import { buildBriefing } from '../briefing'
import { buildAxisContext } from '../context'
import { decide } from '../engine'
import type { AxisAiTransport } from './ai'
import { answerFromBriefing } from './deterministic'
import { createAxisConversation } from './index'
import { detectFocus, looksLikeQuestion, looksLikeRequest, matchIntent } from './intents'
import type { AxisConversationMemory } from './types'

const MONDAY = new Date(2026, 8, 7, 10, 0)

function profile(): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    typicalSessionMinutes: 60,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
}

function recovery(): RecoveryInputs {
  return {
    dayKey: '2026-09-07',
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
  }
}

/** Tren superior hace dos días: hoy toca tren inferior. */
function session(): WorkoutSession {
  return {
    id: 'upper',
    dayKey: '2026-09-05',
    startedAt: '2026-09-05T18:00:00.000Z',
    completedAt: '2026-09-05T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda', 'hombros', 'brazos'],
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: 3,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

function setup() {
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: [session()],
    activities: [],
    now: MONDAY,
  })
  const decision = decide(context)
  const briefing = buildBriefing(context, decision, [session()], decision.primary, null, [])
  const day: AxisDay = { context, decision, selected: decision.primary }
  return { context, decision, briefing, day }
}

const CHANGE_MODE: AxisConversationMemory = { lastIntent: 'change', changeMode: true }
const NEGOTIATION_PROMPT = /Dime qué quieres cambiar/

const INFORMATIVE = [
  'hola buenas para que sirve las flexiones',
  '¿Para qué sirven las flexiones?',
  '¿Qué músculos trabajan las sentadillas?',
  '¿Por qué necesito descansar?',
  '¿Qué significa Recovery Score?',
  '¿Cuánto descanso entre series?',
  '¿Por qué me recomiendas este entrenamiento?',
]

const REQUESTS = [
  'Quiero hacer algo más corto',
  'No quiero hacer piernas',
  'Cambia el entrenamiento',
  'Hazme una sesión más suave',
  'ayer hice 20 km de bici por montaña, ¿podemos no hacer piernas?',
]

// ---------------------------------------------------------------------------
// 1-2. Preguntas informativas: nunca negociación
// ---------------------------------------------------------------------------

test('1. «para qué sirven las flexiones» se responde con el catálogo, dentro y fuera del modo cambio', () => {
  const { briefing } = setup()
  for (const question of ['hola buenas para que sirve las flexiones', '¿Para qué sirven las flexiones?']) {
    for (const memory of [undefined, CHANGE_MODE]) {
      const answer = answerFromBriefing(question, briefing, memory)
      assert.equal(answer.intent, 'exercise', question)
      assert.doesNotMatch(answer.text, NEGOTIATION_PROMPT, question)
      assert.match(answer.text, /^Flexiones: ejercicio de empuje\. Trabaja sobre todo pecho/, question)
      assert.match(answer.text, /Cuerpo en línea/, 'lleva las instrucciones del catálogo')
      assert.equal(answer.proposedTarget ?? null, null)
      assert.equal(answer.verdict ?? null, null)
    }
  }
})

test('«qué músculos trabajan las sentadillas» nombra piernas y aun así no es una petición', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('¿Qué músculos trabajan las sentadillas?', briefing, CHANGE_MODE)
  assert.equal(answer.intent, 'exercise')
  assert.match(answer.text, /^Sentadilla: ejercicio de piernas\. Trabaja sobre todo piernas, y de paso glúteos y core\./)
  assert.equal(answer.proposedTarget ?? null, null)
})

test('2. preguntar por la recuperación en modo cambio responde con la recuperación', () => {
  const { briefing } = setup()
  for (const question of ['¿Qué significa Recovery Score?', '¿Cuánto descanso entre series?', '¿Por qué necesito descansar?']) {
    const answer = answerFromBriefing(question, briefing, CHANGE_MODE)
    assert.notEqual(answer.intent, 'change', question)
    assert.doesNotMatch(answer.text, NEGOTIATION_PROMPT, question)
    assert.equal(answer.proposedTarget ?? null, null, question)
  }
  assert.equal(matchIntent('¿Qué significa Recovery Score?').intent, 'recovery')
})

test('«score» ya no se lee como «core»: el foco se busca por palabra', () => {
  assert.equal(detectFocus('¿Qué significa Recovery Score?'), null)
  assert.equal(detectFocus('hoy core no'), 'core_movilidad')
  assert.equal(detectFocus('las piernas las tengo cargadas'), 'tren_inferior')
  assert.equal(detectFocus('pierna'), 'tren_inferior')
})

// ---------------------------------------------------------------------------
// 3. Lo que ya funcionaba sigue igual
// ---------------------------------------------------------------------------

test('3. «¿por qué me recomiendas este entrenamiento?» sigue explicando la propuesta', () => {
  const { briefing } = setup()
  for (const memory of [undefined, CHANGE_MODE]) {
    const answer = answerFromBriefing('¿Por qué me recomiendas este entrenamiento?', briefing, memory)
    assert.equal(answer.intent, 'why')
    assert.match(answer.text, new RegExp(briefing.proposal!.headline.slice(0, 20)))
    assert.doesNotMatch(answer.text, NEGOTIATION_PROMPT)
  }
})

// ---------------------------------------------------------------------------
// 4-5. Las peticiones siguen siendo peticiones
// ---------------------------------------------------------------------------

test('4. «quiero una sesión más corta» sigue siendo un cambio', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('quiero una sesión más corta', briefing, CHANGE_MODE)
  assert.equal(answer.intent, 'change')
  assert.equal(answer.verdict, 'accept')
  assert.ok(answer.proposedTarget, 'hay una alternativa más corta preparada')
})

test('5. «no quiero hacer piernas» sigue siendo un cambio', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('no quiero hacer piernas', briefing, CHANGE_MODE)
  assert.equal(answer.intent, 'change')
  assert.equal(answer.verdict, 'decline', 'sin motivo, AXIS no lo quita')
  assert.deepEqual(answer.changeRequest, { kind: 'avoid_focus', focus: 'tren_inferior' })
})

test('las peticiones de siempre, con y sin interrogación, siguen negociándose', () => {
  const { briefing } = setup()
  for (const question of REQUESTS) {
    const answer = answerFromBriefing(question, briefing, CHANGE_MODE)
    assert.equal(answer.intent, 'change', question)
    assert.ok(answer.verdict, `${question} tiene veredicto`)
  }
  for (const question of REQUESTS) assert.equal(looksLikeRequest(question) || !looksLikeQuestion(question), true, question)
  for (const question of INFORMATIVE) {
    assert.equal(looksLikeQuestion(question), true, question)
    assert.equal(looksLikeRequest(question), false, question)
  }
})

test('un mensaje suelto sin forma de pregunta sigue pidiendo el motivo en modo cambio', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('buenas', briefing, CHANGE_MODE)
  assert.equal(answer.intent, 'change')
  assert.match(answer.text, NEGOTIATION_PROMPT)
})

// ---------------------------------------------------------------------------
// 6. Una pregunta informativa nunca genera una acción ejecutable
// ---------------------------------------------------------------------------

test('6. ninguna pregunta informativa produce una propuesta de acción', () => {
  const { briefing, day } = setup()
  for (const question of INFORMATIVE) {
    for (const memory of [undefined, CHANGE_MODE]) {
      const answer = answerFromBriefing(question, briefing, memory)
      assert.equal(answer.proposedTarget ?? null, null, question)
      assert.equal(proposeAction(day, answer), null, `${question} no lleva botón`)
    }
  }
})

test('6b. aunque el modelo sugiera una acción sobre una pregunta informativa, no llega a existir', async () => {
  const { briefing, day, decision } = setup()
  const light = decision.alternatives.find((item) => item.type === 'LIGHT_TRAINING')!
  const transport: AxisAiTransport = {
    isConfigured: () => true,
    async send() {
      return {
        text: 'Las flexiones trabajan pecho. Cambio a la versión más ligera.',
        action: { type: 'change_training', target: { type: light.type, focus: light.session?.focus ?? null } },
      }
    },
  }
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask('¿Para qué sirven las flexiones?', briefing, CHANGE_MODE)

  assert.equal(result.intent, 'exercise')
  assert.equal(result.usedFallback, true, 'una acción no aprobada tumba la respuesta del modelo')
  assert.equal(result.modelDisagreed, true)
  assert.equal(result.proposedTarget ?? null, null)
  assert.equal(proposeAction(day, result), null)
  assert.match(result.text, /^Flexiones: ejercicio de empuje/, 'responde el determinista')
})

test('la respuesta de ejercicio sí puede redactarla el modelo cuando se limita a redactar', async () => {
  const { briefing } = setup()
  const transport: AxisAiTransport = {
    isConfigured: () => true,
    async send() {
      return { text: 'Las flexiones son un empuje: trabajan sobre todo el pecho, con hombros, brazos y core de apoyo.' }
    },
  }
  const conversation = createAxisConversation({ transport })
  const result = await conversation.ask('¿Para qué sirven las flexiones?', briefing)
  assert.match(result.engineId, /ai/)
  assert.equal(result.usedFallback, false)
  assert.equal(result.intent, 'exercise')
})

test('un ejercicio que no está en el catálogo no se inventa', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('¿Para qué sirve el press de banca?', briefing)
  assert.notEqual(answer.intent, 'exercise')
  assert.equal(answer.intent, 'unknown')
  assert.equal(answer.unknown, true)
})
