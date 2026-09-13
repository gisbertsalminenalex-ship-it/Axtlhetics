import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { createMemoryRepositories } from '../../data/memory-repositories'
import type { ScheduledActivity, UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { minutesFromMidnight } from '../shared/dates'
import {
  markProposalChanged,
  startWorkout,
  toWorkoutSession,
} from '../workouts/active-workout'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import type { WorkoutSession } from '../workouts/types'
import {
  buildChangeTrainingAction,
  contextFingerprint,
  isSessionValid,
  overrideFrom,
  resolveOverride,
  validateAction,
} from './actions'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { answerFromBriefing } from './conversation/deterministic'
import { decide } from './engine'
import type { AxisContext, AxisDecision, AxisProposal } from './types'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const MONDAY_KEY = '2026-09-07'
const SUNDAY_KEY = '2026-09-06'

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
    dayKey: SUNDAY_KEY,
    startedAt: '2026-09-06T18:00:00.000Z',
    completedAt: '2026-09-06T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda'],
    exercises: [],
    totalVolumeKg: 720,
    status: 'completed',
    perceivedEffort: 4,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

function basketball(partial: Partial<ScheduledActivity> = {}): ScheduledActivity {
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
    ...partial,
  }
}

type World = {
  context: AxisContext
  decision: AxisDecision
  /** La sesión que el usuario tiene ahora mismo. */
  current: AxisProposal
}

function world(overrides: Partial<Parameters<typeof buildAxisContext>[0]> = {}): World {
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: [session()],
    activities: [],
    now: MONDAY,
    ...overrides,
  })
  const decision = decide(context)
  return { context, decision, current: decision.primary }
}

/** Una alternativa distinta de la actual, que es lo que AXIS propondría. */
function someAlternative(decision: AxisDecision): AxisProposal {
  const alternative = decision.alternatives[0]
  assert.ok(alternative, 'el motor debe ofrecer alguna alternativa')
  return alternative
}

function anAction(w: World, target = someAlternative(w.decision)) {
  return buildChangeTrainingAction({
    context: w.context,
    origin: w.current,
    target,
    reason: 'Prueba',
  })
}

// ---------------------------------------------------------------------------
// 1. AXIS llega a una propuesta de acción
// ---------------------------------------------------------------------------

test('la conversación produce un destino cuando AXIS acepta un cambio', () => {
  const w = world()
  const briefing = buildBriefing(w.context, w.decision, [session()], w.current)

  const answer = answerFromBriefing(
    'ayer hice 20 km de bici por montaña, hoy piernas no',
    briefing,
    { lastIntent: 'change', changeMode: true },
  )

  assert.ok(answer.proposedTarget, 'AXIS debe proponer una opción concreta')
  assert.ok(answer.proposedReason, 'y el motivo con el que la defiende')
})

test('cuando AXIS se niega no propone ninguna acción', () => {
  const w = world()
  const briefing = buildBriefing(w.context, w.decision, [session()], w.current)

  const answer = answerFromBriefing('hoy no quiero hacer piernas', briefing, {
    lastIntent: 'change',
    changeMode: true,
  })

  assert.equal(answer.proposedTarget ?? null, null, 'una negativa no lleva botón')
})

test('la acción guarda la elección, no un id que no sobrevive al recálculo', () => {
  const w = world()
  const target = someAlternative(w.decision)
  const action = anAction(w, target)

  assert.equal(action.type, 'change_training')
  assert.equal(action.target.type, target.type)
  assert.equal(action.target.focus, target.session?.focus ?? null)
  assert.equal(action.origin.proposalId, w.current.id)
  assert.equal(action.origin.headline, w.current.headline)
  assert.ok(action.label.length > 0)
  assert.ok(action.summary.length > 0)
})

// ---------------------------------------------------------------------------
// 2. Una propuesta no cambia nada por sí sola
// ---------------------------------------------------------------------------

test('construir la acción no toca el estado ni la persistencia', async () => {
  const repositories = createMemoryRepositories()
  const w = world()

  anAction(w)

  assert.equal(
    await repositories.dayPlan.getByDay(MONDAY_KEY),
    null,
    'nada se ha guardado: hace falta confirmar',
  )
})

