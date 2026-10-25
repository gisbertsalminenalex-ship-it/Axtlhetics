/**
 * Patrones de movimiento y sesiones montadas como las montaría un entrenador (D-073).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSession, LIGHT_BODYWEIGHT_REPS, SLOW_TEMPO, workGoalFor } from '../axis/session-builder'
import { EXERCISE_CATALOG, findExercise } from './catalog'
import type { UserEquipment } from './equipment'
import { EXERCISE_PATTERNS, isIsolation, PATTERN_FALLBACKS, patternOf } from './patterns'
import type { Exercise, PlannedSession } from './types'
import { isMainExercise } from './types'

const STRENGTH_CATEGORIES = ['empuje', 'tiron', 'piernas', 'core']

/** Barra, gomas y dos pares de mancuernas: el material de alguien que entrena en casa en serio. */
const HOME_GYM: UserEquipment = {
  items: ['barra_dominadas', 'gomas'],
  weights: [
    { kind: 'mancuerna', kg: 5, pair: true },
    { kind: 'mancuerna', kg: 10, pair: true },
  ],
}
const HEAVY: UserEquipment = { items: [], weights: [{ kind: 'mancuerna', kg: 20, pair: true }] }

function exercise(id: string): Exercise {
  const found = findExercise(id)
  assert.ok(found, id)
  return found!
}

function main(session: PlannedSession) {
  return session.exercises.filter(isMainExercise)
}

function patterns(session: PlannedSession) {
  return main(session).map((item) => patternOf(exercise(item.exerciseId)))
}

const BASE = { intensity: 'moderada' as const, experience: 'intermedio' as const, gear: HOME_GYM }

test('todo ejercicio de fuerza o core tiene patrón; los saltos, la movilidad y los intervalos no', () => {
  for (const item of EXERCISE_CATALOG) {
    if (STRENGTH_CATEGORIES.includes(item.category)) assert.ok(patternOf(item), `${item.id} sin patrón`)
    else assert.equal(patternOf(item), null, item.id)
  }
  for (const id of [...Object.keys(EXERCISE_PATTERNS), ...PATTERN_FALLBACKS]) assert.ok(findExercise(id), `${id} no está en el catálogo`)
})

test('tren superior: empuje y tirón horizontales y verticales antes que los brazos, y con barra una dominada de verdad', () => {
  const session = buildSession({ ...BASE, focus: 'tren_superior', availableMinutes: 60, goals: ['hipertrofia'] })
  const found = patterns(session)
  for (const pattern of ['empuje_horizontal', 'empuje_vertical', 'tiron_horizontal', 'tiron_vertical'] as const) {
    assert.ok(found.includes(pattern), `${pattern}: ${found.join(', ')}`)
  }
  const firstAccessory = found.findIndex((pattern) => ['biceps', 'triceps', 'hombro'].includes(pattern!))
  assert.ok(firstAccessory === -1 || firstAccessory >= 4, found.join(', '))
  const vertical = main(session).find((item) => patternOf(exercise(item.exerciseId)) === 'tiron_vertical')!
  assert.notEqual(vertical.exerciseId, 'pullover-con-pesa', 'el pullover solo sustituye a la dominada si no hay barra ni gomas')
})

test('tren inferior: sentadilla, bisagra de cadera y zancada; con mancuernas, la bisagra no es un sustituto', () => {
  const session = buildSession({ ...BASE, focus: 'tren_inferior', availableMinutes: 45, goals: ['hipertrofia'] })
  const found = patterns(session)
  assert.deepEqual(found.slice(0, 3), ['sentadilla', 'bisagra', 'zancada'])
  const hinge = main(session)[1]
  assert.ok(!PATTERN_FALLBACKS.includes(hinge.exerciseId), hinge.name)
})

test('nunca dos variantes de la misma familia ni tres del mismo patrón, aunque falte material', () => {
  const none: UserEquipment = { items: [], weights: [] }
  for (const gear of [none, HOME_GYM]) {
    for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
      for (const experience of ['principiante', 'intermedio', 'avanzado'] as const) {
        const session = buildSession({ ...BASE, gear, experience, focus, availableMinutes: 60, goals: ['hipertrofia'] })
        const items = main(session).map((item) => exercise(item.exerciseId))
        const families = items.map((item) => item.family).filter(Boolean)
        assert.equal(new Set(families).size, families.length, `${focus}/${experience}: ${items.map((item) => item.id).join(', ')}`)
        const found = patterns(session)
        for (const pattern of new Set(found)) {
          assert.ok(found.filter((other) => other === pattern).length <= 2, `${focus}/${experience}: ${found.join(', ')}`)
        }
      }
    }
  }
})

