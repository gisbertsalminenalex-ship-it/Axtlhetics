import assert from 'node:assert/strict'
import test from 'node:test'

import type { AxisProposal } from '../axis/types'
import {
  adjustReps,
  adjustWeight,
  takesWeight,
  canUndoLastSet,
  completedSetsTotal,
  completeSet,
  currentEntry,
  currentSetNumber,
  currentVolumeKg,
  extendRest,
  isActiveWorkout,
  isFinished,
  MAX_REPS,
  MAX_WEIGHT_KG,
  performedExercises,
  reconcileStoredWorkout,
  REST_EXTENSION_SECONDS,
  restState,
  skipExercise,
  skipRest,
  startWorkout,
  toWorkoutSession,
  undoLastSet,
  WEIGHT_STEP_KG,
} from './active-workout'
import { metTarget, type PlannedSession } from './types'

const plan: PlannedSession = {
  focus: 'tren_superior',
  title: 'Fuerza · Tren superior',
  intensity: 'moderada',
  estimatedMinutes: 45,
  muscleGroups: ['pecho', 'espalda'],
  exercises: [
    {
      exerciseId: 'press-banca',
      name: 'Press banca',
      sets: 2,
      reps: 8,
      isTimed: false,
      suggestedWeightKg: 80,
      restSeconds: 90,
      unilateral: false,
      tempo: null,
      imageUrl: null,
    },
    {
      exerciseId: 'remo-barra',
      name: 'Remo con barra',
      sets: 2,
      reps: 10,
      isTimed: false,
      suggestedWeightKg: null,
      restSeconds: 90,
      unilateral: false,
      tempo: null,
      imageUrl: null,
    },
  ],
}

const proposal: AxisProposal = {
  id: 'proposal-1',
  dayKey: '2026-09-08',
  createdAt: '2026-09-08T10:00:00.000Z',
  type: 'TRAINING',
  headline: 'Entrena tren superior con intensidad moderada.',
  reason: 'Tu recuperación es buena.',
  session: plan,
  factors: [],
  label: 'Recomendada',
  rule: 'good_recovery',
}

const START = new Date(2026, 8, 8, 18, 0, 0)

function fresh() {
  const workout = startWorkout(proposal, START)
  assert.ok(workout)
  return workout!
}

test('una propuesta sin sesión no arranca un entrenamiento', () => {
  const restProposal: AxisProposal = { ...proposal, type: 'RECOVERY', session: null }
  assert.equal(startWorkout(restProposal, START), null)
})

test('el entrenamiento arranca en el primer ejercicio con la carga sugerida', () => {
  const workout = fresh()
  const entry = currentEntry(workout)
  assert.equal(entry?.name, 'Press banca')
  assert.equal(entry?.weightKg, 80)
  assert.equal(currentSetNumber(workout), 1)
  assert.equal(isFinished(workout), false)
})

test('completar todas las series de un ejercicio pasa al siguiente', () => {
  let workout = fresh()
  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.name, 'Press banca', 'aún queda una serie')
  assert.equal(currentSetNumber(workout), 2)

  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.name, 'Remo con barra')
})

test('al terminar el último ejercicio la sesión queda finalizada', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  assert.equal(isFinished(workout), true)
  assert.equal(currentEntry(workout), null)
  assert.equal(completedSetsTotal(workout), 4)
})

test('completar una serie más allá del final no rompe nada', () => {
  let workout = fresh()
  for (let i = 0; i < 6; i += 1) workout = completeSet(workout)
  assert.equal(completedSetsTotal(workout), 4)
})

test('el selector de carga sube y baja en escalones y no cruza el cero', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 1)
  assert.equal(currentEntry(workout)?.weightKg, 80 + WEIGHT_STEP_KG)

  for (let i = 0; i < 1000; i += 1) workout = adjustWeight(workout, -1)
  assert.equal(currentEntry(workout)?.weightKg, 0)
})

test('el escalón de carga es de medio kilo', () => {
  assert.equal(WEIGHT_STEP_KG, 0.5)
})

