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

import { EXERCISE_CATALOG, findExercise, isAvailable, LEGACY_LOAD_KG } from '../workouts/catalog'
import type { CompletedSet, Exercise, WorkoutSession } from '../workouts/types'
import { FOCUS_CATEGORIES, isMainExercise, usesLoad, type ExercisePhase } from '../workouts/types'
import {
  adjustReps,
  completeSet,
  skipExercise,
  startWorkout,
  toWorkoutSession,
  type ActiveWorkout,
} from '../workouts/active-workout'
import { isPatternFallback, patternOf } from '../workouts/patterns'
import type { AxisProposal } from './types'
import {
  adaptDifficulty,
  buildSession,
  estimateMinutes,
  exerciseCountFor,
  hasMastered,
  lastPerformanceOf,
  repCapFor,
  ROTATION_DIFFICULTY_BAND,
  suggestWorkFor,
  targetDifficultyFor,
  titleFor,
} from './session-builder'
import { SKIP_PENALTY_DAYS } from '../workouts/history'

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

test('cada sesión sirve a un objetivo: la de fuerza baja las repeticiones y suma una serie, sin bajar de 5 (D-047)', () => {
  const flexiones = exercise('flexiones')
  const fuerza = suggestWorkFor(flexiones, { ...BASE, goal: 'fuerza' })
  const hipertrofia = suggestWorkFor(flexiones, { ...BASE, goal: 'hipertrofia' })
  assert.ok(fuerza.reps < hipertrofia.reps)
  assert.ok(fuerza.reps >= 5)
  assert.equal(fuerza.sets, hipertrofia.sets + 1)
  // Con varios objetivos en el perfil y sin objetivo de sesión, fuerza general: ya no se promedian.
  assert.deepEqual(
    suggestWorkFor(flexiones, { ...BASE, goals: ['fuerza', 'resistencia'] }),
    suggestWorkFor(flexiones, { ...BASE, goal: 'salud_general' }),
  )
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
  assert.equal(work.weightKg, LEGACY_LOAD_KG)
  assert.equal(work.reps, remo.work.reps)
})

test('con todas las series hechas y carga por debajo del máximo, sube la carga un escalón', () => {
  const remo = exercise('remo-unilateral')
  const history = [performed('remo-unilateral', [{ reps: 12, weightKg: 2.5, completed: true }])]
  const work = suggestWorkFor(remo, { ...BASE, history })
  assert.equal(work.weightKg, LEGACY_LOAD_KG)
})

test('con la pesa al máximo, la progresión pasa a repeticiones y se detiene en el tope', () => {
  const remo = exercise('remo-unilateral')
  const history = [performed('remo-unilateral', [{ reps: 12, weightKg: 5, completed: true }])]
  const work = suggestWorkFor(remo, { ...BASE, history })
  assert.equal(work.weightKg, LEGACY_LOAD_KG, 'la carga no puede pasar del material que hay')
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
  const inclinadas = exercise('flexiones-inclinadas')
  assert.equal(inclinadas.difficulty, 1)

  assert.equal(adaptDifficulty(inclinadas, 2, {}).id, 'flexiones-inclinadas', 'sin dominarlo, se queda')
  const mastered = [performed('flexiones-inclinadas', [{ reps: repCapFor(inclinadas), weightKg: null, completed: true }])]
  assert.equal(adaptDifficulty(inclinadas, 2, { history: mastered }).id, 'flexiones', 'dominado, sube')
  assert.equal(adaptDifficulty(exercise('flexiones'), 1, {}).id, 'flexiones-inclinadas', 'por encima del objetivo, baja')
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
  const ids = session.exercises.filter(isMainExercise).map((item) => item.exerciseId)
  assert.equal(new Set(ids).size, ids.length, 'sin repetidos')
  assert.ok(ids.length >= 3)
  for (const id of ids) {
    const found = exercise(id)
    assert.ok(FOCUS_CATEGORIES.tren_superior.includes(found.category), `${id} no es de tren superior`)
    assert.ok(found.equipment.every((item) => ['ninguno', 'pesa', 'superficie_elevada'].includes(item)))
  }
  assert.equal(session.title, titleFor('tren_superior', 'moderada', 'hipertrofia'))
  assert.equal(session.title, 'Hipertrofia · Tren superior')
  // La duración es la real (D-050) y cabe en el tiempo disponible.
  assert.ok(session.estimatedMinutes > 0 && session.estimatedMinutes <= 60)
})

