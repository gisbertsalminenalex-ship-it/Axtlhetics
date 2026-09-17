/**
 * Las barreras entre el modelo de lenguaje y AXIS.
 *
 * Todo lo que aquí se comprueba se resume en una frase: AXIS decide, Gemini
 * redacta, AXIS valida, el usuario confirma, el dominio aplica. Cada test es un
 * intento del modelo de saltarse un eslabón, y la prueba de que no puede.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../../profile/types'
import type { RecoveryInputs } from '../../recovery/types'
import type { WorkoutSession } from '../../workouts/types'
import { buildChangeTrainingAction, findProposal, validateAction } from '../actions'
import { buildBriefing } from '../briefing'
import { buildAxisContext } from '../context'
import { decide } from '../engine'
import { AXIS_PERSONALITY } from '../personality'
import {
  aiSystemPrompt,
  parseAiAction,
  parseAiResponse,
  reconcileTarget,
  toAiBriefing,
  type AxisAiRequest,
  type AxisAiTransport,
} from './ai'
import { answerFromBriefing } from './deterministic'
import { createAxisConversation } from './index'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const MONDAY_KEY = '2026-09-07'
const SATURDAY_KEY = '2026-09-05'

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['fuerza'],
    experience: 'intermedio',
    availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    typicalSessionMinutes: 60,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function recovery(partial: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return {
    dayKey: MONDAY_KEY,
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
    ...partial,
  }
}

function session(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    dayKey: SATURDAY_KEY,
    startedAt: '2026-09-05T18:00:00.000Z',
    completedAt: '2026-09-05T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda', 'hombros', 'brazos'],
    exercises: [],
    totalVolumeKg: 300,
    status: 'completed',
    perceivedEffort: 4,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
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
  const briefing = buildBriefing(context, decision, [session()])
  return { context, decision, briefing }
}

const CHANGE_MODE = { lastIntent: 'change' as const, changeMode: true }

/** Un transporte que devuelve lo que se le diga y recuerda lo que recibió. */
function fakeTransport(reply: (request: AxisAiRequest) => { text: string; action?: unknown }) {
  const requests: AxisAiRequest[] = []
  const transport: AxisAiTransport = {
    isConfigured: () => true,
    async send(request) {
      requests.push(request)
      return reply(request) as { text: string }
    },
  }
  return { transport, requests }
}

// Mensajes que, en modo cambio, producen un veredicto concreto y además pasan
// por el modelo (la pregunta cruda se clasifica como «cambiar»).
const DECLINE_MESSAGE = 'cambia la sesión, no quiero hacer piernas'
const ACCEPT_MESSAGE = 'cambia a algo más corto, voy justo de tiempo'

