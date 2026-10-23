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
  assert.match(s.overview, /^Partes de una base sólida: \d+\/100 en equilibrio corporal\./)
  assert.match(s.overview, /Lo mejor: /)
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
  assert.match(s.overview, /Lo que más te hará avanzar ahora es trabajar esto: la cabeza queda adelantada/)
  assert.ok(s.actions.some((a) => /espalda alta/i.test(a.text)))
})

test('la rodilla que se va hacia dentro se detecta con la medida nueva, y su paso de acción', () => {
  const shots = balanced()
  shots.squat_front = three({ kneeAnkleRatio: 0.7, leftKneeInPct: 35, rightKneeInPct: 4 })
  const s = summarizeScan({ shots })
  assert.ok(s.improvements.some((t) => /rodilla izquierda se va hacia dentro/.test(t)))
  // Las dos medidas de la rodilla dicen casi lo mismo: en la lista, solo la que nombra el lado.
  assert.equal(s.improvements.filter((t) => /rodilla/.test(t)).length, 1)
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

test('composición corporal: sin lo necesario para estimarla, se dice qué falta; el dato del usuario se recoge', () => {
  const without = summarizeScan({ shots: balanced() }).categories.find((c) => c.key === 'composition')!
  assert.match(without.text, /necesito saber qué fórmula usar/)
  assert.equal(without.score, null)
  const withData = summarizeScan({ shots: balanced(), bodyFatPct: 14.5 }).categories.find((c) => c.key === 'composition')!
  assert.match(withData.text, /14,5 %/)
})

/** Tres fotos idénticas: medidas estables sin el pequeño ruido de `three`. */
const steady = (values: Record<string, number>) => [1, 2, 3].map(() => m(values))

test('D-068: las zonas salen de la foto, y el historial lo confirma o lo matiza', () => {
  const sessions = ['2026-09-20', '2026-09-23', '2026-09-26', '2026-09-29'].map((d) => session(d, ['pecho', 'hombros', 'brazos']))
  const s = summarizeScan({
    // «V» corta: hombros y espalda por detrás. Brazo tan ancho como el muslo: destacan los brazos, las piernas por detrás.
    shots: { ...balanced(), front: steady({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, shoulderToWaist: 1.2, upperArmMean: 0.45, thighMean: 0.45 }) },
    sessions,
    today: '2026-10-07',
    selfReport: { priority: 'musculo' },
  })
  assert.deepEqual(s.diagnosis.strongZones, ['brazos'])
  assert.deepEqual(s.diagnosis.weakZones, ['hombros', 'espalda', 'piernas'])
  const dev = s.categories.find((c) => c.key === 'muscleDevelopment')!
  assert.match(dev.text, /En tus fotos destacan brazos frente a un físico equilibrado\./)
  // La espalda es lo menos entrenado: el historial lo confirma.
  assert.match(dev.text, /En tus fotos, tu espalda va por detrás y tu historial lo confirma/)
  // Los hombros se entrenan a menudo: el consejo es subir la carga.
  assert.match(dev.text, /En tus fotos, tus hombros van por detrás aunque los entrenas a menudo/)
  assert.match(dev.text, /En tus fotos, tus piernas van por detrás del resto\./)
  assert.ok(s.improvements.includes('Más desarrollo en hombros, espalda y piernas'))
  const priority = s.actions[0]
  assert.match(priority.text, /^Dar prioridad a hombros, espalda y piernas: ya les subo las series de la semana/)
  for (const id of priority.exerciseIds) assert.ok(findExercise(id), id)
})

test('D-068: sin zonas claras en la foto, no se inventan zonas ni pasos', () => {
  const s = summarizeScan({ shots: balanced(), selfReport: { priority: null } })
  assert.deepEqual(s.diagnosis.strongZones, [])
  assert.deepEqual(s.diagnosis.weakZones, [])
  assert.doesNotMatch(allText(s), /destacan|va por detrás|van por detrás|Dar prioridad a/)
})

test('D-068: la complexión se deduce de la altura, el peso y la «V», y guía el plan de la prioridad', () => {
  const s = summarizeScan({
    shots: { ...balanced(), front: steady({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, shoulderToWaist: 1.35 }) },
    selfReport: { priority: 'musculo' },
    body: { heightCm: 178, age: 25, weightKg: 55 },
  })
  assert.equal(s.diagnosis.build?.type, 'ectomorfa')
  const composition = s.categories.find((c) => c.key === 'composition')!
  assert.match(composition.text, /Por tus proporciones, tu complexión es ectomorfa: la estimo con tu altura y tu peso y la «V» de hombros a cintura de tus fotos\./)
  assert.match(composition.text, /Tu prioridad es ganar músculo\. Con una complexión ectomorfa, lo que más te hará ganar músculo es progresar en carga/)
  assert.ok(composition.details.some((d) => /^Complexión \(escala Heath-Carter\): meso 4,4 · ecto 5,7$/.test(d)), composition.details.join(' | '))
  assert.doesNotMatch(composition.text, /[!¡]|kilos|adelgaz/i)
})

test('D-068: sin altura ni peso ni grasa, la complexión no se rellena', () => {
  const s = summarizeScan({ shots: balanced(), selfReport: { priority: 'musculo' } })
  assert.equal(s.diagnosis.build, null)
  assert.doesNotMatch(allText(s), /complexión es/)
})

/** Fotos de frente y de perfil de una persona de 178 cm: cuello 12 × 12 cm y cintura 30 × 24 cm. */
function withFatSpans(): PoseShots {
  const h = 178
  const same = (values: Record<string, number>) => [1, 2, 3].map(() => m(values))
  return {
    ...balanced(),
    front: same({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, legToTorso: 1.4, neckWidthH: 12 / h, waistWidthH: 30 / h }),
    side: same({ headForwardPct: 2, headAngleDeg: 80, neckDepthH: 12 / h, waistDepthH: 24 / h }),
  }
}

test('grasa estimada: con sexo, altura y las dos fotos, se da con su margen, su método y sus límites', () => {
  const s = summarizeScan({
    shots: withFatSpans(),
    selfReport: { priority: null, sex: 'hombre' },
    body: { heightCm: 178, age: 30 },
  })
  assert.ok(s.bodyFat, 'hay estimación')
  const composition = s.categories.find((c) => c.key === 'composition')!
  assert.ok(composition.text.includes(`Tu grasa corporal estimada es del ${String(s.bodyFat.pct).replace('.', ',')} % (±4 %)`), composition.text)
  assert.match(composition.text, /fórmula de la Marina/)
  assert.match(composition.text, /no una medida médica/)
  assert.match(composition.text, /no ve la grasa interna/)
  // No puntúa ni entra en el índice.
  assert.equal(composition.score, null)
  assert.equal(composition.inIndex, false)
})

test('grasa estimada: sin altura o sin la foto de perfil, no se estima y se dice qué falta', () => {
  const self = { priority: null, sex: 'hombre' } as const
  const noHeight = summarizeScan({ shots: withFatSpans(), selfReport: self })
  assert.equal(noHeight.bodyFat, null)
  assert.match(noHeight.categories.find((c) => c.key === 'composition')!.text, /necesito tu altura/)
  const { side: _side, ...noSide } = withFatSpans()
  const s = summarizeScan({ shots: noSide, selfReport: self, body: { heightCm: 178, age: 30 } })
  assert.match(s.categories.find((c) => c.key === 'composition')!.text, /necesito la foto de perfil/)
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

// ---------------------------------------------------------------------------
// Zonas medidas en la foto, cruzadas con la fuerza (D-023)
// ---------------------------------------------------------------------------

const withZones = (zones: Record<string, number>): PoseShots => ({
  ...balanced(),
  front: three({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, armAsymmetryPct: 1, legAsymmetryPct: 1, legToTorso: 1.4, shoulderToWaist: 1.35, ...zones }).map((shot) =>
    Object.fromEntries(Object.entries(shot).map(([k, v]) => [k, k in zones ? { value: zones[k] } : v])),
  ),
})
const devText = (s: ReturnType<typeof summarizeScan>) => s.categories.find((c) => c.key === 'muscleDevelopment')!.text

test('primer escaneo con zonas: es la referencia, y dice cuándo será coherente con músculo', () => {
  const s = summarizeScan({ shots: withZones({ upperArmMean: 0.33, thighMean: 0.4 }) })
  assert.match(devText(s), /este escaneo es tu referencia/)
  const details = s.categories.find((c) => c.key === 'muscleDevelopment')!.details
  assert.ok(details.includes('Brazo: ancho medio 33 % de su longitud (en la foto)'))
})

test('la zona crece y la fuerza de esa zona sube en los tests: coherente con más músculo', () => {
  const previous = { measurements: withZones({ upperArmMean: 0.3 }), dayKey: '2026-09-01' }
  const later = completed('2026-09-01', { push: 14, core: 56, legs: 62, pull: [12, 14] })
  const s = summarizeScan({ shots: withZones({ upperArmMean: 0.36 }), previous, assessments: [completed('2026-08-01'), later] })
  assert.match(devText(s), /Tu brazo ocupa más anchura que en tu escaneo anterior y tu fuerza de empuje y tirón ha subido: es coherente con más músculo\./)
  assert.ok(s.strengths.includes('Tu brazo ha crecido junto con tu fuerza'))
})

test('la zona crece pero sin un test que lo respalde: no se atribuye a músculo', () => {
  const previous = { measurements: withZones({ thighMean: 0.36 }), dayKey: '2026-09-01' }
  const s = summarizeScan({ shots: withZones({ thighMean: 0.42 }), previous })
  assert.match(devText(s), /Tu muslo ocupa más anchura que en tu escaneo anterior\. Sin un test que muestre más fuerza, no puedo saber si es músculo\./)
})

test('la zona crece pero la fuerza ahí no sube: tampoco se atribuye a músculo', () => {
  const previous = { measurements: withZones({ thighMean: 0.36 }), dayKey: '2026-09-01' }
  const later = completed('2026-09-01', { push: 14, core: 56, legs: 50, pull: [12, 14] })
  const s = summarizeScan({ shots: withZones({ thighMean: 0.42 }), previous, assessments: [completed('2026-08-01'), later] })
  assert.match(devText(s), /Tu muslo ocupa más anchura que en tu escaneo anterior, pero tu fuerza ahí no ha subido: no puedo atribuirlo a músculo\./)
})

test('un cambio dentro del margen no se cuenta como crecimiento, y nunca se habla de grasa', () => {
  const previous = { measurements: withZones({ upperArmMean: 0.33, thighMean: 0.4 }), dayKey: '2026-09-01' }
  const s = summarizeScan({ shots: withZones({ upperArmMean: 0.34, thighMean: 0.41 }), previous })
  assert.match(devText(s), /no ha cambiado más que el margen de medida/)
  assert.doesNotMatch(devText(s), /grasa|adelgaz|delgad|gord/i)
})

test('el contorno máximo solo, por encima de su margen, también cuenta como crecer', () => {
  const previous = { measurements: withZones({ calfMean: 0.15, calfPeak: 0.17 }), dayKey: '2026-09-01' }
  const s = summarizeScan({ shots: withZones({ calfMean: 0.155, calfPeak: 0.21 }), previous })
  assert.match(devText(s), /Tu pantorrilla ocupa más anchura que en tu escaneo anterior\./)
})

test('si la media sube y el contorno baja, no hay un cambio claro y no se dice nada de esa zona', () => {
  const previous = { measurements: withZones({ thighMean: 0.36, thighPeak: 0.45 }), dayKey: '2026-09-01' }
  const s = summarizeScan({ shots: withZones({ thighMean: 0.42, thighPeak: 0.4 }), previous })
  assert.doesNotMatch(devText(s), /muslo/)
})

test('el antebrazo se mide como una zona más, con su media y su contorno', () => {
  const s = summarizeScan({ shots: withZones({ forearmMean: 0.2, forearmPeak: 0.24 }) })
  const details = s.categories.find((c) => c.key === 'muscleDevelopment')!.details
  assert.ok(details.includes('Antebrazo: ancho medio 20 %, máximo 24 % de su longitud (en la foto)'), details.join(' | '))
})

test('un escaneo anterior sin estas medidas (otro método) no se compara: el nuevo es la referencia', () => {
  const old = withZones({ upperArmWidth: 0.3 })
  const s = summarizeScan({ shots: withZones({ upperArmMean: 0.36 }), previous: { measurements: old, dayKey: '2026-09-01' } })
  assert.match(devText(s), /este escaneo es tu referencia/)
  assert.doesNotMatch(devText(s), /más anchura/)
})

test('la cintura respecto a la cadera se dice tal cual, sin hablar de grasa', () => {
  const s = summarizeScan({ shots: withZones({ waistToHip: 0.82 }) })
  const proportion = s.categories.find((c) => c.key === 'proportion')!
  assert.match(proportion.text, /En la foto, tu cintura mide un 82 % de la anchura de tu cadera\./)
  assert.ok(proportion.details.includes('Cintura / cadera: 0,82'))
  assert.doesNotMatch(proportion.text, /grasa|adelgaz|delgad|gord/i)
})

// ---------------------------------------------------------------------------
// Core y brazos (D-023, enmienda del 2026-10-14)
// ---------------------------------------------------------------------------

const development = (shots: PoseShots) => summarizeScan({ shots }).categories.find((c) => c.key === 'muscleDevelopment')!

test('el abdomen de perfil se describe por su forma y se dice que puede ser músculo o grasa', () => {
  const flat = development({ ...balanced(), side: three({ headForwardPct: 2, headAngleDeg: 80, bellyBulgePct: 0.5 }) })
  assert.match(flat.text, /tu abdomen queda recto/)
  assert.match(flat.text, /puede ser músculo o grasa/)
  const out = development({ ...balanced(), side: three({ headForwardPct: 2, headAngleDeg: 80, bellyBulgePct: 6 }) })
  assert.match(out.text, /sale claramente/)
  assert.ok(out.details.some((d) => d.startsWith('Abdomen de perfil: 6 %')))
})

test('unos flancos que entran se dicen como una cintura que se estrecha', () => {
  const shots = { ...balanced(), front: three({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, legToTorso: 1.4, flankBulgePct: -2 }) }
  assert.match(development(shots).text, /tu cintura se estrecha/)
})

test('brazo / antebrazo y el pico flexionado se cuentan como referencia, sin comparar con nadie', () => {
  const shots: PoseShots = {
    ...balanced(),
    // Proporciones pequeñas: tres fotos iguales, para no salirse de su margen.
    front: [1, 2, 3].map(() => m({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, legToTorso: 1.4, armToForearm: 1.3, upperArmPeak: 0.3 })),
    flex: [1, 2, 3].map(() => m({ flexArmMean: 0.3, flexArmPeak: 0.36 })),
  }
  const text = development(shots).text
  assert.match(text, /un 30 % más ancho que tu antebrazo/)
  assert.match(text, /Al flexionar, el pico de tu brazo pasa del 30 % al 36 %/)
  assert.doesNotMatch(text, /media|población|normal/)
})

test('sin medidas de core ni de brazos no se dice nada de ellos', () => {
  const text = development(balanced()).text
  assert.doesNotMatch(text, /abdomen|flancos|antebrazo/)
})

// ---------------------------------------------------------------------------
// Resumen de entrenador (D-023, enmienda del 2026-10-14)
// ---------------------------------------------------------------------------

test('con una sola foto por pose, un único aviso en vez de uno por pose', () => {
  const single: PoseShots = Object.fromEntries(Object.entries(balanced()).map(([pose, shots]) => [pose, shots!.slice(0, 1)]))
  const notes = summarizeScan({ shots: single }).photoNotes.filter((n) => /una sola foto/.test(n))
  assert.deepEqual(notes, ['Con una sola foto por pose no puedo comprobar que las medidas sean estables: la próxima vez, haz 2 o 3 de cada pose.'])
})

test('tres pasos: primero la prioridad del usuario, después lo que más le frena y la alimentación', () => {
  const shots = balanced()
  shots.squat_front = three({ kneeAnkleRatio: 0.7, leftKneeInPct: 35, rightKneeInPct: 4 })
  const s = summarizeScan({
    shots,
    selfReport: { priority: 'musculo', sex: 'hombre' },
    body: { heightCm: 178, age: 25, weightKg: 70 },
  })
  assert.equal(s.actions.length, 3)
  assert.match(s.actions[0].text, /^Ganar músculo/)
  assert.match(s.actions[1].text, /^Control de rodilla/)
  assert.match(s.actions[2].text, /^Alimentación: .*ligero superávit.*110–140 g de proteína/)
  for (const action of s.actions) for (const id of action.exerciseIds) assert.ok(findExercise(id), id)
  // El resumen de entrada nombra la prioridad.
  assert.match(s.overview, /ganar músculo, que es tu prioridad, y trabajar lo que más te frena: en la sentadilla, la rodilla izquierda se va hacia dentro./)
})

test('con zonas por detrás en la foto, el primer paso son esas zonas (D-068)', () => {
  const s = summarizeScan({
    shots: { ...balanced(), front: steady({ shoulderTiltDeg: 0.5, hipTiltDeg: 0.4, shoulderToWaist: 1.2 }) },
    selfReport: { priority: 'musculo' },
    body: { heightCm: 178, age: 25, weightKg: 70 },
  })
  assert.match(s.actions[0].text, /^Dar prioridad a hombros y espalda/)
  assert.match(s.overview, /dar prioridad a hombros y espalda, que es lo que menos destaca en tus fotos/)
})

test('un menor recibe guía de alimentación sin déficit ni cifras', () => {
  const s = summarizeScan({
    shots: balanced(),
    selfReport: { priority: 'definir', sex: 'hombre' },
    body: { heightCm: 170, age: 15, weightKg: 60 },
  })
  const food = s.actions.find((a) => a.text.startsWith('Alimentación'))!
  assert.match(food.text, /no hace falta comer menos/)
  assert.doesNotMatch(food.text, /déficit|kcal|\d/)
})

test('sin prioridad no hay paso de alimentación', () => {
  const s = summarizeScan({ shots: balanced(), body: { heightCm: 178, age: 25, weightKg: 70 } })
  assert.ok(!s.actions.some((a) => a.text.startsWith('Alimentación')))
})
