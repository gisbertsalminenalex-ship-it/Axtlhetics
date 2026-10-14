/**
 * Figuras animadas de los ejercicios (D-024): todo el catálogo tiene figura,
 * ninguna pose se sale del lienzo ni produce `NaN`, y los músculos marcados salen
 * del catálogo.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXERCISE_CATALOG, findExercise } from '../domain/workouts/catalog'
import { figureShapes, type Shape } from './draw'
import { musclesOf } from './muscles'
import { FIGURES, figureFor } from './poses'
import { CANVAS, cycleProgress, poseAt, solveJoint, solveSkeleton } from './skeleton'
import { shapesToSvg } from './svg'

const COLORS = { body: 'B', muscle: 'M', prop: 'P', floor: 'F', ink: 'I' }

function shapesAt(id: string, p: number): Shape[] {
  const spec = FIGURES[id]
  const exercise = findExercise(id)!
  return figureShapes(spec, solveSkeleton(poseAt(spec, p), spec.faces ?? 1, spec.view ?? 'side'), musclesOf(exercise))
}

function pointsOf(shape: Shape): number[][] {
  switch (shape.kind) {
    case 'line':
      return [[...shape.a], [...shape.b]]
    case 'curve':
      return [[...shape.a], [...shape.b]]
    case 'circle':
      return [[shape.c[0] - shape.r, shape.c[1] - shape.r], [shape.c[0] + shape.r, shape.c[1] + shape.r]]
    case 'rect':
      return [[shape.x, shape.y], [shape.x + shape.w, shape.y + shape.h]]
  }
}

test('todos los ejercicios del catálogo tienen figura, y no hay figuras de ejercicios que no existen', () => {
  for (const exercise of EXERCISE_CATALOG) assert.ok(figureFor(exercise.id), `falta la figura de ${exercise.id}`)
  for (const id of Object.keys(FIGURES)) assert.ok(findExercise(id), `figura de un ejercicio que no está en el catálogo: ${id}`)
})

test('ninguna pose se sale del lienzo ni produce valores imposibles, en todo el movimiento', () => {
  // Medio grosor del trazo más ancho: lo que puede sobresalir de un punto.
  const margin = 13
  for (const id of Object.keys(FIGURES)) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      for (const shape of shapesAt(id, p)) {
        for (const [x, y] of pointsOf(shape)) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${id} en ${p}: punto no finito`)
          assert.ok(x >= CANVAS.x - margin && x <= CANVAS.x + CANVAS.width + margin, `${id} en ${p}: x = ${x}`)
          assert.ok(y >= CANVAS.y - margin && y <= CANVAS.y + CANVAS.height + margin, `${id} en ${p}: y = ${y}`)
        }
      }
    }
  }
})

test('cada músculo principal del catálogo se ve en azul en su figura', () => {
  for (const exercise of EXERCISE_CATALOG) {
    const strong = shapesAt(exercise.id, 0).filter((s) => s.tone === 'muscle')
    assert.ok(strong.length > 0, `${exercise.id} no marca ningún músculo principal`)
  }
})

test('los músculos salen del catálogo: principales en azul, secundarios en azul suave, y lo principal gana', () => {
  assert.deepEqual(musclesOf({ id: 'x', family: undefined, primaryMuscles: ['pecho'], secondaryMuscles: ['hombros', 'brazos'] }), {
    chest: 1,
    shoulder: 2,
    upperArm: 2,
  })
  assert.deepEqual(musclesOf({ id: 'x', family: undefined, primaryMuscles: ['brazos'], secondaryMuscles: ['brazos'] }), { upperArm: 1 })
  // Los gemelos y el tobillo se marcan en la pantorrilla, no en el muslo.
  assert.deepEqual(musclesOf(findExercise('elevacion-gemelos')!), { shin: 1 })
  assert.deepEqual(musclesOf(findExercise('tobillo-pared')!), { shin: 1 })
})

test('la articulación de en medio queda a la distancia de los dos huesos', () => {
  const joint = solveJoint([0, 0], [30, 40], 28, 26, 1)
  assert.ok(Math.abs(Math.hypot(joint[0], joint[1]) - 28) < 1e-6)
  assert.ok(Math.abs(Math.hypot(30 - joint[0], 40 - joint[1]) - 26) < 1e-6)
  // El otro lado da la articulación simétrica.
  const other = solveJoint([0, 0], [30, 40], 28, 26, -1)
  assert.notDeepEqual(joint, other)
})

test('una repetición: quieto al empezar, llega al final a mitad de ciclo y vuelve', () => {
  assert.equal(cycleProgress(0), 0)
  assert.equal(cycleProgress(0.55 * 2800), 1)
  assert.equal(cycleProgress(2800), 0)
  const quarter = cycleProgress(0.31 * 2800)
  assert.ok(quarter > 0 && quarter < 1)
})

test('una figura de mantener una posición no cambia en todo el ciclo', () => {
  const still = Object.entries(FIGURES).filter(([, spec]) => spec.frames.length === 1)
  assert.ok(still.length > 0)
  for (const [id] of still) assert.deepEqual(shapesAt(id, 0), shapesAt(id, 1), id)
})

test('el SVG agrupa el lado lejano con transparencia y no lleva valores imposibles', () => {
  const svg = shapesToSvg(shapesAt('flexiones', 0.5), COLORS)
  assert.match(svg, /^<line/)
  assert.match(svg, /<g opacity="0.5">/)
  assert.doesNotMatch(svg, /NaN|undefined/)
})