test('la carga sube y baja de medio kilo en medio kilo y sigue siendo un número', () => {
  let workout = fresh()
  for (let i = 0; i < 60; i += 1) workout = adjustWeight(workout, -1)
  assert.equal(currentEntry(workout)?.weightKg, 50)

  const up: unknown[] = []
  for (let i = 0; i < 4; i += 1) {
    workout = adjustWeight(workout, 1)
    up.push(currentEntry(workout)?.weightKg)
  }
  assert.deepEqual(up, [50.5, 51, 51.5, 52])

  const down: unknown[] = []
  for (let i = 0; i < 4; i += 1) {
    workout = adjustWeight(workout, -1)
    down.push(currentEntry(workout)?.weightKg)
  }
  assert.deepEqual(down, [51.5, 51, 50.5, 50])
  assert.ok(up.concat(down).every((kg) => typeof kg === 'number'))
})

test('el selector de carga no pasa del máximo', () => {
  let workout = fresh()
  for (let i = 0; i < 1000; i += 1) workout = adjustWeight(workout, 1)
  assert.equal(currentEntry(workout)?.weightKg, MAX_WEIGHT_KG)
})

test('una serie registrada con medio kilo conserva el valor exacto', () => {
  let workout = adjustWeight(fresh(), 1)
  workout = completeSet(workout)
  assert.equal(workout.entries[0].sets[0].weightKg, 80.5)
})

test('un ejercicio sin carga sugerida y sin pesa en el catálogo no admite kilos', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)
  assert.equal(currentEntry(workout)?.weightKg, null)

  workout = adjustWeight(workout, 1)
  assert.equal(currentEntry(workout)?.weightKg, null, 'no hay selector de kg que pulsar')
})

test('admite kilos lo que lleva pesa o ya trae carga; una flexión o una plancha, no', () => {
  assert.equal(takesWeight({ exerciseId: 'remo-unilateral', weightKg: null }), true)
  assert.equal(takesWeight({ exerciseId: 'press-banca', weightKg: 80 }), true)
  assert.equal(takesWeight({ exerciseId: 'flexiones', weightKg: null }), false)
  assert.equal(takesWeight({ exerciseId: 'plancha', weightKg: null }), false)
  assert.equal(takesWeight({ exerciseId: 'movilidad-articular', weightKg: null }), false)
})

test('las repeticiones se mantienen dentro de un rango razonable', () => {
  let workout = fresh()
  for (let i = 0; i < 100; i += 1) workout = adjustReps(workout, -1)
  assert.equal(currentEntry(workout)?.reps, 1)

  for (let i = 0; i < 100; i += 1) workout = adjustReps(workout, 1)
  assert.equal(currentEntry(workout)?.reps, MAX_REPS)
})

test('se registra lo que realmente se hizo, no lo que se propuso', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 10) // 85 kg
  workout = adjustReps(workout, -2) // 6 reps
  workout = completeSet(workout)

  const entry = workout.entries[0]
  assert.deepEqual(entry.sets[0], { reps: 6, weightKg: 85, completed: true })
  assert.equal(currentVolumeKg(workout), 6 * 85)
})

test('saltar un ejercicio queda registrado como modificación', () => {
  let workout = fresh()
  workout = skipExercise(workout)
  assert.equal(currentEntry(workout)?.name, 'Remo con barra')
  assert.equal(workout.modifications.length, 1)
  assert.equal(workout.modifications[0].kind, 'exercise_skipped')
})

test('la sesión guardada conserva la propuesta que la originó', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)

  const saved = toWorkoutSession(workout, {
    status: 'completed',
    effort: 4,
    completedAt: new Date(2026, 8, 8, 19, 0, 0),
  })

  assert.equal(saved.proposal?.proposalId, 'proposal-1')
  assert.equal(saved.proposal?.headline, proposal.headline)
  assert.equal(saved.status, 'completed')
  assert.equal(saved.durationSeconds, 3600)
  assert.equal(saved.effort, 4)
  assert.equal(saved.perceivedEffort, null, 'la sensación ya no se escribe (D-019)')
  assert.equal(saved.totalVolumeKg, 2 * 8 * 80)
})

