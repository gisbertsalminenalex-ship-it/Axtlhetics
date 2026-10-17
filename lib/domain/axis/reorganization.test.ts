/**
 * Reorganización flexible del entrenamiento (D-022), de punta a punta: lo que
 * dice el usuario, lo que responde AXIS, la acción que propone, aplicarla y
 * deshacerla. Sin plan semanal y sin copiar sesiones entre días.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { ScheduledActivity, UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { weekdayOfKey } from '../shared/dates'
import type { WorkoutSession } from '../workouts/types'
import {
  applyAction,
  canUndoAction,
  checkAction,
  executeAction,
  isActionProposal,
  proposeAction,
  undoAction,
  type AxisDay,
  type AxisMemoryPort,
} from './action-engine'
import { buildChangeTrainingAction, findProposal, validateAction, type AxisActionProposal } from './actions'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { answerFromBriefing } from './conversation/deterministic'
import { FATIGUE_NOT_REGISTERED } from './conversation/negotiation'
import { decide } from './engine'
import { deriveFacts } from './facts'
import {
  emptyDayMemory,
  isAxisDayMemory,
  movedFromDayBefore,
  type AxisDayMemory,
} from './memory'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const TODAY = '2026-09-07'
const TOMORROW = '2026-09-08'
const NOW = '2026-09-07T10:00:00.000Z'

function profile(patch: Partial<UserProfile> = {}): UserProfile {
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
    ...patch,
  }
}

function recovery(patch: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return {
    dayKey: TODAY,
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
    ...patch,
  }
}

function session(dayKey = '2026-09-05'): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
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

function activity(patch: Partial<ScheduledActivity>): ScheduledActivity {
  return {
    id: `a-${patch.name ?? 'x'}`,
    name: 'Baloncesto',
    weekday: 3,
    date: null,
    startMinute: null,
    endMinute: null,
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'core'],
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

type Setup = {
  profile?: UserProfile
  recovery?: RecoveryInputs | null
  sessions?: WorkoutSession[]
  activities?: ScheduledActivity[]
  movedFromYesterday?: boolean
  availableMinutesToday?: number | null
  movedTo?: string | null
}

function setup(options: Setup = {}) {
  const sessions = options.sessions ?? [session()]
  const context = buildAxisContext({
    profile: options.profile ?? profile(),
    recoveryInputs: options.recovery === undefined ? recovery() : options.recovery,
    recentSessions: sessions,
    activities: options.activities ?? [],
    movedFromYesterday: options.movedFromYesterday,
    availableMinutesToday: options.availableMinutesToday,
    now: MONDAY,
  })
  const decision = decide(context)
  const briefing = buildBriefing(context, decision, sessions, decision.primary, null, [], options.movedTo ?? null)
  const day: AxisDay = { context, decision, selected: decision.primary }
  return { context, decision, briefing, day }
}

const CHANGE_MODE = { lastIntent: null, changeMode: true, lastChangeRequest: null }

/** Un puerto que recuerda lo guardado y puede fallar a voluntad. */
function port(options: { failSave?: boolean; activities?: ScheduledActivity[] } = {}) {
  const activities = options.activities ?? []
  const saved: AxisDayMemory[] = []
  const disk: AxisMemoryPort & { saved: AxisDayMemory[]; activities: ScheduledActivity[] } = {
    saved,
    activities,
    async save(memory) {
      if (options.failSave) throw new Error('disco lleno')
      saved.push(memory)
    },
    async addActivity(item) {
      activities.push(item)
    },
    async removeActivity(id) {
      const index = activities.findIndex((item) => item.id === id)
      if (index >= 0) activities.splice(index, 1)
    },
  }
  return disk
}

// ---------------------------------------------------------------------------
// Contexto: minutos y día movido
// ---------------------------------------------------------------------------

test('los minutos dichos bajan el tiempo disponible, nunca lo suben', () => {
  assert.equal(deriveFacts(setup({ availableMinutesToday: 25 }).context).availableMinutes, 25)
  assert.equal(deriveFacts(setup({ availableMinutesToday: 200 }).context).availableMinutes, 60)
  assert.equal(deriveFacts(setup().context).availableMinutes, 60)
})

