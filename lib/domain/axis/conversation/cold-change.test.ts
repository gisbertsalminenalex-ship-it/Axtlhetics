/**
 * Una petición clara de cambio abre la negociación sin pasar por el botón.
 *
 * Regresión del fallo visto en producción: «quiero una sesión más corta»,
 * escrito desde Inicio sin haber pulsado «Cambiar entrenamiento», se leía como
 * una pregunta por la sesión de hoy y AXIS la recitaba entera. Una petición
 * inequívoca —pide algo, y ese algo tiene nombre— se negocia desde cualquier
 * estado; una pregunta informativa nunca, aunque nombre lo mismo.
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
import { conversationMemoryOf, emptyDayMemory, rememberAnswer, rememberQuestion, type AxisDayMemory } from '../memory'
import { answerFromBriefing } from './deterministic'
import type { AxisMessage } from './types'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const NOW = '2026-09-07T10:00:00.000Z'

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

/** Lo que dice el usuario desde Inicio, sin haber pulsado nada. */
const COLD = undefined

const CLEAR_CHANGES: ReadonlyArray<{ message: string; kind: string }> = [
  { message: 'quiero una sesión más corta', kind: 'shorter' },
  { message: 'hazme un entrenamiento más corto', kind: 'shorter' },
  { message: 'tengo menos tiempo hoy', kind: 'shorter' },
  { message: 'quiero algo de 20 minutos', kind: 'shorter' },
  { message: 'quiero entrenar menos tiempo', kind: 'shorter' },
  { message: 'quiero hacer menos ejercicios', kind: 'shorter' },
  { message: 'quiero una sesión más ligera', kind: 'easier' },
  { message: '¿podemos hacer una sesión más corta?', kind: 'shorter' },
  { message: '¿puedes hacerla más ligera?', kind: 'easier' },
  { message: 'no quiero hacer piernas', kind: 'avoid_focus' },
  { message: '¿podemos no hacer piernas?', kind: 'avoid_focus' },
]

const INFORMATIVE = [
  '¿para qué sirven las flexiones?',
  '¿qué músculos trabajan las sentadillas?',
  '¿por qué me recomiendas este entrenamiento?',
  '¿cuánto descanso entre series?',
  '¿qué es el Recovery Score?',
  // Nombran el cambio, pero preguntan: la palabra no basta.
  '¿es mejor una sesión más corta?',
  '¿cuánto dura una sesión más ligera?',
]

// ---------------------------------------------------------------------------
// 1. Peticiones claras: negociación desde cualquier estado
// ---------------------------------------------------------------------------

test('1. «quiero una sesión más corta» desde frío negocia, propone la alternativa corta y lleva botón', () => {
  const { briefing, day } = setup()
  const answer = answerFromBriefing('quiero una sesión más corta', briefing, COLD)

  assert.equal(answer.intent, 'change')
  assert.equal(answer.verdict, 'accept')
  assert.deepEqual(answer.changeRequest, { kind: 'shorter', focus: null })
  assert.ok(answer.proposedTarget, 'propone la alternativa más corta que el motor preparó')
  assert.equal(answer.proposedTarget.type, 'LIGHT_TRAINING')

  const action = proposeAction(day, answer)
  assert.ok(action, 'hay botón de confirmar')
  assert.equal(action.type, 'change_training')
  assert.deepEqual(action.target, answer.proposedTarget)
})

test('desde frío se lee exactamente igual que con el modo cambio activo', () => {
  const { briefing } = setup()
  for (const { message, kind } of CLEAR_CHANGES) {
    const cold = answerFromBriefing(message, briefing, COLD)
    const warm = answerFromBriefing(message, briefing, { lastIntent: 'change', changeMode: true })

    assert.equal(cold.intent, 'change', message)
    assert.equal(cold.changeRequest?.kind, kind, message)
    assert.equal(cold.verdict, warm.verdict, `${message}: mismo veredicto`)
    assert.equal(cold.text, warm.text, `${message}: misma respuesta`)
    assert.deepEqual(cold.proposedTarget ?? null, warm.proposedTarget ?? null, `${message}: misma propuesta`)
  }
})

test('«no quiero hacer piernas» desde frío se negocia y, sin motivo, se rechaza', () => {
  const { briefing, day } = setup()
  const answer = answerFromBriefing('no quiero hacer piernas', briefing, COLD)

  assert.equal(answer.intent, 'change')
  assert.equal(answer.verdict, 'decline')
  assert.deepEqual(answer.changeRequest, { kind: 'avoid_focus', focus: 'tren_inferior' })
  assert.equal(answer.proposedTarget ?? null, null)
  assert.equal(proposeAction(day, answer), null, 'un rechazo no lleva botón')
})

