/**
 * Resumen del escáner (D-023): todas las fotos juntas, sin inventar nada.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { completed } from '../assessment/test-fixtures'
import { findExercise } from '../workouts/catalog'
import type { Measurements } from './measure'
import { scoreOn, summarizeScan, type PoseShots } from './summary'

const m = (values: Record<string, number | null>): Measurements =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null ? { value: null, reason: 'not_visible' } : { value: v }]))

/** Tres fotos casi iguales de cada pose: un cuerpo equilibrado y con buen rango. */
function balanced(): PoseShots {
  const three = (values: Record<string, number>) => [0, 0.3, -0.3].map((d) => m(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v + d]))))
  return {
    front: three({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, armAsymmetryPct: 1, legAsymmetryPct: 1, legToTorso: 1.4, shoulderToWaist: 1.35 }),
    side: three({ headForwardPct: 2, headAngleDeg: 80 }),
    squat_side: three({ kneeAngleDeg: 85, trunkLeanDeg: 35 }),
    squat_front: three({ leftKneeDeg: 1, rightKneeDeg: 1.5 }),
    arms_up: three({ leftArmDeg: 175, rightArmDeg: 174, armsDiffDeg: 1 }),
  }
}

test('puntuar: 100 hasta «bueno», 0 desde «mejorable», en los dos sentidos', () => {
  assert.equal(scoreOn(1, { good: 2, poor: 8 }), 100)
  assert.equal(scoreOn(5, { good: 2, poor: 8 }), 50)
  assert.equal(scoreOn(9, { good: 2, poor: 8 }), 0)
  // Más es mejor (brazos arriba).
  assert.equal(scoreOn(175, { good: 170, poor: 135 }), 100)
  assert.equal(scoreOn(135, { good: 170, poor: 135 }), 0)
})

test('un cuerpo equilibrado da un índice alto, puntos fuertes y ninguna mejora inventada', () => {
  const s = summarizeScan({ shots: balanced() })
  assert.ok(s.index !== null && s.index >= 90, `índice ${s.index}`)
  assert.ok(s.strengths.length >= 4)
  assert.deepEqual(s.improvements, [])
  assert.deepEqual(s.actions, [])
  assert.match(s.overview, /^Índice de equilibrio \d+\/100\. Sin desequilibrios destacables/)
})

test('lo que se mide mal en una zona sale como mejora con su paso de acción', () => {
  const shots = balanced()
  shots.squat_front = [m({ leftKneeDeg: 14, rightKneeDeg: 2 }), m({ leftKneeDeg: 15, rightKneeDeg: 1 }), m({ leftKneeDeg: 13, rightKneeDeg: 2 })]
  const s = summarizeScan({ shots })
  assert.ok(s.improvements.some((t) => /rodilla izquierda se va hacia dentro/.test(t)))
  assert.ok(s.actions.some((a) => /Control de rodilla/.test(a.text)))
  assert.match(s.overview, /Lo que más margen tiene/)
})

test('una medida que cambia mucho entre fotos no entra y se avisa', () => {
  const shots = balanced()
  shots.side = [m({ headForwardPct: 2 }), m({ headForwardPct: 25 }), m({ headForwardPct: 10 })]
  const s = summarizeScan({ shots })
  const posture = s.categories.find((c) => c.key === 'postureMobility')!
  assert.ok(!posture.details.some((d) => d.startsWith('Cabeza')), 'la cabeza no se usa')
  assert.ok(s.photoNotes.some((n) => /De perfil: algunas medidas cambian mucho/.test(n)))
})

test('con una sola foto se avisa de que no se puede comprobar la estabilidad', () => {
  const s = summarizeScan({ shots: { front: [m({ shoulderTiltDeg: 1 })] } })
  assert.ok(s.photoNotes.some((n) => /una sola foto/.test(n)))
})

test('sin fotos suficientes no hay índice y no se rellena nada', () => {
  const s = summarizeScan({ shots: {} })
  assert.equal(s.index, null)
  assert.ok(s.categories.every((c) => c.score === null))
  assert.match(s.overview, /Faltan fotos/)
})

test('la asimetría de longitud de huesos no puntúa: avisa de una foto girada', () => {
  const shots = balanced()
  shots.front = [m({ shoulderTiltDeg: 0.5, armAsymmetryPct: 12, legAsymmetryPct: 1 }), m({ shoulderTiltDeg: 0.6, armAsymmetryPct: 11, legAsymmetryPct: 1 })]
  const s = summarizeScan({ shots })
  assert.ok(s.photoNotes.some((n) => /parece girado/.test(n)))
  assert.ok(!s.improvements.some((t) => /brazo.*largo|longitud/i.test(t)))
})

test('desarrollo muscular: sale de los tests, no de la foto, y no cuenta para el índice', () => {
  const none = summarizeScan({ shots: balanced() }).categories.find((c) => c.key === 'muscleDevelopment')!
  assert.equal(none.score, null)
  assert.equal(none.inIndex, false)
  assert.match(none.summary, /Haz el test de evolución/)

  const first = summarizeScan({ shots: balanced(), assessments: [completed('2026-08-01')] }).categories.find((c) => c.key === 'muscleDevelopment')!
  assert.match(first.summary, /primer test es la referencia/)

  // Segundo test: empuje y tirón suben, core igual, piernas bajan.
  const later = completed('2026-09-01', { push: 14, core: 56, legs: 50, pull: [12, 14] })
  const s = summarizeScan({ shots: balanced(), assessments: [completed('2026-08-01'), later] })
  assert.ok(s.strengths.some((t) => /sube en empuje y tirón/.test(t)))
  assert.ok(s.improvements.some((t) => /no sube en core y piernas/.test(t)))
})

test('composición corporal: no se mide; solo aparece el dato que da el usuario', () => {
  const without = summarizeScan({ shots: balanced() }).categories.find((c) => c.key === 'composition')!
  assert.match(without.summary, /No se mide con fotos/)
  const withData = summarizeScan({ shots: balanced(), bodyFatPct: 14.5 }).categories.find((c) => c.key === 'composition')!
  assert.match(withData.summary, /14,5 %/)
  assert.equal(withData.score, null)
})

test('los ejercicios recomendados existen en el catálogo y los textos no diagnostican', () => {
  const shots = balanced()
  shots.front = [m({ shoulderTiltDeg: 9, hipTiltDeg: 9 }), m({ shoulderTiltDeg: 9.5, hipTiltDeg: 8.8 })]
  shots.side = [m({ headForwardPct: 25 }), m({ headForwardPct: 24 })]
  shots.squat_side = [m({ kneeAngleDeg: 150, trunkLeanDeg: 70 }), m({ kneeAngleDeg: 148, trunkLeanDeg: 68 })]
  shots.squat_front = [m({ leftKneeDeg: 20, rightKneeDeg: 2 }), m({ leftKneeDeg: 19, rightKneeDeg: 3 })]
  shots.arms_up = [m({ leftArmDeg: 130, rightArmDeg: 160, armsDiffDeg: -30 }), m({ leftArmDeg: 131, rightArmDeg: 161, armsDiffDeg: -30 })]
  const s = summarizeScan({ shots })
  assert.ok(s.actions.length > 0 && s.actions.length <= 4)
  for (const action of s.actions) for (const id of action.exerciseIds) assert.ok(findExercise(id), `existe ${id}`)
  const text = JSON.stringify(s)
  assert.doesNotMatch(text, /valgo|escoliosis|lordosis|cifosis|diagn|patol|lesi[oó]n|!/i)
})