test('D-050: la duración sale de series, repeticiones, descansos y cambios', () => {
  const planned = (sets: number, reps: number, rest: number, extra: Partial<{ isTimed: boolean; unilateral: boolean }> = {}) => ({
    exerciseId: 'x', name: 'x', sets, reps, isTimed: false, suggestedWeightKg: null, restSeconds: rest, unilateral: false, tempo: null, imageUrl: null, ...extra,
  })
  // 3 × 10 a 4 s, 2 descansos de 60 s y 45 s de cambio: 120 + 120 + 45 = 285 s → 5 min.
  assert.equal(estimateMinutes([planned(3, 10, 60)]), 5)
  // A un lado y luego al otro, el trabajo se dobla.
  assert.ok(estimateMinutes([planned(3, 10, 60, { unilateral: true })]) > estimateMinutes([planned(3, 10, 60)]))
  // Por tiempo, los segundos son los del ejercicio: 4 × 30 s + 3 × 30 s + 45 s ≈ 4 min.
  assert.equal(estimateMinutes([planned(4, 30, 30, { isTimed: true })]), 4)
})

test('D-050: con muy poco tiempo la sesión se compacta en vez de pasarse', () => {
  const session = buildSession({ focus: 'cuerpo_completo', intensity: 'moderada', availableMinutes: 20, goals: ['hipertrofia'], experience: 'intermedio' })
  assert.ok(session.estimatedMinutes <= 20, `sesión de ${session.estimatedMinutes} min`)
  assert.ok(session.exercises.filter(isMainExercise).length >= 1)
})

test('D-050: en el mismo tiempo, la fuerza (descansos largos) lleva menos o los mismos ejercicios que la hipertrofia', () => {
  const base = { focus: 'tren_superior' as const, intensity: 'moderada' as const, availableMinutes: 50, goals: ['fuerza' as const], experience: 'intermedio' as const }
  const strength = buildSession({ ...base, goal: 'fuerza' }).exercises.filter(isMainExercise).length
  const hypertrophy = buildSession({ ...base, goal: 'hipertrofia' }).exercises.filter(isMainExercise).length
  assert.ok(strength <= hypertrophy)
})

test('evitar grupos los deja fuera, salvo que la sesión quedara demasiado corta', () => {
  const session = buildSession({ focus: 'cuerpo_completo', intensity: 'moderada', availableMinutes: 60, goals: ['hipertrofia'], experience: 'intermedio', avoidMuscleGroups: ['piernas', 'gluteos'] })
  // El calentamiento moviliza el tobillo, pero no carga piernas: solo cuenta el entrenamiento.
  const main = session.exercises.filter(isMainExercise)
  for (const item of main) {
    const found = exercise(item.exerciseId)
    assert.ok(!found.primaryMuscles.includes('piernas'), `${item.exerciseId} carga piernas`)
  }
  assert.ok(main.length >= 3)
})

test('ninguna sesión sugiere más carga que la pesa disponible', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'core_movilidad'] as const) {
    const session = buildSession({ focus, intensity: 'alta', availableMinutes: 60, goals: ['fuerza'], experience: 'avanzado' })
    for (const item of session.exercises) {
      if (item.suggestedWeightKg !== null) assert.ok(item.suggestedWeightKg <= LEGACY_LOAD_KG, item.exerciseId)
    }
  }
})

test('el catálogo entero es alcanzable: cada ejercicio con progresión apunta a uno real', () => {
  for (const item of EXERCISE_CATALOG) {
    if (item.progressionId) assert.ok(findExercise(item.progressionId), `${item.id} → ${item.progressionId}`)
    if (item.regressionId) assert.ok(findExercise(item.regressionId), `${item.id} → ${item.regressionId}`)
  }
})

// ---------------------------------------------------------------------------
// Regresión D-019: la progresión con datos del flujo real
//
// El test de arriba («si no se completaron todas las series…») construye a mano
// una serie con `completed: false`, algo que el entrenamiento real nunca produce:
// toda serie registrada es completada. Con el flujo real, un ejercicio hecho a
// medias se daba por hecho y AXIS subía la carga la sesión siguiente.
// ---------------------------------------------------------------------------

function realSession(play: (workout: ActiveWorkout) => ActiveWorkout): WorkoutSession {
  const remo = exercise('remo-unilateral')
  const proposal: AxisProposal = {
    id: 'p-1',
    dayKey: '2026-09-07',
    createdAt: '2026-09-07T10:00:00.000Z',
    type: 'TRAINING',
    headline: 'Entrena tren superior.',
    reason: 'Tu recuperación es buena.',
    factors: [],
    label: 'Recomendada',
    rule: 'good_recovery',
    session: {
      focus: 'tren_superior',
      title: 'Fuerza · Tren superior',
      intensity: 'moderada',
      estimatedMinutes: 30,
      muscleGroups: ['espalda'],
      exercises: [
        {
          exerciseId: remo.id,
          name: remo.name,
          sets: 3,
          reps: 12,
          isTimed: false,
          suggestedWeightKg: 2.5,
          restSeconds: 60,
          unilateral: true,
          tempo: null,
          imageUrl: null,
        },
      ],
    },
  }
  const started = startWorkout(proposal, new Date(2026, 8, 7, 18, 0))!
  return toWorkoutSession(play(started), { status: 'completed', completedAt: new Date(2026, 8, 7, 18, 30) })
}

