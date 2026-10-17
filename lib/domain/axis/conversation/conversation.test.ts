import assert from 'node:assert/strict'
import test from 'node:test'

import type { ScheduledActivity, UserProfile } from '../../profile/types'
import type { RecoveryInputs } from '../../recovery/types'
import { minutesFromMidnight } from '../../shared/dates'
import type { WorkoutSession } from '../../workouts/types'
import { buildBriefing } from '../briefing'
import { buildAxisContext } from '../context'
import { decide } from '../engine'
import type { AxisAiTransport } from './ai'
import { createAxisConversation, fallbackNoticeOf } from './index'
import { answerFromBriefing, suggestionsFor } from './deterministic'
import { detectIntent } from './intents'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const MONDAY_KEY = '2026-09-07'
const SUNDAY_KEY = '2026-09-06'

function profile(partial: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals: ['fuerza', 'rendimiento_deportivo'],
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
    dayKey: SUNDAY_KEY,
    startedAt: '2026-09-06T18:00:00.000Z',
    completedAt: '2026-09-06T19:00:00.000Z',
    durationSeconds: 3600,
    focus: 'tren_superior',
    title: 'Fuerza · Tren superior',
    intensity: 'moderada',
    muscleGroups: ['pecho', 'espalda'],
    exercises: [],
    totalVolumeKg: 720,
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

function briefingWith(
  overrides: Partial<Parameters<typeof buildAxisContext>[0]> = {},
  sessions: WorkoutSession[] = [],
) {
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: sessions,
    activities: [],
    now: MONDAY,
    ...overrides,
  })
  return { briefing: buildBriefing(context, decide(context), sessions), context }
}

// ---------------------------------------------------------------------------
// Construcción del contexto
// ---------------------------------------------------------------------------

test('el briefing recoge perfil, recuperación, carga y propuesta reales', () => {
  const { briefing } = briefingWith({}, [session()])

  assert.equal(briefing.profile?.name, 'Alex')
  assert.deepEqual(briefing.profile?.goals, ['fuerza', 'rendimiento_deportivo'])
  assert.equal(briefing.recovery.known, true)
  assert.equal(briefing.load.known, true)
  assert.ok(briefing.proposal)
  assert.ok(briefing.lastSession)
})

test('el briefing marca como desconocido lo que no se ha registrado', () => {
  const { briefing } = briefingWith({ recoveryInputs: null })

  assert.equal(briefing.recovery.known, false)
  assert.equal(briefing.load.known, false, 'sin sesiones no hay carga')
  assert.equal(briefing.lastSession, null)
  assert.equal(briefing.week.sessionCount, 0)
})

test('el briefing no inventa un perfil que no existe', () => {
  const { briefing } = briefingWith({ profile: null })
  assert.equal(briefing.profile, null)
})

test('el Recovery Score del briefing es el que calcula el dominio', () => {
  const { briefing, context } = briefingWith()
  assert.equal(briefing.recovery.known, true)
  if (briefing.recovery.known && context.recoveryScore?.status === 'ok') {
    assert.equal(briefing.recovery.value, context.recoveryScore.value)
  }
})

// ---------------------------------------------------------------------------
// Coherencia con el AXIS determinista
// ---------------------------------------------------------------------------

test('«qué hago hoy» responde exactamente la propuesta de Inicio', () => {
  const { briefing, context } = briefingWith({}, [session()])
  const decision = decide(context)
  const answer = answerFromBriefing('¿Qué debería hacer hoy?', briefing)

  assert.equal(answer.intent, 'today')
  assert.equal(answer.unknown, false)
  assert.ok(
    answer.text.startsWith(briefing.proposal!.headline),
    'la respuesta debe abrir con el mismo titular que muestra Inicio',
  )
  assert.equal(briefing.proposal!.headline, decision.primary.headline)
})

test('«por qué» explica con los mismos factores que decidieron', () => {
  const { briefing } = briefingWith({ activities: [basketball()] })
  const answer = answerFromBriefing('¿Por qué me recomiendas esto?', briefing)

  assert.equal(answer.intent, 'why')
  assert.match(answer.text, /baloncesto/i)
})

test('si AXIS recomienda no entrenar, la conversación dice lo mismo', () => {
  const { briefing } = briefingWith({ recoveryInputs: recovery({ muscleFatigue: 5 }) })
  const answer = answerFromBriefing('¿Qué debería hacer hoy?', briefing)

  assert.equal(briefing.proposal?.type, 'RECOVERY')
  assert.match(answer.text, /recupera/i)
})

// ---------------------------------------------------------------------------
// No inventar
// ---------------------------------------------------------------------------

