/**
 * La memoria de AXIS: un registro por día con todo lo que recuerda.
 *
 * Primero las operaciones, una a una. Después el flujo entero tal y como lo
 * recorre la aplicación —preguntar, negociar, confirmar, recargar—, con el
 * repositorio en memoria haciendo de disco. Las regresiones del fallo que se
 * encontró en la Fase 1 («Cambiar entrenamiento» borraba el hilo) están al
 * final, numeradas.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createMemoryRepositories } from '../../data/memory-repositories'
import type { UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import type { WorkoutSession } from '../workouts/types'
import { buildChangeTrainingAction, findProposal, overrideFrom, validateAction } from './actions'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { answerFromBriefing } from './conversation/deterministic'
import { changeOpeningMessage } from './conversation/negotiation'
import type { AxisMessage } from './conversation/types'
import { decide } from './engine'
import {
  applyOverride,
  cancelAction,
  clearOverride,
  clearThread,
  closeChangeThread,
  conversationMemoryOf,
  emptyDayMemory,
  isActionApplied,
  isAxisDayMemory,
  isMemoryForDay,
  markActionError,
  memoryForToday,
  openChangeThread,
  rememberAnswer,
  rememberQuestion,
} from './memory'

const DAY = '2026-09-07'
const NOW = '2026-09-07T10:00:00.000Z'

function message(id: string, role: 'user' | 'axis' = 'axis', text = 'texto'): AxisMessage {
  return { id, role, text, createdAt: NOW }
}

const OVERRIDE = {
  dayKey: DAY,
  type: 'LIGHT_TRAINING' as const,
  focus: 'tren_superior' as const,
  originHeadline: 'Entrena tren superior.',
  reason: 'Vas justo de tiempo.',
  decidedAt: NOW,
  source: 'axis_conversation' as const,
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

test('una memoria vacía tiene todos los campos y la versión del registro', () => {
  const memory = emptyDayMemory(DAY, NOW)
  assert.deepEqual(memory, {
    dayKey: DAY,
    schema: 1,
    override: null,
    cancelledActivities: [],
    reportedLoads: [],
    messages: [],
    actionStatuses: {},
    thread: { lastIntent: null, changeMode: false, lastChangeRequest: null },
    updatedAt: NOW,
  })
  assert.equal(isAxisDayMemory(memory), true)
})

test('recordar una respuesta guarda el mensaje, la intención y lo aprendido', () => {
  let memory = rememberQuestion(emptyDayMemory(DAY, NOW), message('q1', 'user'))
  memory = rememberAnswer(memory, message('a1'), {
    intent: 'change',
    changeRequest: { kind: 'avoid_focus', focus: 'tren_inferior' },
    cancelledActivities: ['Baloncesto'],
    reportedLoad: { quote: 'ayer hice 20 km', muscleGroups: ['piernas'], demanding: true },
  }, '2026-09-07T10:01:00.000Z')

  assert.deepEqual(memory.messages.map((m) => m.id), ['q1', 'a1'])
  assert.equal(memory.thread.lastIntent, 'change')
  assert.deepEqual(memory.thread.lastChangeRequest, { kind: 'avoid_focus', focus: 'tren_inferior' })
  assert.deepEqual(memory.cancelledActivities, ['Baloncesto'])
  assert.equal(memory.reportedLoads.length, 1)
  assert.equal(memory.reportedLoads[0].messageId, 'a1')
  assert.equal(memory.reportedLoads[0].reportedAt, '2026-09-07T10:01:00.000Z')
  assert.equal(memory.updatedAt, '2026-09-07T10:01:00.000Z')
})

test('una respuesta sin petición de cambio conserva la anterior; sin carga, no duplica', () => {
  let memory = rememberAnswer(emptyDayMemory(DAY, NOW), message('a1'), {
    intent: 'change',
    changeRequest: { kind: 'shorter', focus: null },
    reportedLoad: { quote: 'ayer hice 20 km', muscleGroups: ['piernas'], demanding: true },
    cancelledActivities: ['Baloncesto'],
  })
  memory = rememberAnswer(memory, message('a2'), {
    intent: 'why',
    reportedLoad: { quote: 'ayer hice 20 km', muscleGroups: ['piernas'], demanding: true },
    cancelledActivities: ['Baloncesto', 'Tenis'],
  })

  assert.equal(memory.thread.lastIntent, 'why')
  assert.deepEqual(memory.thread.lastChangeRequest, { kind: 'shorter', focus: null })
  assert.equal(memory.reportedLoads.length, 1, 'la misma frase no cuenta dos veces')
  assert.deepEqual(memory.cancelledActivities, ['Baloncesto', 'Tenis'])
})

test('abrir la negociación añade la apertura y no la duplica; cerrar conserva el hilo', () => {
  let memory = rememberAnswer(emptyDayMemory(DAY, NOW), message('a1'), { intent: 'today' })
  memory = openChangeThread(memory, message('open'))
  const opened = memory

  assert.deepEqual(memory.messages.map((m) => m.id), ['a1', 'open'])
  assert.equal(memory.thread.changeMode, true)
  assert.equal(memory.thread.lastIntent, 'change')

  memory = openChangeThread(memory, message('open2'))
  assert.equal(memory, opened, 'ya estaba abierto: no se toca')

  memory = closeChangeThread(memory)
  assert.equal(memory.thread.changeMode, false)
  assert.deepEqual(memory.messages.map((m) => m.id), ['a1', 'open'])
  assert.equal(closeChangeThread(memory), memory, 'cerrar lo cerrado no cambia nada')
})

test('aplicar una acción fija la elección, la marca aplicada y termina la negociación', () => {
  let memory = openChangeThread(emptyDayMemory(DAY, NOW), message('open'))
  memory = applyOverride(memory, OVERRIDE, 'act-1')

  assert.deepEqual(memory.override, OVERRIDE)
  assert.equal(isActionApplied(memory, 'act-1'), true)
  assert.equal(memory.thread.changeMode, false)
  assert.equal(applyOverride(memory, { ...OVERRIDE, focus: 'tren_inferior' }, 'act-1'), memory, 'no se aplica dos veces')
})

test('cancelar una acción termina la negociación y no toca una ya aplicada', () => {
  let memory = openChangeThread(emptyDayMemory(DAY, NOW), message('open'))
  memory = cancelAction(memory, 'act-1')
  assert.deepEqual(memory.actionStatuses['act-1'], { state: 'cancelled' })
  assert.equal(memory.thread.changeMode, false)

  const applied = applyOverride(emptyDayMemory(DAY, NOW), OVERRIDE, 'act-2')
  assert.equal(cancelAction(applied, 'act-2'), applied)
})

test('un error en una acción se registra con su mensaje', () => {
  const memory = markActionError(emptyDayMemory(DAY, NOW), 'act-1', 'No cuadra.')
  assert.deepEqual(memory.actionStatuses['act-1'], { state: 'error', message: 'No cuadra.' })
})

test('retirar la elección del día conserva todo lo demás', () => {
  let memory = applyOverride(emptyDayMemory(DAY, NOW), OVERRIDE, 'act-1')
  memory = rememberAnswer(memory, message('a1'), {
    intent: 'change',
    cancelledActivities: ['Baloncesto'],
    reportedLoad: { quote: 'ayer 20 km', muscleGroups: ['piernas'], demanding: true },
  })
  memory = clearOverride(memory)

  assert.equal(memory.override, null)
  assert.deepEqual(memory.cancelledActivities, ['Baloncesto'])
  assert.equal(memory.reportedLoads.length, 1)
  assert.equal(memory.messages.length, 1)
  assert.equal(isActionApplied(memory, 'act-1'), true)
  assert.equal(clearOverride(memory), memory)
})

test('vaciar el hilo conserva lo decidido y lo contado', () => {
  let memory = applyOverride(emptyDayMemory(DAY, NOW), OVERRIDE, 'act-1')
  memory = rememberAnswer(memory, message('a1'), {
    intent: 'change',
    cancelledActivities: ['Baloncesto'],
    reportedLoad: { quote: 'ayer 20 km', muscleGroups: ['piernas'], demanding: true },
  })
  memory = clearThread(memory)

  assert.deepEqual(memory.messages, [])
  assert.deepEqual(memory.actionStatuses, {})
  assert.deepEqual(memory.thread, { lastIntent: null, changeMode: false, lastChangeRequest: null })
  assert.deepEqual(memory.override, OVERRIDE)
  assert.deepEqual(memory.cancelledActivities, ['Baloncesto'])
  assert.equal(memory.reportedLoads.length, 1)
})

test('la memoria que necesita la conversación sale del hilo', () => {
  const memory = openChangeThread(emptyDayMemory(DAY, NOW), message('open'))
  assert.deepEqual(conversationMemoryOf(memory), {
    lastIntent: 'change',
    changeMode: true,
    lastChangeRequest: null,
  })
})

test('lo leído del disco se valida: un registro corrupto o de otro día no se usa', () => {
  const memory = emptyDayMemory(DAY, NOW)
  assert.equal(isAxisDayMemory(null), false)
  assert.equal(isAxisDayMemory({ ...memory, schema: 2 }), false)
  assert.equal(isAxisDayMemory({ ...memory, messages: 'hola' }), false)
  assert.equal(isAxisDayMemory({ ...memory, thread: { changeMode: 'sí' } }), false)
  assert.equal(isMemoryForDay(memory, '2026-09-08'), false)

  const today = new Date(2026, 8, 7, 10, 0)
  assert.equal(memoryForToday(memory, today), memory)
  assert.equal(memoryForToday({ ...memory, dayKey: '2026-09-06' }, today).messages.length, 0)
  assert.equal(memoryForToday('basura', today).dayKey, DAY)
})

test('la memoria no conoce React, la persistencia ni el motor', () => {
  const source = readFileSync(new URL('./memory.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from 'react'|indexedDB|getRepositories|from '\.\/engine'|from '\.\/rules'/)
})

// ---------------------------------------------------------------------------
// El flujo entero, como lo recorre la aplicación
// ---------------------------------------------------------------------------

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
    dayKey: DAY,
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
  }
}

/** Tren superior hace dos días: hoy toca tren inferior, y «piernas no» pide algo real. */
function upperSession(): WorkoutSession {
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

/**
 * Lo que hace el store, sin React: construye el día desde la memoria, pregunta,
 * recuerda, confirma y guarda. Cada paso escribe en el repositorio como lo
 * haría el efecto de guardado.
 */
function app(repositories = createMemoryRepositories(), sessions = [upperSession()]) {
  let memory = emptyDayMemory(DAY, NOW)
  let counter = 0
  const id = () => `m${++counter}`

  const day = () => {
    const context = buildAxisContext({
      profile: profile(),
      recoveryInputs: recovery(),
      recentSessions: sessions,
      activities: [],
      cancelledToday: memory.cancelledActivities,
      now: MONDAY,
    })
    const decision = decide(context)
    const proposal = findProposal(decision, memory.override ?? { type: decision.primary.type, focus: decision.primary.session?.focus ?? null }) ?? decision.primary
    const briefing = buildBriefing(context, decision, sessions, proposal, memory.override, memory.reportedLoads)
    return { context, decision, proposal, briefing }
  }

  const persist = async () => repositories.axisMemory.save(memory)

  return {
    get memory() {
      return memory
    },
    day,
    async load() {
      const stored = await repositories.axisMemory.getByDay(DAY)
      memory = stored ?? emptyDayMemory(DAY, NOW)
      return memory
    },
    async ask(text: string) {
      const { briefing, decision, proposal, context } = day()
      memory = rememberQuestion(memory, { id: id(), role: 'user', text, createdAt: NOW })
      const result = answerFromBriefing(text, briefing, conversationMemoryOf(memory))
      const target = result.proposedTarget ? findProposal(decision, result.proposedTarget) : null
      const action =
        target && target.id !== proposal.id
          ? buildChangeTrainingAction({ context, origin: proposal, target, reason: result.proposedReason ?? '' })
          : null
      const answer: AxisMessage = { id: id(), role: 'axis', text: result.text, createdAt: NOW, intent: result.intent, action }
      memory = rememberAnswer(memory, answer, result)
      await persist()
      return { result, answer }
    },
    async openChange() {
      const { briefing } = day()
      memory = openChangeThread(memory, { id: id(), role: 'axis', text: changeOpeningMessage(briefing), createdAt: NOW, intent: 'change' })
      await persist()
    },
    async confirm(answer: AxisMessage) {
      const { decision, context, proposal } = day()
      const action = answer.action!
      const validation = validateAction(action, decision, context, proposal)
      if (!validation.ok) {
        memory = markActionError(memory, action.id, validation.message)
      } else {
        memory = applyOverride(memory, overrideFrom(action, validation.target), action.id)
      }
      await persist()
      return validation
    },
    async close() {
      memory = closeChangeThread(memory)
      await persist()
    },
    async finishWorkout() {
      memory = clearOverride(memory)
      await persist()
    },
  }
}

test('flujo: negociar, confirmar y recargar deja exactamente la misma memoria', async () => {
  const repositories = createMemoryRepositories()
  const a = app(repositories)

  await a.ask('¿Por qué me recomiendas este entrenamiento?')
  await a.openChange()
  const { answer } = await a.ask('cambia a algo más corto, voy justo de tiempo')
  assert.ok(answer.action, 'AXIS acepta y propone')
  const validation = await a.confirm(answer)
  assert.equal(validation.ok, true)

  const before = a.memory
  const reloaded = app(repositories)
  const after = await reloaded.load()

  assert.deepEqual(after, before)
  assert.ok(after.override)
  assert.equal(isActionApplied(after, answer.action!.id), true)
  assert.equal(after.thread.changeMode, false, 'confirmar terminó la negociación')
  assert.equal(reloaded.day().proposal.type, 'LIGHT_TRAINING', 'Inicio muestra la sesión elegida tras recargar')
})

test('regresión 1-4: abrir «Cambiar entrenamiento» no borra mensajes, acciones ni marcas', async () => {
  const a = app()
  await a.ask('¿Por qué me recomiendas este entrenamiento?')
  await a.openChange()
  const { answer } = await a.ask('cambia a algo más corto, voy justo de tiempo')
  await a.confirm(answer)
  // Un mensaje marcado como desacuerdo del modelo, como los que deja la Fase 1.
  let memory = a.memory
  memory = rememberAnswer(memory, { id: 'flag', role: 'axis', text: 'x', createdAt: NOW, modelDisagreed: true }, { intent: 'why' })

  const countBefore = memory.messages.length
  const reopened = openChangeThread(closeChangeThread(memory), { id: 'open2', role: 'axis', text: 'otra vez', createdAt: NOW, intent: 'change' })

  assert.equal(reopened.messages.length, countBefore + 1, '1. no borra los mensajes anteriores')
  assert.deepEqual(reopened.actionStatuses, memory.actionStatuses, '2. los estados de acción siguen')
  assert.equal(reopened.messages.find((m) => m.id === 'flag')?.modelDisagreed, true, '3. modelDisagreed sigue presente')
  assert.equal(isActionApplied(reopened, answer.action!.id), true, '4. la acción sigue applied')
})

test('regresión 5-6: recargar durante una negociación mantiene changeMode; «Volver» lo apaga', async () => {
  const repositories = createMemoryRepositories()
  const a = app(repositories)
  await a.openChange()
  await a.ask('hoy no quiero hacer piernas')
  assert.equal(a.memory.thread.changeMode, true)

  const reloaded = app(repositories)
  const after = await reloaded.load()
  assert.equal(after.thread.changeMode, true, '5. sigue negociando tras recargar')
  assert.deepEqual(after.thread.lastChangeRequest, { kind: 'avoid_focus', focus: 'tren_inferior' })

  await reloaded.close()
  assert.equal((await app(repositories).load()).thread.changeMode, false, '6. Volver lo desactiva y queda guardado')
})

test('regresión 7: tras salir del modo cambio, una pregunta ambigua ya no es una petición', async () => {
  const a = app()
  await a.openChange()
  const inChange = await a.ask('buenas')
  assert.equal(inChange.result.intent, 'change', 'en modo cambio se pide el motivo')

  await a.close()
  const outside = await a.ask('buenas')
  assert.notEqual(outside.result.intent, 'change')
  assert.equal(outside.result.intent, 'unknown')
})

test('regresión 8: «ayer hice 20 km» y luego «hoy piernas no» conserva la evidencia', async () => {
  const a = app()
  await a.openChange()
  const first = await a.ask('ayer hice 20 km de bici por montaña')
  assert.equal(a.memory.reportedLoads.length, 1, 'la carga contada queda en la memoria')
  assert.ok(first.result.reportedLoad)

  const second = await a.ask('hoy piernas no')
  assert.equal(second.result.verdict, 'accept', `sin la memoria era decline: ${second.result.text}`)
  assert.match(second.result.text, /no me conste registrado/i, 'sigue diciendo que no está registrado')
})

test('sin la evidencia recordada, la misma petición se rechaza (control)', async () => {
  const a = app()
  await a.openChange()
  const { result } = await a.ask('hoy piernas no')
  assert.equal(result.verdict, 'decline')
})

test('insistir tras recargar mantiene el criterio en corto', async () => {
  const repositories = createMemoryRepositories()
  const a = app(repositories)
  await a.openChange()
  await a.ask('hoy no quiero hacer piernas')

  const reloaded = app(repositories)
  await reloaded.load()
  const { result } = await reloaded.ask('venga, porfa')
  assert.equal(result.verdict, 'decline')
  assert.match(result.text, /^Sigo pensando lo mismo/)
})

test('terminar el entrenamiento retira la elección y conserva el resto', async () => {
  const a = app()
  await a.ask('hoy no tengo partido de baloncesto y me apetece entrenar')
  await a.openChange()
  await a.ask('ayer hice 20 km de bici')
  const { answer } = await a.ask('cambia a algo más corto, voy justo de tiempo')
  await a.confirm(answer)
  assert.ok(a.memory.override)

  await a.finishWorkout()
  assert.equal(a.memory.override, null)
  assert.equal(a.memory.reportedLoads.length, 1)
  assert.ok(a.memory.messages.length >= 6)
  assert.equal(isActionApplied(a.memory, answer.action!.id), true)
})

test('una acción de otro día en el hilo se rechaza al confirmarla', async () => {
  const a = app()
  await a.openChange()
  const { answer } = await a.ask('cambia a algo más corto, voy justo de tiempo')
  const stale: AxisMessage = { ...answer, action: { ...answer.action!, dayKey: '2026-09-01' } }
  const validation = await a.confirm(stale)
  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.reason, 'otro_dia')
  assert.equal(a.memory.override, null)
  assert.equal(a.memory.actionStatuses[stale.action!.id]?.state, 'error')
})

test('la memoria de ayer no se carga hoy', async () => {
  const repositories = createMemoryRepositories()
  await repositories.axisMemory.save({
    ...emptyDayMemory('2026-09-06', NOW),
    cancelledActivities: ['Baloncesto'],
    thread: { lastIntent: 'change', changeMode: true, lastChangeRequest: { kind: 'rest', focus: null } },
  })
  const today = await app(repositories).load()
  assert.equal(today.dayKey, DAY)
  assert.deepEqual(today.cancelledActivities, [])
  assert.equal(today.thread.changeMode, false)
  assert.ok(await repositories.axisMemory.getByDay('2026-09-06'), 'el registro de ayer se conserva')
})

test('borrar todos los datos deja la memoria vacía', async () => {
  const repositories = createMemoryRepositories()
  const a = app(repositories)
  await a.ask('¿qué hago hoy?')
  await repositories.axisMemory.clear(DAY)
  const after = await app(repositories).load()
  assert.deepEqual(after, emptyDayMemory(DAY, NOW))
})