test('con el flujo real, 2 de 3 series no suben la carga: se repite', () => {
  const half = realSession((w) => skipExercise(completeSet(completeSet(w))))
  const work = suggestWorkFor(exercise('remo-unilateral'), { ...BASE, history: [half] })
  assert.equal(work.weightKg, 2.5)
})

test('con el flujo real, menos reps de las previstas no suben la carga', () => {
  const low = realSession((w) => {
    let current = adjustReps(w, -4) // 8 de 12
    for (let i = 0; i < 3; i += 1) current = completeSet(current)
    return current
  })
  const work = suggestWorkFor(exercise('remo-unilateral'), { ...BASE, history: [low] })
  assert.equal(work.weightKg, 2.5)
})

test('con el flujo real, lo previsto entero sí sube la carga', () => {
  const full = realSession((w) => completeSet(completeSet(completeSet(w))))
  const work = suggestWorkFor(exercise('remo-unilateral'), { ...BASE, history: [full] })
  assert.equal(work.weightKg, LEGACY_LOAD_KG)
})

// ---------------------------------------------------------------------------
// Rotación de ejercicios (D-020)
//
// Entre candidatos válidos y de dificultad equivalente, gana el que lleva más
// tiempo sin usarse. Determinista: mismo historial, misma sesión.
// ---------------------------------------------------------------------------

const ROTATION = { ...BASE, availableMinutes: 45 }
const TODAY = '2026-09-20'

/** Una sesión con estos ejercicios hechos y estos saltados, como la guarda la app. */
function day(
  dayKey: string,
  done: readonly string[],
  options: { skipped?: readonly string[]; status?: WorkoutSession['status'] } = {},
): WorkoutSession {
  return {
    ...performed('x', [], { dayKey, status: options.status ?? 'completed' }),
    id: `day-${dayKey}-${done.join('+')}`,
    exercises: done.map((id) => ({
      exerciseId: id,
      name: exercise(id).name,
      sets: [{ reps: 10, weightKg: null, completed: true }],
    })),
    // El texto exacto que deja `skipExercise` (un test de history vigila el contrato).
    modifications: (options.skipped ?? []).map((id) => ({
      kind: 'exercise_skipped' as const,
      detail: `${exercise(id).name} sin completar.`,
    })),
  }
}

/** Los ejercicios del entrenamiento, sin el calentamiento ni la vuelta a la calma (D-032). */
function ids(session: { exercises: readonly { exerciseId: string; phase?: ExercisePhase }[] }): string[] {
  return session.exercises.filter(isMainExercise).map((item) => item.exerciseId)
}

/** Varias sesiones seguidas del mismo foco, cada una hecha entera y añadida al historial. */
function weeks(
  focus: Parameters<typeof buildSession>[0]['focus'],
  count: number,
  extra: Partial<Parameters<typeof buildSession>[0]> = {},
): string[][] {
  let history: WorkoutSession[] = []
  const result: string[][] = []
  for (let week = 0; week < count; week += 1) {
    const dayKey = `2026-08-${String(week + 1).padStart(2, '0')}`
    const session = buildSession({ ...ROTATION, focus, history, today: dayKey, ...extra })
    result.push(ids(session))
    history = [day(dayKey, ids(session)), ...history]
  }
  return result
}

test('sin historial la selección es la de siempre: sin uso registrado, manda la dificultad', () => {
  const session = buildSession({ ...ROTATION, focus: 'tren_superior' })
  // En 45 min, con la duración real (D-050), caben cinco.
  // Por patrones (D-073): empuje horizontal, tirón, empuje vertical, el otro tirón y un brazo.
  assert.deepEqual(ids(session), [
    'flexiones',
    'remo-unilateral',
    'press-hombro-unilateral',
    'pullover-con-pesa',
    'extension-triceps-unilateral',
  ])
  assert.ok(session.estimatedMinutes <= 45)
})

test('con el mismo historial sale siempre la misma sesión', () => {
  const history = [day('2026-09-19', ['flexiones', 'remo-unilateral'])]
  const a = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  const b = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.deepEqual(ids(a), ids(b))
})

test('dos sesiones seguidas del mismo foco no son iguales', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'core_movilidad'] as const) {
    const [first, second] = weeks(focus, 2)
    assert.notDeepEqual(first, second, focus)
  }
})