test('sin recuperación registrada, AXIS dice que no puede calcularla', () => {
  const { briefing } = briefingWith({ recoveryInputs: null })
  const answer = answerFromBriefing('¿Cómo estoy recuperando?', briefing)

  assert.equal(answer.unknown, true)
  assert.match(answer.text, /no puedo calcular/i)
  assert.ok(!/\d+ sobre 100/.test(answer.text), 'no debe aparecer ninguna puntuación')
})

test('sin historial, AXIS no se inventa un último entrenamiento', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Qué hice en mi último entrenamiento?', briefing)

  assert.equal(answer.unknown, true)
  assert.match(answer.text, /todavía no tengo/i)
})

test('sin deportes registrados, AXIS no inventa un partido', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Tengo baloncesto hoy?', briefing)

  assert.equal(answer.intent, 'sport_today')
  assert.equal(answer.unknown, true)
  assert.match(answer.text, /no tienes ning[uú]n deporte registrado/i)
})

test('una pregunta fuera de ámbito recibe la respuesta acordada', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Cuál es la capital de Francia?', briefing)

  assert.equal(answer.intent, 'out_of_scope')
  assert.equal(answer.unknown, true)
  assert.match(answer.text, /queda fuera de lo que puedo ayudarte a decidir/i)
  assert.match(answer.text, /entrenamiento/i)
})

test('AXIS no opina sobre salud ni diagnostica', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Me he lesionado la rodilla?', briefing)

  assert.equal(answer.intent, 'medical')
  assert.equal(answer.unknown, true)
  assert.match(answer.text, /no soy m[eé]dico/i)
})

test('«me molesta» también es una molestia: respuesta segura, sin tocar el entrenamiento', () => {
  const { briefing } = briefingWith()
  for (const question of [
    'Me molesta el hombro',
    'Me molestan las rodillas',
    'Las flexiones con rodillas me molestan',
    'Tengo molestias en la espalda',
    'El hombro me molesta un poco cuando hago press',
  ]) {
    const answer = answerFromBriefing(question, briefing)
    assert.equal(answer.intent, 'medical', question)
    assert.ok(!answer.proposedTarget && !answer.proposedEffect, question)
    assert.match(answer.text, /no soy m[eé]dico/i, question)
  }
})

// ---------------------------------------------------------------------------
// Respuestas con datos
// ---------------------------------------------------------------------------

test('la recuperación se responde con el valor real', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Cómo estoy recuperando?', briefing)

  assert.equal(answer.unknown, false)
  if (briefing.recovery.known) {
    assert.match(answer.text, new RegExp(`${briefing.recovery.value} sobre 100`))
  }
})

test('el último entrenamiento se responde con lo que se guardó', () => {
  const { briefing } = briefingWith({}, [session()])
  const answer = answerFromBriefing('¿Qué hice ayer?', briefing)

  assert.equal(answer.unknown, false)
  assert.match(answer.text, /Fuerza · Tren superior/)
})

test('los objetivos múltiples se nombran todos, sin priorizar ninguno', () => {
  const { briefing } = briefingWith()
  const answer = answerFromBriefing('¿Cuáles son mis objetivos?', briefing)

  assert.match(answer.text, /fuerza/i)
  assert.match(answer.text, /rendimiento deportivo/i)
  assert.match(answer.text, /sin dar prioridad/i)
})

// ---------------------------------------------------------------------------
// Intenciones
// ---------------------------------------------------------------------------

test('las preguntas típicas se clasifican bien, con y sin acentos', () => {
  assert.equal(detectIntent('¿Qué debería hacer hoy?'), 'today')
  assert.equal(detectIntent('que deberia hacer hoy'), 'today')
  assert.equal(detectIntent('¿Por qué esta sesión?'), 'why')
  assert.equal(detectIntent('porque me recomiendas esto'), 'why')
  assert.equal(detectIntent('¿Cómo estoy recuperando?'), 'recovery')
  assert.equal(detectIntent('¿Qué hice en mi último entrenamiento?'), 'last_session')
  assert.equal(detectIntent('¿Qué llevo esta semana?'), 'week')
  assert.equal(detectIntent('¿Tengo deporte hoy?'), 'sport_today')
  assert.equal(detectIntent('¿Qué tienes en cuenta para decidir?'), 'factors')
  assert.equal(detectIntent('Estoy cansado, ¿qué hago?'), 'tired')
  assert.equal(detectIntent('Quiero cambiar el entrenamiento de hoy'), 'change')
  assert.equal(detectIntent(''), 'unknown')
})

// ---------------------------------------------------------------------------
// Sugerencias
// ---------------------------------------------------------------------------

test('solo se sugiere lo que AXIS puede responder con los datos de ahora', () => {
  const vacio = briefingWith({ recoveryInputs: null }).briefing
  const conDatos = briefingWith({}, [session()]).briefing

  assert.ok(!suggestionsFor(vacio).some((s) => s.label.includes('última vez')))
  assert.ok(suggestionsFor(conDatos).some((s) => s.label.includes('última vez')))
  assert.ok(suggestionsFor(conDatos).length <= 4)
})

