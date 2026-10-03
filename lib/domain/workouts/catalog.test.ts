import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AVAILABLE_EQUIPMENT,
  availableExercises,
  EXERCISE_CATALOG,
  exercisesAvoidingGroups,
  exercisesForFocus,
  findExercise,
  isAvailable,
  MAX_AVAILABLE_LOAD_KG,
  SINGLE_WEIGHT_BILATERAL_IDS,
  variantOf,
} from './catalog'
import { MAX_REPS } from './active-workout'
import { repCapFor } from '../axis/session-builder'
import type { ExerciseCategory, MuscleGroup } from './types'
import { FOCUS_CATEGORIES, usesLoad } from './types'

// ---------------------------------------------------------------------------
// Equipamiento real
// ---------------------------------------------------------------------------

test('todo el catálogo es ejecutable con el equipamiento disponible', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(
      isAvailable(exercise),
      `${exercise.name} necesita ${exercise.equipment.join(', ')}`,
    )
  }
})

test('ningún ejercicio declara equipamiento vacío', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(exercise.equipment.length > 0, `${exercise.name} no declara equipamiento`)
  }
})

test('todo ejercicio que usa carga es unilateral, salvo la lista explícita de bilaterales', () => {
  for (const exercise of EXERCISE_CATALOG) {
    if (!usesLoad(exercise)) continue
    // La pesa sujeta entera con las dos manos: solo los de la lista (D-008, D-020).
    if (SINGLE_WEIGHT_BILATERAL_IDS.includes(exercise.id)) continue
    assert.ok(exercise.unilateral, `${exercise.name} necesitaría dos pesas`)
  }
})

test('la lista de bilaterales es cerrada: existen, usan la pesa y no son unilaterales', () => {
  assert.deepEqual(
    [...SINGLE_WEIGHT_BILATERAL_IDS].sort(),
    ['hip-thrust-con-pesa', 'pullover-con-pesa', 'sentadilla-con-pesa'],
    'añadir uno es una decisión, no un descuido',
  )
  for (const id of SINGLE_WEIGHT_BILATERAL_IDS) {
    const exercise = findExercise(id)
    assert.ok(exercise, `${id} no existe`)
    assert.ok(usesLoad(exercise!), `${id} no usa la pesa`)
    assert.equal(exercise!.unilateral, false, `${id} está en la lista pero es unilateral`)
  }
})

test('quitar la pesa deja fuera exactamente los ejercicios que la necesitan', () => {
  const withoutWeight = availableExercises(EXERCISE_CATALOG, ['ninguno', 'superficie_elevada'])
  assert.ok(withoutWeight.length > 0)
  for (const exercise of withoutWeight) {
    assert.ok(!usesLoad(exercise), `${exercise.name} no debería aparecer sin pesa`)
  }
  assert.ok(withoutWeight.length < EXERCISE_CATALOG.length)
})

test('sin ningún equipamiento solo quedan ejercicios de peso corporal puro', () => {
  const bodyweightOnly = availableExercises(EXERCISE_CATALOG, ['ninguno'])
  assert.ok(bodyweightOnly.length >= 8, 'debe quedar sesión posible solo con el cuerpo')
  for (const exercise of bodyweightOnly) {
    assert.deepEqual(exercise.equipment, ['ninguno'])
  }
})

test('la pesa disponible es de 5 kg y el catálogo no supone más', () => {
  assert.equal(MAX_AVAILABLE_LOAD_KG, 5)
  assert.ok(AVAILABLE_EQUIPMENT.includes('pesa'))
})

// ---------------------------------------------------------------------------
// Cobertura del catálogo
// ---------------------------------------------------------------------------

test('el catálogo cubre los cinco patrones de movimiento', () => {
  const categories = new Set<ExerciseCategory>(EXERCISE_CATALOG.map((item) => item.category))
  assert.deepEqual(
    [...categories].sort(),
    ['core', 'empuje', 'movilidad', 'piernas', 'tiron'],
  )
})

