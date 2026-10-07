/**
 * AXIS y el test de evolución (D-021, bloque 3): hechos del día, disponibilidad,
 * actividad sin carga inventada y respuestas solo cuando el usuario pregunta.
 * Reloj fijo: lunes 7 de septiembre de 2026, 10:00.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { interruptAssessment, recordResult } from '../assessment/assessment'
import { at, completed, started } from '../assessment/test-fixtures'
import type { Assessment } from '../assessment/types'
import type { ExperienceLevel, ScheduledActivity, UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import { computeTrainingLoad } from '../workouts/load'
import type { WorkoutSession } from '../workouts/types'
import { assessmentStatusFor } from './assessment'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { assessmentEntryReason } from './conversation/assessment-answer'
import { answerFromBriefing } from './conversation/deterministic'
import { decide } from './engine'
import { deriveFacts } from './facts'

const NOW = new Date(2026, 8, 7, 10, 0)
const TODAY = '2026-09-07'
const TOMORROW = '2026-09-08'

function profile(patch: Partial<UserProfile> = {}): UserProfile {
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
    ...patch,
  }
}

const GOOD: RecoveryInputs = {
  dayKey: TODAY,
  sleepHours: 9,
  energy: 4,
  muscleFatigue: 2,
  stress: 2,
  hydrationGlasses: 6,
  updatedAt: '2026-09-07T08:00:00.000Z',
}
const LOW: RecoveryInputs = { ...GOOD, sleepHours: 4, energy: 1, muscleFatigue: 4, stress: 5, hydrationGlasses: 1 }

function session(dayKey: string): WorkoutSession {
  return {
    id: `s-${dayKey}`,
    dayKey,
    startedAt: `${dayKey}T18:00:00.000Z`,
    completedAt: `${dayKey}T19:00:00.000Z`,
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda'],
    exercises: [],
    totalVolumeKg: 0,
    status: 'completed',
    perceivedEffort: 3,
    proposal: null,
    modifications: [],
    notes: null,
  }
}

function match(date: string | null, weekday = 0): ScheduledActivity {
  return {
    id: `m-${date ?? weekday}`,
    name: 'Partido',
    weekday: weekday as ScheduledActivity['weekday'],
    date,
    startMinute: null,
    endMinute: null,
    intensity: 'alta',
    loadsMuscleGroups: ['piernas'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
}

type Setup = {
  profile?: UserProfile
  recovery?: RecoveryInputs | null
  sessions?: WorkoutSession[]
  activities?: ScheduledActivity[]
  assessments?: Assessment[]
}

function setup(options: Setup = {}) {
  const sessions = options.sessions ?? [session('2026-09-05')]
  const context = buildAxisContext({
    profile: options.profile ?? profile(),
    recoveryInputs: options.recovery === undefined ? GOOD : options.recovery,
    recentSessions: sessions,
    activities: options.activities ?? [],
    assessments: options.assessments ?? [],
    now: NOW,
  })
  const decision = decide(context)
  const facts = deriveFacts(context)
  const briefing = buildBriefing(context, decision, sessions, decision.primary)
  return { context, decision, facts, briefing, status: assessmentStatusFor(context, facts, decision) }
}

const OLD_TEST = completed('2026-08-01') // 37 días antes
const RECENT_TEST = completed('2026-08-20') // 18 días antes

function interruptedToday(): Assessment {
  const outcome = interruptAssessment(recordResult(started(TODAY), 14, at(TODAY)), at(TODAY))
  if (outcome.kind !== 'interrupted') throw new Error('debería quedar interrumpido')
  return outcome.assessment
}

// ---------------------------------------------------------------------------
// 1–2. Disponibilidad
// ---------------------------------------------------------------------------

test('disponible: 28 días o más, recuperación suficiente, sin entrenar y sin deporte exigente', () => {
  const { status, briefing } = setup({ assessments: [OLD_TEST] })
  assert.deepEqual(status.reasons, [])
  assert.equal(status.status, 'available')
  assert.equal(status.lastCompletedDay, '2026-08-01')
  assert.equal(status.nextEligibleDay, '2026-08-29')
  assert.equal(briefing.assessment.status, 'available')
})

test('sin ningún test anterior también está disponible: será el primero', () => {
  const { status } = setup()
  assert.equal(status.status, 'available')
  assert.equal(status.lastCompletedDay, null)
  assert.equal(status.nextEligibleDay, null)
})

test('no disponible antes de 28 días desde el último test completado', () => {
  const { status } = setup({ assessments: [RECENT_TEST] })
  assert.deepEqual(status.reasons, ['too_soon'])
  assert.equal(status.nextEligibleDay, '2026-09-17')
})

test('no disponible con recuperación baja', () => {
  assert.ok(setup({ recovery: LOW, assessments: [OLD_TEST] }).status.reasons.includes('recovery_low'))
})

test('no disponible con un deporte exigente hoy', () => {
  assert.ok(setup({ activities: [match(TODAY)], assessments: [OLD_TEST] }).status.reasons.includes('demanding_activity_today'))
})

test('no disponible con un deporte exigente mañana', () => {
  assert.ok(setup({ activities: [match(TOMORROW, 1)], assessments: [OLD_TEST] }).status.reasons.includes('demanding_activity_tomorrow'))
})

test('no disponible si hoy ya hay un entrenamiento', () => {
  const { status } = setup({ sessions: [session(TODAY)], assessments: [OLD_TEST] })
  assert.ok(status.reasons.includes('trained_today'))
})

// ---------------------------------------------------------------------------
// 3–5. Hechos del día
// ---------------------------------------------------------------------------

test('test completado hoy', () => {
  const { facts } = setup({ assessments: [completed(TODAY)] })
  assert.deepEqual(
    [facts.assessmentCompletedToday, facts.assessmentInProgressToday, facts.assessmentInterruptedToday],
    [true, false, false],
  )
})

test('test en curso hoy: se reanuda, no se ofrece otro', () => {
  const ongoing = recordResult(started(TODAY), 14, at(TODAY))
  const { facts, status } = setup({ assessments: [ongoing] })
  assert.equal(facts.assessmentInProgressToday, true)
  assert.equal(status.status, 'in_progress')
})

test('test interrumpido hoy', () => {
  const { facts } = setup({ assessments: [interruptedToday()] })
  assert.equal(facts.assessmentInterruptedToday, true)
  assert.equal(facts.assessmentCompletedToday, false)
})

test('los tests de otro día no son hechos de hoy', () => {
  const { facts } = setup({ assessments: [completed('2026-09-06')] })
  assert.equal(facts.assessmentCompletedToday, false)
})

// ---------------------------------------------------------------------------
// 6–7. Actividad del día, sin carga inventada
// ---------------------------------------------------------------------------

test('un test completado hoy cuenta como actividad: AXIS no propone otro entrenamiento', () => {
  const { decision } = setup({ assessments: [completed(TODAY)] })
  assert.equal(decision.primary.type, 'REST')
  const factor = decision.primary.factors.find((item) => item.key === 'assessment_today')
  assert.ok(factor)
  assert.match(factor.detail, /test de evolución/)
})

test('un test interrumpido hoy también cuenta como actividad', () => {
  assert.equal(setup({ assessments: [interruptedToday()] }).decision.primary.type, 'REST')
})

test('un test a medias de hoy todavía no es actividad: se puede reanudar', () => {
  const ongoing = recordResult(started(TODAY), 14, at(TODAY))
  assert.notEqual(setup({ assessments: [ongoing] }).decision.primary.type, 'REST')
})

test('tras el test, «quiero entrenar» no consigue una sesión', () => {
  const { briefing } = setup({ assessments: [completed(TODAY)] })
  const answer = answerFromBriefing('quiero entrenar igualmente', briefing, { lastIntent: null, changeMode: true, lastChangeRequest: null })
  assert.equal(answer.verdict, 'decline')
  assert.equal(answer.proposedTarget ?? null, null)
})

test('el test no inventa carga: la Carga y el resumen semanal son los mismos con o sin tests', () => {
  const sessions = [session('2026-09-05'), session('2026-09-03')]
  const without = setup({ sessions })
  const withTests = setup({ sessions, assessments: [completed(TODAY), completed('2026-08-01')] })
  assert.deepEqual(withTests.briefing.load, without.briefing.load)
  assert.deepEqual(withTests.briefing.week, without.briefing.week)
  assert.deepEqual(computeTrainingLoad(sessions, TODAY), computeTrainingLoad(sessions, TODAY))
  assert.equal(withTests.facts.trainedToday, false, 'un test no es una sesión de entrenamiento')
  assert.deepEqual(withTests.facts.recentMuscleGroups, without.facts.recentMuscleGroups)
})

// ---------------------------------------------------------------------------
// 8–9. Conversación: solo si se pregunta
// ---------------------------------------------------------------------------

test('AXIS no menciona el test si no se le pregunta, aunque esté disponible', () => {
  const { briefing, decision } = setup({ assessments: [OLD_TEST] })
  assert.equal(briefing.assessment.status, 'available')
  assert.doesNotMatch(`${decision.primary.headline} ${decision.primary.reason}`, /\btest/i)
  for (const question of [
    '¿qué toca hoy?',
    '¿por qué?',
    '¿cómo voy esta semana?',
    '¿qué tal mi recuperación?',
    'quiero cambiar el entrenamiento',
    'hoy no puedo entrenar',
    'ayer no pude entrenar',
    '¿qué tienes en cuenta?',
    'contesta rápido, ¿qué hago hoy?',
  ]) {
    const answer = answerFromBriefing(question, briefing)
    assert.notEqual(answer.intent, 'assessment', question)
    assert.doesNotMatch(answer.text, /\btest/i, question)
  }
})

test('«¿Puedo hacer el test?» responde con la disponibilidad real', () => {
  const available = answerFromBriefing('¿Puedo hacer el test?', setup({ assessments: [OLD_TEST] }).briefing)
  assert.equal(available.intent, 'assessment')
  assert.match(available.text, /^Sí, hoy puedes hacer el test\. El anterior fue el sábado 1 de agosto\./)

  const soon = answerFromBriefing('¿Cuándo puedo hacer el test?', setup({ assessments: [RECENT_TEST] }).briefing)
  assert.match(soon.text, /Hoy no puedes hacer el test\./)
  assert.match(soon.text, /a partir del jueves 17 de septiembre/)

  const first = answerFromBriefing('¿está disponible mi test?', setup().briefing)
  assert.match(first.text, /Sería tu primer test/)
})

test('«¿Cómo funciona el test?» describe el protocolo; un seguimiento sigue hablando del test', () => {
  const { briefing } = setup()
  const how = answerFromBriefing('¿Cómo funciona el test?', briefing)
  assert.match(how.text, /4 pruebas/)
  assert.match(how.text, /plancha/)
  assert.match(how.text, /remo unilateral con la pesa de 5 kg/)

  const followUp = answerFromBriefing('¿y cuándo me toca repetirlo?', briefing, { lastIntent: 'assessment', changeMode: false, lastChangeRequest: null })
  assert.equal(followUp.intent, 'assessment')
})

test('el protocolo nombra la variante del primer test entera: «flexiones estándar», nunca «son flexiones»', () => {
  const howFor = (experience: ExperienceLevel) =>
    answerFromBriefing('¿Cómo funciona el test?', setup({ profile: profile({ experience }) }).briefing).text

  assert.match(howFor('intermedio'), /Para el primero, por tu nivel, tocan flexiones estándar\./)
  assert.match(howFor('principiante'), /Para el primero, por tu nivel, tocan flexiones inclinadas\./)
  assert.doesNotMatch(howFor('intermedio'), /son flexiones\./)
})

test('sin preguntar por el test, «¿cuándo me toca repetirlo?» no habla del test', () => {
  const answer = answerFromBriefing('¿cuándo me toca repetirlo?', setup().briefing)
  assert.notEqual(answer.intent, 'assessment')
})

test('responder sobre el test hecho hoy, a medias o interrumpido', () => {
  assert.match(answerFromBriefing('¿puedo hacer el test?', setup({ assessments: [completed(TODAY)] }).briefing).text, /Ya has hecho el test hoy/)
  const ongoing = recordResult(started(TODAY), 14, at(TODAY))
  assert.match(answerFromBriefing('¿puedo hacer el test?', setup({ assessments: [ongoing] }).briefing).text, /continuarlo/)
  assert.match(answerFromBriefing('¿puedo hacer el test?', setup({ assessments: [interruptedToday()] }).briefing).text, /no cuenta como comparación/)
})

// ---------------------------------------------------------------------------
// 10. Descanso del motor
// ---------------------------------------------------------------------------

test('si el motor decide descansar, el test no está disponible y el motivo es el del motor', () => {
  const { status, briefing, decision } = setup({ profile: profile({ availableWeekdays: [2, 3] }), assessments: [OLD_TEST] })
  assert.equal(decision.primary.type, 'REST')
  assert.ok(status.reasons.includes('axis_rest'))
  const answer = answerFromBriefing('¿puedo hacer el test?', briefing)
  assert.match(answer.text, /Hoy toca descansar/)
  assert.ok(answer.text.toLowerCase().includes(decision.primary.reason.slice(1, 20).toLowerCase()))
})

test('elegir descansar uno mismo no es la decisión del motor: no bloquea el test', () => {
  const { context, decision, facts } = setup({ assessments: [OLD_TEST] })
  const recovery = decision.alternatives.find((item) => item.type === 'RECOVERY')
  assert.ok(recovery)
  // Aunque el usuario haya elegido la recuperación, el motor proponía entrenar.
  const briefing = buildBriefing(context, decision, [], recovery)
  assert.equal(briefing.assessment.status, 'available')
  assert.equal(assessmentStatusFor(context, facts, decision).status, 'available')
})

// ---------------------------------------------------------------------------
// 12. Variante de flexiones
// ---------------------------------------------------------------------------

test('variante del primer test: principiante → inclinadas; intermedio y avanzado → estándar', () => {
  const variantFor = (experience: ExperienceLevel) => setup({ profile: profile({ experience }) }).briefing.assessment.pushUp
  assert.deepEqual(variantFor('principiante'), { name: 'Flexiones inclinadas', fixed: false })
  assert.deepEqual(variantFor('intermedio'), { name: 'Flexiones', fixed: false })
  assert.deepEqual(variantFor('avanzado'), { name: 'Flexiones', fixed: false })
})

test('después del primer test, la variante es la fijada, no la del nivel', () => {
  const diamond = completed('2026-08-01', undefined, 'flexiones-diamante')
  const pushUp = setup({ profile: profile({ experience: 'principiante' }), assessments: [diamond] }).briefing.assessment.pushUp
  assert.deepEqual(pushUp, { name: 'Flexiones diamante', fixed: true })
})

// ---------------------------------------------------------------------------
// 13. Información insuficiente
// ---------------------------------------------------------------------------

test('sin recuperación registrada no se da por disponible', () => {
  const { status, briefing } = setup({ recovery: null, assessments: [OLD_TEST] })
  assert.notEqual(status.status, 'available')
  assert.ok(status.reasons.includes('recovery_unknown'))
  assert.match(answerFromBriefing('¿puedo hacer el test?', briefing).text, /Regístrala y lo miro/)
})

test('sin decisión del motor tampoco: no se sabe si hoy toca descansar', () => {
  const context = buildAxisContext({ profile: profile(), recoveryInputs: GOOD, recentSessions: [], activities: [], now: NOW })
  assert.equal(buildBriefing(context, null, []).assessment.status, 'unavailable')
})

test('sin perfil no se recomienda ninguna variante', () => {
  const context = buildAxisContext({ profile: null, recoveryInputs: GOOD, recentSessions: [], activities: [], now: NOW })
  assert.equal(buildBriefing(context, decide(context), []).assessment.pushUp, null)
})

// ---------------------------------------------------------------------------
// Bloque 4: el texto de la entrada en Entrenamiento
// ---------------------------------------------------------------------------

test('la entrada no explica nada si se puede hacer, si aún no tocan los 28 días o si ya se hizo hoy', () => {
  assert.equal(assessmentEntryReason(setup({ assessments: [OLD_TEST] }).briefing.assessment), null)
  assert.equal(assessmentEntryReason(setup({ assessments: [RECENT_TEST] }).briefing.assessment), null, 'sin contador')
  assert.equal(assessmentEntryReason(setup({ assessments: [completed(TODAY)] }).briefing.assessment), null)
  assert.equal(assessmentEntryReason(setup({ assessments: [interruptedToday()] }).briefing.assessment), null)
})

test('si ya tocaría pero hoy no se puede, la entrada da el motivo del dominio', () => {
  assert.equal(assessmentEntryReason(setup({ recovery: LOW, assessments: [OLD_TEST] }).briefing.assessment), 'Tu recuperación de hoy es baja.')
  assert.equal(
    assessmentEntryReason(setup({ recovery: null, assessments: [OLD_TEST] }).briefing.assessment),
    'Registra tu recuperación de hoy para poder hacerlo.',
  )
  assert.equal(assessmentEntryReason(setup({ sessions: [session(TODAY)], assessments: [OLD_TEST] }).briefing.assessment), 'Hoy ya has entrenado.')
})