// ---------------------------------------------------------------------------
// Proveedor de IA
// ---------------------------------------------------------------------------

function transport(overrides: Partial<AxisAiTransport> = {}): AxisAiTransport {
  return {
    isConfigured: () => true,
    send: async () => ({ text: 'Respuesta del modelo.' }),
    ...overrides,
  }
}

test('sin proveedor configurado responde el motor determinista', async () => {
  const { briefing } = briefingWith({}, [session()])
  const conversation = createAxisConversation({ aiEndpoint: null })
  const result = await conversation.ask('¿Qué debería hacer hoy?', briefing)

  assert.match(result.engineId, /deterministic/)
  assert.equal(result.usedFallback, false, 'no es un fallback: es el modo normal')
  assert.equal(result.intent, 'today')
})

test('con proveedor configurado, el modelo redacta las preguntas que lo merecen', async () => {
  const { briefing } = briefingWith({}, [session()])
  const conversation = createAxisConversation({ transport: transport() })
  // «Por qué» pide una explicación: ahí una redacción natural aporta.
  const result = await conversation.ask('¿Por qué me propones esto hoy?', briefing)

  assert.equal(result.text, 'Respuesta del modelo.')
  assert.match(result.engineId, /ai/)
  assert.equal(result.usedFallback, false)
})

test('con una falta, AXIS responde lo mismo que bien escrito (D-026)', () => {
  const { briefing } = briefingWith({}, [session()])
  for (const [written, correct] of [
    ['estoy cansao', 'estoy cansado'],
    ['porqe me propones esto oy', 'por qué me propones esto hoy'],
    ['q tal la semnaa', 'qué tal la semana'],
  ]) {
    const typo = answerFromBriefing(written, briefing)
    const right = answerFromBriefing(correct, briefing)
    assert.equal(typo.intent, right.intent, written)
    assert.equal(typo.text, right.text, written)
  }
})

test('una pregunta mal escrita que merece redacción llega al modelo, tal como se escribió (D-026)', async () => {
  const { briefing } = briefingWith({}, [session()])
  const preguntas: string[] = []
  const conversation = createAxisConversation({
    transport: transport({
      send: async (request) => {
        preguntas.push(request.question)
        return { text: 'Respuesta del modelo.' }
      },
    }),
  })
  const result = await conversation.ask('porqe me propones esto oy', briefing)

  assert.match(result.engineId, /ai/)
  assert.deepEqual(preguntas, ['porqe me propones esto oy'], 'el modelo entiende las faltas: recibe el original')
})

test('D-027: las respuestas de datos las redacta el modelo, con las cifras del dominio', async () => {
  // Una sesión de esta semana, para que la semana tenga datos; 1.250 kg lleva punto de millares.
  const today = session({
    id: 'session-2',
    dayKey: MONDAY_KEY,
    startedAt: '2026-09-07T06:00:00.000Z',
    completedAt: '2026-09-07T07:00:00.000Z',
    totalVolumeKg: 1250,
  })
  const { briefing } = briefingWith({}, [session(), today])
  const dominios: string[] = []
  const conversation = createAxisConversation({
    transport: transport({
      // Un modelo que copia el texto del dominio: conserva todas las cifras.
      send: async (request) => {
        dominios.push(request.domain.intent)
        return { text: request.domain.text }
      },
    }),
  })

  for (const [pregunta, intent] of [
    ['¿Cómo estoy recuperando?', 'recovery'],
    ['¿Cómo va mi carga?', 'load'],
    ['¿Qué entrené ayer?', 'last_session'],
    ['¿Qué tal la semana?', 'week'],
  ]) {
    const result = await conversation.ask(pregunta, briefing)
    assert.equal(result.intent, intent, pregunta)
    assert.match(result.engineId, /ai/, pregunta)
    assert.equal(result.usedFallback, false, pregunta)
  }
  assert.deepEqual(dominios, ['recovery', 'load', 'last_session', 'week'])
})

test('D-027: si el modelo se deja una cifra de una respuesta de datos, responde el determinista', async () => {
  const { briefing } = briefingWith({}, [session()])
  const conversation = createAxisConversation({
    transport: transport({ send: async () => ({ text: 'Tu carga va bien, sin nada que destacar.' }) }),
  })
  const result = await conversation.ask('¿Cómo va mi carga?', briefing)

  assert.match(result.engineId, /deterministic/)
  assert.equal(result.usedFallback, true)
  assert.equal(result.rejectedReason, 'omitted_number')
  assert.match(result.text, /d/, 'el texto del dominio, con sus cifras')
})

