/**
 * AxisActionEngine: el ciclo de vida de una acción, de la propuesta a la
 * memoria guardada.
 *
 * Nada de lo que hay aquí decide un entrenamiento. Se comprueba que lo que el
 * dominio ya permitió se ejecuta de forma segura, una sola vez, y que lo que no
 * permitió no se ejecuta por ningún camino.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createMemoryRepositories } from '../../data/memory-repositories'
import type { ScheduledActivity, UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { minutesFromMidnight } from '../shared/dates'
import type { Exercise, WorkoutSession } from '../workouts/types'
import { buildChangeTrainingAction, findProposal, resolveOverride, type AxisActionProposal } from './actions'
import {
  actionStatus,
  applyAction,
  checkAction,
  dismissAction,
  executeAction,
  isActionProposal,
  proposeAction,
  sanitizeActions,
  type AxisDay,
  type AxisMemoryPort,
} from './action-engine'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { answerFromBriefing } from './conversation/deterministic'
import { decide } from './engine'
import { emptyDayMemory, openChangeThread, rememberAnswer, type AxisDayMemory } from './memory'
import type { AxisProposal } from './types'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const DAY = '2026-09-07'
const NOW = '2026-09-07T10:00:00.000Z'

function profile(partial: Partial<UserProfile> = {}): UserProfile {
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
    ...partial,
  }
}

function recovery(partial: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return {
    dayKey: DAY,
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
    ...partial,
  }
}

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

function basketball(): ScheduledActivity {
  return {
    id: 'activity-1',
    name: 'Baloncesto',
    weekday: 0,
    startMinute: minutesFromMidnight(20, 0),
    endMinute: minutesFromMidnight(22, 0),
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'gluteos'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
}

/** El día tal y como lo construye la aplicación: contexto, decisión y selección. */
function dayWith(
  overrides: Partial<Parameters<typeof buildAxisContext>[0]> = {},
  memory: AxisDayMemory = emptyDayMemory(DAY, NOW),
): AxisDay {
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: [session()],
    activities: [],
    now: MONDAY,
    ...overrides,
  })
  const decision = decide(context)
  const selected = resolveOverride(memory.override, decision, DAY) ?? decision.primary
  return { context, decision, selected }
}

function alternative(day: AxisDay, index = 0): AxisProposal {
  const item = day.decision.alternatives[index]
  assert.ok(item, `el motor debe ofrecer la alternativa ${index}`)
  return item
}

function actionFor(day: AxisDay, target = alternative(day)): AxisActionProposal {
  return buildChangeTrainingAction({ context: day.context, origin: day.selected, target, reason: 'Prueba' })
}

/** Memoria con la acción en el hilo, como la deja la conversación. */
function withAction(memory: AxisDayMemory, action: AxisActionProposal): AxisDayMemory {
  return rememberAnswer(
    memory,
    { id: `msg-${action.id}`, role: 'axis', text: action.summary, createdAt: NOW, intent: 'change', action },
    { intent: 'change' },
    NOW,
  )
}

/** Un puerto que recuerda lo guardado, o que falla las veces que se le diga. */
function port(failures = 0): AxisMemoryPort & { saved: AxisDayMemory[] } {
  const saved: AxisDayMemory[] = []
  let remaining = failures
  return {
    saved,
    async save(memory) {
      if (remaining > 0) {
        remaining -= 1
        throw new Error('Disco lleno.')
      }
      saved.push(memory)
    },
  }
}

// ---------------------------------------------------------------------------
// 1. De respuesta a acción
// ---------------------------------------------------------------------------