test('con minutos dichos, el motor vuelve a decidir y la sesión cabe en ellos', () => {
  const { decision } = setup({ availableMinutesToday: 25 })
  const minutes = decision.primary.session?.estimatedMinutes ?? 0
  assert.ok(minutes > 0 && minutes <= 25, `sesión de ${minutes} min`)
})

test('un entrenamiento movido desde ayer hace disponible un día no marcado, sin copiar nada', () => {
  const notMonday = profile({ availableWeekdays: [2, 3] })
  assert.equal(setup({ profile: notMonday }).decision.primary.type, 'REST')
  const moved = setup({ profile: notMonday, movedFromYesterday: true })
  assert.notEqual(moved.decision.primary.type, 'REST')
  assert.ok(moved.decision.primary.session, 'el motor genera la sesión de hoy desde cero')
})

test('el día movido sigue sujeto al resto de reglas: con recuperación baja, recuperar', () => {
  const tired = setup({
    profile: profile({ availableWeekdays: [2, 3] }),
    movedFromYesterday: true,
    recovery: recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5, hydrationGlasses: 1 }),
  })
  assert.equal(tired.decision.primary.type, 'RECOVERY')
})

test('de ayer solo se lee si se movió a hoy; también pasada la medianoche', () => {
  const yesterday = { ...emptyDayMemory('2026-09-06', NOW), movedTo: TODAY }
  assert.equal(movedFromDayBefore(yesterday, TODAY), true)
  assert.equal(movedFromDayBefore(yesterday, TOMORROW), false, 'un movimiento pasado deja de aplicar')
  assert.equal(movedFromDayBefore({ ...yesterday, movedTo: TOMORROW }, TODAY), false)
  assert.equal(movedFromDayBefore({ ...emptyDayMemory('2026-09-05', NOW), movedTo: TODAY }, TODAY), false)
  assert.equal(movedFromDayBefore({ dayKey: '2026-09-06' }, TODAY), false)
  assert.equal(movedFromDayBefore(null, TODAY), false)
})

// ---------------------------------------------------------------------------
// 1. «Hoy no puedo entrenar»
// ---------------------------------------------------------------------------

test('«hoy no puedo entrenar» se acepta y propone recuperación para hoy', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('Hoy no puedo entrenar', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.equal(answer.proposedTarget?.type, 'RECOVERY')
  assert.equal(answer.proposedEffect ?? null, null, 'solo cambia la elección de hoy')
})

test('no poder no es no querer: «no quiero entrenar» se concede, pero AXIS dice lo que opina', () => {
  const { briefing } = setup({ sessions: [session('2026-09-01')] })
  const cannot = answerFromBriefing('Hoy no puedo entrenar', briefing)
  const wont = answerFromBriefing('No quiero entrenar', briefing, CHANGE_MODE)
  assert.equal(cannot.changeRequest?.kind, 'cannot_today')
  assert.equal(wont.changeRequest?.kind, 'rest')
  assert.equal(wont.verdict, 'accept', 'decide el usuario (D-030)')
  assert.match(wont.text, /d[ií]as sin entrenar/i, 'seis días sin entrenar: lo dice')
  assert.doesNotMatch(cannot.text, /d[ií]as sin entrenar/i, 'no poder no se discute')
})

test('ya entrenado hoy, no hay nada que reorganizar', () => {
  const { briefing } = setup({ sessions: [session(TODAY)] })
  const answer = answerFromBriefing('Hoy no puedo entrenar', briefing)
  assert.equal(answer.proposedTarget ?? null, null)
})

// ---------------------------------------------------------------------------
// 2. Mover a mañana
// ---------------------------------------------------------------------------