test('D-027: una respuesta de datos sin datos no gasta una llamada al modelo', async () => {
  const { briefing } = briefingWith({}, [])
  let llamadas = 0
  const conversation = createAxisConversation({
    transport: transport({
      send: async () => {
        llamadas += 1
        return { text: 'Respuesta del modelo.' }
      },
    }),
  })

  for (const pregunta of ['¿Qué entrené ayer?', '¿Qué tal la semana?', '¿Cómo va mi carga?']) {
    const result = await conversation.ask(pregunta, briefing)
    assert.match(result.engineId, /deterministic/, pregunta)
  }
  assert.equal(llamadas, 0)
})

test('lo que decide, lo médico, el test y el escáner no gastan una llamada al modelo', async () => {
  const { briefing } = briefingWith({}, [session()])
  let llamadas = 0
  const conversation = createAxisConversation({
    transport: transport({
      send: async () => {
        llamadas += 1
        return { text: 'Respuesta del modelo.' }
      },
    }),
  })

  for (const pregunta of [
    '¿Qué entrenamiento tengo hoy?',
    'Me duele la rodilla',
    '¿Cuándo me toca el test?',
    '¿Qué tal mi escaneo?',
  ]) {
    const result = await conversation.ask(pregunta, briefing)
    assert.match(result.engineId, /deterministic/, pregunta)
    assert.equal(result.usedFallback, false, pregunta)
  }

  assert.equal(llamadas, 0)
})

test('lo médico y lo ajeno a AXTHLETICS nunca pasan por el modelo', async () => {
  const { briefing } = briefingWith({}, [session()])
  let llamadas = 0
  const conversation = createAxisConversation({
    transport: transport({
      send: async () => {
        llamadas += 1
        return { text: 'Respuesta del modelo.' }
      },
    }),
  })

  await conversation.ask('me duele la rodilla', briefing)
  await conversation.ask('¿cuál es la capital de Francia?', briefing)

  assert.equal(llamadas, 0, 'ahí la redacción no aporta y el riesgo sí')
})

test('si el proveedor falla, AXIS responde igualmente con el determinista', async () => {
  const { briefing } = briefingWith({}, [session()])
  const conversation = createAxisConversation({
    transport: transport({
      send: async () => {
        throw new Error('502 del proveedor')
      },
    }),
  })

  const result = await conversation.ask('¿Por qué me propones esto hoy?', briefing)

  assert.equal(result.usedFallback, true)
  assert.match(result.engineId, /deterministic/)
  assert.ok(result.text.startsWith(briefing.proposal!.headline))
})

test('una respuesta vacía del proveedor también cae al determinista', async () => {
  const { briefing } = briefingWith({}, [session()])
  const conversation = createAxisConversation({
    transport: transport({ send: async () => ({ text: '   ' }) }),
  })

  const result = await conversation.ask('¿Por qué me propones esto hoy?', briefing)
  assert.equal(result.usedFallback, true)
  assert.equal(result.intent, 'why')
})

test('solo se avisa de «sin conexión» cuando de verdad no hay red', async () => {
  const { briefing } = briefingWith({}, [session()])
  const caida = createAxisConversation({
    transport: transport({
      send: async () => {
        throw new Error('403 FORBIDDEN')
      },
    }),
  })
  const fallo = await caida.ask('¿Por qué me propones esto hoy?', briefing)

  assert.equal(fallbackNoticeOf(fallo, false), 'offline')
  assert.equal(fallbackNoticeOf(fallo, true), 'local', 'con red, un rechazo no es «sin conexión»')

  const descartada = createAxisConversation({
    transport: transport({ send: async () => ({ text: '   ' }) }),
  })
  const filtrada = await descartada.ask('¿Por qué me propones esto hoy?', briefing)
  assert.equal(fallbackNoticeOf(filtrada, false), 'local', 'el modelo respondió: había red')

  const local = await caida.ask('¿Qué entrenamiento tengo hoy?', briefing)
  assert.equal(fallbackNoticeOf(local, false), null, 'lo que responde siempre el determinista no es un fallback')
})

test('el transporte HTTP se declara no configurado sin endpoint', async () => {
  const conversation = createAxisConversation({ aiEndpoint: null })
  const { briefing } = briefingWith()
  const result = await conversation.ask('¿Cómo estoy recuperando?', briefing)
  assert.match(result.engineId, /deterministic/)
})

// ---------------------------------------------------------------------------
// Deportes: días, intensidad y su efecto en la decisión
// ---------------------------------------------------------------------------

