import assert from 'node:assert/strict'
import test from 'node:test'

import type { ScheduledActivity, UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { minutesFromMidnight } from '../shared/dates'
import type { PerformedExercise, WorkoutSession } from '../workouts/types'
import { buildAxisContext } from './context'
import { decide } from './engine'
import { isTrainingRecommendation } from './types'
import { findExercise, isAvailable, MAX_AVAILABLE_LOAD_KG } from '../workouts/catalog'
import { usesLoad } from '../workouts/types'

// 2026-09-08 es lunes. Todos los tests fijan la hora para ser deterministas.
const MONDAY = new Date(2026, 8, 7, 10, 0)
const MONDAY_KEY = '2026-09-07'
const SUNDAY_KEY = '2026-09-06'
const SATURDAY_KEY = '2026-09-05'

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['hipertrofia'],
    experience: 'intermedio',
    availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    typicalSessionMinutes: 60,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function recovery(partial: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return {
    dayKey: MONDAY_KEY,
    sleepHours: 9,
    energy: 4,
    muscleFatigue: 2,
    stress: 2,
    hydrationGlasses: 6,
    updatedAt: '2026-09-07T08:00:00.000Z',
    ...partial,
  }
}

function session(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    dayKey: SATURDAY_KEY,
    startedAt: '2026-09-05T18:00:00.000Z',
    completedAt: '2026-09-05T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda', 'hombros', 'brazos'],
    exercises: [],
    totalVolumeKg: 3200,
    status: 'completed',
    perceivedEffort: 4,
    proposal: null,
    modifications: [],
    notes: null,
    ...partial,
  }
}

function basketball(partial: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id: 'activity-1',
    name: 'Baloncesto',
    weekday: 0,
    startMinute: minutesFromMidnight(20, 0),
    endMinute: minutesFromMidnight(22, 0),
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'gluteos'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
  }
}