test('mover a mañana: hoy recuperación y mañana disponible', () => {
  const { briefing, day } = setup()
  const answer = answerFromBriefing('Quiero mover el entrenamiento de hoy a mañana', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.equal(answer.proposedTarget?.type, 'RECOVERY')
  assert.deepEqual(answer.proposedEffect, { kind: 'move_to_tomorrow' })

  const action = proposeAction(day, answer)
  assert.equal(action?.type, 'move_to_tomorrow')
  const applied = applyAction(action!, day, emptyDayMemory(TODAY, NOW), NOW)
  assert.ok(applied.ok)
  if (!applied.ok) return
  assert.equal(applied.memory.movedTo, TOMORROW)
  assert.equal(applied.memory.override?.type, 'RECOVERY')
  assert.equal(applied.createdActivity, null)
})

test('«muévela a mañana», como lo ofrece AXIS, también mueve: dentro y fuera del modo cambio', () => {
  const { briefing, day } = setup()
  for (const memory of [undefined, { lastIntent: 'change' as const, changeMode: true, lastChangeRequest: null }]) {
    const answer = answerFromBriefing('Muévela a mañana', briefing, memory)
    assert.deepEqual(answer.proposedEffect, { kind: 'move_to_tomorrow' })
    assert.equal(proposeAction(day, answer)?.type, 'move_to_tomorrow')
  }
})

test('lo movido desde ayer se puede volver a mover, avisando (D-030)', () => {
  const { briefing, day } = setup({ movedFromYesterday: true })
  const answer = answerFromBriefing('muévelo a mañana', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.deepEqual(answer.proposedEffect, { kind: 'move_to_tomorrow' })
  assert.match(answer.text, /ya ven[ií]a movido de ayer/i)

  const action = proposeAction(day, answer)!
  assert.ok(checkAction(action, day, emptyDayMemory(TODAY, NOW)).ok, 'y la validación lo deja ejecutar')
})

test('se mueve aunque mañana haya un deporte exigente, avisando (D-030)', () => {
  const match = activity({ name: 'Partido', date: TOMORROW, weekday: 2 })
  const { briefing, day } = setup({ activities: [match] })
  const answer = answerFromBriefing('déjalo para mañana', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.match(answer.text, /mañana tienes partido/i)
  assert.ok(checkAction(proposeAction(day, answer)!, day, emptyDayMemory(TODAY, NOW)).ok)
})

test('«he corrido mucho hoy, cambia el entreno a mañana» lo mueve (D-030)', () => {
  const { briefing, day } = setup()
  const answer = answerFromBriefing('hoy he echo mucho ejericio ya que he corrido, podemos cambiar el entreno a mañana', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.equal(proposeAction(day, answer)?.type, 'move_to_tomorrow')
})

test('ya entrenado hoy, no hay nada que mover, y se dice sin un «no»', () => {
  const { briefing } = setup({ sessions: [session(TODAY)] })
  const answer = answerFromBriefing('muévelo a mañana', briefing)
  assert.equal(answer.proposedEffect ?? null, null)
  assert.match(answer.text, /ya has entrenado/i)
})

// ---------------------------------------------------------------------------
// 3. «Ayer no pude entrenar»
// ---------------------------------------------------------------------------

test('«ayer no pude entrenar» informa y no cambia nada, ni negociando', () => {
  const { briefing } = setup()
  for (const memory of [undefined, CHANGE_MODE]) {
    const answer = answerFromBriefing('Ayer no pude entrenar', briefing, memory)
    assert.equal(answer.intent, 'missed_yesterday')
    assert.equal(answer.proposedTarget ?? null, null)
    assert.equal(answer.proposedEffect ?? null, null)
    assert.match(answer.text, /no hay sesión doble/)
  }
})

// ---------------------------------------------------------------------------
// 4. Minutos concretos
// ---------------------------------------------------------------------------

test('«hoy solo tengo 20 minutos» propone usar esos minutos', () => {
  const { briefing, day } = setup()
  const answer = answerFromBriefing('Hoy solo tengo 20 minutos', briefing)
  assert.equal(answer.verdict, 'accept')
  assert.deepEqual(answer.proposedEffect, { kind: 'set_available_minutes', minutes: 20 })

  const action = proposeAction(day, answer)!
  assert.equal(action.type, 'set_available_minutes')
  const applied = applyAction(action, day, emptyDayMemory(TODAY, NOW), NOW)
  assert.ok(applied.ok)
  if (applied.ok) {
    assert.equal(applied.memory.availableMinutes, 20)
    assert.equal(applied.memory.override, null)
  }
})

test('por debajo del mínimo no hay sesión estructurada: descanso o movilidad libre', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('solo tengo 10 minutos', briefing)
  assert.equal(answer.verdict, 'compromise')
  assert.equal(answer.proposedEffect ?? null, null)
  assert.equal(answer.proposedTarget?.type, 'RECOVERY')
  assert.match(answer.text, /movilidad libre/)
})

test('si la sesión ya cabe, no hay nada que cambiar; y preguntarlo no cambia nada', () => {
  const { briefing } = setup()
  const roomy = answerFromBriefing('tengo 90 minutos', briefing)
  assert.equal(roomy.proposedEffect ?? null, null)
  const asked = answerFromBriefing('¿y si solo tengo 20 minutos?', briefing)
  assert.equal(asked.proposedEffect ?? null, null)
})

test('la validación de los minutos: mínimo de sesión y sin repetir', () => {
  const { day } = setup()
  const below = { ...proposeAction(day, { proposedEffect: { kind: 'set_available_minutes', minutes: 20 } })!, minutes: 10 } as AxisActionProposal
  const check = validateAction(below, day.decision, day.context, day.selected)
  assert.equal(check.ok, false)

  const same = setup({ availableMinutesToday: 25 })
  const repeat = proposeAction(same.day, { proposedEffect: { kind: 'set_available_minutes', minutes: 25 } })!
  const again = validateAction(repeat, same.day.decision, same.day.context, same.day.selected)
  assert.equal(again.ok, false)
  if (!again.ok) assert.equal(again.reason, 'sin_efecto')
})

// ---------------------------------------------------------------------------
// 5. Fatiga contada en la conversación
// ---------------------------------------------------------------------------

test('fatiga sin registrar: fuera del cambio pide registrarla; dentro, suaviza y lo recuerda (D-030)', () => {
  const { briefing } = setup({ recovery: recovery({ muscleFatigue: null as never }) })
  assert.equal(briefing.fatigueLevel, null)

  const outside = answerFromBriefing('Hoy estoy demasiado fatigado', briefing)
  assert.ok(outside.text.includes(FATIGUE_NOT_REGISTERED))
  assert.equal(outside.proposedTarget ?? null, null)

  const inside = answerFromBriefing('estoy reventado', briefing, CHANGE_MODE)
  assert.notEqual(inside.verdict, 'need_info', 'pedir algo más suave estando cansado se concede')
  assert.notEqual(inside.verdict, 'decline')
  assert.match(inside.text, /no tengo tu fatiga registrada/i, 'y no la anota: pide registrarla')
})

test('fatiga registrada: negociando, se juzga como pedir algo más suave', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('estoy muy cansado', briefing, CHANGE_MODE)
  assert.equal(answer.changeRequest?.kind, 'tired')
  assert.notEqual(answer.verdict, 'need_info')
})

// ---------------------------------------------------------------------------
// 6. «Mañana tengo un partido»
// ---------------------------------------------------------------------------

test('partido sin registrar y sin intensidad: AXIS pregunta antes de proponer', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('Mañana tengo un partido', briefing)
  assert.equal(answer.intent, 'match_tomorrow')
  assert.equal(answer.verdict, 'need_info')
  assert.equal(answer.proposedEffect ?? null, null)

  const reply = answerFromBriefing('exigente', briefing, { lastIntent: 'match_tomorrow', changeMode: false, lastChangeRequest: null })
  assert.deepEqual(reply.proposedEffect, { kind: 'add_dated_activity', intensity: 'alta' })
})

test('una pregunta corta con «normal» después de hablar del partido no registra nada', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('¿es normal?', briefing, { lastIntent: 'match_tomorrow', changeMode: false, lastChangeRequest: null })
  assert.equal(answer.proposedEffect ?? null, null)
})

