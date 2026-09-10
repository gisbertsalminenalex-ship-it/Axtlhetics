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
  variantOf,
} from './catalog'
import type { ExerciseCategory } from './types'
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

test('todo ejercicio que usa carga es unilateral: solo hay una pesa', () => {
  for (const exercise of EXERCISE_CATALOG) {
    if (!usesLoad(exercise)) continue
    // La sentadilla con pesa se sujeta con las dos manos, así que es la excepción
    // razonable: el peso no se reparte entre dos mancuernas.
    if (exercise.id === 'sentadilla-con-pesa') continue
    assert.ok(exercise.unilateral, `${exercise.name} necesitaría dos pesas`)
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

test('el catálogo cubre los cuatro patrones de movimiento', () => {
  const categories = new Set<ExerciseCategory>(EXERCISE_CATALOG.map((item) => item.category))
  assert.deepEqual(
    [...categories].sort(),
    ['core', 'empuje', 'piernas', 'tiron'],
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