test('con el tiempo salen todos los ejercicios de dificultad equivalente: ninguno queda fuera', () => {
  const target = targetDifficultyFor(ROTATION.experience, ROTATION.intensity)
  // Con tiempo para los seis huecos de la plantilla (D-073): con menos, el accesorio de hombro no llega.
  const seen = new Set(weeks('tren_superior', 8, { availableMinutes: 75 }).flat())

  const expected = EXERCISE_CATALOG.filter(
    (item) =>
      (item.category === 'empuje' || item.category === 'tiron') &&
      isAvailable(item) &&
      Math.abs(item.difficulty - target) <= ROTATION_DIFFICULTY_BAND &&
      adaptDifficulty(item, target).id === item.id &&
      // Un sustituto (D-073) solo entra si no hay nada mejor del patrón.
      !isPatternFallback(item),
  )
  assert.ok(expected.length > 4, 'hay más candidatos que huecos en una sesión')
  for (const item of expected) {
    assert.ok(seen.has(item.id), `${item.name} no ha salido en 8 sesiones`)
  }
})

test('en cuerpo completo corto van los compuestos: pierna, empuje y tirón antes que el core (D-073)', () => {
  for (const sessionIds of weeks('cuerpo_completo', 4, { availableMinutes: 30 })) {
    const patterns = sessionIds.map((id) => patternOf(exercise(id)))
    assert.ok(patterns[0] === 'sentadilla' || patterns[0] === 'zancada', sessionIds.join(', '))
    assert.equal(patterns[1], 'empuje_horizontal', sessionIds.join(', '))
    assert.ok(patterns[2] === 'tiron_horizontal' || patterns[2] === 'tiron_vertical', sessionIds.join(', '))
    assert.ok(!patterns.includes('core'), sessionIds.join(', '))
  }
  const long = ids(buildSession({ ...ROTATION, focus: 'cuerpo_completo', availableMinutes: 75 }))
  assert.ok(long.some((id) => patternOf(exercise(id)) === 'core'), `con tiempo, el core entra: ${long.join(', ')}`)
})

test('la rotación respeta los grupos que hay que evitar', () => {
  const history = [day('2026-09-19', ['sentadilla', 'zancadas'])]
  const session = buildSession({
    ...ROTATION,
    focus: 'cuerpo_completo',
    avoidMuscleGroups: ['piernas'],
    history,
    today: TODAY,
  })
  for (const id of ids(session)) {
    const item = exercise(id)
    assert.ok(
      !item.primaryMuscles.includes('piernas') && !item.secondaryMuscles.includes('piernas'),
      `${item.name} carga piernas`,
    )
  }
})

test('una sesión interrumpida con series también cuenta como uso', () => {
  const history = [day('2026-09-19', ['flexiones'], { status: 'abandoned' })]
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.ok(!ids(session).includes('flexiones'))
})

test('la movilidad no cuenta como grupo cargado de la sesión', () => {
  const session = buildSession({ ...ROTATION, focus: 'core_movilidad' })
  const loaded = new Set(
    session.exercises
      .map((item) => exercise(item.exerciseId))
      .filter((item) => item.category !== 'movilidad')
      .flatMap((item) => [...item.primaryMuscles, ...item.secondaryMuscles]),
  )
  assert.ok(session.exercises.some((item) => exercise(item.exerciseId).category === 'movilidad'))
  assert.deepEqual([...new Set(session.muscleGroups)].sort(), [...loaded].sort())
})

// ---------------------------------------------------------------------------
// Ejercicios saltados (D-020)
// ---------------------------------------------------------------------------

test('un ejercicio nunca usado puede aparecer', () => {
  // Sin historial, «Flexiones» abre la sesión.
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history: [], today: TODAY })
  assert.equal(ids(session)[0], 'flexiones')
})

test('un ejercicio saltado hace poco pierde prioridad frente a uno nunca usado', () => {
  const history = [day('2026-09-19', [], { skipped: ['flexiones'] })]
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.ok(!ids(session).includes('flexiones'), 'AXIS no lo vuelve a proponer de inmediato')
})

test('un ejercicio saltado hace suficiente tiempo vuelve a competir normalmente', () => {
  // 19 días antes de TODAY: más que SKIP_PENALTY_DAYS.
  const history = [day('2026-09-01', [], { skipped: ['flexiones'] })]
  assert.ok(19 > SKIP_PENALTY_DAYS)
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.equal(ids(session)[0], 'flexiones', 'la señal caducó: como si nunca se hubiera usado')
})

test('saltar un ejercicio no cambia su progresión: solo cuentan las series hechas', () => {
  const remo = exercise('remo-unilateral')
  const done = performed('remo-unilateral', [{ reps: 12, weightKg: 2.5, completed: true }], {
    dayKey: '2026-09-10',
  })
  const skipped = day('2026-09-19', [], { skipped: ['remo-unilateral'] })

  assert.deepEqual(
    lastPerformanceOf('remo-unilateral', [skipped, done]),
    lastPerformanceOf('remo-unilateral', [done]),
  )
  assert.deepEqual(
    suggestWorkFor(remo, { ...BASE, history: [skipped, done] }),
    suggestWorkFor(remo, { ...BASE, history: [done] }),
  )
})