/** Un deporte se guarda como una actividad por cada día que se practica. */
function sportOn(
  name: string,
  weekdays: number[],
  intensity: 'baja' | 'media' | 'alta',
  loadsLegs = true,
): ScheduledActivity[] {
  return weekdays.map((weekday) => ({
    id: `${name}-${weekday}`,
    name,
    weekday: weekday as ScheduledActivity['weekday'],
    startMinute: null,
    endMinute: null,
    intensity,
    loadsMuscleGroups: loadsLegs ? ['piernas', 'gluteos'] : [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }))
}

test('los días de cada deporte llegan al contexto de AXIS', () => {
  const { context } = briefingWith({ activities: sportOn('Baloncesto', [0, 2, 3], 'alta') })
  assert.equal(context.activities.length, 3)
  assert.deepEqual(context.activities.map((activity) => activity.weekday).sort(), [0, 2, 3])
})

test('la intensidad de cada deporte llega al contexto', () => {
  const { context } = briefingWith({
    activities: [...sportOn('Baloncesto', [0], 'alta'), ...sportOn('Natacion', [5], 'media')],
  })
  const porNombre = new Map(context.activities.map((a) => [a.name, a.intensity]))
  assert.equal(porNombre.get('Baloncesto'), 'alta')
  assert.equal(porNombre.get('Natacion'), 'media')
})

test('el briefing agrupa las actividades en deportes con sus días', () => {
  const { briefing } = briefingWith({
    activities: [...sportOn('Baloncesto', [0, 2, 3], 'alta'), ...sportOn('Natacion', [5], 'media')],
  })

  const sports = briefing.profile?.sports ?? []
  assert.equal(sports.length, 2, 'tres días de baloncesto son un solo deporte')

  const basket = sports.find((sport) => sport.name === 'Baloncesto')
  assert.deepEqual(basket?.weekdays, [0, 2, 3])
  assert.equal(basket?.intensity, 'alta')
})

test('varios deportes el mismo día se consideran todos', () => {
  const { briefing } = briefingWith({
    activities: [...sportOn('Baloncesto', [0], 'alta'), ...sportOn('Natacion', [0], 'media', false)],
  })
  assert.equal(briefing.activitiesToday.length, 2)
})

test('un deporte exigente hoy cambia la decisión', () => {
  const sin = decide(briefingWith({}, [session()]).context)
  const con = decide(
    briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()]).context,
  )

  assert.equal(sin.primary.type, 'TRAINING')
  assert.equal(con.primary.type, 'MODIFIED_TRAINING')
  assert.match(con.primary.reason, /baloncesto/i)
})

test('un deporte exigente hoy evita cargar los grupos que ya trabaja', () => {
  const decision = decide(
    briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()]).context,
  )
  const groups = decision.primary.session?.muscleGroups ?? []
  assert.ok(!groups.includes('piernas'), `no debería cargar piernas: ${groups.join(', ')}`)
})

test('un deporte exigente mañana suaviza la sesión de hoy', () => {
  const decision = decide(
    briefingWith({ activities: sportOn('Baloncesto', [1], 'alta') }, [session()]).context,
  )
  assert.equal(decision.primary.type, 'LIGHT_TRAINING')
  assert.match(decision.primary.reason, /mañana/i)
})

test('un deporte suave no condiciona el entrenamiento', () => {
  const decision = decide(
    briefingWith({ activities: sportOn('Natacion', [0], 'baja', false) }, [session()]).context,
  )
  assert.equal(decision.primary.type, 'TRAINING')
})

test('sin hora registrada AXIS sabe que hay deporte pero no inventa una franja', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') })
  assert.equal(briefing.activitiesToday[0].window, null)

  const answer = answerFromBriefing('¿Tengo deporte hoy?', briefing)
  assert.match(answer.text, /baloncesto/i)
  assert.ok(!/\d{2}:\d{2}/.test(answer.text), 'no debe aparecer ninguna hora inventada')
})

// ---------------------------------------------------------------------------
// Conversación: explicar la decisión
// ---------------------------------------------------------------------------

test('AXIS explica por qué descartó el foco que el usuario pregunta', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('¿Y por qué no piernas?', briefing)

  assert.equal(answer.intent, 'why_not')
  assert.equal(answer.unknown, false)
  assert.match(answer.text, /baloncesto/i)
  assert.match(answer.text, /piernas/i)
})

test('AXIS enumera lo que ha tenido en cuenta, sin inventar factores', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('¿Qué tienes en cuenta para decidir?', briefing)

  assert.equal(answer.intent, 'factors')
  assert.match(answer.text, /recuperaci/i)
  assert.match(answer.text, /baloncesto/i)
})

test('preguntar cómo afecta el deporte responde con el deporte real', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('¿Cómo afecta mi baloncesto al entrenamiento?', briefing)

  assert.equal(answer.intent, 'sport_impact')
  assert.equal(answer.unknown, false)
  assert.match(answer.text, /baloncesto/i)
})

test('sin deporte, preguntar cómo afecta lo dice en vez de inventarlo', () => {
  const { briefing } = briefingWith({}, [session()])
  const answer = answerFromBriefing('¿Cómo afecta mi deporte al entrenamiento?', briefing)

  assert.equal(answer.unknown, true)
  assert.match(answer.text, /no tienes deporte registrado/i)
})