test('proposeAction convierte el destino aprobado en una acción, y no inventa nada', () => {
  const day = dayWith()
  const target = alternative(day)
  const action = proposeAction(day, {
    proposedTarget: { type: target.type, focus: target.session?.focus ?? null },
    proposedReason: 'Vas justo de tiempo.',
  })
  assert.ok(action)
  assert.equal(action!.type, 'change_training')
  assert.deepEqual(action!.target, { type: target.type, focus: target.session?.focus ?? null })
  assert.equal(action!.origin.proposalId, day.selected.id)
  assert.equal(action!.reason, 'Vas justo de tiempo.')
  assert.equal(action!.dayKey, DAY)

  assert.equal(proposeAction(day, { proposedTarget: null }), null, 'sin destino no hay acción')
  assert.equal(proposeAction(day, {}), null)
  assert.equal(
    proposeAction(day, { proposedTarget: { type: 'MODIFIED_TRAINING', focus: 'core_movilidad' } }),
    null,
    'un destino que el motor no generó no produce acción',
  )
  assert.equal(
    proposeAction(day, { proposedTarget: { type: day.selected.type, focus: day.selected.session?.focus ?? null } }),
    null,
    'el destino ya seleccionado no produce acción',
  )
})

// ---------------------------------------------------------------------------
// 2. ¿Puede ejecutarse?
// ---------------------------------------------------------------------------

test('una acción válida pasa y resuelve la propuesta destino de la decisión vigente', () => {
  const day = dayWith()
  const target = alternative(day)
  const check = checkAction(actionFor(day, target), day, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, true)
  if (check.ok) assert.equal(check.target.id, target.id)
})

test('una acción malformada se rechaza aunque venga con un id', () => {
  const day = dayWith()
  const broken = { ...actionFor(day), target: { type: 42, focus: null } } as unknown as AxisActionProposal
  const check = checkAction(broken, day, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'malformada')
})

test('otro día', () => {
  const day = dayWith()
  const check = checkAction({ ...actionFor(day), dayKey: '2026-09-01' }, day, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'otro_dia')
})

test('destino que no existe en la decisión', () => {
  const day = dayWith()
  const check = checkAction(
    { ...actionFor(day), target: { type: 'MODIFIED_TRAINING', focus: 'core_movilidad' } },
    day,
    emptyDayMemory(DAY, NOW),
  )
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'ya_no_disponible')
})

function dayWithTamperedSession(mutate: (session: NonNullable<AxisProposal['session']>) => void): { day: AxisDay; target: AxisProposal } {
  const base = dayWith()
  const target = alternative(base)
  assert.ok(target.session)
  const tampered: AxisProposal = { ...target, session: { ...target.session!, exercises: target.session!.exercises.map((e) => ({ ...e })) } }
  mutate(tampered.session!)
  const decision = { ...base.decision, alternatives: base.decision.alternatives.map((a) => (a.id === target.id ? tampered : a)) }
  return { day: { ...base, decision }, target: tampered }
}

test('ejercicio inexistente en el catálogo del contexto', () => {
  const { day, target } = dayWithTamperedSession((s) => {
    s.exercises[0].exerciseId = 'press-banca-inventado'
  })
  const check = checkAction(actionFor(day, target), day, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'sesion_invalida')
})

test('peso por encima de la pesa disponible, y peso negativo', () => {
  for (const weight of [7.5, -1]) {
    const { day, target } = dayWithTamperedSession((s) => {
      s.exercises[0].suggestedWeightKg = weight
    })
    const check = checkAction(actionFor(day, target), day, emptyDayMemory(DAY, NOW))
    assert.equal(check.ok, false, String(weight))
    if (!check.ok) assert.equal(check.reason, 'sesion_invalida')
  }
})

test('la validación usa el catálogo del contexto, no uno global', () => {
  const base = dayWith()
  const target = alternative(base)
  // Un catálogo que no contiene ninguno de los ejercicios de la sesión.
  const emptyCatalog: Exercise[] = []
  const day: AxisDay = { ...base, context: { ...base.context, catalog: emptyCatalog } }
  const check = checkAction(actionFor(day, target), day, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'sesion_invalida')
})

