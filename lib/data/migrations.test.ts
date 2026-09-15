import assert from 'node:assert/strict'
import test from 'node:test'

import { DB_VERSION } from './indexeddb/db'
import type { StoredProfile } from './migrations'
import {
  dropLegacySports,
  extractLegacySports,
  FALLBACK_GOAL,
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

test('la versión del esquema es la que guarda la sesión en curso', () => {
  assert.equal(DB_VERSION, 6)
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