// ---------------------------------------------------------------------------
// Familias (D-020.1)
//
// Variedad preferida, no restricción: dos variantes de la misma familia no van
// juntas si hay alternativas; si no las hay, se repite familia antes que dejar
// la sesión corta.
// ---------------------------------------------------------------------------

/** El catálogo real sin ninguna familia: el comportamiento de antes de D-020.1. */
const WITHOUT_FAMILIES: Exercise[] = EXERCISE_CATALOG.map(({ family: _family, ...rest }) => rest)

function families(sessionIds: readonly string[]): string[] {
  return sessionIds.map((id) => exercise(id).family).filter((family): family is string => Boolean(family))
}

test('con alternativas, ninguna sesión junta dos variantes de la misma familia', () => {
  const levels = [
    ['principiante', 'ligera'], ['principiante', 'moderada'], ['intermedio', 'moderada'],
    ['intermedio', 'alta'], ['avanzado', 'alta'],
  ] as const
  for (const [experience, intensity] of levels) {
    for (const focus of ['tren_superior', 'tren_inferior', 'core_movilidad', 'cuerpo_completo'] as const) {
      for (const sessionIds of weeks(focus, 8, { experience, intensity })) {
        const used = families(sessionIds)
        assert.equal(new Set(used).size, used.length, `${experience}/${intensity}/${focus}: ${sessionIds.join(', ')}`)
      }
    }
  }
})

test('nunca se repite el mismo ejercicio dentro de una sesión', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'core_movilidad', 'cuerpo_completo'] as const) {
    for (const sessionIds of weeks(focus, 8)) {
      assert.equal(new Set(sessionIds).size, sessionIds.length, sessionIds.join(', '))
    }
  }
})

test('la familia separa lo que el patrón no: sin familias, la misma sesión juntaba dos puentes', () => {
  const withFamilies = ids(buildSession({ ...ROTATION, focus: 'tren_inferior' }))
  const withoutFamilies = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', catalog: WITHOUT_FAMILIES }))

  const realFamilies = (sessionIds: string[]) => families(sessionIds)
  assert.ok(new Set(realFamilies(withoutFamilies)).size < realFamilies(withoutFamilies).length, withoutFamilies.join(', '))
  assert.equal(new Set(realFamilies(withFamilies)).size, realFamilies(withFamilies).length, withFamilies.join(', '))
  assert.equal(withFamilies.length, withoutFamilies.length, 'la sesión no sale más corta')
})

test('los ejercicios sin familia se eligen exactamente como antes', () => {
  // Sin conflicto de familia, las dos selecciones coinciden: tren superior y core, sin historial.
  for (const focus of ['tren_superior', 'core_movilidad'] as const) {
    assert.deepEqual(
      ids(buildSession({ ...ROTATION, focus })),
      ids(buildSession({ ...ROTATION, focus, catalog: WITHOUT_FAMILIES })),
      focus,
    )
  }
})

test('si no hay familias suficientes, se repite familia antes que dejar la sesión corta', () => {
  // Solo zancadas: tres ejercicios de la misma familia y nada más en piernas.
  const onlyLunges = EXERCISE_CATALOG.filter(
    (item) => item.category !== 'piernas' || ['zancadas', 'zancada-atras', 'zancada-bulgara'].includes(item.id),
  )
  const session = ids(buildSession({ ...ROTATION, experience: 'avanzado', intensity: 'alta', focus: 'tren_inferior', catalog: onlyLunges }))

  assert.deepEqual(session.sort(), ['zancada-atras', 'zancada-bulgara', 'zancadas'])
  assert.equal(new Set(families(session)).size, 1, 'repite familia: no había otra cosa')
})

test('con familias la selección sigue siendo determinista', () => {
  const history = [day('2026-09-19', ['sentadilla', 'puente-gluteos'])]
  const a = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', history, today: TODAY }))
  const b = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', history, today: TODAY }))
  assert.deepEqual(a, b)
})

// ---------------------------------------------------------------------------
// D-031: el esfuerzo modula la progresión, y la semana de descarga
// ---------------------------------------------------------------------------

const DONE = [
  { reps: 12, weightKg: null, completed: true },
  { reps: 12, weightKg: null, completed: true },
  { reps: 12, weightKg: null, completed: true },
]