test('una sesión incompleta se guarda como acortada, no como completa a medias', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = completeSet(workout)

  const saved = toWorkoutSession(workout, { status: 'completed' })
  assert.equal(saved.exercises.length, 1)
  assert.ok(saved.modifications.some((item) => item.kind === 'session_shortened'))
})

test('abandonar la sesión queda marcado en el registro', () => {
  const workout = fresh()
  const saved = toWorkoutSession(workout, { status: 'abandoned' })
  assert.equal(saved.status, 'abandoned')
  assert.ok(saved.modifications.some((item) => item.kind === 'session_abandoned'))
  assert.equal(saved.totalVolumeKg, 0)
})

test('la duración nunca es negativa aunque el reloj vaya hacia atrás', () => {
  const workout = fresh()
  const saved = toWorkoutSession(workout, {
    status: 'completed',
    completedAt: new Date(2026, 8, 8, 17, 0, 0),
  })
  assert.ok(saved.durationSeconds >= 0)
})

// ---------------------------------------------------------------------------
// P-014: reanudar una sesión guardada
// ---------------------------------------------------------------------------

import { hasProgress } from './active-workout'

/** Lo que la sesión atraviesa al ir y volver del almacenamiento. */
function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test('una sesión a medias se reconoce después de pasar por el almacenamiento', () => {
  let workout = fresh()
  workout = adjustWeight(workout, 1)
  workout = adjustReps(workout, -2)
  workout = completeSet(workout)

  const stored = roundTrip(workout)
  assert.equal(isActiveWorkout(stored), true)
  assert.deepEqual(stored, workout, 'no se pierde ni cambia ningún campo')
})

test('una sesión ya terminada también tiene una forma válida', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  assert.equal(isActiveWorkout(roundTrip(workout)), true)
})

test('un registro corrupto no se reconoce como sesión', () => {
  const workout = fresh()
  assert.equal(isActiveWorkout(null), false)
  assert.equal(isActiveWorkout('sesión'), false)
  assert.equal(isActiveWorkout({}), false)
  assert.equal(isActiveWorkout({ ...workout, entries: 'nada' }), false)
  assert.equal(isActiveWorkout({ ...workout, exerciseIndex: 99 }), false)
  assert.equal(isActiveWorkout({ ...workout, exerciseIndex: -1 }), false)
  assert.equal(isActiveWorkout({ ...workout, startedAt: 'ayer' }), false)
  assert.equal(
    isActiveWorkout({ ...workout, entries: [{ ...workout.entries[0], sets: [{ reps: 'ocho' }] }] }),
    false,
  )
})

test('la sesión de hoy se reanuda exactamente donde se dejó', () => {
  let workout = fresh()
  workout = completeSet(workout)
  workout = adjustWeight(workout, 10) // 85 kg

  const outcome = reconcileStoredWorkout(roundTrip(workout), {
    today: '2026-09-08',
    savedAt: '2026-09-08T18:10:00.000Z',
  })
  assert.equal(outcome.kind, 'resume')
  if (outcome.kind !== 'resume') return
  assert.equal(currentEntry(outcome.workout)?.weightKg, 85)
  assert.equal(currentSetNumber(outcome.workout), 2)
  assert.equal(outcome.workout.id, workout.id)
})

test('una sesión de otro día con series hechas pasa al historial como abandonada', () => {
  let workout = fresh()
  workout = completeSet(workout)
  const savedAt = new Date(2026, 8, 8, 18, 12, 0).toISOString()

  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return

  assert.equal(outcome.session.id, workout.id, 'mismo id: no puede duplicarse')
  assert.equal(outcome.session.status, 'abandoned')
  assert.equal(outcome.session.dayKey, '2026-09-08', 'pertenece al día en que se hizo')
  assert.equal(outcome.session.exercises.length, 1)
  // La duración sale del último guardado, no de «ahora»: 12 minutos, no un día.
  assert.equal(outcome.session.durationSeconds, 12 * 60)
  assert.ok(outcome.session.modifications.some((m) => m.kind === 'session_abandoned'))
})