test('la sesión activa sigue siendo la misma mientras no se confirme', () => {
  const w = world()
  anAction(w)

  const activa = resolveOverride(null, w.decision, MONDAY_KEY) ?? w.decision.primary
  assert.equal(activa.id, w.current.id)
})

// ---------------------------------------------------------------------------
// 3-4. Validar y aplicar
// ---------------------------------------------------------------------------

test('una acción válida resuelve la propuesta destino real', () => {
  const w = world()
  const target = someAlternative(w.decision)
  const validation = validateAction(anAction(w, target), w.decision, w.context)

  assert.equal(validation.ok, true)
  if (validation.ok) {
    assert.equal(validation.target.id, target.id)
    assert.equal(validation.recomputed, false, 'el contexto no ha cambiado')
  }
})

test('al aplicar, la elección guardada apunta a la nueva sesión', async () => {
  const repositories = createMemoryRepositories()
  const w = world()
  const target = someAlternative(w.decision)
  const action = anAction(w, target)

  const validation = validateAction(action, w.decision, w.context)
  assert.equal(validation.ok, true)
  if (!validation.ok) return

  await repositories.dayPlan.save({
    dayKey: MONDAY_KEY,
    override: overrideFrom(action, validation.target),
    cancelledActivities: [],
  })

  const stored = await repositories.dayPlan.getByDay(MONDAY_KEY)
  assert.ok(stored?.override)
  assert.equal(stored.override.type, target.type)
  assert.equal(stored.override.focus, target.session?.focus ?? null)
  assert.equal(stored.override.originHeadline, w.current.headline, 'queda de qué se cambió')
  assert.equal(stored.override.source, 'axis_conversation')
})

test('la propuesta activa pasa a ser la elegida', () => {
  const w = world()
  const target = someAlternative(w.decision)
  const action = anAction(w, target)
  const validation = validateAction(action, w.decision, w.context)
  assert.equal(validation.ok, true)
  if (!validation.ok) return

  const override = overrideFrom(action, validation.target)
  const activa = resolveOverride(override, w.decision, MONDAY_KEY)

  assert.ok(activa)
  assert.equal(activa.id, target.id)
  assert.notEqual(activa.id, w.decision.primary.id, 'ya no manda la recomendación original')
})

// ---------------------------------------------------------------------------
// 8. Sobrevive a una recarga
// ---------------------------------------------------------------------------

test('tras recargar, la elección se vuelve a resolver contra la decisión nueva', () => {
  const w = world()
  const target = someAlternative(w.decision)
  const action = anAction(w, target)
  const validation = validateAction(action, w.decision, w.context)
  assert.equal(validation.ok, true)
  if (!validation.ok) return

  const override = overrideFrom(action, validation.target)

  // Recargar: el motor decide otra vez y todos los ids son nuevos.
  const recargado = world()
  assert.notEqual(recargado.decision.primary.id, w.decision.primary.id, 'los ids cambian')

  const activa = resolveOverride(override, recargado.decision, MONDAY_KEY)
  assert.ok(activa, 'la elección sigue localizándose por tipo y foco')
  assert.equal(activa.type, target.type)
  assert.equal(activa.session?.focus ?? null, target.session?.focus ?? null)
})

test('una elección de otro día no se aplica a hoy', () => {
  const w = world()
  const action = anAction(w)
  const validation = validateAction(action, w.decision, w.context)
  if (!validation.ok) return

  const override = overrideFrom(action, validation.target)
  assert.equal(resolveOverride(override, w.decision, '2026-09-08'), null)
})

// ---------------------------------------------------------------------------
// 9-12. Lo que no debe poder pasar
// ---------------------------------------------------------------------------

test('aplicar dos veces la misma acción no tiene efecto la segunda', () => {
  const w = world()
  const target = someAlternative(w.decision)
  const action = anAction(w, target)

  // Primera vez: válida.
  assert.equal(validateAction(action, w.decision, w.context).ok, true)

  /*
   * Segunda vez, ya con esa sesión activa. El origen de la acción es la sesión
   * de la que se partía, así que si ya se aplicó no hay nada que cambiar.
   */
  const yaAplicada = buildChangeTrainingAction({
    context: w.context,
    origin: target,
    target,
    reason: 'Prueba',
  })
  const segunda = validateAction(yaAplicada, w.decision, w.context)

  assert.equal(segunda.ok, false)
  if (!segunda.ok) assert.equal(segunda.reason, 'sin_efecto')
})