test('D-031: la última ejecución recuerda cuánto costó la sesión', () => {
  assert.equal(lastPerformanceOf('flexiones', [performed('flexiones', DONE, { effort: 4 })])?.effort, 4)
  assert.equal(lastPerformanceOf('flexiones', [performed('flexiones', DONE)])?.effort, null)
})

test('D-031: «al límite» repite aunque se completara todo; «fácil» dobla el paso', () => {
  const flexiones = exercise('flexiones')
  const normal = suggestWorkFor(flexiones, { ...BASE, history: [performed('flexiones', DONE, { effort: 3 })] })
  const limite = suggestWorkFor(flexiones, { ...BASE, history: [performed('flexiones', DONE, { effort: 5 })] })
  const facil = suggestWorkFor(flexiones, { ...BASE, history: [performed('flexiones', DONE, { effort: 2 })] })
  const sinValorar = suggestWorkFor(flexiones, { ...BASE, history: [performed('flexiones', DONE)] })

  assert.equal(limite.reps, 12, 'al límite: mismas repeticiones')
  assert.ok(normal.reps > 12, 'moderado: sube')
  assert.equal(sinValorar.reps, normal.reps, 'sin valorar, como siempre')
  assert.ok(facil.reps > normal.reps || facil.reps === repCapFor(flexiones), 'fácil: sube más, sin pasar el techo')
})

test('D-031: en descarga, una serie menos (nunca menos de 2) y sin subir', () => {
  const flexiones = exercise('flexiones')
  const history = [performed('flexiones', DONE, { effort: 2 })]
  const normal = suggestWorkFor(flexiones, { ...BASE, history })
  const descarga = suggestWorkFor(flexiones, { ...BASE, history, deload: true })

  assert.equal(descarga.sets, Math.max(2, normal.sets - 1))
  assert.equal(descarga.reps, 12, 'no se sube en descarga')
  assert.ok(suggestWorkFor(flexiones, { ...BASE, intensity: 'ligera', deload: true }).sets >= 2)
})

test('D-031: una sesión de descarga lo lleva marcado', () => {
  const descarga = buildSession({ ...BASE, focus: 'tren_superior', availableMinutes: 45, deload: true })
  const normal = buildSession({ ...BASE, focus: 'tren_superior', availableMinutes: 45 })
  assert.equal(descarga.deload, true)
  assert.equal('deload' in normal, false)
})

// ---------------------------------------------------------------------------
// D-032: calentamiento y vuelta a la calma
// ---------------------------------------------------------------------------

test('D-045: cada sesión de fuerza abre con el calentamiento en tres partes y ya no tiene vuelta a la calma', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus })
    const parts = session.exercises.map((item) => item.warmupPart ?? (item.phase ? 'otra fase' : 'entrenamiento'))
    const first = parts.indexOf('entrenamiento')
    assert.ok(first > 0, `${focus}: empieza calentando`)
    // Activación, movilidad y aproximación, en ese orden y sin mezclarse.
    const warmup = parts.slice(0, first)
    assert.deepEqual([...new Set(warmup)], ['activacion', 'movilidad', 'aproximacion'], `${focus}: ${warmup.join(', ')}`)
    assert.ok(parts.slice(first).every((part) => part === 'entrenamiento'), `${focus}: termina con el entrenamiento`)
    assert.ok(session.exercises.every((item) => item.phase !== 'vuelta_calma'))
  }
})

test('D-045: la activación es un minuto de jumping jacks y otro de escaladores', () => {
  const session = buildSession({ ...ROTATION, focus: 'cuerpo_completo' })
  const activation = session.exercises.filter((item) => item.warmupPart === 'activacion')
  assert.deepEqual(
    activation.map((item) => [item.exerciseId, item.reps, item.isTimed]),
    [
      ['jumping-jacks', 60, true],
      ['escaladores', 60, true],
    ],
  )
})

test('D-045: la movilidad es de la zona, una serie, sin carga ni descanso', () => {
  const session = buildSession({ ...ROTATION, focus: 'tren_inferior' })
  for (const item of session.exercises.filter((entry) => entry.warmupPart === 'movilidad')) {
    assert.equal(exercise(item.exerciseId).category, 'movilidad', item.exerciseId)
    assert.equal(item.sets, 1)
    assert.equal(item.suggestedWeightKg, null)
    assert.equal(item.restSeconds, 0)
  }
})

test('enmienda de D-045: la movilidad articular es un solo paso libre de 2 minutos, 3 con el objetivo de movilidad', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'acondicionamiento'] as const) {
    const mobility = buildSession({ ...ROTATION, focus }).exercises.filter((item) => item.warmupPart === 'movilidad')
    assert.deepEqual(mobility.map((item) => [item.exerciseId, item.reps, item.isTimed]), [['movilidad-articular', 120, true]], focus)
  }
  const withGoal = buildSession({ ...ROTATION, focus: 'tren_inferior', goals: ['fuerza', 'movilidad'] })
  assert.equal(withGoal.exercises.find((item) => item.exerciseId === 'movilidad-articular')?.reps, 180)
  // Quien salta sigue teniendo su equilibrio después (D-033).
  const jumper = buildSession({ ...ROTATION, focus: 'tren_inferior', jumpSport: true }).exercises.filter((item) => item.warmupPart === 'movilidad')
  assert.deepEqual(jumper.map((item) => item.exerciseId), ['movilidad-articular', 'equilibrio-una-pierna'])
})

