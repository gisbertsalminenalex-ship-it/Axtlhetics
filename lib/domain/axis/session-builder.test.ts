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
import { FOCUS_CATEGORIES, isMainExercise, usesLoad, type ExercisePhase } from '../workouts/types'
import {
  adjustReps,
  completeSet,
  skipExercise,
  startWorkout,
  toWorkoutSession,
  type ActiveWorkout,
} from '../workouts/active-workout'
import type { AxisProposal } from './types'
import {
  adaptDifficulty,
  blendedRepFactor,
  buildSession,
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
  const ids = session.exercises.filter(isMainExercise).map((item) => item.exerciseId)
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
  assert.equal(work.weightKg, Math.min(2.5 + LOAD_STEP_KG, MAX_AVAILABLE_LOAD_KG))
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
  // 45 min menos los 6 del calentamiento y la vuelta a la calma: caben tres (D-032).
  assert.deepEqual(ids(session), ['flexiones-negativas', 'remo-unilateral', 'press-hombro-unilateral'])
})

test('con el mismo historial sale siempre la misma sesión', () => {
  const history = [day('2026-09-19', ['flexiones-negativas', 'remo-unilateral'])]
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
  const seen = new Set(weeks('tren_superior', 8).flat())

  const expected = EXERCISE_CATALOG.filter(
    (item) =>
      (item.category === 'empuje' || item.category === 'tiron') &&
      Math.abs(item.difficulty - target) <= ROTATION_DIFFICULTY_BAND &&
      adaptDifficulty(item, target).id === item.id,
  )
  assert.ok(expected.length > 4, 'hay más candidatos que huecos en una sesión')
  for (const item of expected) {
    assert.ok(seen.has(item.id), `${item.name} no ha salido en 8 sesiones`)
  }
})

test('en cuerpo completo corto, el core ya no se queda siempre fuera', () => {
  const sessions = weeks('cuerpo_completo', 4, { availableMinutes: 25 })
  assert.equal(sessions[0].length, 3, 'tres ejercicios para cuatro categorías')
  const core = sessions.flat().filter((id) => exercise(id).category === 'core')
  assert.ok(core.length > 0, `ninguna de ${sessions.length} sesiones tuvo core`)
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
  const history = [day('2026-09-19', ['flexiones-negativas'], { status: 'abandoned' })]
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.ok(!ids(session).includes('flexiones-negativas'))
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
  // Sin historial, «Flexiones negativas» abre la sesión.
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history: [], today: TODAY })
  assert.equal(ids(session)[0], 'flexiones-negativas')
})

test('un ejercicio saltado hace poco pierde prioridad frente a uno nunca usado', () => {
  const history = [day('2026-09-19', [], { skipped: ['flexiones-negativas'] })]
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.ok(!ids(session).includes('flexiones-negativas'), 'AXIS no lo vuelve a proponer de inmediato')
})

test('un ejercicio saltado hace suficiente tiempo vuelve a competir normalmente', () => {
  // 19 días antes de TODAY: más que SKIP_PENALTY_DAYS.
  const history = [day('2026-09-01', [], { skipped: ['flexiones-negativas'] })]
  assert.ok(19 > SKIP_PENALTY_DAYS)
  const session = buildSession({ ...ROTATION, focus: 'tren_superior', history, today: TODAY })
  assert.equal(ids(session)[0], 'flexiones-negativas', 'la señal caducó: como si nunca se hubiera usado')
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

test('la familia es lo único que separa: sin familias, la misma sesión juntaba dos zancadas', () => {
  const withFamilies = ids(buildSession({ ...ROTATION, focus: 'tren_inferior' }))
  const withoutFamilies = ids(buildSession({ ...ROTATION, focus: 'tren_inferior', catalog: WITHOUT_FAMILIES }))

  assert.ok(withoutFamilies.includes('zancadas') && withoutFamilies.includes('zancada-atras'), withoutFamilies.join(', '))
  assert.ok(!(withFamilies.includes('zancadas') && withFamilies.includes('zancada-atras')), withFamilies.join(', '))
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

test('D-032: cada sesión de fuerza abre con calentamiento y cierra con vuelta a la calma', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...ROTATION, focus })
    const phases = session.exercises.map((item) => item.phase ?? 'entrenamiento')
    const first = phases.indexOf('entrenamiento')
    const last = phases.lastIndexOf('entrenamiento')

    assert.ok(first > 0, `${focus}: empieza calentando`)
    assert.ok(phases.slice(0, first).every((phase) => phase === 'calentamiento'))
    assert.ok(last < phases.length - 1, `${focus}: termina con la vuelta a la calma`)
    assert.ok(phases.slice(last + 1).every((phase) => phase === 'vuelta_calma'))
    assert.ok(phases.slice(first, last + 1).every((phase) => phase === 'entrenamiento'), 'en medio, solo el entrenamiento')
  }
})

test('D-032: las fases son movilidad, una serie, sin carga ni descanso', () => {
  const session = buildSession({ ...ROTATION, focus: 'tren_inferior' })
  for (const item of session.exercises.filter((entry) => !isMainExercise(entry))) {
    assert.equal(exercise(item.exerciseId).category, 'movilidad', item.exerciseId)
    assert.equal(item.sets, 1)
    assert.equal(item.suggestedWeightKg, null)
    assert.equal(item.restSeconds, 0)
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
