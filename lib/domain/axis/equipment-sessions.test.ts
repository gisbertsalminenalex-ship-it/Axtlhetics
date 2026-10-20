/**
 * Sesiones con el material de cada usuario (D-046): qué ejercicios entran, con
 * qué kilos y cómo progresan cuando hay más de un peso.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG, findExercise, isAvailable } from '../workouts/catalog'
import { availableEquipment, loadsFor, NO_EQUIPMENT, type UserEquipment } from '../workouts/equipment'
import type { CompletedSet, SessionFocus, WorkoutSession } from '../workouts/types'
import { isMainExercise, usesLoad } from '../workouts/types'
import { toAiBriefing } from './conversation/ai'
import { answerFromBriefing } from './conversation/deterministic'
import { resolveExercise } from './conversation/intents'
import { detectPreference } from './conversation/preferences'
import type { AxisBriefing } from './briefing'
import { buildSession, hasMastered, repCapFor, suggestWorkFor } from './session-builder'

const FULL: UserEquipment = {
  items: ['barra_dominadas', 'gomas', 'banco'],
  weights: [
    { kind: 'mancuerna', kg: 4, pair: true },
    { kind: 'mancuerna', kg: 8, pair: true },
    { kind: 'mancuerna', kg: 12, pair: true },
    { kind: 'kettlebell', kg: 12, pair: false },
  ],
}

const BASE = { intensity: 'moderada' as const, goals: ['hipertrofia' as const], experience: 'principiante' as const }

function performed(exerciseId: string, sets: CompletedSet[], dayKey = '2026-10-05'): WorkoutSession {
  return {
    id: `session-${exerciseId}-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['espalda'],
    exercises: [{ exerciseId, name: exerciseId, sets }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

const sets = (reps: number, weightKg: number | null, n = 3): CompletedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg, completed: true }))

function session(focus: SessionFocus, gear: UserEquipment, history: WorkoutSession[] = []) {
  return buildSession({ ...BASE, focus, availableMinutes: 60, gear, history, today: '2026-10-19' })
}

// ---------------------------------------------------------------------------
// Qué entra
// ---------------------------------------------------------------------------

test('solo entra lo que se puede hacer con el material, en todos los focos', () => {
  for (const gear of [NO_EQUIPMENT, FULL, { items: [], weights: [{ kind: 'mancuerna' as const, kg: 5, pair: false }] }]) {
    const available = availableEquipment(gear)
    for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'core_movilidad'] as const) {
      for (const planned of session(focus, gear).exercises) {
        const exercise = findExercise(planned.exerciseId)!
        assert.ok(isAvailable(exercise, available), `${planned.exerciseId} en ${focus} con ${JSON.stringify(gear)}`)
      }
    }
  }
})

test('sin material, ninguna sesión lleva carga, y sigue habiendo sesión completa', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const main = session(focus, NO_EQUIPMENT).exercises.filter(isMainExercise)
    assert.ok(main.length >= 3, focus)
    assert.ok(main.every((planned) => planned.suggestedWeightKg === null), focus)
  }
})

test('con barra y gomas, el tirón vertical aparece en las sesiones de tren superior', () => {
  const seen = new Set<string>()
  let history: WorkoutSession[] = []
  for (let week = 0; week < 6; week += 1) {
    const planned = session('tren_superior', FULL, history)
    const main = planned.exercises.filter(isMainExercise)
    for (const item of main) seen.add(item.exerciseId)
    const dayKey = `2026-10-${String(10 + week).padStart(2, '0')}`
    history = [
      { ...performed(main[0].exerciseId, sets(main[0].reps, main[0].suggestedWeightKg), dayKey), exercises: main.map((item) => ({ exerciseId: item.exerciseId, name: item.name, sets: sets(item.reps, item.suggestedWeightKg) })) },
      ...history,
    ]
  }
  const vertical = [...seen].filter((id) => findExercise(id)!.family === 'dominada')
  assert.ok(vertical.length > 0, `sin tirón vertical en 6 sesiones: ${[...seen].join(', ')}`)
})

test('toda carga sugerida es un peso que el usuario tiene y que sirve para ese ejercicio', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    for (const planned of session(focus, FULL).exercises) {
      if (planned.suggestedWeightKg === null) continue
      const loads = loadsFor(findExercise(planned.exerciseId)!, FULL)
      assert.ok(loads.includes(planned.suggestedWeightKg), `${planned.exerciseId}: ${planned.suggestedWeightKg} kg no está en ${loads}`)
    }
  }
})

test('todo ejercicio con carga del catálogo tiene un peso sugerido con el material completo', () => {
  for (const exercise of EXERCISE_CATALOG.filter(usesLoad)) {
    const work = suggestWorkFor(exercise, { ...BASE, gear: FULL })
    assert.ok(work.weightKg !== null, exercise.id)
  }
})

// ---------------------------------------------------------------------------
// Doble progresión
// ---------------------------------------------------------------------------

test('sin historial se empieza por el peso de partida, no por el más pesado', () => {
  const remo = findExercise('remo-unilateral')! // referencia 8 kg para un principiante
  assert.equal(suggestWorkFor(remo, { ...BASE, gear: FULL }).weightKg, 8)
  assert.equal(suggestWorkFor(remo, { ...BASE, experience: 'avanzado', gear: FULL }).weightKg, 12)
})

test('por debajo del techo suben las repeticiones con el mismo peso', () => {
  const remo = findExercise('remo-unilateral')!
  const work = suggestWorkFor(remo, { ...BASE, gear: FULL, history: [performed('remo-unilateral', sets(12, 8))] })
  assert.equal(work.weightKg, 8)
  assert.equal(work.reps, 14)
})

test('en el techo y con un peso mayor, se sube de peso y las repeticiones vuelven a las de partida', () => {
  const remo = findExercise('remo-unilateral')!
  const cap = repCapFor(remo)
  const work = suggestWorkFor(remo, { ...BASE, gear: FULL, history: [performed('remo-unilateral', sets(cap, 8))] })
  assert.equal(work.weightKg, 12)
  assert.equal(work.reps, remo.work.reps)
})

test('en el techo sin un peso mayor, se queda: y solo entonces se da por dominado', () => {
  const remo = findExercise('remo-unilateral')!
  const cap = repCapFor(remo)
  const atTop = [performed('remo-unilateral', sets(cap, 12))]
  const work = suggestWorkFor(remo, { ...BASE, gear: FULL, history: atTop })
  assert.equal(work.weightKg, 12)
  assert.equal(work.reps, cap)
  assert.equal(hasMastered(remo, atTop, FULL), true)
  assert.equal(hasMastered(remo, [performed('remo-unilateral', sets(cap, 8))], FULL), false, 'queda un peso mayor')
})

test('si no se completó, se repite el mismo peso aunque haya otros', () => {
  const remo = findExercise('remo-unilateral')!
  const failed = performed('remo-unilateral', [...sets(12, 8, 2), { reps: 7, weightKg: 8, completed: false }])
  const work = suggestWorkFor(remo, { ...BASE, gear: FULL, history: [failed] })
  assert.equal(work.weightKg, 8)
})

// ---------------------------------------------------------------------------
// Conversación: «el remo» es el que el usuario puede hacer
// ---------------------------------------------------------------------------

test('con una sola pesa, «el press de suelo» es el de una mano; con un par, AXIS pregunta cuál', () => {
  const legacy = availableEquipment({ items: [], weights: [{ kind: 'mancuerna', kg: 5, pair: false }] })
  const single = resolveExercise('¿Cómo hago el press de suelo?', EXERCISE_CATALOG, legacy)
  assert.equal(single.kind === 'found' && single.exercise.id, 'press-suelo-unilateral')

  const pair = resolveExercise('¿Cómo hago el press de suelo?', EXERCISE_CATALOG, availableEquipment(FULL))
  assert.equal(pair.kind, 'ambiguous')
})

test('un ejercicio que no se puede hacer con el material se sigue explicando si se nombra', () => {
  const answer = answerFromBriefing('¿Cómo se hacen las dominadas?', { equipment: availableEquipment(NO_EQUIPMENT) } as AxisBriefing)
  assert.equal(answer.intent, 'exercise')
  assert.match(answer.text, /Dominadas/)
})

test('«no me gustan las dominadas supinas» se apunta con cualquier material', () => {
  const preference = detectPreference('no me gustan las dominadas supinas', availableEquipment(FULL))
  assert.equal(preference?.exerciseId, 'dominadas-supinas')
})

test('el material no viaja a la capa de lenguaje', () => {
  const briefing = { profile: null, equipment: availableEquipment(FULL) } as unknown as AxisBriefing
  assert.equal('equipment' in toAiBriefing(briefing), false)
})
