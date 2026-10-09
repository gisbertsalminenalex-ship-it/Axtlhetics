/**
 * Resumen del escáner (D-023): todas las fotos juntas, en la voz de AXIS y sin
 * inventar nada.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { completed } from '../assessment/test-fixtures'
import { AXIS_PERSONALITY } from '../axis/personality'
import { findExercise } from '../workouts/catalog'
import type { WorkoutSession } from '../workouts/types'
import type { Measurements } from './measure'
import { scoreOn, summarizeScan, type PoseShots } from './summary'

const m = (values: Record<string, number | null>): Measurements =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null ? { value: null, reason: 'not_visible' } : { value: v }]))

const three = (values: Record<string, number>) =>
  [0, 0.3, -0.3].map((d) => m(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v + d]))))

/** Tres fotos casi iguales de cada pose: un cuerpo equilibrado y con buen rango. */
function balanced(): PoseShots {
  return {
    front: three({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, armAsymmetryPct: 1, legAsymmetryPct: 1, legToTorso: 1.4, shoulderToWaist: 1.35 }),
    side: three({ headForwardPct: 2, headAngleDeg: 80 }),
    squat_side: three({ kneeAngleDeg: 85, trunkLeanDeg: 35 }),
    squat_front: three({ kneeAnkleRatio: 1, leftKneeInPct: 2, rightKneeInPct: 3 }),
    arms_up: three({ leftArmDeg: 175, rightArmDeg: 174, armsDiffDeg: 1 }),
  }
}