test('la movilidad articular nunca se elige como entrenamiento', () => {
  for (const focus of ['core_movilidad', 'tren_superior'] as const) {
    const session = buildSession({ ...ROTATION, focus })
    assert.ok(!session.exercises.filter(isMainExercise).some((item) => item.exerciseId === 'movilidad-articular'), focus)
  }
})

test('D-045: la aproximación son 5 repeticiones de los primeros ejercicios: con pesa la misma carga, sin pesa una variante más fácil', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus })
    const main = session.exercises.filter(isMainExercise).filter((item) => !item.isTimed && exercise(item.exerciseId).category !== 'pliometria')
    const approach = session.exercises.filter((item) => item.warmupPart === 'aproximacion')
    assert.equal(approach.length, Math.min(3, main.length), focus)
    approach.forEach((item, index) => {
      const planned = main[index]
      const original = exercise(planned.exerciseId)
      assert.equal(item.sets, 1)
      assert.equal(item.reps, 5)
      assert.equal(item.restSeconds, 0)
      if (usesLoad(original)) {
        assert.equal(item.exerciseId, planned.exerciseId, `${focus}: con pesa, el mismo ejercicio`)
        assert.equal(item.suggestedWeightKg, planned.suggestedWeightKg, `${focus}: con la pesa que se va a usar`)
      } else {
        assert.equal(item.exerciseId, original.regressionId ?? original.id, `${focus}: sin pesa, la variante más fácil`)
        assert.equal(item.suggestedWeightKg, null)
      }
    })
  }
})

test('D-032: la sesión de movilidad no lleva calentamiento: ya lo es', () => {
  const session = buildSession({ ...ROTATION, focus: 'core_movilidad' })
  assert.ok(session.exercises.every(isMainExercise))
})

test('D-032: el calentamiento no cuenta como última vez, ni para la rotación', () => {
  const warmupOnly = performed('gato-camello', [{ reps: 10, weightKg: null, completed: true }])
  warmupOnly.exercises = [{ ...warmupOnly.exercises[0], phase: 'calentamiento' }]
  assert.equal(lastPerformanceOf('gato-camello', [warmupOnly]), null)

  const session = buildSession({ ...ROTATION, focus: 'core_movilidad', history: [warmupOnly], today: TODAY })
  const fresh = buildSession({ ...ROTATION, focus: 'core_movilidad', today: TODAY })
  assert.deepEqual(ids(session), ids(fresh), 'la rotación no lo da por usado')
})

// ---------------------------------------------------------------------------
// D-033: deportes de salto
// ---------------------------------------------------------------------------

const categoryOf = (id: string) => exercise(id).category

test('D-033: con un deporte de salto, la sesión de piernas abre el entrenamiento con un salto', () => {
  for (const focus of ['tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus, jumpSport: true })
    const main = ids(session)
    assert.equal(categoryOf(main[0]), 'pliometria', `${focus}: el salto va primero`)
    assert.equal(main.filter((id) => categoryOf(id) === 'pliometria').length, 1, 'uno solo')
    assert.ok(session.exercises.some((item) => item.exerciseId === 'equilibrio-una-pierna' && item.phase === 'calentamiento'))
  }
})

test('D-033: sin deporte de salto, ni saltos ni equilibrio', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus })
    assert.ok(session.exercises.every((item) => categoryOf(item.exerciseId) !== 'pliometria'))
    assert.ok(session.exercises.every((item) => item.exerciseId !== 'equilibrio-una-pierna'))
  }
})

test('D-033: tren superior y sesiones ligeras no llevan salto; el equilibrio del calentamiento, sí', () => {
  const upper = buildSession({ ...ROTATION, focus: 'tren_superior', jumpSport: true })
  const light = buildSession({ ...ROTATION, focus: 'tren_inferior', intensity: 'ligera', jumpSport: true })
  for (const session of [upper, light]) {
    assert.ok(session.exercises.every((item) => categoryOf(item.exerciseId) !== 'pliometria'))
    assert.ok(session.exercises.some((item) => item.exerciseId === 'equilibrio-una-pierna'))
  }
  const mobility = buildSession({ ...ROTATION, focus: 'core_movilidad', jumpSport: true })
  assert.ok(mobility.exercises.every(isMainExercise), 'la movilidad sigue sin calentamiento')
})