// ---------------------------------------------------------------------------
// 2. Preguntas informativas: nunca
// ---------------------------------------------------------------------------

test('2. ninguna pregunta informativa se convierte en cambio, ni desde frío ni en modo cambio', () => {
  const { briefing, day } = setup()
  for (const question of INFORMATIVE) {
    for (const memory of [COLD, { lastIntent: 'change' as const, changeMode: true }]) {
      const answer = answerFromBriefing(question, briefing, memory)
      assert.notEqual(answer.intent, 'change', question)
      assert.equal(answer.verdict ?? null, null, question)
      assert.equal(answer.proposedTarget ?? null, null, question)
      assert.equal(proposeAction(day, answer), null, `${question} no lleva botón`)
    }
  }
})

test('las preguntas de siempre conservan su intención', () => {
  const { briefing } = setup()
  assert.equal(answerFromBriefing('¿para qué sirven las flexiones?', briefing, COLD).intent, 'exercise')
  assert.equal(answerFromBriefing('¿qué músculos trabajan las sentadillas?', briefing, COLD).intent, 'exercise')
  assert.equal(answerFromBriefing('¿por qué me recomiendas este entrenamiento?', briefing, COLD).intent, 'why')
  assert.equal(answerFromBriefing('¿qué es el Recovery Score?', briefing, COLD).intent, 'recovery')
})

// ---------------------------------------------------------------------------
// 3. Lo que no es inequívoco sigue necesitando el botón
// ---------------------------------------------------------------------------

test('3. pedir sin decir qué, nombrar una zona o querer entrenar no abren la negociación desde frío', () => {
  const { briefing } = setup()

  // Pide, pero no dice qué: AXIS pregunta el motivo, como hasta ahora.
  const vague = answerFromBriefing('quiero cambiar el entrenamiento de hoy', briefing, COLD)
  assert.equal(vague.intent, 'change')
  assert.equal(vague.verdict ?? null, null)
  assert.match(vague.text, /qué quieres cambiar y por qué/i)

  // Nombra una zona sin pedir nada: no es una petición.
  for (const message of ['ayer hice piernas', 'hoy toca piernas']) {
    const answer = answerFromBriefing(message, briefing, COLD)
    assert.notEqual(answer.intent, 'change', message)
    assert.equal(answer.verdict ?? null, null, message)
  }

  // Una hipótesis se responde como pregunta, no como orden.
  const hypothetical = answerFromBriefing('¿Y si hago solo 20 minutos?', briefing, COLD)
  assert.equal(hypothetical.intent, 'shorten')
  assert.equal(hypothetical.verdict ?? null, null)

  // Una molestia física nunca se negocia.
  const medical = answerFromBriefing('me duele la rodilla, quiero algo más corto', briefing, COLD)
  assert.equal(medical.intent, 'medical')
})

// ---------------------------------------------------------------------------
// 4. La negociación abierta escribiendo continúa como la abierta con el botón
// ---------------------------------------------------------------------------

function message(id: string, role: AxisMessage['role'] = 'axis'): AxisMessage {
  return { id, role, text: id, createdAt: NOW }
}

test('4. una negociación abierta desde frío deja la memoria en modo cambio, y una respuesta corriente no', () => {
  const { briefing } = setup()

  let memory: AxisDayMemory = rememberQuestion(emptyDayMemory('2026-09-07', NOW), message('q1', 'user'))
  const plain = answerFromBriefing('¿por qué me recomiendas este entrenamiento?', briefing, conversationMemoryOf(memory))
  memory = rememberAnswer(memory, message('a1'), plain)
  assert.equal(memory.thread.changeMode, false, 'explicar no abre nada')

  memory = rememberQuestion(memory, message('q2', 'user'))
  const negotiated = answerFromBriefing('no quiero hacer piernas', briefing, conversationMemoryOf(memory))
  memory = rememberAnswer(memory, message('a2'), negotiated)
  assert.equal(memory.thread.changeMode, true, 'negociar deja la conversación en modo cambio')
  assert.deepEqual(memory.thread.lastChangeRequest, { kind: 'avoid_focus', focus: 'tren_inferior' })

  // Y ahora la evidencia cuenta, igual que tras pulsar el botón.
  memory = rememberQuestion(memory, message('q3', 'user'))
  const withEvidence = answerFromBriefing('ayer hice 20 km de bici por montaña', briefing, conversationMemoryOf(memory))
  assert.equal(withEvidence.intent, 'change')
  assert.ok(withEvidence.reportedLoad, 'la carga contada entra en la negociación')
  assert.notEqual(withEvidence.verdict, 'decline', 'AXIS cede por evidencia')
})