test('una sesión de otro día sin ninguna serie se descarta sin tocar el historial', () => {
  const outcome = reconcileStoredWorkout(roundTrip(fresh()), {
    today: '2026-09-09',
    savedAt: '2026-09-08T18:00:00.000Z',
  })
  assert.equal(outcome.kind, 'discard')
})

test('un registro que no se entiende se descarta aunque sea de hoy', () => {
  const outcome = reconcileStoredWorkout(
    { id: 'x', dayKey: '2026-09-08' },
    { today: '2026-09-08', savedAt: '2026-09-08T18:00:00.000Z' },
  )
  assert.equal(outcome.kind, 'discard')
})

test('si la fecha del último guardado no es válida, la sesión archivada no inventa duración', () => {
  let workout = fresh()
  workout = completeSet(workout)
  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt: '???' })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return
  assert.equal(outcome.session.durationSeconds, 0)
})

test('hay progreso en cuanto se completa la primera serie', () => {
  const workout = fresh()
  assert.equal(hasProgress(workout), false)
  assert.equal(hasProgress(completeSet(workout)), true)
})

test('una sesión de otro día con todo hecho se archiva como completada, no abandonada', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout)
  const savedAt = new Date(2026, 8, 8, 18, 30, 0).toISOString()

  const outcome = reconcileStoredWorkout(roundTrip(workout), { today: '2026-09-09', savedAt })
  assert.equal(outcome.kind, 'archive')
  if (outcome.kind !== 'archive') return
  assert.equal(outcome.session.status, 'completed')
  assert.equal(outcome.session.durationSeconds, 30 * 60)
  assert.ok(!outcome.session.modifications.some((m) => m.kind === 'session_abandoned'))
})

test('un plan o una propuesta a medias invalidan el registro', () => {
  const workout = fresh()
  assert.equal(isActiveWorkout({ ...workout, plan: { title: 'x' } }), false)
  assert.equal(isActiveWorkout({ ...workout, proposal: { proposalId: 'p' } }), false)
})

test('saltar todos los ejercicios agota la sesión pero no cuenta como progreso', () => {
  /*
   * El caso que hacía que una sesión vacía entrara en el historial como
   * completada: la sesión se agota igual que si se hubiera hecho entera
   * —`isFinished` es true y no queda ejercicio en curso— pero sin una sola
   * serie. Quien la guarde tiene que mirar `hasProgress`, no `isFinished`.
   */
  let workout = fresh()
  for (let i = 0; i < plan.exercises.length; i += 1) workout = skipExercise(workout)

  assert.equal(isFinished(workout), true)
  assert.equal(currentEntry(workout), null)
  assert.equal(hasProgress(workout), false)
  assert.equal(completedSetsTotal(workout), 0)
})

// ---------------------------------------------------------------------------
// Descanso entre series (D-019)
// ---------------------------------------------------------------------------

/** `START` más unos segundos: el reloj de estos tests no depende del real. */
function at(seconds: number): Date {
  return new Date(START.getTime() + seconds * 1000)
}

test('completar una serie arranca solo el descanso del ejercicio', () => {
  const workout = completeSet(fresh(), at(0))

  assert.deepEqual(restState(workout, at(0)), { remainingSeconds: 90, totalSeconds: 90 })
  assert.deepEqual(restState(workout, at(30)), { remainingSeconds: 60, totalSeconds: 90 })
  // Medio segundo no se redondea a cero: «00:01» hasta que acaba de verdad.
  assert.equal(restState(workout, new Date(at(89).getTime() + 500))?.remainingSeconds, 1)
})