test('sin efecto: el destino ya es la sesión seleccionada ahora, aunque el origen fuera otro', () => {
  const day = dayWith()
  const target = alternative(day)
  const action = actionFor(day, target) // origen: la principal
  // El usuario ya está en esa alternativa (por otra acción aplicada antes).
  const now: AxisDay = { ...day, selected: target }
  const check = checkAction(action, now, emptyDayMemory(DAY, NOW))
  assert.equal(check.ok, false)
  if (!check.ok) assert.equal(check.reason, 'sin_efecto')
})

test('propuesta obsoleta: con un partido nuevo la opción se juzga contra la decisión de ahora', () => {
  const before = dayWith()
  const action = actionFor(before)
  const after = dayWith({ activities: [basketball()] })
  const check = checkAction(action, after, emptyDayMemory(DAY, NOW))
  if (check.ok) {
    assert.ok([after.decision.primary, ...after.decision.alternatives].some((p) => p.id === check.target.id), 'sale de la decisión nueva')
  } else {
    assert.ok(['ya_no_disponible', 'sin_efecto'].includes(check.reason))
  }
})

test('ya aplicada, cancelada y superada no vuelven a ejecutarse', () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)

  const applied = applyAction(action, day, memory, NOW)
  assert.equal(applied.ok, true)
  if (!applied.ok) return
  const again = checkAction(action, day, applied.memory)
  assert.equal(again.ok, false)
  if (!again.ok) assert.equal(again.reason, 'ya_aplicada')

  const cancelled = dismissAction(action, memory, NOW)
  const afterCancel = checkAction(action, day, cancelled)
  assert.equal(afterCancel.ok, false)
  if (!afterCancel.ok) assert.equal(afterCancel.reason, 'cancelada')

  const superseded: AxisDayMemory = { ...memory, actionStatuses: { [action.id]: { state: 'superseded' } } }
  const afterSupersede = checkAction(action, day, superseded)
  assert.equal(afterSupersede.ok, false)
  if (!afterSupersede.ok) assert.equal(afterSupersede.reason, 'superada')
})

test('una acción en error se puede reintentar', () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory: AxisDayMemory = { ...emptyDayMemory(DAY, NOW), actionStatuses: { [action.id]: { state: 'error', message: 'x' } } }
  assert.equal(checkAction(action, day, memory).ok, true)
})

// ---------------------------------------------------------------------------
// 3. Aplicar, cancelar, estado
// ---------------------------------------------------------------------------

test('aplicar fija el override, marca applied y cierra la negociación; es puro', () => {
  const day = dayWith()
  const target = alternative(day)
  const action = actionFor(day, target)
  const memory = openChangeThread(withAction(emptyDayMemory(DAY, NOW), action), { id: 'open', role: 'axis', text: 'x', createdAt: NOW }, NOW)

  const result = applyAction(action, day, memory, NOW)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.override.type, target.type)
  assert.equal(result.override.focus, target.session?.focus ?? null)
  assert.equal(result.override.source, 'axis_conversation')
  assert.deepEqual(result.memory.override, result.override)
  assert.equal(actionStatus(result.memory, action.id).state, 'applied')
  assert.equal(result.memory.thread.changeMode, false)
  assert.equal(memory.override, null, 'la memoria de entrada no se ha tocado')
  assert.equal(actionStatus(memory, action.id).state, 'pending')
})

test('aplicar una acción que no pasa deja el motivo en la memoria; una ya cerrada la deja intacta', () => {
  const day = dayWith()
  const action = { ...actionFor(day), dayKey: '2026-09-01' }
  const memory = emptyDayMemory(DAY, NOW)
  const result = applyAction(action, day, memory, NOW)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.reason, 'otro_dia')
  assert.equal(actionStatus(result.memory, action.id).state, 'error')
  assert.equal(result.memory.override, null)

  const cancelled = dismissAction(action, memory, NOW)
  const closed = applyAction(action, day, cancelled, NOW)
  assert.equal(closed.ok, false)
  assert.equal(closed.memory, cancelled, 'no se marca error sobre una acción cancelada')
})

