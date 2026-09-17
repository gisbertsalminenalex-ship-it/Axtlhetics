/**
 * El constructor de sesiones: cómo AXIS convierte un foco y una intensidad en
 * ejercicios concretos con series, repeticiones y carga.
 *
 * Hasta ahora solo se probaba a través de `decide`. Estas pruebas van a las
 * piezas: repeticiones por objetivo, progresión por historial, cambio de
 * variante y respeto del material disponible.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG, findExercise, LOAD_STEP_KG, MAX_AVAILABLE_LOAD_KG } from '../workouts/catalog'
import type { CompletedSet, Exercise, WorkoutSession } from '../workouts/types'
import { FOCUS_CATEGORIES, usesLoad } from '../workouts/types'
import {
  adaptDifficulty,
  blendedRepFactor,
  buildSession,
  exerciseCountFor,
  hasMastered,
  lastPerformanceOf,
  repCapFor,
  suggestWorkFor,
  targetDifficultyFor,
  titleFor,
} from './session-builder'

function exercise(id: string): Exercise {
  const found = findExercise(id)
  assert.ok(found, `el catálogo no tiene ${id}`)
  return found!
}

function performed(
  exerciseId: string,
  sets: CompletedSet[],
  partial: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id: `session-${exerciseId}`,
    dayKey: '2026-09-05',
    startedAt: '2026-09-05T18:00:00.000Z',
    completedAt: '2026-09-05T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [{ exerciseId, name: exerciseId, sets }],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

const BASE = { intensity: 'moderada' as const, goals: ['hipertrofia' as const], experience: 'intermedio' as const }

// ---------------------------------------------------------------------------
// Repeticiones por objetivo
// ---------------------------------------------------------------------------

test('un objetivo solo aplica su factor; varios se promedian sin importar el orden', () => {
  assert.equal(blendedRepFactor(['fuerza']), 0.7)
  assert.equal(blendedRepFactor(['resistencia']), 1.3)
  assert.equal(blendedRepFactor(['fuerza', 'resistencia']), 1)
  assert.equal(blendedRepFactor(['resistencia', 'fuerza']), blendedRepFactor(['fuerza', 'resistencia']))
  assert.equal(blendedRepFactor([]), 1, 'sin objetivo se usa el de salud general')
})

test('la fuerza baja las repeticiones y la resistencia las sube, sin bajar de 5', () => {
  const flexiones = exercise('flexiones')
  const fuerza = suggestWorkFor(flexiones, { ...BASE, goals: ['fuerza'] })
  const resistencia = suggestWorkFor(flexiones, { ...BASE, goals: ['resistencia'] })
  assert.ok(fuerza.reps < flexiones.work.reps)
  assert.ok(resistencia.reps > flexiones.work.reps)
  assert.ok(fuerza.reps >= 5)
})

test('los isométricos no recortan segundos por el objetivo', () => {
  const plancha = exercise('plancha')
  assert.equal(suggestWorkFor(plancha, { ...BASE, goals: ['fuerza'] }).reps, plancha.work.reps)
})

test('la intensidad mueve las series dentro del techo de la experiencia', () => {
  const flexiones = exercise('flexiones')
  const ligera = suggestWorkFor(flexiones, { ...BASE, intensity: 'ligera' })
  const moderada = suggestWorkFor(flexiones, { ...BASE, intensity: 'moderada' })
  const alta = suggestWorkFor(flexiones, { ...BASE, intensity: 'alta', experience: 'principiante' })
  assert.equal(ligera.sets, flexiones.work.sets - 1)
  assert.equal(moderada.sets, flexiones.work.sets)
  assert.ok(alta.sets <= 3, 'un principiante no pasa de 3 series')
  assert.ok(ligera.sets >= 2, 'nunca menos de 2 series')
})

// ---------------------------------------------------------------------------
// Progresión por historial
// ---------------------------------------------------------------------------

test('la última ejecución se lee de la sesión completada más reciente', () => {
  const history = [
    performed('flexiones', [{ reps: 12, weightKg: null, completed: true }], { dayKey: '2026-09-06' }),
    performed('flexiones', [{ reps: 8, weightKg: null, completed: true }], { dayKey: '2026-09-04' }),
    performed('flexiones', [{ reps: 20, weightKg: null, completed: true }], { dayKey: '2026-09-03', status: 'abandoned' }),
  ]
  const last = lastPerformanceOf('flexiones', history)
  assert.equal(last?.reps, 12)
  assert.equal(lastPerformanceOf('sentadilla', history), null)
})

test('sin historial la carga sugerida es la pesa disponible y las reps las del ejercicio', () => {
  const remo = exercise('remo-unilateral')
  assert.ok(usesLoad(remo))
  const work = suggestWorkFor(remo, BASE)
  assert.equal(work.weightKg, MAX_AVAILABLE_LOAD_KG)
  assert.equal(work.reps, remo.work.reps)
})

test('con todas las series hechas y carga por debajo del máximo, sube la carga un escalón', () => {
  const remo = exercise('remo-unilateral')
  const history = [performed('remo-unilateral', [{ reps: 12, weightKg: 2.5, completed: true }])]
  const work = suggestWorkFor(remo, { ...BASE, history })
  assert.equal(work.weightKg, Math.min(2.5 + LOAD_STEP_KG, MAX_AVAILABLE_LOAD_KG))
})

test('con la pesa al máximo, la progresión pasa a repeticiones y se detiene en el tope', () => {
  const remo = exercise('remo-unilateral')
  const history = [performed('remo-unilateral', [{ reps: 12, weightKg: 5, completed: true }])]
  const work = suggestWorkFor(remo, { ...BASE, history })
  assert.equal(work.weightKg, MAX_AVAILABLE_LOAD_KG, 'la carga no puede pasar del material que hay')
  assert.equal(work.reps, 14)

  const atCap = [performed('remo-unilateral', [{ reps: 99, weightKg: 5, completed: true }])]
  assert.equal(suggestWorkFor(remo, { ...BASE, history: atCap }).reps, repCapFor(remo))
})

test('si no se completaron todas las series, no se progresa: se repite', () => {
  const remo = exercise('remo-unilateral')
  const history = [
    performed('remo-unilateral', [
      { reps: 12, weightKg: 2.5, completed: true },
      { reps: 9, weightKg: 2.5, completed: false },
    ]),
  ]
  const work = suggestWorkFor(remo, { ...BASE, history })
  assert.equal(work.weightKg, 2.5)
  assert.equal(work.reps, 12)
})

test('los isométricos progresan en segundos', () => {
  const plancha = exercise('plancha')
  const history = [performed('plancha', [{ reps: 30, weightKg: null, completed: true }])]
  assert.equal(suggestWorkFor(plancha, { ...BASE, history }).reps, 35)
})

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

test('un ejercicio se domina cuando llega al tope de repeticiones con todas las series', () => {
  const flexiones = exercise('flexiones')
  const cap = repCapFor(flexiones)
  assert.equal(hasMastered(flexiones, []), false)
  assert.equal(hasMastered(flexiones, [performed('flexiones', [{ reps: cap, weightKg: null, completed: true }])]), true)
  assert.equal(hasMastered(flexiones, [performed('flexiones', [{ reps: cap, weightKg: null, completed: false }])]), false)
  assert.equal(hasMastered(flexiones, [performed('flexiones', [{ reps: cap - 1, weightKg: null, completed: true }])]), false)
})

test('solo se sube de variante cuando la actual está dominada; bajar no requiere nada', () => {
  const negativas = exercise('flexiones-negativas')
  assert.equal(negativas.difficulty, 2)

  assert.equal(adaptDifficulty(negativas, 3, {}).id, 'flexiones-negativas', 'sin dominarlo, se queda')
  const mastered = [performed('flexiones-negativas', [{ reps: repCapFor(negativas), weightKg: null, completed: true }])]
  assert.equal(adaptDifficulty(negativas, 3, { history: mastered }).id, 'flexiones', 'dominado, sube')
  assert.equal(adaptDifficulty(negativas, 1, {}).id, 'flexiones-inclinadas', 'por encima del objetivo, baja')
})

test('la dificultad objetivo combina experiencia e intensidad dentro de 1–5', () => {
  assert.equal(targetDifficultyFor('principiante', 'ligera'), 1)
  assert.equal(targetDifficultyFor('intermedio', 'moderada'), 2)
  assert.equal(targetDifficultyFor('avanzado', 'alta'), 4)
})

// ---------------------------------------------------------------------------
// La sesión entera
// ---------------------------------------------------------------------------

test('el número de ejercicios sale de los minutos, entre 3 y 6', () => {
  assert.equal(exerciseCountFor(10), 3)
  assert.equal(exerciseCountFor(45), 4)
  assert.equal(exerciseCountFor(120), 6)
})

test('una sesión solo contiene ejercicios del foco, sin repetir y ejecutables con lo que hay', () => {
  const session = buildSession({ focus: 'tren_superior', intensity: 'moderada', availableMinutes: 60, goals: ['hipertrofia'], experience: 'intermedio' })
  const ids = session.exercises.map((item) => item.exerciseId)
  assert.equal(new Set(ids).size, ids.length, 'sin repetidos')
  assert.ok(ids.length >= 3)
  for (const id of ids) {
    const found = exercise(id)
    assert.ok(FOCUS_CATEGORIES.tren_superior.includes(found.category), `${id} no es de tren superior`)
    assert.ok(found.equipment.every((item) => ['ninguno', 'pesa', 'superficie_elevada'].includes(item)))
  }
  assert.equal(session.title, titleFor('tren_superior', 'moderada'))
  assert.ok(session.estimatedMinutes >= 20 && session.estimatedMinutes % 5 === 0)
})

test('evitar grupos los deja fuera, salvo que la sesión quedara demasiado corta', () => {
  const session = buildSession({ focus: 'cuerpo_completo', intensity: 'moderada', availableMinutes: 60, goals: ['hipertrofia'], experience: 'intermedio', avoidMuscleGroups: ['piernas', 'gluteos'] })
  for (const item of session.exercises) {
    const found = exercise(item.exerciseId)
    assert.ok(!found.primaryMuscles.includes('piernas'), `${item.exerciseId} carga piernas`)
  }
  assert.ok(session.exercises.length >= 3)
})

test('ninguna sesión sugiere más carga que la pesa disponible', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'core_movilidad'] as const) {
    const session = buildSession({ focus, intensity: 'alta', availableMinutes: 60, goals: ['fuerza'], experience: 'avanzado' })
    for (const item of session.exercises) {
      if (item.suggestedWeightKg !== null) assert.ok(item.suggestedWeightKg <= MAX_AVAILABLE_LOAD_KG, item.exerciseId)
    }
  }
})

test('el catálogo entero es alcanzable: cada ejercicio con progresión apunta a uno real', () => {
  for (const item of EXERCISE_CATALOG) {
    if (item.progressionId) assert.ok(findExercise(item.progressionId), `${item.id} → ${item.progressionId}`)
    if (item.regressionId) assert.ok(findExercise(item.regressionId), `${item.id} → ${item.regressionId}`)
  }
})
