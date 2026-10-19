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
import { MAX_REPS, MAX_SECONDS } from './active-workout'
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

test('el catálogo cubre los cinco patrones de movimiento, más la pliometría (D-033)', () => {
  const categories = new Set<ExerciseCategory>(EXERCISE_CATALOG.map((item) => item.category))
  assert.deepEqual(
    [...categories].sort(),
    ['core', 'empuje', 'movilidad', 'piernas', 'pliometria', 'tiron'],
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

test('el catálogo tiene 51 ejercicios: 23 de D-008, 16 de D-020, 4 de D-020.1, 1 de D-025, 5 de D-033 y 2 de D-045', () => {
  // Cada ampliación es una decisión: antes este test fijaba 39, luego 43, 44 y 49.
  assert.equal(EXERCISE_CATALOG.length, 51)
})

test('las flexiones con rodillas (D-025): iniciación sin material, sin tocar la cadena de las flexiones', () => {
  const knee = findExercise('flexiones-rodillas')
  assert.ok(knee)
  assert.equal(knee!.name, 'Flexiones con rodillas')
  assert.equal(knee!.category, 'empuje')
  assert.equal(knee!.family, 'flexion')
  assert.equal(knee!.difficulty, 1)
  assert.deepEqual(knee!.equipment, ['ninguno'])
  assert.equal(knee!.unilateral, false)
  assert.equal(knee!.regressionId, null)
  assert.equal(knee!.progressionId, 'flexiones-negativas')
  assert.ok(isAvailable(knee!))
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
    const max = exercise.work.isTimed ? MAX_SECONDS : MAX_REPS
    assert.ok(exercise.work.reps <= max, `${exercise.name}: ${exercise.work.reps} de base`)
    assert.ok(repCapFor(exercise) <= max, `${exercise.name}: techo ${repCapFor(exercise)} > ${max}`)
  }
})

test('la movilidad son exactamente los siete aprobados, de peso corporal', () => {
  // D-020 empezó con tres; D-020.1 añade isquiotibiales, tobillo y hombro; D-033, el equilibrio.
  // La activación del calentamiento (D-045) va aparte: no es movilidad que se entrene.
  const mobility = EXERCISE_CATALOG.filter((item) => item.category === 'movilidad' && !item.warmupOnly)
  assert.deepEqual(
    mobility.map((item) => item.id).sort(),
    [
      'angeles-pared', 'equilibrio-una-pierna', 'estiramiento-flexor-cadera', 'estiramiento-isquiotibiales',
      'gato-camello', 'rotacion-toracica', 'tobillo-pared',
    ],
  )
  for (const exercise of mobility) {
    // El equilibrio es prevención: estabiliza, no moviliza (D-033).
    assert.equal(exercise.stimulus, exercise.id === 'equilibrio-una-pierna' ? 'estabilidad' : 'movilidad')
    assert.deepEqual(exercise.equipment, ['ninguno'])
  }
})

test('cada ejercicio entra en algún foco de sesión, salvo la pliometría, que la añade el bloque de deporte (D-033)', () => {
  const reachable = new Set(Object.values(FOCUS_CATEGORIES).flat())
  for (const exercise of EXERCISE_CATALOG) {
    if (exercise.category === 'pliometria') continue
    assert.ok(reachable.has(exercise.category), `${exercise.name} no entra en ningún foco`)
  }
  assert.ok(!reachable.has('pliometria'), 'ningún foco elige saltos por sí solo')
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

// ---------------------------------------------------------------------------
// D-020.1: cuatro ejercicios y familias
// ---------------------------------------------------------------------------

test('los cuatro ejercicios de D-020.1 existen con su categoría, dificultad, material y relaciones', () => {
  const expected: [string, string, ExerciseCategory, string | null][] = [
    ['zancada-lateral', 'Zancada lateral', 'piernas', 'sentadilla'],
    ['estiramiento-isquiotibiales', 'Estiramiento de isquiotibiales', 'movilidad', null],
    ['tobillo-pared', 'Tobillo a la pared', 'movilidad', null],
    ['angeles-pared', 'Ángeles en la pared', 'movilidad', null],
  ]
  for (const [id, name, category, regressionId] of expected) {
    const exercise = findExercise(id)
    assert.ok(exercise, `${id} no existe`)
    assert.equal(exercise!.name, name)
    assert.equal(exercise!.category, category)
    assert.equal(exercise!.difficulty, 2)
    assert.deepEqual(exercise!.equipment, ['ninguno'])
    assert.equal(exercise!.regressionId, regressionId)
    assert.equal(exercise!.progressionId, null)
  }
  // Isquiotibiales: unos 30 s, como el resto de estiramientos.
  assert.equal(findExercise('estiramiento-isquiotibiales')!.work.isTimed, true)
  assert.equal(findExercise('estiramiento-isquiotibiales')!.work.reps, 30)
})

test('las relaciones de los 39 ejercicios anteriores no cambian', () => {
  // [dificultad, regresión, progresión] tal y como estaban en d719b81.
  const before: Record<string, [number, string | null, string | null]> = {
    'flexiones-inclinadas': [1, null, 'flexiones-negativas'],
    'flexiones-negativas': [2, 'flexiones-inclinadas', 'flexiones'],
    'flexiones': [3, 'flexiones-negativas', 'flexiones-diamante'],
    'flexiones-diamante': [4, 'flexiones', null],
    'press-hombro-unilateral': [2, null, null],
    'extension-triceps-unilateral': [2, null, null],
    'press-suelo-unilateral': [1, null, null],
    'flexiones-declinadas': [4, 'flexiones', null],
    'flexion-pica': [3, null, null],
    'patada-triceps-unilateral': [1, null, null],
    'superman': [1, null, 'remo-unilateral'],
    'remo-unilateral': [2, 'superman', 'remo-renegado'],
    'remo-renegado': [4, 'remo-unilateral', null],
    'curl-biceps-unilateral': [1, null, null],
    'ytw-boca-abajo': [1, null, null],
    'pullover-con-pesa': [2, null, null],
    'curl-martillo-unilateral': [1, null, null],
    'sentadilla': [1, null, 'sentadilla-con-pesa'],
    'sentadilla-con-pesa': [2, 'sentadilla', 'zancada-bulgara'],
    'zancadas': [2, 'sentadilla', 'zancada-bulgara'],
    'zancada-atras': [2, 'sentadilla', 'zancada-bulgara'],
    'zancada-bulgara': [4, 'zancadas', null],
    'peso-muerto-unilateral': [3, 'puente-gluteos', null],
    'puente-gluteos': [1, null, 'peso-muerto-unilateral'],
    'elevacion-gemelos': [1, null, 'elevacion-gemelos-una-pierna'],
    'elevacion-gemelos-una-pierna': [2, 'elevacion-gemelos', null],
    'sentadilla-isometrica-pared': [2, 'sentadilla', null],
    'subida-escalon': [2, 'sentadilla', 'zancada-bulgara'],
    'puente-talones-silla': [2, 'puente-gluteos', null],
    'hip-thrust-con-pesa': [2, 'puente-gluteos', null],
    'dead-bug': [1, null, 'plancha'],
    'bird-dog': [1, null, 'plancha-lateral'],
    'plancha': [2, 'dead-bug', 'hollow-hold'],
    'plancha-lateral': [2, 'bird-dog', 'hollow-hold'],
    'hollow-hold': [3, 'plancha', null],
    'plancha-toque-hombro': [3, 'plancha', null],
    'gato-camello': [2, null, null],
    'rotacion-toracica': [2, null, null],
    'estiramiento-flexor-cadera': [2, null, null],
  }
  for (const [id, [difficulty, regressionId, progressionId]] of Object.entries(before)) {
    const exercise = findExercise(id)
    assert.ok(exercise, `${id} ha desaparecido`)
    assert.deepEqual(
      [exercise!.difficulty, exercise!.regressionId, exercise!.progressionId],
      [difficulty, regressionId, progressionId],
      id,
    )
  }
})

test('las familias son pocas, semánticas y solo agrupan variantes del mismo patrón', () => {
  const families = new Map<string, string[]>()
  for (const exercise of EXERCISE_CATALOG) {
    if (!exercise.family) continue
    families.set(exercise.family, [...(families.get(exercise.family) ?? []), exercise.id])
  }
  assert.deepEqual(
    [...families.keys()].sort(),
    ['curl', 'flexion', 'gemelos', 'plancha', 'puente', 'remo', 'salto-vertical', 'sentadilla', 'triceps', 'zancada'],
  )
  for (const [family, ids] of families) {
    assert.ok(ids.length >= 2, `${family} con un solo ejercicio no separa nada`)
    const categories = new Set(ids.map((id) => findExercise(id)!.category))
    assert.equal(categories.size, 1, `${family} mezcla categorías`)
  }
})

test('lo que se diferencia de verdad no comparte familia', () => {
  // Otro plano, otro patrón, o movilidad: pueden ir juntos en una sesión.
  for (const id of [
    'zancada-lateral', 'flexion-pica', 'press-hombro-unilateral', 'press-suelo-unilateral',
    'plancha-lateral', 'subida-escalon', 'ytw-boca-abajo',
    'gato-camello', 'rotacion-toracica', 'estiramiento-flexor-cadera',
    'estiramiento-isquiotibiales', 'tobillo-pared', 'angeles-pared',
  ]) {
    assert.equal(findExercise(id)!.family, undefined, id)
  }
})