test('cada foco de sesión tiene ejercicios suficientes', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo', 'core_movilidad'] as const) {
    const candidates = exercisesForFocus(focus).filter((exercise) => isAvailable(exercise))
    assert.ok(candidates.length >= 3, `${focus} solo tiene ${candidates.length} ejercicios`)
    for (const exercise of candidates) {
      assert.ok(FOCUS_CATEGORIES[focus].includes(exercise.category))
    }
  }
})

test('los identificadores del catálogo son únicos', () => {
  const ids = EXERCISE_CATALOG.map((exercise) => exercise.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('cada ejercicio tiene instrucciones y parámetros de trabajo', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(exercise.instructions.length > 10, `${exercise.name} sin instrucciones`)
    assert.ok(exercise.work.sets > 0, `${exercise.name} sin series`)
    assert.ok(exercise.work.reps > 0, `${exercise.name} sin repeticiones`)
    assert.ok(exercise.primaryMuscles.length > 0, `${exercise.name} sin grupo principal`)
  }
})

// ---------------------------------------------------------------------------
// Progresiones y regresiones
// ---------------------------------------------------------------------------

test('toda progresión y regresión apunta a un ejercicio que existe', () => {
  for (const exercise of EXERCISE_CATALOG) {
    for (const id of [exercise.progressionId, exercise.regressionId]) {
      if (id === null) continue
      assert.ok(findExercise(id), `${exercise.name} apunta a ${id}, que no existe`)
    }
  }
})

test('una progresión nunca es más fácil que su origen', () => {
  for (const exercise of EXERCISE_CATALOG) {
    if (!exercise.progressionId) continue
    const harder = findExercise(exercise.progressionId)
    assert.ok(harder)
    assert.ok(
      harder!.difficulty > exercise.difficulty,
      `${harder!.name} no es más difícil que ${exercise.name}`,
    )
  }
})

test('una regresión nunca es más difícil que su origen', () => {
  for (const exercise of EXERCISE_CATALOG) {
    if (!exercise.regressionId) continue
    const easier = findExercise(exercise.regressionId)
    assert.ok(easier)
    assert.ok(
      easier!.difficulty < exercise.difficulty,
      `${easier!.name} no es más fácil que ${exercise.name}`,
    )
  }
})

test('las variantes se quedan dentro del mismo patrón de movimiento', () => {
  for (const exercise of EXERCISE_CATALOG) {
    for (const id of [exercise.progressionId, exercise.regressionId]) {
      if (id === null) continue
      const variant = findExercise(id)
      assert.equal(
        variant!.category,
        exercise.category,
        `${exercise.name} cambia de patrón al progresar`,
      )
    }
  }
})

test('pedir una variante más ligera devuelve algo ejecutable', () => {
  const pushup = findExercise('flexiones')
  assert.ok(pushup)
  const easier = variantOf(pushup!, 'easier')
  assert.equal(easier.id, 'flexiones-negativas')
  assert.ok(easier.difficulty < pushup!.difficulty)
  assert.ok(isAvailable(easier))
})

test('pedir una variante más exigente devuelve algo ejecutable', () => {
  const pushup = findExercise('flexiones')
  assert.ok(pushup)
  const harder = variantOf(pushup!, 'harder')
  assert.equal(harder.id, 'flexiones-diamante')
  assert.ok(harder.difficulty > pushup!.difficulty)
})

test('sin variante disponible se devuelve el mismo ejercicio', () => {
  const curl = findExercise('curl-biceps-unilateral')
  assert.ok(curl)
  assert.equal(variantOf(curl!, 'harder').id, curl!.id)
  assert.equal(variantOf(curl!, 'easier').id, curl!.id)
})

test('una variante que necesita material inexistente no se propone', () => {
  const lunges = findExercise('zancadas')
  assert.ok(lunges)
  // La búlgara necesita una superficie elevada: sin ella, se mantiene la zancada.
  const harder = variantOf(lunges!, 'harder', EXERCISE_CATALOG, ['ninguno'])
  assert.equal(harder.id, lunges!.id)
})

// ---------------------------------------------------------------------------
// Filtrado por grupos
// ---------------------------------------------------------------------------

test('evitar un grupo excluye también los ejercicios que lo cargan de forma secundaria', () => {
  const upper = exercisesForFocus('tren_superior')
  const withoutLegs = exercisesAvoidingGroups(upper, ['piernas', 'gluteos'])
  for (const exercise of withoutLegs) {
    assert.ok(!exercise.primaryMuscles.includes('gluteos'))
    assert.ok(!exercise.secondaryMuscles.includes('gluteos'))
  }
  // El superman activa glúteos, así que debe quedar fuera.
  assert.ok(!withoutLegs.some((exercise) => exercise.id === 'superman'))
})

test('sin grupos que evitar no se filtra nada', () => {
  const upper = exercisesForFocus('tren_superior')
  assert.equal(exercisesAvoidingGroups(upper, []).length, upper.length)
})

// ---------------------------------------------------------------------------
// Validaciones del catálogo ampliado (D-020)
// ---------------------------------------------------------------------------

test('el catálogo tiene 39 ejercicios: los 23 de D-008 y los 16 de D-020', () => {
  assert.equal(EXERCISE_CATALOG.length, 39)
})

test('los ejercicios de D-008 conservan su id: el historial y la progresión dependen de ellos', () => {
  for (const id of [
    'flexiones-inclinadas', 'flexiones-negativas', 'flexiones', 'flexiones-diamante',
    'press-hombro-unilateral', 'extension-triceps-unilateral', 'superman', 'remo-unilateral',
    'remo-renegado', 'curl-biceps-unilateral', 'sentadilla', 'sentadilla-con-pesa', 'zancadas',
    'zancada-atras', 'zancada-bulgara', 'peso-muerto-unilateral', 'puente-gluteos',
    'elevacion-gemelos', 'dead-bug', 'bird-dog', 'plancha', 'plancha-lateral', 'hollow-hold',
  ]) {
    assert.ok(findExercise(id), `${id} ha desaparecido o cambiado de id`)
  }
})

test('los nombres son únicos: es como AXIS reconoce un ejercicio y un salto', () => {
  const names = EXERCISE_CATALOG.map((item) => item.name.toLowerCase())
  assert.equal(new Set(names).size, names.length)
})

test('ningún ejercicio sin músculo principal ni sin descanso', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(exercise.primaryMuscles.length > 0, `${exercise.name} sin músculo principal`)
    assert.ok(exercise.work.restSeconds > 0, `${exercise.name} sin descanso`)
  }
})

