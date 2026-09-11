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
import { createAxisConversation } from './index'
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

test('una consulta de datos no gasta una llamada al modelo', async () => {
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
    '¿Cómo estoy recuperando?',
    '¿Qué entrenamiento tengo hoy?',
    '¿Cuánta carga llevo?',
    '¿Qué entrené ayer?',
    '¿Qué tal la semana?',
  ]) {
    const result = await conversation.ask(pregunta, briefing)
    assert.match(result.engineId, /deterministic/, pregunta)
    assert.equal(result.usedFallback, false, 'no es un fallback: el dominio ya lo sabe')
  }

  assert.equal(llamadas, 0, 'el dominio responde solo a lo que ya sabe')
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