function contextWith(
  overrides: Partial<Parameters<typeof buildAxisContext>[0]> = {},
) {
  return buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: [],
    activities: [],
    now: MONDAY,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Tipo de recomendación
// ---------------------------------------------------------------------------

test('con buena recuperación y descanso suficiente propone entrenar', () => {
  const decision = decide(contextWith({ recentSessions: [session()] }))
  assert.equal(decision.primary.type, 'TRAINING')
  assert.ok(decision.primary.session, 'debe traer una sesión concreta')
  assert.ok(decision.primary.session!.exercises.length >= 3)
})

test('con recuperación baja recomienda recuperar y no propone sesión', () => {
  const decision = decide(
    contextWith({
      recoveryInputs: recovery({ sleepHours: 4.5, energy: 1, muscleFatigue: 4, stress: 5 }),
    }),
  )
  assert.equal(decision.primary.type, 'RECOVERY')
  assert.equal(decision.primary.session, null)
  assert.equal(isTrainingRecommendation(decision.primary.type), false)
})

test('con fatiga muscular muy alta recomienda recuperar aunque el resto vaya bien', () => {
  const decision = decide(
    contextWith({ recoveryInputs: recovery({ muscleFatigue: 5 }) }),
  )
  assert.equal(decision.primary.type, 'RECOVERY')
})

test('con recuperación moderada propone sesión ligera', () => {
  const decision = decide(
    contextWith({
      recoveryInputs: recovery({ sleepHours: 7, energy: 3, muscleFatigue: 3, stress: 3, hydrationGlasses: 3 }),
    }),
  )
  assert.equal(decision.primary.type, 'LIGHT_TRAINING')
  assert.equal(decision.primary.session?.intensity, 'ligera')
})

test('sin datos de recuperación no inventa nada y propone sesión ligera', () => {
  const decision = decide(contextWith({ recoveryInputs: null }))
  assert.equal(decision.primary.type, 'LIGHT_TRAINING')
  assert.match(decision.primary.reason, /recuperación/i)
})

test('si ya has entrenado hoy, recomienda descansar', () => {
  const decision = decide(
    contextWith({ recentSessions: [session({ dayKey: MONDAY_KEY })] }),
  )
  assert.equal(decision.primary.type, 'REST')
  assert.equal(decision.primary.session, null)
})

test('si hoy no es un día disponible, recomienda descansar', () => {
  const decision = decide(
    contextWith({ profile: profile({ availableWeekdays: [1, 3, 5] }) }),
  )
  assert.equal(decision.primary.type, 'REST')
  assert.match(decision.primary.reason, /días que has marcado/i)
})

// ---------------------------------------------------------------------------
// Actividades con horario fijo
// ---------------------------------------------------------------------------

test('con baloncesto por la tarde adapta la sesión en lugar de ignorarlo', () => {
  const decision = decide(contextWith({ activities: [basketball()] }))
  assert.equal(decision.primary.type, 'MODIFIED_TRAINING')
  assert.match(decision.primary.reason, /baloncesto/i)
})

test('con baloncesto adaptando la sesión, no carga las piernas', () => {
  const decision = decide(contextWith({ activities: [basketball()] }))
  const groups = decision.primary.session?.muscleGroups ?? []
  assert.ok(!groups.includes('piernas'), `no debería cargar piernas, trajo ${groups.join(', ')}`)
})

test('si el baloncesto empieza en menos de hora y media, recomienda recuperar', () => {
  const decision = decide(
    contextWith({
      activities: [basketball({ startMinute: minutesFromMidnight(11, 0) })],
    }),
  )
  assert.equal(decision.primary.type, 'RECOVERY')
})

test('una actividad que ya ha terminado no condiciona el día', () => {
  const decision = decide(
    contextWith({
      activities: [
        basketball({
          startMinute: minutesFromMidnight(7, 0),
          endMinute: minutesFromMidnight(9, 0),
        }),
      ],
      recentSessions: [session()],
    }),
  )
  assert.equal(decision.primary.type, 'TRAINING')
})

test('una actividad suave no bloquea el entrenamiento', () => {
  const decision = decide(
    contextWith({
      activities: [basketball({ intensity: 'baja' })],
      recentSessions: [session()],
    }),
  )
  assert.equal(decision.primary.type, 'TRAINING')
})

// ---------------------------------------------------------------------------
// Historial y rotación de grupos
// ---------------------------------------------------------------------------

test('evita repetir el grupo trabajado ayer', () => {
  const decision = decide(
    contextWith({ recentSessions: [session({ dayKey: SUNDAY_KEY })] }),
  )
  assert.notEqual(decision.primary.session?.focus, 'tren_superior')
})

test('con tren superior ayer y tren inferior anteayer, no repite ninguno de los dos', () => {
  const decision = decide(
    contextWith({
      recentSessions: [
        session({ dayKey: SUNDAY_KEY, focus: 'tren_superior', muscleGroups: ['pecho', 'espalda'] }),
        session({
          dayKey: SATURDAY_KEY,
          focus: 'tren_inferior',
          muscleGroups: ['piernas', 'gluteos'],
        }),
      ],
    }),
  )
  assert.equal(decision.primary.type, 'TRAINING')
  // Con los dos trenes trabajados hace poco, algo se repite sí o sí. La garantía es
  // que elige el foco con menos solape: tren inferior está entero en el historial
  // reciente, tren superior solo a medias.
  assert.notEqual(
    decision.primary.session?.focus,
    'tren_inferior',
    'no debería repetir el foco cuyos grupos están todos recién trabajados',
  )
})

test('sin historial reciente no descarta ningún foco', () => {
  const decision = decide(contextWith({ recentSessions: [] }))
  assert.ok(decision.primary.session, 'debe proponer algo aunque no haya historial')
  assert.ok(decision.primary.session!.exercises.length >= 3)
})

test('la duración disponible reduce el número de ejercicios', () => {
  const long = decide(contextWith({ recentSessions: [session()] }))
  const short = decide(
    contextWith({
      profile: profile({ typicalSessionMinutes: 30 }),
      recentSessions: [session()],
    }),
  )
  const longCount = long.primary.session?.exercises.length ?? 0
  const shortCount = short.primary.session?.exercises.length ?? 0
  assert.ok(shortCount < longCount, `${shortCount} debería ser menor que ${longCount}`)
})

// ---------------------------------------------------------------------------
// Progresión
// ---------------------------------------------------------------------------

function performed(exerciseId: string, weightKg: number, allCompleted: boolean): PerformedExercise {
  return {
    exerciseId,
    name: exerciseId,
    sets: [
      { reps: 8, weightKg, completed: true },
      { reps: 8, weightKg, completed: allCompleted },
    ],
  }
}

test('si completaste todas las series con margen de carga, sube el peso', () => {
  const decision = decide(
    contextWith({
      recentSessions: [
        session({
          dayKey: SUNDAY_KEY,
          focus: 'tren_inferior',
          muscleGroups: ['piernas'],
          exercises: [performed('remo-unilateral', 2.5, true)],
        }),
      ],
    }),
  )
  const row = decision.primary.session?.exercises.find((item) => item.exerciseId === 'remo-unilateral')
  assert.ok(row, 'la sesión debería incluir el remo unilateral')
  assert.equal(row!.suggestedWeightKg, 5)
})

test('con la única pesa ya al máximo, la progresión pasa a repeticiones', () => {
  const withHistory = decide(
    contextWith({
      recentSessions: [
        session({
          dayKey: SUNDAY_KEY,
          focus: 'tren_inferior',
          muscleGroups: ['piernas'],
          exercises: [performed('remo-unilateral', MAX_AVAILABLE_LOAD_KG, true)],
        }),
      ],
    }),
  )
  const row = withHistory.primary.session?.exercises.find((item) => item.exerciseId === 'remo-unilateral')
  assert.ok(row)
  assert.equal(row!.suggestedWeightKg, MAX_AVAILABLE_LOAD_KG, 'no hay más pesa que sugerir')
  assert.ok(row!.reps > 12, `las repeticiones deberían subir, fueron ${row!.reps}`)
})

test('nunca se sugiere más carga de la que existe', () => {
  const decision = decide(
    contextWith({
      recentSessions: [
        session({
          dayKey: SUNDAY_KEY,
          focus: 'tren_inferior',
          muscleGroups: ['piernas'],
          exercises: [performed('remo-unilateral', MAX_AVAILABLE_LOAD_KG, true)],
        }),
      ],
    }),
  )
  for (const exercise of decision.primary.session?.exercises ?? []) {
    if (exercise.suggestedWeightKg === null) continue
    assert.ok(
      exercise.suggestedWeightKg <= MAX_AVAILABLE_LOAD_KG,
      `${exercise.name} sugiere ${exercise.suggestedWeightKg} kg y solo hay una pesa de ${MAX_AVAILABLE_LOAD_KG}`,
    )
  }
})

test('si no completaste todas las series, mantiene la carga', () => {
  const decision = decide(
    contextWith({
      recentSessions: [
        session({
          dayKey: SUNDAY_KEY,
          focus: 'tren_inferior',
          muscleGroups: ['piernas'],
          exercises: [performed('remo-unilateral', 2.5, false)],
        }),
      ],
    }),
  )
  const row = decision.primary.session?.exercises.find((item) => item.exerciseId === 'remo-unilateral')
  assert.equal(row!.suggestedWeightKg, 2.5)
})

test('los ejercicios de peso corporal nunca llevan carga sugerida', () => {
  const decision = decide(contextWith({ recentSessions: [] }))
  for (const planned of decision.primary.session?.exercises ?? []) {
    const exercise = findExercise(planned.exerciseId)
    assert.ok(exercise, `${planned.exerciseId} debería existir en el catálogo`)
    if (!usesLoad(exercise!)) {
      assert.equal(planned.suggestedWeightKg, null, `${planned.name} no usa pesa`)
    } else {
      assert.equal(planned.suggestedWeightKg, MAX_AVAILABLE_LOAD_KG)
    }
  }
})

// ---------------------------------------------------------------------------
// Equipamiento y selección
// ---------------------------------------------------------------------------

test('solo propone ejercicios ejecutables con el equipamiento disponible', () => {
  for (const focus of ['tren_superior', 'tren_inferior', 'cuerpo_completo'] as const) {
    const decision = decide(contextWith({ recentSessions: [session()] }))
    const alternatives = [decision.primary, ...decision.alternatives]
    for (const proposal of alternatives) {
      for (const planned of proposal.session?.exercises ?? []) {
        const exercise = findExercise(planned.exerciseId)
        assert.ok(exercise, `${planned.exerciseId} no está en el catálogo (${focus})`)
        assert.ok(isAvailable(exercise!), `${exercise!.name} necesita material inexistente`)
      }
    }
  }
})

test('el objetivo del perfil cambia el rango de repeticiones', () => {
  const strength = decide(
    contextWith({ profile: profile({ goals: ['fuerza'] }), recentSessions: [session()] }),
  )
  const endurance = decide(
    contextWith({ profile: profile({ goals: ['resistencia'] }), recentSessions: [session()] }),
  )

  const repsOf = (decision: ReturnType<typeof decide>) =>
    (decision.primary.session?.exercises ?? [])
      .filter((exercise) => !exercise.isTimed)
      .reduce((total, exercise) => total + exercise.reps, 0)

  assert.ok(
    repsOf(endurance) > repsOf(strength),
    'resistencia debería acumular más repeticiones que fuerza',
  )
})

test('una sesión de tren superior mezcla empuje y tirón', () => {
  const decision = decide(contextWith({ recentSessions: [session({ focus: 'tren_inferior', muscleGroups: ['piernas'] })] }))
  const categories = new Set(
    (decision.primary.session?.exercises ?? []).map(
      (planned) => findExercise(planned.exerciseId)?.category,
    ),
  )
  assert.ok(categories.size > 1, 'no debería ser todo el mismo patrón de movimiento')
})

test('ajustar la dificultad no deja la sesión corta ni con ejercicios repetidos', () => {
  const decision = decide(
    contextWith({
      recoveryInputs: recovery({ sleepHours: 7, energy: 3, muscleFatigue: 3, stress: 3, hydrationGlasses: 3 }),
      activities: [basketball()],
      recentSessions: [session()],
    }),
  )

  for (const proposal of [decision.primary, ...decision.alternatives]) {
    const exercises = proposal.session?.exercises ?? []
    if (exercises.length === 0) continue
    const ids = exercises.map((exercise) => exercise.exerciseId)
    assert.equal(new Set(ids).size, ids.length, `${proposal.label} repite ejercicios`)
    assert.ok(exercises.length >= 3, `${proposal.label} solo trae ${exercises.length} ejercicios`)
  }
})

test('una sesión ligera elige variantes más accesibles', () => {
  const light = decide(
    contextWith({
      recoveryInputs: recovery({ sleepHours: 7, energy: 3, muscleFatigue: 3, stress: 3, hydrationGlasses: 3 }),
      recentSessions: [session()],
    }),
  )
  assert.equal(light.primary.type, 'LIGHT_TRAINING')

  const difficulties = (light.primary.session?.exercises ?? []).map(
    (planned) => findExercise(planned.exerciseId)?.difficulty ?? 0,
  )
  assert.ok(difficulties.length > 0)
  assert.ok(
    difficulties.every((difficulty) => difficulty <= 2),
    `una sesión ligera no debería traer dificultad alta: ${difficulties.join(', ')}`,
  )
})

// ---------------------------------------------------------------------------
// Alternativas y explicación
// ---------------------------------------------------------------------------

test('toda propuesta explica por qué', () => {
  const decision = decide(contextWith({ recentSessions: [session()] }))
  for (const proposal of [decision.primary, ...decision.alternatives]) {
    assert.ok(proposal.reason.length > 10, `razón vacía en ${proposal.type}`)
    assert.ok(proposal.headline.length > 0)
    assert.ok(proposal.label.length > 0)
  }
})

test('una propuesta de entrenamiento ofrece alternativas, incluida la de recuperar', () => {
  const decision = decide(contextWith({ recentSessions: [session()] }))
  assert.ok(decision.alternatives.length >= 2)
  assert.ok(decision.alternatives.some((alternative) => alternative.type === 'RECOVERY'))
})

test('un día de recuperación ofrece igualmente una alternativa suave', () => {
  const decision = decide(
    contextWith({ recoveryInputs: recovery({ muscleFatigue: 5 }) }),
  )
  assert.equal(decision.primary.type, 'RECOVERY')
  assert.ok(decision.alternatives.length >= 1)
  assert.ok(decision.alternatives.every((alternative) => alternative.session !== null))
})

test('las alternativas de entrenamiento traen una sesión concreta', () => {
  const decision = decide(contextWith({ recentSessions: [session()] }))
  for (const alternative of decision.alternatives) {
    if (isTrainingRecommendation(alternative.type)) {
      assert.ok(alternative.session, `${alternative.label} debería traer sesión`)
      assert.ok(alternative.session!.exercises.length > 0)
    }
  }
})

test('cada propuesta tiene un identificador propio', () => {
  const decision = decide(contextWith({ recentSessions: [session()] }))
  const ids = [decision.primary, ...decision.alternatives].map((proposal) => proposal.id)
  assert.equal(new Set(ids).size, ids.length)
})

// ---------------------------------------------------------------------------
// Qué regla decidió
// ---------------------------------------------------------------------------

test('cada propuesta dice qué regla la decidió', () => {
  const good = decide(contextWith({ recentSessions: [session()] }))
  assert.equal(good.primary.rule, 'good_recovery')

  const low = decide(contextWith({ recoveryInputs: recovery({ sleepHours: 3, energy: 1, muscleFatigue: 5, stress: 5 }) }))
  assert.equal(low.primary.rule, 'low_recovery')

  const unknown = decide(contextWith({ recoveryInputs: null }))
  assert.equal(unknown.primary.rule, 'unknown_recovery')

  const rested = decide(contextWith({ profile: profile({ availableWeekdays: [1, 3, 5] }) }))
  assert.equal(rested.primary.rule, 'not_available_today')

  // Las alternativas no las decide una regla: dicen por qué existen.
  for (const alternative of [...good.alternatives, ...rested.alternatives]) {
    assert.match(alternative.rule, /^alternative_/, alternative.label)
  }
})