test('el dominio produce los veredictos con los que se prueban las barreras', () => {
  const { briefing } = setup()
  const declined = answerFromBriefing(DECLINE_MESSAGE, briefing, CHANGE_MODE)
  const accepted = answerFromBriefing(ACCEPT_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(declined.verdict, 'decline')
  assert.equal(declined.proposedTarget, null)
  assert.equal(accepted.verdict, 'accept')
  assert.ok(accepted.proposedTarget, 'acortar con una alternativa más corta preparada se acepta')
})

// ---------------------------------------------------------------------------
// 1. Gemini puede mejorar la redacción cuando respeta la decisión
// ---------------------------------------------------------------------------

test('el modelo puede redactar mejor una negativa sin tocar el veredicto', async () => {
  const { briefing } = setup()
  const { transport, requests } = fakeTransport(() => ({
    text: 'Hoy no quitaría piernas: tu recuperación está en 84 y no hay nada que lo justifique.',
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(DECLINE_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(requests.length, 1, 'se pidió una redacción')
  assert.match(result.engineId, /ai/)
  assert.equal(result.usedFallback, false)
  assert.equal(result.modelDisagreed, false)
  assert.match(result.text, /^Hoy no quitaría piernas/)
  // Lo estructurado sale intacto del dominio.
  assert.equal(result.verdict, 'decline')
  assert.equal(result.proposedTarget, null)
  assert.equal(result.intent, 'change')
})

test('el modelo puede redactar una aceptación y el destino sigue siendo el del dominio', async () => {
  const { briefing } = setup()
  const domain = answerFromBriefing(ACCEPT_MESSAGE, briefing, CHANGE_MODE)
  const { transport } = fakeTransport((request) => ({
    text: 'El tiempo manda. Cambio a la versión más ligera, que cabe en lo que tienes.',
    action: { type: 'change_training', target: request.domain.proposedTarget },
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(ACCEPT_MESSAGE, briefing, CHANGE_MODE)

  assert.match(result.engineId, /ai/)
  assert.deepEqual(result.proposedTarget, domain.proposedTarget)
  assert.equal(result.modelDisagreed, false)
})

// ---------------------------------------------------------------------------
// 2. Gemini NO puede cambiar una decisión
// ---------------------------------------------------------------------------

test('el modelo no puede cambiar la decisión: el destino que propone se descarta y responde el determinista', async () => {
  const { briefing, decision } = setup()
  const local = answerFromBriefing(ACCEPT_MESSAGE, briefing, CHANGE_MODE)
  // Un destino real de la decisión, pero distinto del aprobado.
  const other = decision.alternatives.find(
    (item) => item.type === 'RECOVERY' || item.type === 'REST',
  )
  assert.ok(other)

  const { transport } = fakeTransport(() => ({
    text: 'Mejor descansa hoy.',
    action: { type: 'change_training', target: { type: other!.type, focus: null } },
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(ACCEPT_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(result.usedFallback, true)
  assert.equal(result.modelDisagreed, true)
  assert.equal(result.rejectedReason, 'model_disagreed')
  assert.equal(result.text, local.text, 'responde el determinista, palabra por palabra')
  assert.deepEqual(result.proposedTarget, local.proposedTarget, 'el destino es el del dominio')
})

// ---------------------------------------------------------------------------
// 3. Gemini NO puede convertir un «no» en un «sí»
// ---------------------------------------------------------------------------

test('el modelo no puede convertir un decline en un accept con la redacción', async () => {
  const { briefing } = setup()
  const local = answerFromBriefing(DECLINE_MESSAGE, briefing, CHANGE_MODE)
  const { transport } = fakeTransport(() => ({
    text: 'De acuerdo, hoy dejamos las piernas. Cambio a tren superior.',
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(DECLINE_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(result.usedFallback, true)
  assert.equal(result.rejectedReason, 'contradicts_verdict')
  assert.equal(result.verdict, 'decline')
  assert.equal(result.proposedTarget, null, 'sigue sin haber botón')
  assert.equal(result.text, local.text)
})

// ---------------------------------------------------------------------------
// 4. Gemini NO puede inventar una propuesta válida
// ---------------------------------------------------------------------------

test('el modelo no puede inventar una propuesta cuando el dominio no aprobó ninguna', async () => {
  const { briefing, decision, context } = setup()
  const { transport } = fakeTransport(() => ({
    text: 'Hoy no quitaría piernas.',
    action: { type: 'change_training', target: { type: 'TRAINING', focus: 'tren_superior' } },
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(DECLINE_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(result.modelDisagreed, true)
  assert.equal(result.proposedTarget, null, 'no aparece ningún botón')

  // Y aunque alguien fabricara la acción a mano con un destino inexistente,
  // la validación del dominio la para.
  const fake = buildChangeTrainingAction({
    context,
    origin: decision.primary,
    target: { ...decision.primary, type: 'TRAINING', session: null },
    reason: 'inventada',
  })
  const validation = validateAction(fake, decision, context)
  assert.equal(validation.ok, false)
})

test('una acción con un destino que no existe en la decisión se rechaza en la validación', () => {
  const { decision } = setup()
  assert.equal(findProposal(decision, { type: 'MODIFIED_TRAINING', focus: 'core_movilidad' }), null)
})

// ---------------------------------------------------------------------------
// 5. Un texto inválido del modelo produce fallback determinista
// ---------------------------------------------------------------------------

test('un texto inválido del modelo no se enseña: responde el determinista', async () => {
  const { briefing } = setup()
  const local = answerFromBriefing('¿Por qué me propones esto hoy?', briefing)

  const cases: { text: string; reason: string }[] = [
    { text: '   ', reason: 'empty' },
    { text: 'Claro, te lo explico: tu recuperación está bien.', reason: 'forbidden_opener' },
    { text: 'Tu recuperación está bien 💪', reason: 'emoji' },
    { text: '¡Vamos! Tu recuperación está bien.', reason: 'exclamation' },
    { text: 'Parece una lesión leve, con antiinflamatorios se pasa.', reason: 'medical_language' },
    {
      text: 'Frase uno. Frase dos. Frase tres. Frase cuatro. Frase cinco.',
      reason: 'too_long',
    },
  ]

  for (const item of cases) {
    const { transport } = fakeTransport(() => ({ text: item.text }))
    const conversation = createAxisConversation({ transport })
    const result = await conversation.ask('¿Por qué me propones esto hoy?', briefing)

    assert.equal(result.usedFallback, true, `«${item.text}» debía caer al determinista`)
    assert.equal(result.rejectedReason, item.reason)
    assert.equal(result.text, local.text)
    assert.equal(result.modelDisagreed, false, 'un texto malo no es un desacuerdo sobre la acción')
  }
})

// ---------------------------------------------------------------------------
// 6. `modelDisagreed` queda registrado
// ---------------------------------------------------------------------------

test('reconcileTarget deja constancia del desacuerdo y nunca devuelve lo del modelo', () => {
  const domain = { type: 'LIGHT_TRAINING', focus: 'tren_inferior' } as const

  assert.deepEqual(reconcileTarget(null, domain), { target: domain, modelDisagreed: false })
  assert.deepEqual(reconcileTarget(undefined, null), { target: null, modelDisagreed: false })

  const agrees = reconcileTarget({ type: 'change_training', target: { ...domain } }, domain)
  assert.deepEqual(agrees, { target: domain, modelDisagreed: false })

  const differs = reconcileTarget(
    { type: 'change_training', target: { type: 'TRAINING', focus: 'tren_superior' } },
    domain,
  )
  assert.equal(differs.modelDisagreed, true)
  assert.deepEqual(differs.target, domain, 'el destino sigue siendo el del dominio')

  const invented = reconcileTarget(
    { type: 'change_training', target: { type: 'TRAINING', focus: 'tren_superior' } },
    null,
  )
  assert.deepEqual(invented, { target: null, modelDisagreed: true })
})

// ---------------------------------------------------------------------------
// 7. medical / out_of_scope nunca llegan al modelo
// ---------------------------------------------------------------------------

test('lo médico y lo ajeno nunca llegan al modelo, ni siquiera en modo cambio', async () => {
  const { briefing } = setup()
  const { transport, requests } = fakeTransport(() => ({ text: 'No debería verse.' }))
  const conversation = createAxisConversation({ transport })

  for (const question of [
    'me duele la rodilla, ¿cambio la sesión?',
    'tengo una lesión en el hombro',
    '¿cuál es la capital de Francia?',
    'dime una receta para cenar',
  ]) {
    for (const memory of [undefined, CHANGE_MODE]) {
      const result = await conversation.ask(question, briefing, memory)
      assert.notEqual(result.text, 'No debería verse.', question)
      assert.match(result.engineId, /deterministic/, question)
    }
  }

  assert.equal(requests.length, 0, 'el transporte no recibió ninguna petición')
})

// ---------------------------------------------------------------------------
// 8. El flujo de confirmación sigue intacto
// ---------------------------------------------------------------------------

test('lo que el modelo redacta sigue teniendo que pasar por validateAction y por el botón', async () => {
  const { briefing, decision, context } = setup()
  const { transport } = fakeTransport((request) => ({
    text: 'Cambio a la versión más ligera.',
    action: { type: 'change_training', target: request.domain.proposedTarget },
  }))
  const conversation = createAxisConversation({ transport })

  const result = await conversation.ask(ACCEPT_MESSAGE, briefing, CHANGE_MODE)
  assert.ok(result.proposedTarget)

  // Lo que hace la aplicación: construir la acción pendiente. Nada ha cambiado.
  const target = findProposal(decision, result.proposedTarget!)
  assert.ok(target)
  const action = buildChangeTrainingAction({
    context,
    origin: decision.primary,
    target: target!,
    reason: result.proposedReason ?? '',
  })
  assert.equal(action.type, 'change_training')

  // Solo al confirmar se valida, contra la decisión vigente.
  const validation = validateAction(action, decision, context)
  assert.equal(validation.ok, true)
  if (validation.ok) assert.equal(validation.target.id, target!.id)

  // Y una acción de otro día, aunque venga bien formada, no se aplica.
  const stale = { ...action, dayKey: '2026-09-01' }
  assert.equal(validateAction(stale, decision, context).ok, false)
})

// ---------------------------------------------------------------------------
// Unidades de la capa de IA que no tenían test
// ---------------------------------------------------------------------------

test('parseAiResponse exige texto y descarta acciones mal formadas sin remendarlas', () => {
  assert.throws(() => parseAiResponse(null))
  assert.throws(() => parseAiResponse('texto'))
  assert.throws(() => parseAiResponse({ text: '   ' }))

  assert.deepEqual(parseAiResponse({ text: ' Hola. ' }), { text: 'Hola.', action: null })
  assert.deepEqual(parseAiResponse({ text: 'Hola.', action: 'cambia' }), { text: 'Hola.', action: null })
  assert.deepEqual(
    parseAiResponse({ text: 'Hola.', action: { type: 'change_training', target: { type: 'REST', focus: null } } }),
    { text: 'Hola.', action: { type: 'change_training', target: { type: 'REST', focus: null } } },
  )
})

test('parseAiAction solo admite la única acción que existe, con un destino bien formado', () => {
  assert.equal(parseAiAction(null), null)
  assert.equal(parseAiAction({ type: 'delete_history' }), null)
  assert.equal(parseAiAction({ type: 'change_training' }), null)
  assert.equal(parseAiAction({ type: 'change_training', target: { type: 1, focus: null } }), null)
  assert.equal(parseAiAction({ type: 'change_training', target: { type: 'REST', focus: 3 } }), null)
  assert.deepEqual(
    parseAiAction({ type: 'change_training', target: { type: 'LIGHT_TRAINING', focus: 'tren_superior' } }),
    { type: 'change_training', target: { type: 'LIGHT_TRAINING', focus: 'tren_superior' } },
  )
})

test('el nombre del usuario no sale hacia el proveedor; el resto del briefing sí', () => {
  const { briefing } = setup()
  const sent = toAiBriefing(briefing)

  assert.ok(briefing.profile?.name, 'el briefing local sí tiene nombre')
  assert.equal('name' in (sent.profile ?? {}), false)
  assert.equal(sent.profile?.age, briefing.profile?.age)
  assert.deepEqual(sent.profile?.goals, briefing.profile?.goals)
  assert.deepEqual(sent.recovery, briefing.recovery)
  assert.deepEqual(sent.proposal, briefing.proposal)
  assert.doesNotMatch(JSON.stringify(sent), /Alex/)

  const withoutProfile = toAiBriefing({ ...briefing, profile: null })
  assert.equal(withoutProfile.profile, null)
})

test('el prompt del proveedor se genera desde la personalidad y añade solo el formato', () => {
  const prompt = aiSystemPrompt()

  for (const line of [
    ...AXIS_PERSONALITY.identity,
    ...AXIS_PERSONALITY.tone,
    ...AXIS_PERSONALITY.register,
    ...AXIS_PERSONALITY.disagreement.slice(1),
  ]) {
    assert.ok(prompt.includes(line), `falta en el prompt: ${line.slice(0, 50)}`)
  }
  assert.match(prompt, /Nunca más de 4/)
  assert.match(prompt, /No contradigas `domain`/)
  assert.match(prompt, /No propongas un destino distinto/)
})

test('la petición al proveedor lleva el veredicto del dominio y el briefing sin nombre', async () => {
  const { briefing } = setup()
  const { transport, requests } = fakeTransport(() => ({ text: 'Hoy no quitaría piernas.' }))
  const conversation = createAxisConversation({ transport })

  await conversation.ask(DECLINE_MESSAGE, briefing, CHANGE_MODE)

  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(request.domain.intent, 'change')
  assert.equal(request.domain.proposedTarget, null)
  assert.ok(request.domain.text.length > 0)
  assert.equal('name' in (request.briefing.profile ?? {}), false)
  assert.ok(request.system.includes(AXIS_PERSONALITY.identity[0]))
})