test('ningún objetivo ni techo de progresión pasa del límite del selector de reps o segundos', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(exercise.work.reps <= MAX_REPS, `${exercise.name}: ${exercise.work.reps} de base`)
    assert.ok(repCapFor(exercise) <= MAX_REPS, `${exercise.name}: techo ${repCapFor(exercise)} > ${MAX_REPS}`)
  }
})

test('hay exactamente tres ejercicios de movilidad, de peso corporal', () => {
  const mobility = EXERCISE_CATALOG.filter((item) => item.category === 'movilidad')
  assert.deepEqual(
    mobility.map((item) => item.id).sort(),
    ['estiramiento-flexor-cadera', 'gato-camello', 'rotacion-toracica'],
  )
  for (const exercise of mobility) {
    assert.equal(exercise.stimulus, 'movilidad')
    assert.deepEqual(exercise.equipment, ['ninguno'])
  }
})

test('cada ejercicio entra en algún foco de sesión', () => {
  const reachable = new Set(Object.values(FOCUS_CATEGORIES).flat())
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(reachable.has(exercise.category), `${exercise.name} no entra en ningún foco`)
  }
})

test('cada grupo muscular tiene variedad, también sin la pesa', () => {
  const minimum: Record<MuscleGroup, number> = {
    pecho: 3, espalda: 3, hombros: 2, brazos: 3, piernas: 6, gluteos: 3, core: 4,
  }
  const withoutWeight = availableExercises(EXERCISE_CATALOG, ['ninguno', 'superficie_elevada'])
  for (const [group, count] of Object.entries(minimum) as [MuscleGroup, number][]) {
    const all = EXERCISE_CATALOG.filter((item) => item.primaryMuscles.includes(group))
    assert.ok(all.length >= count, `${group}: ${all.length} ejercicios`)
    const noWeight = withoutWeight.filter((item) => item.primaryMuscles.includes(group))
    assert.ok(noWeight.length >= 1, `${group}: ninguno sin la pesa`)
  }
})