test('cancelar termina la negociación y no toca una acción aplicada', () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = openChangeThread(withAction(emptyDayMemory(DAY, NOW), action), { id: 'open', role: 'axis', text: 'x', createdAt: NOW }, NOW)
  const cancelled = dismissAction(action, memory, NOW)
  assert.equal(actionStatus(cancelled, action.id).state, 'cancelled')
  assert.equal(cancelled.thread.changeMode, false)

  const applied = applyAction(action, day, memory, NOW)
  if (applied.ok) assert.equal(dismissAction(action, applied.memory, NOW), applied.memory)
})

test('el estado de una acción sin registro es pending', () => {
  assert.deepEqual(actionStatus(emptyDayMemory(DAY, NOW), 'nunca-vista'), { state: 'pending' })
})

// ---------------------------------------------------------------------------
// 4. Ejecutar con persistencia
// ---------------------------------------------------------------------------

test('ejecutar: comprueba, aplica, guarda; lo guardado es lo aplicado', async () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)
  const disk = port()

  const result = await executeAction(action, day, memory, disk, NOW)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(disk.saved.length, 1)
  assert.deepEqual(disk.saved[0], result.memory, 'lo que se devuelve es exactamente lo guardado')
  assert.equal(actionStatus(result.memory, action.id).state, 'applied')
  assert.ok(result.memory.override)
})

test('si guardar falla, nada queda aplicado y el error es visible y reintentable', async () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)
  const disk = port(1)

  const failed = await executeAction(action, day, memory, disk, NOW)
  assert.equal(failed.ok, false)
  if (failed.ok) return
  assert.equal(failed.reason, 'persistencia')
  assert.equal(failed.message, 'Disco lleno.')
  assert.equal(failed.memory.override, null, 'el override no se aplica')
  assert.equal(actionStatus(failed.memory, action.id).state, 'error')
  assert.equal(disk.saved.length, 0, 'no se escribió nada')
  assert.equal(failed.memory.thread.changeMode, memory.thread.changeMode, 'la negociación sigue como estaba')

  // Reintento: el error no bloquea.
  const retry = await executeAction(action, day, failed.memory, disk, NOW)
  assert.equal(retry.ok, true)
  if (retry.ok) {
    assert.equal(actionStatus(retry.memory, action.id).state, 'applied')
    assert.equal(disk.saved.length, 1)
  }
})

test('nunca se guarda applied antes de que el guardado válido termine: el puerto recibe la memoria ya aplicada, una vez', async () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)
  const seen: string[] = []
  const disk: AxisMemoryPort = {
    async save(next) {
      seen.push(actionStatus(next, action.id).state)
    },
  }
  await executeAction(action, day, memory, disk, NOW)
  assert.deepEqual(seen, ['applied'])
})

test('doble confirmación: la segunda recibe ya_aplicada y no escribe', async () => {
  const day = dayWith()
  const action = actionFor(day)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)
  const disk = port()

  const first = await executeAction(action, day, memory, disk, NOW)
  assert.equal(first.ok, true)
  if (!first.ok) return
  const second = await executeAction(action, day, first.memory, disk, NOW)
  assert.equal(second.ok, false)
  if (!second.ok) {
    assert.equal(second.reason, 'ya_aplicada')
    assert.equal(second.memory, first.memory, 'la memoria no cambia')
  }
  assert.equal(disk.saved.length, 1)

  // Dos llamadas casi simultáneas sobre la misma memoria de partida.
  const [a, b] = await Promise.all([
    executeAction(action, day, memory, port(), NOW),
    executeAction(action, day, memory, port(), NOW),
  ])
  assert.equal(a.ok && b.ok, true, 'cada una sobre su copia es válida')
  if (a.ok && b.ok) assert.deepEqual(a.memory, b.memory, 'y producen exactamente lo mismo: idempotente')
})

