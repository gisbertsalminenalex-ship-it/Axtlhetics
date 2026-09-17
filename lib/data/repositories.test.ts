import assert from 'node:assert/strict'
import test from 'node:test'

import type { ScheduledActivity, UserProfile } from '../domain/profile/types'
import { PRIMARY_PROFILE_ID } from '../domain/profile/types'
import type { RecoveryInputs } from '../domain/recovery/types'
import { emptyRecoveryInputs } from '../domain/recovery/types'
import { minutesFromMidnight } from '../domain/shared/dates'
import { emptyDayMemory, type AxisDayMemory } from '../domain/axis/memory'
import type { ActiveWorkout } from '../domain/workouts/active-workout'
import type { WorkoutSession } from '../domain/workouts/types'
import { getRepositories } from './index'
import { ACTIVE_WORKOUT_KEY, isIndexedDbAvailable, openDatabase, STORES } from './indexeddb/db'
import { createMemoryRepositories } from './memory-repositories'

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: PRIMARY_PROFILE_ID,
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function activity(partial: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id: 'activity-1',
    name: 'Baloncesto',
    weekday: 2,
    startMinute: minutesFromMidnight(20, 0),
    endMinute: minutesFromMidnight(22, 0),
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'gluteos'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function session(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    dayKey: '2026-09-08',
    startedAt: '2026-09-08T18:00:00.000Z',
    completedAt: '2026-09-08T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho'],
    exercises: [],
    totalVolumeKg: 300,
    status: 'completed',
    perceivedEffort: 4,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

test('el perfil se guarda, se recupera y se borra', async () => {
  const repositories = createMemoryRepositories()
  assert.equal(await repositories.profile.get(), null)

  await repositories.profile.save(profile())
  const stored = await repositories.profile.get()
  assert.equal(stored?.name, 'Alex')
  assert.equal(stored?.age, 15)
  assert.deepEqual(stored?.availableWeekdays, [0, 2, 4])

  await repositories.profile.clear()
  assert.equal(await repositories.profile.get(), null)
})

test('guardar el perfil dos veces sustituye, no duplica', async () => {
  const repositories = createMemoryRepositories()
  await repositories.profile.save(profile())
  await repositories.profile.save(profile({ name: 'Alejandro', weightKg: 70 }))

  const stored = await repositories.profile.get()
  assert.equal(stored?.name, 'Alejandro')
  assert.equal(stored?.weightKg, 70)
})

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

test('las actividades se ordenan por día y hora de inicio', async () => {
  const repositories = createMemoryRepositories()
  await repositories.activities.save(
    activity({ id: 'b', weekday: 4, startMinute: minutesFromMidnight(18, 0) }),
  )
  await repositories.activities.save(
    activity({ id: 'c', weekday: 2, startMinute: minutesFromMidnight(21, 0) }),
  )
  await repositories.activities.save(
    activity({ id: 'a', weekday: 2, startMinute: minutesFromMidnight(19, 0) }),
  )

  const list = await repositories.activities.list()
  assert.deepEqual(
    list.map((item) => item.id),
    ['a', 'c', 'b'],
  )
})

test('una actividad se puede borrar sin tocar las demás', async () => {
  const repositories = createMemoryRepositories()
  await repositories.activities.save(activity({ id: 'a' }))
  await repositories.activities.save(activity({ id: 'b', weekday: 4 }))

  await repositories.activities.remove('a')
  const list = await repositories.activities.list()
  assert.deepEqual(
    list.map((item) => item.id),
    ['b'],
  )
})

test('borrar una actividad que no existe no rompe nada', async () => {
  const repositories = createMemoryRepositories()
  await repositories.activities.remove('fantasma')
  assert.deepEqual(await repositories.activities.list(), [])
})

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------

test('la recuperación se guarda por día', async () => {
  const repositories = createMemoryRepositories()
  const inputs: RecoveryInputs = {
    ...emptyRecoveryInputs('2026-09-08', '2026-09-08T08:00:00.000Z'),
    sleepHours: 8.5,
    energy: 4,
  }
  await repositories.recovery.save(inputs)

  const stored = await repositories.recovery.getByDay('2026-09-08')
  assert.equal(stored?.sleepHours, 8.5)
  assert.equal(stored?.energy, 4)
  assert.equal(await repositories.recovery.getByDay('2026-09-07'), null)
})

test('guardar el mismo día dos veces actualiza el registro', async () => {
  const repositories = createMemoryRepositories()
  const base = emptyRecoveryInputs('2026-09-08', '2026-09-08T08:00:00.000Z')

  await repositories.recovery.save({ ...base, sleepHours: 7 })
  await repositories.recovery.save({ ...base, sleepHours: 9, energy: 5 })

  const stored = await repositories.recovery.getByDay('2026-09-08')
  assert.equal(stored?.sleepHours, 9)
  assert.equal(stored?.energy, 5)
  assert.equal((await repositories.recovery.recent(10)).length, 1)
})

test('los días recientes vienen del más nuevo al más antiguo', async () => {
  const repositories = createMemoryRepositories()
  for (const dayKey of ['2026-09-06', '2026-09-08', '2026-09-07']) {
    await repositories.recovery.save(emptyRecoveryInputs(dayKey, `${dayKey}T08:00:00.000Z`))
  }

  const recent = await repositories.recovery.recent(2)
  assert.deepEqual(
    recent.map((item) => item.dayKey),
    ['2026-09-08', '2026-09-07'],
  )
})

// ---------------------------------------------------------------------------
// Entrenamientos
// ---------------------------------------------------------------------------

test('una sesión completada se guarda entera y se recupera igual', async () => {
  const repositories = createMemoryRepositories()
  const saved = session({
    exercises: [
      {
        exerciseId: 'remo-unilateral',
        name: 'Remo unilateral con pesa',
        sets: [
          { reps: 12, weightKg: 5, completed: true },
          { reps: 10, weightKg: 5, completed: true },
        ],
      },
    ],
    proposal: {
      proposalId: 'proposal-1',
      type: 'TRAINING',
      headline: 'Entrena tren superior con intensidad moderada.',
      reason: 'Tu recuperación es buena.',
      focus: 'tren_superior',
      intensity: 'moderada',
    },
    modifications: [{ kind: 'exercise_skipped', detail: 'Superman sin completar.' }],
  })

  await repositories.workouts.save(saved)
  const stored = await repositories.workouts.getById('session-1')

  assert.ok(stored)
  assert.deepEqual(stored, saved, 'la sesión debe volver exactamente igual')
  assert.equal(stored!.proposal?.proposalId, 'proposal-1')
  assert.equal(stored!.modifications.length, 1)
  assert.equal(stored!.exercises[0].sets.length, 2)
})

test('el historial se devuelve del más reciente al más antiguo', async () => {
  const repositories = createMemoryRepositories()
  await repositories.workouts.save(session({ id: 'a', dayKey: '2026-09-05' }))
  await repositories.workouts.save(session({ id: 'c', dayKey: '2026-09-08' }))
  await repositories.workouts.save(session({ id: 'b', dayKey: '2026-09-06' }))

  const list = await repositories.workouts.list()
  assert.deepEqual(
    list.map((item) => item.id),
    ['c', 'b', 'a'],
  )
})

test('dos sesiones del mismo día se ordenan por hora de inicio', async () => {
  const repositories = createMemoryRepositories()
  await repositories.workouts.save(
    session({ id: 'manana', startedAt: '2026-09-08T09:00:00.000Z' }),
  )
  await repositories.workouts.save(
    session({ id: 'tarde', startedAt: '2026-09-08T19:00:00.000Z' }),
  )

  const list = await repositories.workouts.list()
  assert.deepEqual(
    list.map((item) => item.id),
    ['tarde', 'manana'],
  )
})

test('el límite del historial recorta pero mantiene el orden', async () => {
  const repositories = createMemoryRepositories()
  for (const dayKey of ['2026-09-01', '2026-09-02', '2026-09-03']) {
    await repositories.workouts.save(session({ id: dayKey, dayKey }))
  }

  const list = await repositories.workouts.list(2)
  assert.deepEqual(
    list.map((item) => item.id),
    ['2026-09-03', '2026-09-02'],
  )
})

test('volver a guardar una sesión la actualiza en lugar de duplicarla', async () => {
  const repositories = createMemoryRepositories()
  await repositories.workouts.save(session({ perceivedEffort: null }))
  await repositories.workouts.save(session({ perceivedEffort: 5 }))

  const list = await repositories.workouts.list()
  assert.equal(list.length, 1, 'el historial no debe duplicar la sesión')
  assert.equal(list[0].perceivedEffort, 5)
})

test('una sesión abandonada también se guarda: el historial no se borra por conveniencia', async () => {
  const repositories = createMemoryRepositories()
  await repositories.workouts.save(session({ id: 'abandonada', status: 'abandoned' }))

  const stored = await repositories.workouts.getById('abandonada')
  assert.equal(stored?.status, 'abandoned')
})

test('pedir una sesión que no existe devuelve null, no lanza', async () => {
  const repositories = createMemoryRepositories()
  assert.equal(await repositories.workouts.getById('fantasma'), null)
})

// ---------------------------------------------------------------------------
// Sesión en curso (P-014)
// ---------------------------------------------------------------------------

function activeWorkout(partial: Partial<ActiveWorkout> = {}): ActiveWorkout {
  return {
    id: 'workout-1',
    dayKey: '2026-09-08',
    startedAt: '2026-09-08T18:00:00.000Z',
    proposal: {
      proposalId: 'proposal-1',
      type: 'TRAINING',
      headline: 'Entrena tren superior.',
      reason: 'Tu recuperación es buena.',
      focus: 'tren_superior',
      intensity: 'moderada',
    },
    plan: {
      focus: 'tren_superior',
      title: 'Fuerza · Tren superior',
      intensity: 'moderada',
      estimatedMinutes: 30,
      muscleGroups: ['pecho'],
      exercises: [],
    },
    entries: [
      {
        exerciseId: 'flexiones',
        name: 'Flexiones',
        imageUrl: null,
        targetSets: 3,
        targetReps: 10,
        restSeconds: 60,
        isTimed: false,
        unilateral: false,
        reps: 10,
        weightKg: null,
        sets: [{ reps: 10, weightKg: null, completed: true }],
      },
    ],
    exerciseIndex: 0,
    modifications: [],
    ...partial,
  }
}

test('la sesión en curso se guarda, se recupera entera y se borra', async () => {
  const repositories = createMemoryRepositories()
  assert.equal(await repositories.activeWorkout.get(), null)

  const workout = activeWorkout()
  await repositories.activeWorkout.save({ workout, updatedAt: '2026-09-08T18:05:00.000Z' })

  const stored = await repositories.activeWorkout.get()
  assert.deepEqual(stored?.workout, workout)
  assert.equal(stored?.updatedAt, '2026-09-08T18:05:00.000Z')

  await repositories.activeWorkout.clear()
  assert.equal(await repositories.activeWorkout.get(), null)
})

test('guardar la sesión en curso varias veces deja una sola, la última', async () => {
  const repositories = createMemoryRepositories()
  await repositories.activeWorkout.save({
    workout: activeWorkout({ exerciseIndex: 0 }),
    updatedAt: '2026-09-08T18:05:00.000Z',
  })
  await repositories.activeWorkout.save({
    workout: activeWorkout({ exerciseIndex: 1 }),
    updatedAt: '2026-09-08T18:09:00.000Z',
  })

  const stored = await repositories.activeWorkout.get()
  assert.equal(stored?.workout.exerciseIndex, 1)
  assert.equal(stored?.updatedAt, '2026-09-08T18:09:00.000Z')
})

test('borrar una sesión en curso que no existe no lanza', async () => {
  const repositories = createMemoryRepositories()
  await repositories.activeWorkout.clear()
  assert.equal(await repositories.activeWorkout.get(), null)
})

// ---------------------------------------------------------------------------
// Memoria de AXIS
// ---------------------------------------------------------------------------

test('la memoria de un día se guarda, se recupera entera y se borra', async () => {
  const repositories = createMemoryRepositories()
  assert.equal(await repositories.axisMemory.getByDay('2026-09-08'), null)

  const memory: AxisDayMemory = {
    ...emptyDayMemory('2026-09-08', '2026-09-08T10:00:00.000Z'),
    cancelledActivities: ['Baloncesto'],
    reportedLoads: [
      {
        quote: 'ayer 20 km',
        muscleGroups: ['piernas'],
        demanding: true,
        reportedAt: '2026-09-08T10:00:00.000Z',
        messageId: 'm1',
      },
    ],
    messages: [{ id: 'm1', role: 'user', text: 'ayer 20 km', createdAt: '2026-09-08T10:00:00.000Z' }],
    thread: { lastIntent: 'change', changeMode: true, lastChangeRequest: { kind: 'easier', focus: null } },
  }
  await repositories.axisMemory.save(memory)
  assert.deepEqual(await repositories.axisMemory.getByDay('2026-09-08'), memory)

  await repositories.axisMemory.clear('2026-09-08')
  assert.equal(await repositories.axisMemory.getByDay('2026-09-08'), null)
})

test('cada día tiene su propia memoria y guardar dos veces sustituye', async () => {
  const repositories = createMemoryRepositories()
  await repositories.axisMemory.save(emptyDayMemory('2026-09-08'))
  await repositories.axisMemory.save({ ...emptyDayMemory('2026-09-09'), cancelledActivities: ['Tenis'] })
  await repositories.axisMemory.save({ ...emptyDayMemory('2026-09-08'), cancelledActivities: ['Baloncesto'] })

  assert.deepEqual((await repositories.axisMemory.getByDay('2026-09-08'))?.cancelledActivities, ['Baloncesto'])
  assert.deepEqual((await repositories.axisMemory.getByDay('2026-09-09'))?.cancelledActivities, ['Tenis'])
})

test('la fila de la sesión en curso tiene una clave fija', () => {
  // Es lo que garantiza desde el esquema que nunca haya dos entrenamientos a la vez.
  assert.equal(ACTIVE_WORKOUT_KEY, 'current')
})

// ---------------------------------------------------------------------------
// Selección de implementación
// ---------------------------------------------------------------------------

test('sin IndexedDB la aplicación sigue funcionando en memoria', async () => {
  // En Node no hay IndexedDB, así que este es exactamente el caso de reserva.
  assert.equal(isIndexedDbAvailable(), false)

  const repositories = getRepositories()
  await repositories.profile.save(profile({ name: 'Reserva' }))
  assert.equal((await repositories.profile.get())?.name, 'Reserva')
})

test('abrir la base sin IndexedDB falla de forma explícita', async () => {
  await assert.rejects(() => openDatabase(), /IndexedDB/)
})

test('los almacenes esperados están declarados', () => {
  assert.deepEqual(Object.values(STORES).sort(), [
    'activeWorkout',
    'activities',
    'axisMemory',
    'profile',
    'recovery',
    'sessions',
  ])
})