test('preguntar si se puede entrenar con deporte responde según la decisión real', () => {
  const conDeporte = briefingWith(
    { activities: sportOn('Baloncesto', [0], 'alta') },
    [session()],
  ).briefing
  const answer = answerFromBriefing('¿Puedo entrenar aunque tenga deporte esta tarde?', conDeporte)

  assert.equal(answer.intent, 'can_train')
  assert.match(answer.text, /^S[ií],/)
})

test('en día de recuperación, preguntar si se puede entrenar no dice que sí', () => {
  const { briefing } = briefingWith({ recoveryInputs: recovery({ muscleFatigue: 5 }) })
  const answer = answerFromBriefing('¿Puedo entrenar hoy?', briefing)

  assert.equal(briefing.proposal?.type, 'RECOVERY')
  assert.match(answer.text, /no te lo recomendar/i)
})

test('decir que estás cansado usa los datos si existen y lo admite si no', () => {
  const conDatos = answerFromBriefing('Estoy cansado, ¿qué hago?', briefingWith().briefing)
  assert.equal(conDatos.intent, 'tired')
  assert.equal(conDatos.unknown, false)
  assert.match(conDatos.text, /de recuperaci/i)

  const sinDatos = answerFromBriefing(
    'Estoy cansado, ¿qué hago?',
    briefingWith({ recoveryInputs: null }).briefing,
  )
  assert.equal(sinDatos.unknown, true)
  assert.match(sinDatos.text, /no tengo tu recuperaci/i)
})

test('pedir un cambio sin motivo no despliega un menú de opciones: AXIS pregunta por qué', () => {
  const { briefing } = briefingWith({}, [session()])
  const answer = answerFromBriefing('Quiero cambiar el entrenamiento de hoy', briefing)

  assert.equal(answer.intent, 'change')
  // Antes esto listaba las alternativas y el usuario elegía la que le apetecía.
  // Ahora AXIS pide el motivo, que es lo que le permite decidir.
  assert.match(answer.text, /qué quieres cambiar y por qué/i)
})

test('acortar la sesión parte de la duración real propuesta', () => {
  const { briefing } = briefingWith({}, [session()])
  const answer = answerFromBriefing('¿Y si hago solo 20 minutos?', briefing)

  assert.equal(answer.intent, 'shorten')
  assert.match(answer.text, new RegExp(`${briefing.proposal!.session!.estimatedMinutes} minutos`))
})

// ---------------------------------------------------------------------------
// Seguimiento
// ---------------------------------------------------------------------------

test('una pregunta corta de seguimiento se resuelve con lo hablado antes', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('¿Y eso?', briefing, { lastIntent: 'today' })

  assert.notEqual(answer.intent, 'unknown')
  assert.equal(answer.unknown, false)
})

test('nombrar solo un grupo muscular tras hablar de la sesión pregunta por él', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('piernas', briefing, { lastIntent: 'today' })
  assert.equal(answer.intent, 'why_not')
})

test('sin conversación previa, una pregunta suelta no se fuerza a un tema', () => {
  const { briefing } = briefingWith()
  assert.equal(answerFromBriefing('mmm', briefing).intent, 'unknown')
})

// ---------------------------------------------------------------------------
// Redacción: sin repeticiones ni frases mutiladas
// ---------------------------------------------------------------------------

test('una respuesta compuesta no repite el mismo hecho dos veces', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])
  const answer = answerFromBriefing('¿Y por qué no piernas?', briefing)

  const menciones = answer.text.toLowerCase().split('baloncesto').length - 1
  assert.equal(menciones, 1, `«baloncesto» aparece ${menciones} veces: ${answer.text}`)
})

test('quitar lo repetido no mutila las palabras que quedan', () => {
  const { briefing } = briefingWith({ activities: sportOn('Baloncesto', [0], 'alta') }, [session()])

  for (const question of ['¿Y por qué no piernas?', '¿Tengo deporte hoy?']) {
    const answer = answerFromBriefing(question, briefing)

    // Un recorte mal hecho parte por dentro de las palabras y deja restos de una
    // letra sueltos. «y», «o», «a», «e» y «u» sí son palabras en español.
    assert.ok(
      !/\s[bcdfgijklmnpqrstvwxz]\s/i.test(answer.text),
      `hay una palabra partida en: ${answer.text}`,
    )
    // Y el texto sigue siendo frases completas, terminadas en punto.
    assert.match(answer.text.trim(), /\.$/, `no termina en punto: ${answer.text}`)
  }
})

// ---------------------------------------------------------------------------
// Partidos de un día concreto (D-018)
// ---------------------------------------------------------------------------