test('una propuesta de otro día se rechaza en vez de aplicarse', () => {
  const w = world()
  const action = { ...anAction(w), dayKey: '2026-09-01' }
  const validation = validateAction(action, w.decision, w.context)

  assert.equal(validation.ok, false)
  if (!validation.ok) assert.equal(validation.reason, 'otro_dia')
})

test('si la opción ya no existe con los datos de ahora, se rechaza', () => {
  const w = world()
  const action = anAction(w)

  // El usuario registra un partido mientras el botón estaba en pantalla: AXIS
  // decide otra vez y puede que esa opción ya no esté sobre la mesa.
  const despues = world({ activities: [basketball()] })
  const validation = validateAction(action, despues.decision, despues.context)

  if (!validation.ok) {
    assert.equal(validation.reason, 'ya_no_disponible')
  } else {
    // Si sigue existiendo, se aplica la versión recalculada, no la vieja.
    assert.equal(validation.recomputed, true, 'debe avisar de que el contexto cambió')
    assert.ok(
      [despues.decision.primary, ...despues.decision.alternatives].some(
        (p) => p.id === validation.target.id,
      ),
      'la sesión aplicada sale de la decisión nueva, no de la antigua',
    )
  }
})

test('la huella del contexto cambia cuando cambia algo que decide', () => {
  const base = world()
  const conPartido = world({ activities: [basketball()] })
  const sinRecuperacion = world({ recoveryInputs: null })

  assert.notEqual(contextFingerprint(base.context), contextFingerprint(conPartido.context))
  assert.notEqual(contextFingerprint(base.context), contextFingerprint(sinRecuperacion.context))
  assert.equal(
    contextFingerprint(base.context),
    contextFingerprint(world().context),
    'el mismo estado da la misma huella',
  )
})

// ---------------------------------------------------------------------------
// 13. El catálogo real manda
// ---------------------------------------------------------------------------

test('toda sesión que propone el motor pasa la validación de catálogo', () => {
  const w = world()
  for (const proposal of [w.decision.primary, ...w.decision.alternatives]) {
    assert.ok(isSessionValid(proposal), `sesión inválida: ${proposal.label}`)
  }
})

test('una sesión con un ejercicio inventado se rechaza', () => {
  const w = world()
  const conSesion = [w.decision.primary, ...w.decision.alternatives].find((p) => p.session)
  assert.ok(conSesion?.session)

  const inventado: AxisProposal = {
    ...conSesion,
    session: {
      ...conSesion.session,
      exercises: [
        { ...conSesion.session.exercises[0], exerciseId: 'press-banca-con-barra', name: 'Press banca' },
      ],
    },
  }

  assert.equal(isSessionValid(inventado), false, 'ese ejercicio no está en el catálogo')
})

test('una carga por encima del material disponible se rechaza', () => {
  const w = world()
  const conSesion = [w.decision.primary, ...w.decision.alternatives].find((p) => p.session)
  assert.ok(conSesion?.session)

  const conMancuernas: AxisProposal = {
    ...conSesion,
    session: {
      ...conSesion.session,
      exercises: [{ ...conSesion.session.exercises[0], suggestedWeightKg: 40 }],
    },
  }

  // En casa hay una pesa de 5 kg. Cuarenta kilos no existen.
  assert.equal(isSessionValid(conMancuernas), false)
})

test('el catálogo real no contiene nada que necesite gimnasio', () => {
  // Salvaguarda del alcance: si alguien añade un ejercicio de barra o banco, este
  // test lo caza antes de que AXIS pueda proponerlo.
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(
      exercise.equipment.every((item) => ['ninguno', 'pesa', 'superficie_elevada'].includes(item)),
      `${exercise.id} necesita material que no hay`,
    )
  }
})

// ---------------------------------------------------------------------------
// 7. La modificación queda registrada
// ---------------------------------------------------------------------------