test('D-033: el salto ocupa un hueco, no alarga la sesión', () => {
  const plain = buildSession({ ...ROTATION, focus: 'tren_inferior' })
  const jumping = buildSession({ ...ROTATION, focus: 'tren_inferior', jumpSport: true })
  // El equilibrio añade 2 minutos al calentamiento: como mucho, un ejercicio de fuerza menos.
  assert.ok(ids(jumping).length <= ids(plain).length)
  assert.ok(jumping.estimatedMinutes <= plain.estimatedMinutes)
})

test('D-033: los saltos rotan: el último usado no repite', () => {
  const first = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', jumpSport: true, today: TODAY }))[0]
  const history = [day('2026-09-19', [first])]
  const second = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', jumpSport: true, history, today: TODAY }))[0]
  assert.equal(categoryOf(second), 'pliometria')
  assert.notEqual(second, first)
})

// ---------------------------------------------------------------------------
// D-035: objetivos medibles
// ---------------------------------------------------------------------------

test('D-035: el ejercicio de un objetivo abierto entra en la sesión de su zona', () => {
  const plain = ids(buildSession({ ...ROTATION, focus: 'tren_superior' }))
  const candidate = ['flexiones', 'curl-biceps-unilateral', 'superman'].find((id) => !plain.includes(id))!
  const withTarget = ids(buildSession({ ...ROTATION, focus: 'tren_superior', priorityExerciseIds: [candidate] }))
  assert.ok(withTarget.includes(candidate), `${candidate} debía entrar`)
  assert.equal(withTarget.length, plain.length, 'sustituye, no añade')

  // De otra zona, no entra.
  const legs = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', priorityExerciseIds: [candidate] }))
  assert.ok(!legs.includes(candidate))
})

// ---------------------------------------------------------------------------
// D-037: lo que no gusta
// ---------------------------------------------------------------------------

test('D-037: un ejercicio que no gusta no entra mientras haya alternativas; un objetivo sí', () => {
  const plain = ids(buildSession({ ...ROTATION, focus: 'tren_superior' }))
  const disliked = plain[0]
  const without = ids(buildSession({ ...ROTATION, focus: 'tren_superior', dislikedExerciseIds: [disliked] }))
  assert.ok(!without.includes(disliked), `${disliked} no debía entrar`)
  assert.equal(without.length, plain.length)

  const goal = ids(buildSession({ ...ROTATION, focus: 'tren_superior', dislikedExerciseIds: [disliked], priorityExerciseIds: [disliked] }))
  assert.ok(goal.includes(disliked), 'el objetivo lo pidió el usuario')
})

test('D-037: saltar un ejercicio dos veces en un mes se lee como que no gusta', async () => {
  const { frequentlySkipped } = await import('../workouts/history')
  const once = [day('2026-09-19', [], { skipped: ['zancadas'] })]
  const twice = [day('2026-09-19', [], { skipped: ['zancadas'] }), day('2026-09-12', [], { skipped: ['zancadas'] })]
  const old = [day('2026-09-19', [], { skipped: ['zancadas'] }), day('2026-07-01', [], { skipped: ['zancadas'] })]
  assert.deepEqual(frequentlySkipped(once, TODAY, EXERCISE_CATALOG), [])
  assert.deepEqual(frequentlySkipped(twice, TODAY, EXERCISE_CATALOG), ['zancadas'])
  assert.deepEqual(frequentlySkipped(old, TODAY, EXERCISE_CATALOG), [], 'fuera de los 30 días no cuenta')
})

// ---------------------------------------------------------------------------
// D-041: el escaneo entrena
// ---------------------------------------------------------------------------

test('D-041: los correctivos del escaneo entran en el calentamiento, dos como mucho y sin repetir', () => {
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', warmupExtras: ['angeles-pared', 'tobillo-pared', 'estiramiento-flexor-cadera', 'equilibrio-una-pierna'] })
  const warmup = session.exercises.filter((item) => item.warmupPart === 'movilidad').map((item) => item.exerciseId)
  // Tras la movilidad libre, los dos primeros correctivos (enmienda de D-045).
  assert.deepEqual(warmup, ['movilidad-articular', 'angeles-pared', 'tobillo-pared'])
  assert.ok(buildSession({ ...ROTATION, focus: 'core_movilidad', warmupExtras: ['tobillo-pared'] }).exercises.every(isMainExercise))
})

test('D-041: con diferencia entre lados, al menos un ejercicio a una mano o una pierna', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus, preferUnilateral: true })
    const main = session.exercises.filter(isMainExercise)
    assert.ok(main.some((item) => item.unilateral), `${focus}: ${main.map((item) => item.exerciseId).join(', ')}`)
  }
})