test('con un único deporte habitual, el partido es de ese deporte y carga lo mismo', () => {
  const { briefing, day } = setup({ activities: [activity({ name: 'Baloncesto' })] })
  const answer = answerFromBriefing('mañana tengo un partido importante', briefing)
  assert.match(answer.text, /partido de baloncesto/)
  const action = proposeAction(day, answer)!
  assert.equal(action.type, 'add_dated_activity')
  if (action.type !== 'add_dated_activity') return
  assert.equal(action.summary, 'Registrar partido de baloncesto para el martes 8 de septiembre')
  assert.deepEqual(action.activity, {
    name: 'Partido de baloncesto',
    date: TOMORROW,
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'core'],
  })
})

test('con varios deportes o ninguno: «Partido», sin inventar grupos musculares', () => {
  for (const activities of [[], [activity({ name: 'Baloncesto' }), activity({ id: 'n', name: 'Natación' })]]) {
    const { briefing, day } = setup({ activities })
    const action = proposeAction(day, answerFromBriefing('mañana tengo partido, suave', briefing))!
    assert.equal(action.type, 'add_dated_activity')
    if (action.type !== 'add_dated_activity') continue
    assert.equal(action.activity.name, 'Partido')
    assert.deepEqual(action.activity.loadsMuscleGroups, [])
    assert.equal(action.activity.intensity, 'baja')
  }
})