test('el descanso termina solo al llegar a cero, sin que haya que cerrarlo', () => {
  const workout = completeSet(fresh(), at(0))
  assert.equal(restState(workout, at(90)), null)
  assert.equal(restState(workout, at(500)), null)
})

test('también hay descanso al pasar de un ejercicio al siguiente', () => {
  let workout = completeSet(fresh(), at(0))
  workout = completeSet(workout, at(100)) // última serie de press banca
  assert.equal(currentEntry(workout)?.exerciseId, 'remo-barra')
  assert.equal(restState(workout, at(100))?.remainingSeconds, 90)
})

test('tras la última serie de la sesión no hay descanso: la sesión termina', () => {
  let workout = fresh()
  for (let i = 0; i < 4; i += 1) workout = completeSet(workout, at(i * 100))
  assert.equal(isFinished(workout), true)
  assert.equal(workout.rest, null)
})

test('saltar el descanso lo termina en el acto', () => {
  const workout = skipRest(completeSet(fresh(), at(0)))
  assert.equal(restState(workout, at(1)), null)
})

test('«+15 s» alarga el descanso en curso y el total lo refleja', () => {
  const workout = extendRest(completeSet(fresh(), at(0)), REST_EXTENSION_SECONDS, at(30))
  assert.deepEqual(restState(workout, at(30)), { remainingSeconds: 75, totalSeconds: 105 })
})

test('sin descanso en curso, «+15 s» no inventa uno', () => {
  const idle = fresh()
  assert.equal(extendRest(idle, REST_EXTENSION_SECONDS, at(0)), idle)

  const over = completeSet(fresh(), at(0))
  assert.equal(extendRest(over, REST_EXTENSION_SECONDS, at(200)), over, 'uno ya acabado tampoco se resucita')
})

test('saltar un ejercicio cancela el descanso', () => {
  const workout = skipExercise(completeSet(fresh(), at(0)))
  assert.equal(restState(workout, at(1)), null)
})

test('el descanso sobrevive al almacenamiento: al recargar sigue donde iba', () => {
  const workout = completeSet(fresh(), at(0))
  const stored = JSON.parse(JSON.stringify(workout))

  assert.equal(isActiveWorkout(stored), true)
  const outcome = reconcileStoredWorkout(stored, { today: workout.dayKey, savedAt: at(0).toISOString() })
  assert.equal(outcome.kind, 'resume')
  if (outcome.kind !== 'resume') return
  assert.equal(restState(outcome.workout, at(40))?.remainingSeconds, 50)
})

test('una sesión guardada antes de D-019, sin descanso ni deshacer, sigue reanudándose', () => {
  const legacy = JSON.parse(JSON.stringify(completeSet(fresh(), at(0))))
  delete legacy.rest
  delete legacy.lastSet

  assert.equal(isActiveWorkout(legacy), true)
  assert.equal(restState(legacy, at(1)), null)
  assert.equal(canUndoLastSet(legacy), false)
})

test('un descanso o un deshacer con forma rota invalidan el registro guardado', () => {
  const base = JSON.parse(JSON.stringify(completeSet(fresh(), at(0))))
  assert.equal(isActiveWorkout({ ...base, rest: { startedAt: 'ayer', endsAt: 'luego' } }), false)
  assert.equal(isActiveWorkout({ ...base, lastSet: { exerciseIndex: 7 } }), false)
})

// ---------------------------------------------------------------------------
// Deshacer la última serie (D-019)
// ---------------------------------------------------------------------------

test('deshacer quita la última serie y cancela su descanso', () => {
  const done = completeSet(fresh(), at(0))
  assert.equal(canUndoLastSet(done), true)

  const undone = undoLastSet(done)
  assert.equal(currentEntry(undone)?.sets.length, 0)
  assert.equal(currentSetNumber(undone), 1)
  assert.equal(undone.rest, null)
})