/** Un partido con fecha. Hoy, en estos tests, es el lunes 2026-09-07. */
function matchOn(date: string): ScheduledActivity {
  return { ...sportOn('Partido', [0], 'alta')[0], id: `partido-${date}`, date }
}

test('un partido con fecha de hoy es el deporte de hoy, no un deporte recurrente', () => {
  const { briefing } = briefingWith({ activities: [matchOn(MONDAY_KEY)] }, [session()])

  assert.deepEqual(briefing.activitiesToday.map((activity) => activity.name), ['Partido'])
  assert.deepEqual(briefing.profile?.sports ?? [], [], 'no se presenta como «juegas los lunes»')

  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)
  assert.equal(answer.intent, 'sport_today')
  assert.equal(answer.unknown, false)
  assert.match(answer.text, /partido/i)
})

test('un partido con fecha de mañana condiciona hoy y AXIS lo explica', () => {
  const { briefing, context } = briefingWith({ activities: [matchOn('2026-09-08')] }, [session()])

  assert.deepEqual(briefing.activitiesTomorrow.map((activity) => activity.name), ['Partido'])
  const decision = decide(context)
  assert.equal(decision.primary.type, 'LIGHT_TRAINING')
  assert.match(decision.primary.reason, /mañana/i)

  const answer = answerFromBriefing('¿Cómo afecta el partido al entrenamiento?', briefing)
  assert.equal(answer.intent, 'sport_impact')
  assert.match(answer.text, /partido/i)
})

test('un partido de otra semana no aparece hoy ni mañana', () => {
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-14')] }, [session()])
  assert.equal(briefing.activitiesToday.length, 0, 'es lunes, pero el de la semana que viene')
  assert.equal(briefing.activitiesTomorrow.length, 0)
})

test('«hoy no hay partido» cancela el partido con fecha de hoy', () => {
  const { briefing } = briefingWith({ activities: [matchOn(MONDAY_KEY)] }, [session()])
  const answer = answerFromBriefing('hoy al final no hay partido', briefing, {
    lastIntent: 'change',
    changeMode: true,
  })

  assert.deepEqual(answer.cancelledActivities, ['Partido'])

  // Y, ya cancelado, deja de pesar en la decisión de hoy.
  const after = briefingWith(
    { activities: [matchOn(MONDAY_KEY)], cancelledToday: answer.cancelledActivities },
    [session()],
  )
  assert.equal(after.briefing.activitiesToday.length, 0)
  assert.equal(decide(after.context).primary.type, 'TRAINING')
})

// ---------------------------------------------------------------------------
// «¿Tengo partido hoy?» con partidos de un día concreto (D-018)
//
// Regresión: con solo un partido futuro registrado, AXIS respondía «No tienes
// ningún deporte registrado», porque miraba únicamente los deportes recurrentes.
// ---------------------------------------------------------------------------

const NO_SPORT_REGISTERED = /ning[uú]n deporte registrado/i

test('con solo un partido futuro, «¿Tengo partido hoy?» no dice que no haya deporte registrado', () => {
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-12')] }, [session()])
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.equal(answer.intent, 'sport_today')
  assert.equal(answer.unknown, false)
  assert.doesNotMatch(answer.text, NO_SPORT_REGISTERED)
})

test('partido futuro y ninguno hoy: distingue hoy del día del partido', () => {
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-12')] }, [session()])
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.match(answer.text, /^Hoy no tienes deporte\./)
  assert.match(answer.text, /Partido el s[aá]bado 12 de septiembre/)
  assert.deepEqual(briefing.upcomingDatedActivities, [
    { name: 'Partido', date: '2026-09-12', intensity: 'alta' },
  ])
})

test('un partido mañana se dice «mañana», no con la fecha', () => {
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-08')] }, [session()])
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.match(answer.text, /^Hoy no tienes deporte\./)
  assert.match(answer.text, /Partido mañana/)
})

test('un partido hoy se sigue detectando como el deporte de hoy', () => {
  const { briefing } = briefingWith({ activities: [matchOn(MONDAY_KEY)] }, [session()])
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.match(answer.text, /^S[ií]/)
  assert.match(answer.text, /partido/i)
  assert.doesNotMatch(answer.text, /^Hoy no tienes deporte/)
  assert.deepEqual(briefing.upcomingDatedActivities, [], 'el de hoy no es «próximo»')
})

test('un partido de otra semana no cuenta como hoy, pero se dice cuándo es', () => {
  // También es lunes, pero el de la semana que viene.
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-14')] }, [session()])
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.match(answer.text, /^Hoy no tienes deporte\./)
  assert.match(answer.text, /el lunes 14 de septiembre/)
})

test('un partido que ya pasó no se anuncia como próximo', () => {
  const { briefing } = briefingWith({ activities: [matchOn('2026-09-05')] }, [session()])
  assert.deepEqual(briefing.upcomingDatedActivities, [])
  assert.doesNotMatch(answerFromBriefing('¿Tengo partido hoy?', briefing).text, /5 de septiembre/)
})