test('entrenar una sesión cambiada deja constancia de la propuesta original', () => {
  const w = world()
  const target = [w.decision.primary, ...w.decision.alternatives].find(
    (p) => p.session && p.id !== w.decision.primary.id,
  )
  assert.ok(target?.session)

  const started = startWorkout(target)
  assert.ok(started)

  // Es lo que hace la aplicación al empezar: si lo que se entrena no es lo que
  // AXIS recomendaba, se registra de qué se cambió.
  const marked = markProposalChanged(started, w.decision.primary.headline)
  const guardada = toWorkoutSession(marked, { status: 'abandoned', perceivedEffort: null })

  const cambio = guardada.modifications.find((m) => m.kind === 'proposal_changed')
  assert.ok(cambio, 'debe quedar registrada la modificación')
  assert.match(cambio.detail, new RegExp(w.decision.primary.headline.slice(0, 15), 'i'))

  // Y la instantánea guarda lo que de verdad se entrenó.
  assert.equal(guardada.proposal?.proposalId, target.id)
})

// ---------------------------------------------------------------------------
// 16. La conversación no puede saltarse el dominio
// ---------------------------------------------------------------------------

test('la conversación de AXIS no toca React, IndexedDB ni los repositorios', () => {
  const carpeta = new URL('./conversation/', import.meta.url)
  const archivos = readdirSync(carpeta)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

  assert.ok(archivos.length > 0, 'debe haber módulos que revisar')

  for (const name of archivos) {
    const source = readFileSync(new URL(name, carpeta), 'utf8')

    assert.doesNotMatch(source, /from 'react'|useState|useEffect/, `${name} toca React`)
    assert.doesNotMatch(source, /indexedDB|IDBDatabase/, `${name} toca IndexedDB`)
    assert.doesNotMatch(source, /getRepositories|\/data\//, `${name} toca los repositorios`)
  }
})

test('el dominio de acciones tampoco conoce la persistencia ni la interfaz', () => {
  const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /from 'react'/)
  assert.doesNotMatch(source, /indexedDB|IDBDatabase/)
  assert.doesNotMatch(source, /getRepositories/)
})

// ---------------------------------------------------------------------------
// 14. AXIS conversa sobre el estado nuevo
// ---------------------------------------------------------------------------

test('AXIS puede explicar qué se cambió y por qué, solo si se le pregunta', () => {
  const w = world()
  const target = [w.decision.primary, ...w.decision.alternatives].find(
    (p) => p.session && p.id !== w.current.id,
  )
  assert.ok(target)

  const motivo = 'Vas justo de tiempo.'
  const briefing = buildBriefing(w.context, w.decision, [session()], target, {
    originHeadline: w.current.headline,
    reason: motivo,
  })

  const explicacion = answerFromBriefing('¿qué hemos cambiado?', briefing)
  assert.equal(explicacion.intent, 'changed')
  assert.match(explicacion.text, new RegExp(w.current.headline.slice(0, 15), 'i'))
  assert.match(explicacion.text, new RegExp(motivo.slice(0, 12), 'i'))

  // Pero al preguntar por el día no se arrastra el cambio: interesa qué hacer.
  const hoy = answerFromBriefing('¿qué entrenamiento tengo hoy?', briefing)
  assert.doesNotMatch(hoy.text, /cambiamos/i)
})

test('sin cambios, AXIS dice que la sesión es la que recomendó', () => {
  const w = world()
  const briefing = buildBriefing(w.context, w.decision, [session()], w.current)

  const answer = answerFromBriefing('¿qué hemos cambiado?', briefing)
  assert.equal(answer.intent, 'changed')
  assert.match(answer.text, /nada/i)
})

test('tras aplicar, AXIS habla de la sesión nueva y no de la anterior', () => {
  const w = world()
  const target = [w.decision.primary, ...w.decision.alternatives].find(
    (p) => p.session && p.id !== w.current.id,
  )
  assert.ok(target?.session)

  // El briefing se construye con la propuesta activa, que ahora es la elegida.
  const briefing = buildBriefing(w.context, w.decision, [session()], target)
  const answer = answerFromBriefing('¿qué entrenamiento tengo hoy?', briefing)

  assert.equal(briefing.proposal?.session?.title, target.session.title)
  assert.match(answer.text, new RegExp(target.headline.slice(0, 18), 'i'))
})