function session(dayKey: string, muscleGroups: WorkoutSession['muscleGroups']): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T18:45:00.000Z`,
    durationSeconds: 2700,
    focus: 'tren_superior',
    title: 'Fuerza',
    intensity: 'moderada',
    muscleGroups,
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: null,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

/** Todo el texto que ve el usuario. */
const allText = (s: ReturnType<typeof summarizeScan>) =>
  [s.overview, ...s.categories.map((c) => c.text), ...s.strengths, ...s.improvements, ...s.actions.map((a) => a.text), ...s.photoNotes].join('\n')

test('puntuar: 100 hasta «bueno», 0 desde «mejorable», en los dos sentidos', () => {
  assert.equal(scoreOn(1, { good: 2, poor: 8 }), 100)
  assert.equal(scoreOn(5, { good: 2, poor: 8 }), 50)
  assert.equal(scoreOn(9, { good: 2, poor: 8 }), 0)
  assert.equal(scoreOn(175, { good: 170, poor: 135 }), 100)
  assert.equal(scoreOn(135, { good: 170, poor: 135 }), 0)
})

test('un cuerpo equilibrado: base sólida, puntos fuertes y ninguna mejora inventada', () => {
  const s = summarizeScan({ shots: balanced() })
  assert.ok(s.index !== null && s.index >= 90, `índice ${s.index}`)
  assert.match(s.overview, /^Partes de una base sólida \(\d+\/100\)/)
  assert.ok(s.strengths.length >= 4)
  assert.deepEqual(s.improvements, [])
  assert.match(s.categories.find((c) => c.key === 'symmetry')!.text, /^Aquí estás bien/)
})

test('cada categoría medida es un párrafo: lo que está bien y lo que conviene trabajar, con el porqué', () => {
  const shots = balanced()
  shots.side = three({ headForwardPct: 22 })
  const s = summarizeScan({ shots })
  const posture = s.categories.find((c) => c.key === 'postureMobility')!
  assert.match(posture.text, /La cabeza queda adelantada respecto a los hombros: .*espalda alta/)
  assert.match(posture.text, /Bajas bien en la sentadilla/)
  assert.match(s.overview, /Lo que más te hará avanzar ahora: la cabeza queda adelantada/)
  assert.ok(s.actions.some((a) => /espalda alta/i.test(a.text)))
})

test('la rodilla que se va hacia dentro se detecta con la medida nueva, y su paso de acción', () => {
  const shots = balanced()
  shots.squat_front = three({ kneeAnkleRatio: 0.7, leftKneeInPct: 35, rightKneeInPct: 4 })
  const s = summarizeScan({ shots })
  assert.ok(s.improvements.some((t) => /rodilla izquierda se va hacia dentro/.test(t)))
  assert.ok(s.improvements.some((t) => /una rodilla se mueve distinto/.test(t)))
  assert.ok(s.actions.some((a) => /Control de rodilla/.test(a.text)))
})

test('una medida que cambia mucho entre fotos no entra y se avisa', () => {
  const shots = balanced()
  shots.side = [m({ headForwardPct: 2 }), m({ headForwardPct: 25 }), m({ headForwardPct: 10 })]
  const s = summarizeScan({ shots })
  assert.ok(!s.categories.find((c) => c.key === 'postureMobility')!.details.some((d) => d.startsWith('Cabeza')))
  assert.ok(s.photoNotes.some((n) => /De perfil: algunas medidas cambian mucho/.test(n)))
})

test('con una sola foto se avisa; sin fotos suficientes no hay índice y no se rellena nada', () => {
  assert.ok(summarizeScan({ shots: { front: [m({ shoulderTiltDeg: 1 })] } }).photoNotes.some((n) => /una sola foto/.test(n)))
  const empty = summarizeScan({ shots: {} })
  assert.equal(empty.index, null)
  assert.ok(empty.categories.every((c) => c.score === null))
  assert.match(empty.overview, /Me faltan fotos/)
})

test('la diferencia de longitud de huesos no puntúa: avisa de una foto girada', () => {
  const shots = balanced()
  shots.front = [m({ shoulderTiltDeg: 0.5, armAsymmetryPct: 12, legAsymmetryPct: 1 }), m({ shoulderTiltDeg: 0.6, armAsymmetryPct: 11, legAsymmetryPct: 1 })]
  const s = summarizeScan({ shots })
  assert.ok(s.photoNotes.some((n) => /parece girado/.test(n)))
  assert.ok(!s.improvements.some((t) => /longitud|largo/i.test(t)))
})

test('desarrollo muscular sin datos: lo dice y explica de dónde saldrá; no cuenta en el índice', () => {
  const dev = summarizeScan({ shots: balanced() }).categories.find((c) => c.key === 'muscleDevelopment')!
  assert.equal(dev.score, null)
  assert.equal(dev.inIndex, false)
  assert.match(dev.text, /La foto no muestra cuánto músculo tienes/)
  assert.match(dev.text, /test de evolución/)
})

test('desarrollo muscular con fuerza y entrenamiento reales: lo que sube, lo que no y lo que menos entrenas', () => {
  const later = completed('2026-09-01', { push: 14, core: 56, legs: 50, pull: [12, 14] })
  const sessions = ['2026-09-20', '2026-09-23', '2026-09-26', '2026-09-29', '2026-10-02', '2026-10-05'].map((d) => session(d, ['pecho', 'hombros', 'brazos']))
  const s = summarizeScan({ shots: balanced(), assessments: [completed('2026-08-01'), later], sessions, experience: 'intermedio', today: '2026-10-07' })
  const dev = s.categories.find((c) => c.key === 'muscleDevelopment')!
  assert.match(dev.text, /^Lo estimo con tu fuerza y tu entrenamiento, no con la foto: 6 sesiones en las últimas 8 semanas, nivel intermedio y tus 2 tests de evolución\./)
  assert.match(dev.text, /Tu fuerza sube en empuje y tirón/)
  assert.match(dev.text, /En core y piernas no hay progreso/)
  assert.match(dev.text, /poco espalda/)
  assert.ok(s.improvements.some((t) => /Espalda es lo que menos has entrenado/.test(t)))
  assert.ok(s.actions.some((a) => /core y piernas/.test(a.text)))
})

test('composición corporal: nunca se estima con la foto; solo el dato que da el usuario', () => {
  const without = summarizeScan({ shots: balanced() }).categories.find((c) => c.key === 'composition')!
  assert.match(without.text, /no lo estimo/)
  assert.equal(without.score, null)
  const withData = summarizeScan({ shots: balanced(), bodyFatPct: 14.5 }).categories.find((c) => c.key === 'composition')!
  assert.match(withData.text, /14,5 %/)
})

test('cómo te ves: dicho como tuyo, y los datos lo confirman o lo matizan', () => {
  const sessions = ['2026-09-20', '2026-09-23', '2026-09-26', '2026-09-29'].map((d) => session(d, ['pecho', 'hombros', 'brazos']))
  const s = summarizeScan({
    shots: balanced(),
    sessions,
    today: '2026-10-07',
    selfReport: { build: 'delgada', strongZones: ['brazos'], weakZones: ['espalda', 'pecho'], priority: 'musculo' },
  })
  const dev = s.categories.find((c) => c.key === 'muscleDevelopment')!
  assert.match(dev.text, /Te ves con más músculo en brazos\./)
  // La espalda es lo menos entrenado: el historial lo confirma.
  assert.match(dev.text, /Te ves con menos espalda y tu historial lo confirma/)
  // El pecho se entrena a menudo: el consejo es subir la carga.
  assert.match(dev.text, /Te ves con menos pecho aunque la entrenas a menudo/)
  assert.ok(s.improvements.includes('Quieres más músculo en espalda y pecho'))
  const priority = s.actions[0]
  assert.match(priority.text, /^Dar prioridad a espalda y pecho: .*pregúntale a AXIS/)
  for (const id of priority.exerciseIds) assert.ok(findExercise(id), id)
})

test('solo con respuestas y sin datos: se dice que todavía no está confirmado', () => {
  const dev = summarizeScan({ shots: balanced(), selfReport: { build: null, strongZones: [], weakZones: ['piernas'], priority: null } })
    .categories.find((c) => c.key === 'muscleDevelopment')!
  assert.match(dev.text, /^Te ves con menos piernas\./)
  assert.match(dev.text, /Todavía no tengo tus tests ni tus sesiones para confirmarlo/)
})

test('composición: tu complexión y tu prioridad, con un plan de entrenamiento, sin dietas y sin estimar con la foto', () => {
  const text = summarizeScan({ shots: balanced(), selfReport: { build: 'delgada', strongZones: [], weakZones: [], priority: 'musculo' } })
    .categories.find((c) => c.key === 'composition')!.text
  assert.match(text, /^Describes tu complexión como más bien delgada\./)
  assert.match(text, /Tu prioridad es ganar músculo\. Con una complexión delgada, lo que más te hará ganar músculo es progresar en carga/)
  assert.match(text, /la foto no lo puede medir: no lo estimo/)
  const define = summarizeScan({ shots: balanced(), selfReport: { build: 'media', strongZones: [], weakZones: [], priority: 'definir' } })
    .categories.find((c) => c.key === 'composition')!.text
  assert.match(define, /la alimentación queda fuera de lo que valora AXIS/)
  assert.doesNotMatch(text + define, /[!¡]|dieta|calor[ií]as|prote[ií]na|kilos|peso corporal|adelgaz/i)
})

test('en la voz de AXIS: sin exclamaciones, sin cumplido de apertura, sin diagnósticos y sin peso ni dietas', () => {
  const shots: PoseShots = {
    front: [m({ shoulderTiltDeg: 9, hipTiltDeg: 9 }), m({ shoulderTiltDeg: 9.5, hipTiltDeg: 8.8 })],
    side: [m({ headForwardPct: 25 }), m({ headForwardPct: 24 })],
    squat_side: [m({ kneeAngleDeg: 150, trunkLeanDeg: 70 }), m({ kneeAngleDeg: 148, trunkLeanDeg: 68 })],
    squat_front: [m({ leftKneeInPct: 40, rightKneeInPct: 2 }), m({ leftKneeInPct: 38, rightKneeInPct: 3 })],
    arms_up: [m({ leftArmDeg: 130, rightArmDeg: 160, armsDiffDeg: -30 }), m({ leftArmDeg: 131, rightArmDeg: 161, armsDiffDeg: -30 })],
  }
  for (const s of [summarizeScan({ shots }), summarizeScan({ shots: balanced() })]) {
    const text = allText(s)
    assert.doesNotMatch(text, /[!¡]/)
    assert.doesNotMatch(text, /valgo|escoliosis|lordosis|cifosis|diagn|patol|lesi[oó]n/i)
    assert.doesNotMatch(text, /peso corporal|kilos|adelgaz|dieta|calor[ií]as|prote[ií]na|grasa que|delgad/i)
    const opener = s.overview.toLowerCase()
    for (const forbidden of AXIS_PERSONALITY.forbiddenOpeners) assert.ok(!opener.startsWith(forbidden), forbidden)
    for (const action of s.actions) for (const id of action.exerciseIds) assert.ok(findExercise(id), `existe ${id}`)
  }
})