test('partido ya registrado: AXIS lo confirma y no propone nada', () => {
  const match = activity({ name: 'Partido', date: TOMORROW, weekday: 2 })
  const { briefing } = setup({ activities: [match] })
  const answer = answerFromBriefing('mañana tengo partido', briefing)
  assert.match(answer.text, /Lo tengo: mañana tienes partido/)
  assert.equal(answer.proposedEffect ?? null, null)
})

test('registrar el partido crea una actividad con fecha de mañana y deshacer la retira', async () => {
  const { briefing, day } = setup()
  const action = proposeAction(day, answerFromBriefing('mañana tengo partido exigente', briefing))!
  const disk = port()
  const result = await executeAction(action, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(disk.activities.length, 1)
  const created = disk.activities[0]
  assert.equal(created.date, TOMORROW)
  assert.equal(created.weekday, weekdayOfKey(TOMORROW))
  assert.equal(created.intensity, 'alta')
  assert.deepEqual(result.memory.lastApplied?.createdActivity, created)

  const undone = await undoAction(action.id, result.memory, disk, { workoutStarted: false }, NOW)
  assert.ok(undone.ok)
  assert.equal(disk.activities.length, 0)
  if (undone.ok) assert.equal(undone.removedActivityId, created.id)
})

test('si guardar la memoria falla, el partido recién creado se retira', async () => {
  const { briefing, day } = setup()
  const action = proposeAction(day, answerFromBriefing('mañana tengo partido exigente', briefing))!
  const disk = port({ failSave: true })
  const result = await executeAction(action, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.equal(result.ok, false)
  assert.equal(disk.activities.length, 0)
  assert.equal(result.memory.lastApplied ?? null, null)
})

// ---------------------------------------------------------------------------
// 7. «No puedo hacer el entrenamiento previsto»
// ---------------------------------------------------------------------------

test('«no puedo hacer el entrenamiento previsto» pregunta el motivo antes de decidir', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('No puedo hacer el entrenamiento previsto', briefing)
  assert.equal(answer.verdict, 'need_info')
  assert.equal(answer.changeRequest?.kind, 'cannot_planned')
  assert.equal(answer.proposedTarget ?? null, null)
})

const AFTER_ASKING = {
  lastIntent: 'change' as const,
  changeMode: true,
  lastChangeRequest: { kind: 'cannot_planned', focus: null },
}

test('el motivo material o sitio no es descansar, y no hay filtro por material', () => {
  const { briefing } = setup()
  const answer = answerFromBriefing('no tengo material para entrenar', briefing, AFTER_ASKING)
  assert.equal(answer.verdict, 'compromise')
  assert.equal(answer.proposedTarget ?? null, null)
  assert.equal(answer.proposedEffect ?? null, null)
})

test('el motivo tiempo se trata como minutos; la zona, como evitar la zona', () => {
  const { briefing } = setup()
  const time = answerFromBriefing('solo tengo 25 minutos', briefing, AFTER_ASKING)
  assert.deepEqual(time.proposedEffect, { kind: 'set_available_minutes', minutes: 25 })
  const zone = answerFromBriefing('por la zona', briefing, AFTER_ASKING)
  assert.equal(zone.verdict, 'need_info')
  const named = answerFromBriefing('hoy piernas no', briefing, AFTER_ASKING)
  assert.equal(named.changeRequest?.kind, 'avoid_focus')
})

test('una molestia sigue la respuesta segura y nunca modifica el entrenamiento', () => {
  const { briefing } = setup()
  for (const memory of [undefined, CHANGE_MODE, AFTER_ASKING]) {
    const answer = answerFromBriefing('me duele la rodilla, no puedo entrenar', briefing, memory)
    assert.equal(answer.intent, 'medical')
    assert.equal(answer.proposedTarget ?? null, null)
    assert.equal(answer.proposedEffect ?? null, null)
  }
})

// ---------------------------------------------------------------------------
// Deshacer
// ---------------------------------------------------------------------------

test('deshacer restaura exactamente lo anterior y la acción no vuelve', async () => {
  const { day, briefing } = setup()
  const disk = port()

  // Primero una elección normal, después los minutos.
  const lighter = [day.decision.primary, ...day.decision.alternatives].find((p) => p.type === 'LIGHT_TRAINING')!
  const first = buildChangeTrainingAction({ context: day.context, origin: day.selected, target: lighter, reason: 'Prueba' })
  const afterFirst = await executeAction(first, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.ok(afterFirst.ok)
  if (!afterFirst.ok) return

  const minutes = proposeAction(day, answerFromBriefing('solo tengo 20 minutos', briefing))!
  const afterMinutes = await executeAction(minutes, day, afterFirst.memory, disk, NOW)
  assert.ok(afterMinutes.ok)
  if (!afterMinutes.ok) return
  assert.equal(afterMinutes.memory.override, null)

  // Solo se puede deshacer la última.
  assert.equal(canUndoAction(afterMinutes.memory, first.id, { workoutStarted: false }), false)
  assert.equal(canUndoAction(afterMinutes.memory, minutes.id, { workoutStarted: false }), true)

  const undone = await undoAction(minutes.id, afterMinutes.memory, disk, { workoutStarted: false }, NOW)
  assert.ok(undone.ok)
  if (!undone.ok) return
  assert.deepEqual(undone.memory.override, afterFirst.memory.override)
  assert.equal(undone.memory.availableMinutes ?? null, null)
  assert.equal(undone.memory.actionStatuses[minutes.id]?.state, 'undone')

  const retry = checkAction(minutes, day, undone.memory)
  assert.equal(retry.ok, false)
  if (!retry.ok) assert.equal(retry.reason, 'deshecha')

  const twice = await undoAction(minutes.id, undone.memory, disk, { workoutStarted: false }, NOW)
  assert.equal(twice.ok, false)
  // Lo anterior ya no es «la última»: deshacer no es un historial.
  assert.equal(canUndoAction(undone.memory, first.id, { workoutStarted: false }), false)
})

test('deshacer mover a mañana quita el movimiento y la recuperación de hoy', async () => {
  const { day, briefing } = setup()
  const disk = port()
  const move = proposeAction(day, answerFromBriefing('muévelo a mañana', briefing))!
  const applied = await executeAction(move, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.ok(applied.ok)
  if (!applied.ok) return
  const undone = await undoAction(move.id, applied.memory, disk, { workoutStarted: false }, NOW)
  assert.ok(undone.ok)
  if (!undone.ok) return
  assert.equal(undone.memory.movedTo ?? null, null)
  assert.equal(undone.memory.override, null)
})

test('empezar a entrenar cierra la posibilidad de deshacer', async () => {
  const { day, briefing } = setup()
  const disk = port()
  const move = proposeAction(day, answerFromBriefing('muévelo a mañana', briefing))!
  const applied = await executeAction(move, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.ok(applied.ok)
  if (!applied.ok) return
  assert.equal(canUndoAction(applied.memory, move.id, { workoutStarted: true }), false)
  const blocked = await undoAction(move.id, applied.memory, disk, { workoutStarted: true }, NOW)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.reason, 'entrenamiento_empezado')
  assert.equal(applied.memory.movedTo, TOMORROW)
})

test('si guardar el deshacer falla, nada cambia y el partido vuelve', async () => {
  const { day, briefing } = setup()
  const disk = port()
  const action = proposeAction(day, answerFromBriefing('mañana tengo partido exigente', briefing))!
  const applied = await executeAction(action, day, emptyDayMemory(TODAY, NOW), disk, NOW)
  assert.ok(applied.ok)
  if (!applied.ok) return

  const failing = port({ failSave: true, activities: disk.activities })
  const undone = await undoAction(action.id, applied.memory, failing, { workoutStarted: false }, NOW)
  assert.equal(undone.ok, false)
  assert.equal(undone.memory, applied.memory)
  assert.equal(failing.activities.length, 1, 'la actividad retirada se vuelve a crear')
})

// ---------------------------------------------------------------------------
// Forma de lo guardado
// ---------------------------------------------------------------------------

test('las acciones nuevas se reconocen al leerlas de disco y las rotas no', () => {
  const { day, briefing } = setup()
  const actions = [
    proposeAction(day, answerFromBriefing('muévelo a mañana', briefing))!,
    proposeAction(day, answerFromBriefing('solo tengo 20 minutos', briefing))!,
    proposeAction(day, answerFromBriefing('mañana tengo partido exigente', briefing))!,
  ]
  for (const action of actions) {
    assert.equal(isActionProposal(JSON.parse(JSON.stringify(action))), true, action.type)
  }
  assert.equal(isActionProposal({ ...actions[1], minutes: 'veinte' }), false)
  assert.equal(isActionProposal({ ...actions[2], activity: { name: '', date: TOMORROW } }), false)
  assert.equal(isActionProposal({ ...actions[0], tomorrow: undefined }), false)
})

test('la memoria con los campos nuevos, y la de antes sin ellos, siguen siendo válidas', async () => {
  const old = JSON.parse(JSON.stringify(emptyDayMemory(TODAY, NOW)))
  assert.equal(isAxisDayMemory(old), true)

  const { day, briefing } = setup()
  const move = proposeAction(day, answerFromBriefing('muévelo a mañana', briefing))!
  const applied = applyAction(move, day, emptyDayMemory(TODAY, NOW), NOW)
  assert.ok(applied.ok)
  if (!applied.ok) return
  assert.equal(isAxisDayMemory(JSON.parse(JSON.stringify(applied.memory))), true)
  assert.equal(isAxisDayMemory({ ...applied.memory, availableMinutes: -5 }), false)
  assert.equal(isAxisDayMemory({ ...applied.memory, movedTo: 'mañana' }), false)
  assert.equal(isAxisDayMemory({ ...applied.memory, lastApplied: { actionId: 3 } }), false)
})

test('ninguna reorganización toca sesiones ni crea una sesión para mañana', () => {
  const { day, briefing } = setup()
  const sessionsBefore = JSON.stringify(day.context.recentSessions)
  for (const phrase of ['muévelo a mañana', 'solo tengo 20 minutos', 'Hoy no puedo entrenar']) {
    const action = proposeAction(day, answerFromBriefing(phrase, briefing))!
    const applied = applyAction(action, day, emptyDayMemory(TODAY, NOW), NOW)
    assert.ok(applied.ok, phrase)
  }
  assert.equal(JSON.stringify(day.context.recentSessions), sessionsBefore)
  assert.ok(findProposal(day.decision, { type: 'RECOVERY', focus: null }))
})