test('semana sin ningún partido: la respuesta es la de siempre', () => {
  const none = answerFromBriefing('¿Tengo partido hoy?', briefingWith({}, [session()]).briefing)
  assert.equal(none.unknown, true)
  assert.match(none.text, NO_SPORT_REGISTERED)

  // Con un deporte recurrente que hoy no toca, tampoco cambia nada.
  const weekly = answerFromBriefing(
    '¿Tengo partido hoy?',
    briefingWith({ activities: sportOn('Baloncesto', [2], 'alta') }, [session()]).briefing,
  )
  assert.equal(weekly.text, 'Hoy no tienes deporte. Tienes Baloncesto los miércoles.')
})

test('recurrente y partido futuro a la vez: nombra los dos, cada uno con su cuándo', () => {
  const { briefing } = briefingWith(
    { activities: [...sportOn('Baloncesto', [2], 'media'), matchOn('2026-09-13')] },
    [session()],
  )
  const answer = answerFromBriefing('¿Tengo partido hoy?', briefing)

  assert.match(answer.text, /Baloncesto los miércoles/)
  assert.match(answer.text, /Partido el domingo 13 de septiembre/)
})

// ---------------------------------------------------------------------------
// D-028: lo que el determinista no entiende lo reescribe el modelo
// ---------------------------------------------------------------------------

test('D-028: un mensaje no entendido lo reescribe el modelo y lo responde el determinista', async () => {
  const { briefing } = briefingWith({}, [session()])
  const enviados: { question: string; briefing: unknown }[] = []
  const conversation = createAxisConversation({
    transport: transport({
      send: async (request) => {
        enviados.push({ question: request.question, briefing: request.briefing })
        return { text: 'Estoy muy cansado.' }
      },
    }),
  })
  const result = await conversation.ask('ando fundido', briefing)
  const direct = answerFromBriefing('Estoy muy cansado.', briefing)

  assert.deepEqual(enviados, [{ question: 'ando fundido', briefing: {} }], 'una llamada, solo con el mensaje')
  assert.equal(result.intent, direct.intent)
  assert.notEqual(result.intent, 'unknown')
  assert.equal(result.text, `${direct.text} Te he entendido como «Estoy muy cansado».`)
  assert.equal(result.reinterpretedAs, 'Estoy muy cansado.')
  assert.match(result.engineId, /ai/)
  assert.equal(result.usedFallback, false)
})

test('D-028: si el modelo tampoco lo entiende, o su frase sigue sin entenderse, queda el «no he entendido»', async () => {
  const { briefing } = briefingWith({}, [session()])
  const local = answerFromBriefing('blablabla', briefing)

  for (const reply of ['NO_ENTIENDO', 'Blablabla.']) {
    const conversation = createAxisConversation({ transport: transport({ send: async () => ({ text: reply }) }) })
    const result = await conversation.ask('blablabla', briefing)
    assert.equal(result.intent, 'unknown', reply)
    assert.equal(result.text, local.text, reply)
    assert.equal(result.usedFallback, false, `${reply}: no es un fallo, es la misma respuesta`)
  }
})

test('D-028: una reescritura que no vale o un proveedor caído dejan la respuesta local, con su motivo', async () => {
  const { briefing } = briefingWith({}, [session()])

  const inventa = createAxisConversation({ transport: transport({ send: async () => ({ text: 'Solo tengo 15 minutos.' }) }) })
  const invented = await inventa.ask('ando fundido', briefing)
  assert.equal(invented.intent, 'unknown')
  assert.equal(invented.usedFallback, true)
  assert.equal(invented.rejectedReason, 'invalid_reinterpretation')

  const caida = createAxisConversation({
    transport: transport({
      send: async () => {
        throw new Error('red')
      },
    }),
  })
  const down = await caida.ask('ando fundido', briefing)
  assert.equal(down.intent, 'unknown')
  assert.equal(down.usedFallback, true)
  assert.equal(down.rejectedReason, 'transport_error')
})

test('D-028: lo que el determinista ya entiende no se reescribe', async () => {
  const { briefing } = briefingWith({}, [session()])
  const sistemas: string[] = []
  const conversation = createAxisConversation({
    transport: transport({
      send: async (request) => {
        sistemas.push(request.system)
        return { text: 'Respuesta del modelo.' }
      },
    }),
  })
  await conversation.ask('Me duele la rodilla', briefing)
  await conversation.ask('¿Por qué me propones esto hoy?', briefing)

  assert.equal(sistemas.length, 1, 'lo médico no llama; la explicación llama una vez, para redactar')
  assert.doesNotMatch(sistemas[0], /NO_ENTIENDO/)
})