test('a un intermedio no le abre con flexiones negativas: eso es de principiante', () => {
  const intermediate = buildSession({ ...BASE, focus: 'tren_superior', availableMinutes: 45, goals: ['hipertrofia'] })
  assert.equal(main(intermediate)[0].exerciseId, 'flexiones')
  const beginner = buildSession({ ...BASE, experience: 'principiante', focus: 'tren_superior', availableMinutes: 45, goals: ['hipertrofia'] })
  assert.notEqual(main(beginner)[0].exerciseId, 'flexiones')
})

test('fuerza: los accesorios y el core no bajan a repeticiones de fuerza ni descansan 2 minutos', () => {
  const session = buildSession({ ...BASE, experience: 'avanzado', focus: 'tren_superior', availableMinutes: 75, goals: ['fuerza'] })
  const accessories = main(session).filter((item) => isIsolation(exercise(item.exerciseId)))
  assert.ok(accessories.length > 0)
  for (const item of accessories) {
    assert.ok(item.reps >= 8, `${item.name}: ${item.reps}`)
    assert.ok(item.restSeconds <= 90, `${item.name}: ${item.restSeconds}`)
  }
  const full = buildSession({ ...BASE, focus: 'cuerpo_completo', availableMinutes: 75, goals: ['fuerza'] })
  for (const item of main(full).filter((planned) => patternOf(exercise(planned.exerciseId)) === 'core')) {
    assert.ok(item.restSeconds < 120, `${item.name}: ${item.restSeconds}`)
  }
})

test('fuerza con una pesa que se queda corta: repeticiones normales y bajada lenta, no 6 repeticiones con 5 kg', () => {
  const squat = exercise('sentadilla-con-pesa')
  assert.equal(workGoalFor(squat, 'fuerza', HOME_GYM), 'hipertrofia', '10 kg no dan para fuerza en sentadilla')
  assert.equal(workGoalFor(squat, 'fuerza', HEAVY), 'fuerza', 'con 20 kg, sí')

  const session = buildSession({ ...BASE, focus: 'tren_inferior', availableMinutes: 50, goals: ['fuerza'] })
  const planned = main(session).find((item) => item.exerciseId === 'sentadilla-con-pesa')!
  assert.ok(planned.reps >= 10, `${planned.reps}`)
  assert.equal(planned.tempo, SLOW_TEMPO)

  const heavy = buildSession({ ...BASE, gear: HEAVY, focus: 'tren_inferior', availableMinutes: 50, goals: ['fuerza'] })
  const loaded = main(heavy).find((item) => item.exerciseId === 'sentadilla-con-pesa')!
  assert.ok(loaded.reps < 10, `${loaded.reps}`)
})

test('fuerza: un ejercicio de peso corporal fácil no se trabaja a repeticiones bajas; uno exigente, sí', () => {
  const bridge = exercise('puente-talones-silla')
  assert.ok(bridge.work.reps >= LIGHT_BODYWEIGHT_REPS)
  assert.equal(workGoalFor(bridge, 'fuerza'), 'hipertrofia')
  assert.equal(workGoalFor(exercise('dominadas'), 'fuerza'), 'fuerza')
  assert.equal(workGoalFor(exercise('sentadilla-salto'), 'rendimiento_deportivo'), 'rendimiento_deportivo', 'los saltos no cambian')
})

test('las series de aproximación solo calientan los compuestos', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const session = buildSession({ ...BASE, focus, availableMinutes: 60, goals: ['hipertrofia'] })
    for (const item of session.exercises.filter((planned) => planned.warmupPart === 'aproximacion')) {
      assert.ok(!isIsolation(exercise(item.exerciseId)), `${focus}: ${item.name}`)
    }
  }
})

test('con poco tiempo, antes dos series que quitar el tirón de un cuerpo completo', () => {
  const session = buildSession({ ...BASE, focus: 'cuerpo_completo', availableMinutes: 25, goals: ['hipertrofia'] })
  const found = patterns(session)
  assert.equal(found.length, 3, found.join(', '))
  assert.ok(found.some((pattern) => pattern === 'tiron_horizontal' || pattern === 'tiron_vertical'), found.join(', '))
  assert.ok(session.estimatedMinutes <= 25)
})