test('deshacer la serie que cerró un ejercicio vuelve a ese ejercicio', () => {
  let workout = completeSet(fresh(), at(0))
  workout = completeSet(workout, at(100))
  assert.equal(currentEntry(workout)?.exerciseId, 'remo-barra')

  workout = undoLastSet(workout)
  assert.equal(currentEntry(workout)?.exerciseId, 'press-banca')
  assert.equal(currentEntry(workout)?.sets.length, 1)
  assert.equal(currentSetNumber(workout), 2)
})

test('deshacer devuelve la carga y las reps de la serie, para repetirla de un toque', () => {
  let workout = adjustReps(fresh(), -2) // 6 reps
  workout = completeSet(workout, at(0))
  workout = adjustReps(workout, 3) // se toca algo antes de deshacer
  workout = undoLastSet(workout)

  assert.equal(currentEntry(workout)?.reps, 6)
  assert.equal(currentEntry(workout)?.weightKg, 80)
})

test('solo se deshace la última serie: no es un historial', () => {
  let workout = completeSet(fresh(), at(0))
  workout = undoLastSet(workout)
  assert.equal(canUndoLastSet(workout), false)
  assert.equal(undoLastSet(workout), workout)
})

test('saltar un ejercicio no se puede deshacer, ni deja deshacer la serie anterior', () => {
  const workout = skipExercise(completeSet(fresh(), at(0)))
  assert.equal(canUndoLastSet(workout), false)
})

test('sin ninguna serie no hay nada que deshacer', () => {
  const workout = fresh()
  assert.equal(canUndoLastSet(workout), false)
  assert.equal(undoLastSet(workout), workout)
})

// ---------------------------------------------------------------------------
// El objetivo viaja con lo hecho (D-019)
// ---------------------------------------------------------------------------

test('cada ejercicio hecho guarda lo que estaba previsto', () => {
  const workout = completeSet(fresh(), at(0))
  const [press] = performedExercises(workout)
  assert.equal(press.targetSets, 2)
  assert.equal(press.targetReps, 8)
})

test('un ejercicio a medias no cuenta como hecho, aunque cada serie se registrara', () => {
  // 1 de 2 series y se salta.
  const half = skipExercise(completeSet(fresh(), at(0)))
  assert.equal(metTarget(performedExercises(half)[0]), false)

  // Todas las series, pero por debajo de las reps previstas.
  let low = adjustReps(fresh(), -3)
  low = completeSet(low, at(0))
  low = completeSet(low, at(100))
  assert.equal(metTarget(performedExercises(low)[0]), false)

  // Lo previsto, entero.
  let full = completeSet(fresh(), at(0))
  full = completeSet(full, at(100))
  assert.equal(metTarget(performedExercises(full)[0]), true)
})

// ---------------------------------------------------------------------------
// D-032: calentamiento y vuelta a la calma
// ---------------------------------------------------------------------------

test('D-032: saltar el calentamiento no deja rastro ni acorta la sesión', async () => {
  const { decide } = await import('../axis/engine')
  const { buildAxisContext } = await import('../axis/context')
  const { startWorkout, skipExercise, completeSet, toWorkoutSession } = await import('./active-workout')
  const context = buildAxisContext({
    profile: null,
    recoveryInputs: null,
    recentSessions: [],
    activities: [],
    now: new Date(2026, 8, 7, 10, 0),
  })
  const proposal = decide(context).primary
  let workout = startWorkout(proposal)!
  assert.ok(workout.entries[0].phase === 'calentamiento', 'la sesión empieza calentando')

  // Se salta el calentamiento y se hace todo lo demás.
  while (workout.exerciseIndex < workout.entries.length) {
    const entry = workout.entries[workout.exerciseIndex]
    if (entry.phase) {
      workout = skipExercise(workout)
      continue
    }
    for (let i = 0; i < entry.targetSets; i++) workout = completeSet(workout)
  }

  const session = toWorkoutSession(workout, { status: 'completed' })
  assert.equal(session.modifications.length, 0, `sin «sin completar» ni sesión acortada: ${JSON.stringify(session.modifications)}`)
  assert.ok(session.exercises.every((item) => item.phase === undefined), 'lo hecho es el entrenamiento')
})
