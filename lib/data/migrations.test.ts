import assert from 'node:assert/strict'
import test from 'node:test'

import { DB_VERSION } from './indexeddb/db'
import type { StoredProfile } from './migrations'
import { isAxisDayMemory } from '../domain/axis/memory'
import {
  dropLegacySports,
  extractLegacySports,
  FALLBACK_GOAL,
  mergeIntoAxisMemory,
  needsDayPlanUpgrade,
  needsProfileUpgrade,
  upgradeDayPlanRecord,
  upgradeProfileRecord,
} from './migrations'

/**
 * Un perfil tal y como lo guardaba la v1 del esquema: con `goal` en singular.
 * Se usa `null` para decir «sin objetivo»; `undefined` activaría el valor por defecto.
 */
function legacyProfile(goal: string | null = 'fuerza'): StoredProfile {
  const base = {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
  return goal === null ? base : { ...base, goal }
}

test('la versión del esquema es la que guarda la memoria de AXIS', () => {
  assert.equal(DB_VERSION, 7)
})

// ---------------------------------------------------------------------------
// v4 → v5: el plan del día
// ---------------------------------------------------------------------------

/** La forma que tenía un registro en v4: la elección, con los campos al desnudo. */
function planV4(partial: Record<string, unknown> = {}) {
  return {
    dayKey: '2026-09-11',
    type: 'LIGHT_TRAINING',
    focus: 'tren_superior',
    originHeadline: 'Sesión de tren superior adaptada a tu día.',
    reason: 'Vas justo de tiempo.',
    decidedAt: '2026-09-11T12:00:00.000Z',
    source: 'axis_conversation',
    ...partial,
  }
}

test('una elección guardada en v4 se envuelve sin perder nada', () => {
  const upgraded = upgradeDayPlanRecord(planV4())

  assert.equal(upgraded.dayKey, '2026-09-11')
  assert.deepEqual(upgraded.cancelledActivities, [])

  const override = upgraded.override as Record<string, unknown>
  assert.ok(override, 'la elección no se pierde: se envuelve')
  assert.equal(override.type, 'LIGHT_TRAINING')
  assert.equal(override.focus, 'tren_superior')
  assert.equal(override.originHeadline, 'Sesión de tren superior adaptada a tu día.')
  assert.equal(override.reason, 'Vas justo de tiempo.')
  assert.equal(override.source, 'axis_conversation')
  assert.equal(override.dayKey, '2026-09-11')
})

test('un registro ya en v5 no se vuelve a tocar', () => {
  const v5 = {
    dayKey: '2026-09-11',
    override: { type: 'RECOVERY', focus: null },
    cancelledActivities: ['Baloncesto'],
  }

  assert.equal(needsDayPlanUpgrade(v5), false)
  assert.equal(upgradeDayPlanRecord(v5), v5, 'se devuelve el mismo objeto')
})

test('la migración del plan es idempotente', () => {
  const una = upgradeDayPlanRecord(planV4())
  const dos = upgradeDayPlanRecord(una)

  assert.deepEqual(dos, una, 'aplicarla dos veces no cambia nada')
  assert.equal(needsDayPlanUpgrade(una), false)
})

test('un día sin elección queda con el plan vacío, no roto', () => {
  // Podría existir un registro sin `type` si algo lo escribió a medias.
  const upgraded = upgradeDayPlanRecord({ dayKey: '2026-09-11' })

  assert.equal(upgraded.override, null)
  assert.deepEqual(upgraded.cancelledActivities, [])
})

// ---------------------------------------------------------------------------
// v1 → v2
// ---------------------------------------------------------------------------

test('un objetivo único se convierte en una lista de un elemento', () => {
  const upgraded = upgradeProfileRecord(legacyProfile('fuerza'))
  assert.deepEqual(upgraded.goals, ['fuerza'])
})

test('la clave antigua desaparece tras migrar', () => {
  const upgraded = upgradeProfileRecord(legacyProfile('hipertrofia')) as Record<string, unknown>
  assert.equal('goal' in upgraded, false, 'no debe quedar rastro de `goal`')
})

test('la migración no pierde ningún otro dato del perfil', () => {
  const original = legacyProfile('resistencia')
  const upgraded = upgradeProfileRecord(original) as Record<string, unknown>

  for (const [key, value] of Object.entries(original)) {
    if (key === 'goal') continue
    assert.deepEqual(upgraded[key], value, `se perdió ${key}`)
  }
  assert.equal(upgraded.name, 'Alex')
  assert.equal(upgraded.age, 15)
  assert.deepEqual(upgraded.availableWeekdays, [0, 2, 4])
})

test('un perfil sin ningún objetivo recibe el de reserva', () => {
  const upgraded = upgradeProfileRecord(legacyProfile(null))
  assert.deepEqual(upgraded.goals, [FALLBACK_GOAL])
})

test('un objetivo con un valor inesperado no rompe la migración', () => {
  const upgraded = upgradeProfileRecord({ ...legacyProfile(null), goal: 42 })
  assert.deepEqual(upgraded.goals, [FALLBACK_GOAL])
})

// ---------------------------------------------------------------------------
// Perfiles que ya están migrados
// ---------------------------------------------------------------------------

test('un perfil que ya tiene objetivos no se sobrescribe', () => {
  const current = { ...legacyProfile(null), goals: ['fuerza', 'movilidad'] }
  const result = upgradeProfileRecord(current)

  assert.deepEqual(result.goals, ['fuerza', 'movilidad'])
  assert.equal(result, current, 'debe devolverse el mismo objeto, sin copiar ni tocar')
})

test('varios objetivos sobreviven a migrar dos veces', () => {
  const once = upgradeProfileRecord({ ...legacyProfile(null), goals: ['fuerza', 'tecnica'] })
  const twice = upgradeProfileRecord(once)
  assert.deepEqual(twice.goals, ['fuerza', 'tecnica'])
})

test('si conviven `goal` y `goals`, mandan los `goals` ya existentes', () => {
  const mixed = { ...legacyProfile('resistencia'), goals: ['movilidad'] }
  assert.deepEqual(upgradeProfileRecord(mixed).goals, ['movilidad'])
})

// ---------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------

test('solo se marca para migrar lo que realmente lo necesita', () => {
  assert.equal(needsProfileUpgrade(legacyProfile('fuerza')), true)
  assert.equal(needsProfileUpgrade(legacyProfile(null)), true)
  assert.equal(needsProfileUpgrade({ goals: [] }), true, 'una lista vacía no sirve')
  assert.equal(needsProfileUpgrade({ goals: ['fuerza'] }), false)
})

test('un perfil nuevo, creado ya con goals, no pasa por la migración', () => {
  const fresh = { ...legacyProfile(null), goals: ['rendimiento_deportivo'] }
  assert.equal(needsProfileUpgrade(fresh), false)
})

// ---------------------------------------------------------------------------
// v2 → v3: los deportes salen del perfil
// ---------------------------------------------------------------------------

test('un perfil con deportes en texto libre necesita migrarse', () => {
  const v2 = { ...legacyProfile(null), goals: ['fuerza'], sports: ['Baloncesto', 'Natación'] }
  assert.equal(needsProfileUpgrade(v2), true)
})

test('la clave `sports` desaparece del perfil migrado', () => {
  const v2 = { ...legacyProfile(null), goals: ['fuerza'], sports: ['Baloncesto'] }
  const upgraded = upgradeProfileRecord(v2) as Record<string, unknown>

  assert.equal('sports' in upgraded, false)
  assert.deepEqual(upgraded.goals, ['fuerza'], 'los objetivos no se tocan')
  assert.equal(upgraded.name, 'Alex', 'el resto del perfil sigue intacto')
})

test('los deportes antiguos se pueden recuperar antes de descartarlos', () => {
  const v2 = { ...legacyProfile(null), goals: ['fuerza'], sports: ['Baloncesto', 'Natación'] }
  assert.deepEqual(extractLegacySports(v2), ['Baloncesto', 'Natación'])
})

test('los deportes antiguos no se convierten en actividades a ciegas', () => {
  // Sin día ni intensidad, crear una actividad sería inventar. Solo se descartan
  // del perfil; el usuario los vuelve a declarar con sus días.
  const v2 = { ...legacyProfile(null), goals: ['fuerza'], sports: ['Baloncesto'] }
  const upgraded = upgradeProfileRecord(v2) as Record<string, unknown>
  assert.equal(upgraded.activities, undefined)
})

test('valores basura en `sports` no rompen la extracción', () => {
  const roto = { ...legacyProfile(null), goals: ['fuerza'], sports: [null, 42, '', 'Judo'] }
  assert.deepEqual(extractLegacySports(roto), ['Judo'])
})

test('un perfil sin `sports` se devuelve sin copiar', () => {
  const limpio = { ...legacyProfile(null), goals: ['fuerza'] }
  assert.equal(dropLegacySports(limpio), limpio)
  assert.equal(needsProfileUpgrade(limpio), false)
})

test('migrar de v1 a v3 de una vez arregla objetivos y deportes', () => {
  const v1 = { ...legacyProfile('resistencia'), sports: ['Baloncesto'] }
  const upgraded = upgradeProfileRecord(v1) as Record<string, unknown>

  assert.deepEqual(upgraded.goals, ['resistencia'])
  assert.equal('goal' in upgraded, false)
  assert.equal('sports' in upgraded, false)
  assert.equal(upgraded.name, 'Alex')
})

// ---------------------------------------------------------------------------
// v6 → v7: la memoria de AXIS
// ---------------------------------------------------------------------------

/** Un plan del día tal y como lo guardaba v5/v6. */
function planV6(partial: Record<string, unknown> = {}) {
  return {
    dayKey: '2026-09-11',
    override: {
      dayKey: '2026-09-11',
      type: 'LIGHT_TRAINING',
      focus: 'tren_superior',
      originHeadline: 'Entrena tren superior con intensidad moderada.',
      reason: 'Vas justo de tiempo.',
      decidedAt: '2026-09-11T12:00:00.000Z',
      source: 'axis_conversation',
    },
    cancelledActivities: ['Baloncesto'],
    ...partial,
  }
}

/** Una conversación tal y como la guardaba v5/v6. */
function conversationV6(partial: Record<string, unknown> = {}) {
  return {
    dayKey: '2026-09-11',
    messages: [
      { id: 'm1', role: 'user', text: 'hola', createdAt: '2026-09-11T12:00:00.000Z' },
      {
        id: 'm2',
        role: 'axis',
        text: 'Hoy toca tren superior.',
        createdAt: '2026-09-11T12:00:01.000Z',
        intent: 'today',
        modelDisagreed: true,
      },
    ],
    actionStatuses: { a1: { state: 'applied' } },
    updatedAt: '2026-09-11T12:00:01.000Z',
    ...partial,
  }
}

test('plan y conversación del mismo día se funden sin perder ningún campo', () => {
  const memory = mergeIntoAxisMemory('2026-09-11', planV6(), conversationV6())

  assert.equal(isAxisDayMemory(memory), true)
  assert.equal(memory.dayKey, '2026-09-11')
  assert.equal(memory.schema, 1)
  assert.deepEqual(memory.override, planV6().override)
  assert.deepEqual(memory.cancelledActivities, ['Baloncesto'])
  assert.deepEqual(memory.messages, conversationV6().messages)
  assert.deepEqual(memory.actionStatuses, { a1: { state: 'applied' } })
  assert.equal(memory.updatedAt, '2026-09-11T12:00:01.000Z')
  // Lo nuevo empieza vacío: es lo único cierto que se sabe.
  assert.deepEqual(memory.reportedLoads, [])
  assert.deepEqual(memory.thread, { lastIntent: null, changeMode: false, lastChangeRequest: null })
})

test('solo plan, o solo conversación, también producen una memoria completa', () => {
  const onlyPlan = mergeIntoAxisMemory('2026-09-11', planV6(), null)
  assert.equal(isAxisDayMemory(onlyPlan), true)
  assert.ok(onlyPlan.override)
  assert.deepEqual(onlyPlan.messages, [])
  assert.deepEqual(onlyPlan.actionStatuses, {})

  const onlyConversation = mergeIntoAxisMemory('2026-09-11', null, conversationV6())
  assert.equal(isAxisDayMemory(onlyConversation), true)
  assert.equal(onlyConversation.override, null)
  assert.deepEqual(onlyConversation.cancelledActivities, [])
  assert.equal(onlyConversation.messages.length, 2)

  const nothing = mergeIntoAxisMemory('2026-09-11', null, null)
  assert.equal(isAxisDayMemory(nothing), true)
  assert.equal(nothing.messages.length, 0)
})

test('un plan con la forma v4 llega a v7 correcto: las migraciones se encadenan', () => {
  const memory = mergeIntoAxisMemory('2026-09-11', planV4(), null)
  assert.equal(memory.override?.type, 'LIGHT_TRAINING')
  assert.equal(memory.override?.focus, 'tren_superior')
  assert.deepEqual(memory.cancelledActivities, [])
})

test('la fusión es idempotente: fundir lo ya fundido devuelve lo mismo', () => {
  const once = mergeIntoAxisMemory('2026-09-11', planV6(), conversationV6())
  const twice = mergeIntoAxisMemory('2026-09-11', once, once)
  assert.deepEqual(twice, once)
})

test('un registro antiguo con campos rotos no rompe la fusión', () => {
  const memory = mergeIntoAxisMemory(
    '2026-09-11',
    planV6({ cancelledActivities: 'Baloncesto', override: 'nada' }),
    conversationV6({ messages: 'hola', actionStatuses: null, updatedAt: 42 }),
  )
  assert.equal(isAxisDayMemory(memory), true)
  assert.equal(memory.override, null)
  assert.deepEqual(memory.cancelledActivities, [])
  assert.deepEqual(memory.messages, [])
  assert.deepEqual(memory.actionStatuses, {})
})