test('confirmación después de recargar: la acción leída del repositorio se ejecuta contra la decisión nueva', async () => {
  const repositories = createMemoryRepositories()
  const day = dayWith()
  const action = actionFor(day)
  await repositories.axisMemory.save(withAction(emptyDayMemory(DAY, NOW), action))

  const reloaded = await repositories.axisMemory.getByDay(DAY)
  assert.ok(reloaded)
  const persisted = reloaded!.messages.at(-1)!.action!
  assert.equal(isActionProposal(persisted), true)

  const dayAfterReload = dayWith({}, reloaded!)
  const result = await executeAction(persisted, dayAfterReload, reloaded!, repositories.axisMemory, NOW)
  assert.equal(result.ok, true)
  const stored = await repositories.axisMemory.getByDay(DAY)
  assert.equal(actionStatus(stored!, persisted.id).state, 'applied')
  assert.ok(stored!.override)
})

test('confirmación después de un cambio de contexto: se rechaza sin tocar la memoria si la opción ya no existe', async () => {
  const before = dayWith()
  const action = actionFor(before)
  const memory = withAction(emptyDayMemory(DAY, NOW), action)
  const after = dayWith({ activities: [basketball()] })
  const disk = port()

  const result = await executeAction(action, after, memory, disk, NOW)
  if (!result.ok) {
    assert.ok(['ya_no_disponible', 'sin_efecto'].includes(result.reason))
    assert.equal(result.memory.override, null)
    assert.equal(disk.saved.length, 0)
  } else {
    assert.ok([after.decision.primary, ...after.decision.alternatives].some((p) => p.id === findProposal(after.decision, action.target)?.id))
  }
})

// ---------------------------------------------------------------------------
// 5. Varias acciones pendientes
// ---------------------------------------------------------------------------

test('al aplicar una acción, las demás pendientes del día quedan superadas y ya no se ejecutan', async () => {
  const day = dayWith()
  const first = actionFor(day, alternative(day, 0))
  const second = actionFor(day, alternative(day, 1))
  let memory = withAction(withAction(emptyDayMemory(DAY, NOW), first), second)
  assert.equal(actionStatus(memory, first.id).state, 'pending')
  assert.equal(actionStatus(memory, second.id).state, 'pending')

  const result = await executeAction(first, day, memory, port(), NOW)
  assert.equal(result.ok, true)
  if (!result.ok) return
  memory = result.memory

  assert.equal(actionStatus(memory, first.id).state, 'applied')
  assert.equal(actionStatus(memory, second.id).state, 'superseded')

  const dayAfter: AxisDay = { ...day, selected: resolveOverride(memory.override, day.decision, DAY)! }
  const again = await executeAction(second, dayAfter, memory, port(), NOW)
  assert.equal(again.ok, false)
  if (!again.ok) assert.equal(again.reason, 'superada')
  assert.equal(again.memory, memory, 'nada cambia')
})

test('superar no toca acciones aplicadas ni canceladas; sí las que estaban en error', () => {
  const day = dayWith()
  const a = actionFor(day, alternative(day, 0))
  const b = actionFor(day, alternative(day, 1))
  const c = { ...actionFor(day, alternative(day, 1)), id: 'c' }
  let memory = withAction(withAction(withAction(emptyDayMemory(DAY, NOW), a), b), c)
  memory = dismissAction(b, memory, NOW)
  memory = { ...memory, actionStatuses: { ...memory.actionStatuses, c: { state: 'error', message: 'x' } } }

  const result = applyAction(a, day, memory, NOW)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(actionStatus(result.memory, b.id).state, 'cancelled')
  assert.equal(actionStatus(result.memory, 'c').state, 'superseded')
})

// ---------------------------------------------------------------------------
// 6. Acciones leídas de disco
// ---------------------------------------------------------------------------

test('una acción corrupta en el hilo se queda sin botón', () => {
  const day = dayWith()
  const good = actionFor(day)
  let memory = withAction(emptyDayMemory(DAY, NOW), good)
  memory = {
    ...memory,
    messages: [
      ...memory.messages,
      { id: 'bad', role: 'axis', text: 'x', createdAt: NOW, action: { id: 'bad-action', type: 'delete_everything' } as unknown as AxisActionProposal },
    ],
  }
  const clean = sanitizeActions(memory)
  assert.equal(clean.messages[0].action?.id, good.id, 'la buena se conserva')
  assert.equal(clean.messages[1].action, null, 'la corrupta pierde el botón')
  assert.equal(clean.messages[1].text, 'x', 'el texto se conserva')
  assert.equal(sanitizeActions(clean), clean, 'sin nada que limpiar, no se toca')
})

test('isActionProposal exige la forma completa', () => {
  const day = dayWith()
  const action = actionFor(day)
  assert.equal(isActionProposal(action), true)
  assert.equal(isActionProposal(null), false)
  assert.equal(isActionProposal({ ...action, type: 'change_duration' }), false)
  assert.equal(isActionProposal({ ...action, id: '' }), false)
  assert.equal(isActionProposal({ ...action, target: { type: 'TRAINING' } }), false)
  assert.equal(isActionProposal({ ...action, origin: null }), false)
})

// ---------------------------------------------------------------------------
// 7. Integración: AXIS → propuesta → engine → memoria → pantallas
// ---------------------------------------------------------------------------

test('AXIS propone, el engine ejecuta, la memoria guarda y ambas pantallas ven la misma sesión', async () => {
  const repositories = createMemoryRepositories()
  let memory = emptyDayMemory(DAY, NOW)
  const day = dayWith({}, memory)
  const briefing = buildBriefing(day.context, day.decision, [session()], day.selected, memory.override, memory.reportedLoads)

  const answer = answerFromBriefing('cambia a algo más corto, voy justo de tiempo', briefing, { lastIntent: 'change', changeMode: true })
  assert.equal(answer.verdict, 'accept')
  const action = proposeAction(day, answer)
  assert.ok(action, 'la aceptación produce una acción')
  memory = withAction(memory, action!)

  const result = await executeAction(action!, day, memory, repositories.axisMemory, NOW)
  assert.equal(result.ok, true)
  if (!result.ok) return

  // Lo que Inicio y Entrenamiento leen: la misma propuesta resuelta desde la memoria.
  const stored = (await repositories.axisMemory.getByDay(DAY))!
  const inicio = resolveOverride(stored.override, day.decision, DAY)
  const entrenamiento = resolveOverride(stored.override, day.decision, DAY)
  assert.ok(inicio)
  assert.equal(inicio!.id, entrenamiento!.id)
  assert.equal(inicio!.type, 'LIGHT_TRAINING')
  assert.notEqual(inicio!.id, day.decision.primary.id)
})

// ---------------------------------------------------------------------------
// 8. Arquitectura
// ---------------------------------------------------------------------------

test('el engine de acciones no es otro cerebro: no importa reglas, hechos, constructor, React, datos ni proveedor', () => {
  const source = readFileSync(new URL('./action-engine.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from '\.\/(rules|facts|session-builder|engine)'/, 'no decide')
  assert.doesNotMatch(source, /from 'react'|indexedDB|getRepositories|from '[^']*\/data\//)
  // Lo que importa son las importaciones, no que el comentario diga que no los conoce.
  const imports = source.match(/^import .*$/gm)?.join('\n') ?? ''
  assert.doesNotMatch(imports, /gemini|groq|netlify|vercel|app\/api|conversation\/ai|lib\/ai/i)
  assert.doesNotMatch(source, /from '[^']*components\//)
})

test('el motor de decisión no depende del engine de acciones', () => {
  for (const file of ['engine.ts', 'rules.ts', 'facts.ts', 'session-builder.ts']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /action-engine/, file)
  }
})

test('el store ya no contiene el ciclo de vida: solo llama al engine', () => {
  const source = readFileSync(new URL('../../state/store.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /buildPendingAction|validateAction|overrideFrom|applyOverride|buildChangeTrainingAction/)
  assert.match(source, /executeAction\(/)
  assert.match(source, /proposeAction\(/)
  assert.match(source, /dismissAction\(/)
})
