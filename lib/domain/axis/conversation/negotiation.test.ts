import assert from 'node:assert/strict'
import test from 'node:test'

import type { ScheduledActivity, UserProfile } from '../../profile/types'
import type { RecoveryInputs } from '../../recovery/types'
import { minutesFromMidnight } from '../../shared/dates'
import type { WorkoutSession } from '../../workouts/types'
import { buildBriefing, type AxisBriefing } from '../briefing'
import { buildAxisContext } from '../context'
import { decide } from '../engine'
import { answerFromBriefing } from './deterministic'
import { matchIntent } from './intents'
import {
  changeOpeningMessage,
  detectReportedLoad,
  evaluateChange,
  parseChangeRequest,
} from './negotiation'

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
    goals: ['fuerza'],
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

/** Baloncesto el lunes por la tarde: carga piernas y condiciona el día. */
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
): AxisBriefing {
  const context = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: sessions,
    activities: [],
    now: MONDAY,
    ...overrides,
  })
  return buildBriefing(context, decide(context), sessions)
}

/** Responde como lo hará la aplicación al pulsar «Habla con AXIS». */
function negotiate(message: string, briefing: AxisBriefing) {
  return answerFromBriefing(message, briefing, { lastIntent: 'change', changeMode: true })
}

const SYCOPHANCY = /tienes raz[oó]n|buena idea|por supuesto|claro que s[ií]|sin problema|como quieras|lo que t[uú] prefieras/i

// ---------------------------------------------------------------------------
// Leer lo que el usuario pide
// ---------------------------------------------------------------------------

test('reconoce que el usuario quiere evitar una zona', () => {
  const request = parseChangeRequest('Oye mira, ayer hice bici 20km por montaña, ¿podemos no hacer piernas?')

  assert.equal(request.kind, 'avoid_focus')
  assert.equal(request.focus, 'tren_inferior')
})

test('lee la carga que el usuario cuenta y que no está registrada', () => {
  const reported = detectReportedLoad('ayer hice bici 20km por montaña')

  assert.ok(reported)
  assert.ok(reported.muscleGroups.includes('piernas'))
  assert.equal(reported.demanding, true, '20 km por montaña es exigente')
})

test('una pregunta cualquiera no se confunde con una carga contada', () => {
  assert.equal(detectReportedLoad('¿puedo hacer piernas hoy?'), null)
  assert.equal(detectReportedLoad('quiero algo más corto'), null)
})

test('distingue las demás peticiones', () => {
  assert.equal(parseChangeRequest('hoy voy justo, ¿algo más corto?').kind, 'shorter')
  assert.equal(parseChangeRequest('ponme algo más duro').kind, 'harder')
  assert.equal(parseChangeRequest('prefiero algo más suave').kind, 'easier')
  assert.equal(parseChangeRequest('hoy prefiero descansar').kind, 'rest')
  assert.equal(parseChangeRequest('buenas').kind, 'unclear')
})

// ---------------------------------------------------------------------------
// AXIS cede por evidencia
// ---------------------------------------------------------------------------

test('con una carga contada que pega a la zona, acepta evitarla', () => {
  // La sesión de ayer fue de tren superior, así que hoy tocan piernas.
  const briefing = briefingWith({}, [session()])
  const answer = negotiate('ayer hice 20 km de bici por montaña, ¿podemos no hacer piernas?', briefing)

  assert.equal(answer.intent, 'change')
  assert.match(answer.text, /^te creo/i)
  assert.doesNotMatch(answer.text, SYCOPHANCY, 'no debe empezar dándole la razón')
})

test('lo que el usuario cuenta se tiene en cuenta pero no se presenta como comprobado', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(
    parseChangeRequest('ayer hice 20 km de bici por montaña, hoy piernas no'),
    briefing,
  )

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /^te creo/i)
})

test('con recuperación baja, pedir descansar se acepta', () => {
  const briefing = briefingWith({
    recoveryInputs: recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5 }),
  })
  const verdict = evaluateChange(parseChangeRequest('hoy prefiero descansar'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /recuperaci[oó]n/i)
})

test('el tiempo es un límite real y se acomoda sin discutir', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(parseChangeRequest('hoy voy justo de tiempo'), briefing)

  assert.ok(verdict.outcome === 'accept' || verdict.outcome === 'compromise')
  assert.doesNotMatch(verdict.text, /^no\b/i)
})

// ---------------------------------------------------------------------------
// Firme no es rígido: si el motivo desaparece, AXIS deja entrenar
// ---------------------------------------------------------------------------

test('querer entrenar no se confunde con querer descansar', () => {
  // «no ... entreno ... entrenar» tiene todas las señales de una negativa y es
  // justo lo contrario: la persona quiere entrenar.
  const request = parseChangeRequest(
    'hoy no tenía entreno de básquet y me apetece entrenar',
    ['Básquet'],
  )

  assert.equal(request.kind, 'train_anyway')
  assert.deepEqual(request.cancelledActivities, ['Básquet'])
})

test('una negación no se lee como su contrario', () => {
  assert.equal(parseChangeRequest('hoy no quiero entrenar').kind, 'rest')
  assert.equal(parseChangeRequest('hoy quiero entrenar').kind, 'train_anyway')
})

test('si el deporte del día se cae, la razón para frenar desaparece', () => {
  const conBasquet = briefingWith({ activities: [basketball()] })
  assert.ok(
    conBasquet.proposal,
    'con baloncesto hoy, AXIS propone algo condicionado por el partido',
  )

  const verdict = evaluateChange(
    parseChangeRequest('hoy no tengo básquet al final, y me apetece entrenar', ['Baloncesto']),
    conBasquet,
  )

  assert.notEqual(verdict.outcome, 'decline', 'sin partido no hay nada que reservar')
})

test('un deporte cancelado deja de contar hoy, pero sigue estando registrado', () => {
  const contexto = buildAxisContext({
    profile: profile(),
    recoveryInputs: recovery(),
    recentSessions: [],
    activities: [basketball()],
    cancelledToday: ['Baloncesto'],
    now: MONDAY,
  })
  const briefing = buildBriefing(contexto, decide(contexto), [])

  assert.deepEqual(briefing.activitiesToday, [], 'hoy no cuenta para decidir')
  assert.deepEqual(
    briefing.profile?.sports.map((sport) => sport.name),
    ['Baloncesto'],
    'pero AXIS no puede decir que no lo tienes registrado',
  )
})

test('la cancelación se reconoce aunque el deporte se llame de otra forma', () => {
  // En el onboarding registró «Baloncesto»; al escribir dice «básquet».
  const request = parseChangeRequest('el básquet de hoy se ha cancelado', ['Baloncesto'])
  assert.deepEqual(request.cancelledActivities, ['Baloncesto'])

  // Y sin nombrarlo siquiera.
  const generico = parseChangeRequest('hoy no tengo entreno', ['Baloncesto'])
  assert.deepEqual(generico.cancelledActivities, ['Baloncesto'])
})

test('una frase con «no tengo» que no habla de deporte no cancela nada', () => {
  assert.deepEqual(parseChangeRequest('no tengo tiempo hoy', ['Baloncesto']).cancelledActivities, [])
})

test('con el deporte cancelado, AXIS replantea el día en vez de negarse', () => {
  const conBasquet = briefingWith({ activities: [basketball()] })
  const verdict = evaluateChange(
    parseChangeRequest('el básquet se ha cancelado, quiero entrenar', ['Baloncesto']),
    conBasquet,
  )

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /baloncesto/i, 'nombra el motivo que ha desaparecido')
  assert.match(verdict.text, /replanteo/i)

  /*
   * Y no fija ninguna alternativa: las que hay se calcularon con el partido
   * dentro. Aplicar una sería quedarse con una decisión que ya no vale; el motor
   * vuelve a decidir el día entero sin esa actividad.
   */
  assert.equal(verdict.proposedTarget, null)
})

test('venir de un esfuerzo grande y querer entrenar da una sesión más suave, no un no', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(
    parseChangeRequest('ayer corrí 20 km pero hoy me apetece entrenar'),
    briefing,
  )

  assert.equal(verdict.outcome, 'accept')
  assert.doesNotMatch(verdict.text, /^no\b/i, 'no se le niega entrenar')
  assert.match(verdict.text, /^te creo/i)
})

test('la sesión más suave no puede ser de lo que acaba de castigar', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(
    parseChangeRequest('ayer corrí 20 km por montaña pero hoy me apetece entrenar'),
    briefing,
  )

  // Correr castiga las piernas. Ofrecer una sesión «más suave» de tren inferior
  // contradice el motivo por el que se está bajando el listón.
  if (verdict.proposedTarget) {
    assert.notEqual(verdict.proposedTarget.focus, 'tren_inferior', `ofreció piernas: ${verdict.text}`)
  }
  assert.doesNotMatch(verdict.text, /tren inferior/i, verdict.text)
})

test('contar un esfuerzo grande sin pedir nada adapta la sesión', () => {
  const briefing = briefingWith({}, [session()])
  const request = parseChangeRequest('es que ayer corrí 18 km y hoy me toca entrenar')

  assert.equal(request.kind, 'easier', 'contar un esfuerzo es pedir que se adapte')

  const verdict = evaluateChange(request, briefing)
  assert.ok(verdict.outcome === 'accept' || verdict.outcome === 'compromise')
  assert.doesNotMatch(verdict.text, /dime qué quieres cambiar/i)
})

test('con la recuperación baja, querer entrenar sigue encontrando un límite', () => {
  const briefing = briefingWith({
    recoveryInputs: recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5 }),
  })
  const verdict = evaluateChange(parseChangeRequest('me apetece entrenar'), briefing)

  // Aquí sí toca frenar: el motivo no ha desaparecido, sigue siendo cierto.
  assert.notEqual(verdict.outcome, 'accept')
  assert.match(verdict.text, /recuperaci[oó]n/i)
})

test('si ya has entrenado hoy, AXIS avisa pero deja entrenar otra vez, suave (D-030)', () => {
  const briefing = briefingWith({}, [session({ dayKey: MONDAY_KEY })])
  const verdict = evaluateChange(parseChangeRequest('me apetece entrenar otra vez'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /ya has entrenado/i)
  assert.match(verdict.text, /lo decides t[uú]/i)
})

// ---------------------------------------------------------------------------
// AXIS cede salvo riesgo (D-030), y no cede por insistencia donde hay riesgo
// ---------------------------------------------------------------------------

test('evitar una zona sin ningún motivo se acepta, diciendo que no lo haría (D-030)', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(parseChangeRequest('hoy no quiero hacer piernas'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.ok(verdict.proposedTarget, 'lo deja listo con el botón de confirmar')
  assert.notEqual(verdict.proposedTarget!.focus, 'tren_inferior')
  assert.match(verdict.text, /no es lo que yo har[ií]a/i)
  assert.match(verdict.text, /t[uú] mandas/i)
  assert.doesNotMatch(verdict.text, SYCOPHANCY)
})

test('con la recuperación baja, pedir más caña se rechaza', () => {
  const briefing = briefingWith({
    recoveryInputs: recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5 }),
  })
  const verdict = evaluateChange(parseChangeRequest('ponme algo más duro'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.match(verdict.text, /^no\b/i, 'la primera palabra es el veredicto')
  assert.equal(verdict.proposedTarget, null)
})

test('sin recuperación registrada sube la carga, avisando de que va a ciegas (D-030)', () => {
  const briefing = briefingWith({ recoveryInputs: null })
  const verdict = evaluateChange(parseChangeRequest('quiero algo más intenso'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /no s[eé] c[oó]mo llegas hoy/i)
  assert.match(verdict.text, /apunta tu recuperaci[oó]n/i)
})

test('llevando días sin entrenar y sin motivo, acepta el descanso diciendo lo que opina (D-030)', () => {
  // Última sesión hace ocho días: nada en los datos pide parar hoy.
  const briefing = briefingWith({}, [session({ dayKey: '2026-08-30' })])
  const verdict = evaluateChange(parseChangeRequest('hoy no quiero entrenar'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.equal(verdict.proposedTarget?.type, 'RECOVERY')
  assert.match(verdict.text, /d[ií]as sin entrenar/i)
  assert.match(verdict.text, /no te lo recomendar[ií]a/i)
})

test('insistir sin aportar nada nuevo no cambia el veredicto', () => {
  const briefing = briefingWith({ recoveryInputs: LOW_RECOVERY }, [session()])
  const primero = evaluateChange(parseChangeRequest('ponme algo más duro'), briefing)
  const segundo = evaluateChange(parseChangeRequest('venga, de verdad, más duro'), briefing)

  assert.equal(primero.outcome, 'decline')
  assert.equal(segundo.outcome, 'decline')
  assert.equal(segundo.proposedTarget, null)
})

test('insistir sin argumentos mantiene el criterio y no repite el párrafo entero', () => {
  const briefing = briefingWith({ recoveryInputs: LOW_RECOVERY }, [session()])

  const primera = answerFromBriefing('ponme algo más duro', briefing, {
    lastIntent: 'change',
    changeMode: true,
  })
  assert.match(primera.text, /^no\b/i)
  assert.ok(primera.changeRequest, 'la petición debe quedar registrada para el siguiente turno')

  const insistiendo = answerFromBriefing('venga porfa, de verdad', briefing, {
    lastIntent: 'change',
    changeMode: true,
    lastChangeRequest: primera.changeRequest,
  })

  assert.match(insistiendo.text, /^lo mantengo/i)
  assert.equal(insistiendo.proposedTarget, null, 'insistir no propone nada')
  assert.ok(!insistiendo.text.includes(primera.text), 'no repite la misma parrafada')
})

test('aportar el dato que faltaba reabre la petición y cambia la respuesta', () => {
  const briefing = briefingWith({}, [session()])
  const memoria = { lastIntent: 'change' as const, changeMode: true }

  const negativa = answerFromBriefing('hoy no quiero hacer piernas', briefing, memoria)
  assert.match(negativa.text, /no es lo que yo har[ií]a/i, 'sin motivo, cede pero dice que no lo haría')

  // El usuario cuenta lo que faltaba. No repite la petición: da la evidencia.
  const conEvidencia = answerFromBriefing('es que ayer estuve corriendo 12 km', briefing, {
    ...memoria,
    lastChangeRequest: negativa.changeRequest,
  })

  assert.doesNotMatch(
    conEvidencia.text,
    /dime qué quieres cambiar/i,
    'no puede volver a preguntar lo que ya sabe',
  )
  assert.match(conEvidencia.text, /^te creo/i)
  assert.doesNotMatch(conEvidencia.text, /no es lo que yo har[ií]a/i, 'con la evidencia, ya no hay reparo')
  assert.ok(conEvidencia.proposedTarget, 'con la evidencia, AXIS propone el cambio')
})

test('una negativa se lee como una frase, sin minúsculas tras punto', () => {
  const briefing = briefingWith({}, [session()])
  const { text } = evaluateChange(parseChangeRequest('hoy no quiero hacer piernas'), briefing)

  // Un punto seguido de minúscula delata una frase mal cosida.
  assert.doesNotMatch(text, /\.\s+[a-záéíóúñ]/, `frase mal formada: ${text}`)
})

test('ninguna respuesta de la negociación abre dándole la razón', () => {
  const briefing = briefingWith({}, [session()])
  const mensajes = [
    'hoy no quiero hacer piernas',
    'ponme algo más duro',
    'prefiero algo más suave',
    'hoy prefiero descansar',
    'voy justo de tiempo',
    'quiero hacer tren superior',
    'buenas',
  ]

  for (const mensaje of mensajes) {
    const { text } = evaluateChange(parseChangeRequest(mensaje), briefing)
    assert.doesNotMatch(text, SYCOPHANCY, `«${mensaje}» produjo una respuesta complaciente: ${text}`)
    assert.ok(text.trim().length > 0)
  }
})

// ---------------------------------------------------------------------------
// La negociación mueve la sesión de verdad
// ---------------------------------------------------------------------------

test('cuando acepta, señala una alternativa que el motor ya había preparado', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(
    parseChangeRequest('ayer hice 20 km de bici por montaña, hoy piernas no'),
    briefing,
  )

  if (verdict.proposedTarget !== null) {
    const disponibles = briefing.proposal!.alternatives.map(
      (a) => `${a.type}:${a.focus}`,
    )
    assert.ok(
      disponibles.includes(`${verdict.proposedTarget.type}:${verdict.proposedTarget.focus}`),
      'no puede inventarse una sesión: elige entre las que ya existen',
    )
  }
})

// ---------------------------------------------------------------------------
// Pedir una zona: lo que se afirma sale de los datos registrados (D-016)
// ---------------------------------------------------------------------------

/** Afirmaciones que convierten la ausencia de datos en un hecho. */
const UNTOUCHED_AS_FACT = /no la has tocado|no has (tocado|entrenado|trabajado|hecho)|est[aá] libre/i

test('sin historial, pedir otra zona se acepta sin afirmar que esa zona no se ha tocado', () => {
  const briefing = briefingWith({}, [])
  assert.equal(briefing.proposal!.session!.focus, 'tren_superior')

  const verdict = evaluateChange(parseChangeRequest('quiero hacer piernas'), briefing)
  assert.equal(verdict.outcome, 'accept')
  assert.deepEqual(verdict.proposedTarget, { type: 'MODIFIED_TRAINING', focus: 'tren_inferior' })
  assert.equal(verdict.text, 'No tengo sesiones tuyas de estos días que hayan cargado esa zona. Cambio a «Tren inferior».')
  assert.doesNotMatch(verdict.text, UNTOUCHED_AS_FACT)
})

test('con sesiones recientes de otra zona, se afirma solo lo que registran esas sesiones', () => {
  const briefing = briefingWith({}, [session({ dayKey: '2026-09-05', focus: 'cuerpo_completo', muscleGroups: ['core'] })])
  assert.equal(briefing.daysSinceLastWorkout, 2)

  const verdict = evaluateChange(parseChangeRequest('quiero hacer piernas'), briefing)
  assert.equal(verdict.outcome, 'accept')
  assert.deepEqual(verdict.proposedTarget, { type: 'MODIFIED_TRAINING', focus: 'tren_inferior' })
  assert.equal(verdict.text, 'En tus sesiones de los últimos 3 días no aparece esa zona. Cambio a «Tren inferior».')
  assert.doesNotMatch(verdict.text, UNTOUCHED_AS_FACT)
})

test('una sesión fuera de la ventana no cuenta como historial reciente', () => {
  const briefing = briefingWith({}, [session({ dayKey: '2026-09-01' })])
  const verdict = evaluateChange(parseChangeRequest('quiero hacer piernas'), briefing)
  assert.match(verdict.text, /^No tengo sesiones tuyas de estos días/)
})

test('lo que el usuario cuenta de esa zona se reconoce sin darlo por comprobado, y el veredicto no cambia', () => {
  const briefing = briefingWith({}, [])
  const sinContar = evaluateChange(parseChangeRequest('quiero hacer piernas'), briefing)
  const contando = evaluateChange(parseChangeRequest('ayer hice 20 km de bici, quiero hacer piernas'), briefing)

  // 2(a): mismo veredicto y mismo destino; solo cambia el texto.
  assert.equal(contando.outcome, sinContar.outcome)
  assert.deepEqual(contando.proposedTarget, sinContar.proposedTarget)
  assert.equal(
    contando.text,
    'No tengo sesiones tuyas de estos días que hayan cargado esa zona; eso sí, si ya la cargaste como me cuentas, ve con calma. Cambio a «Tren inferior».',
  )
  assert.doesNotMatch(contando.text, UNTOUCHED_AS_FACT, 'no puede decir que no ha hecho piernas')
})

test('una carga contada antes en el día también se reconoce al pedir la zona después', () => {
  const briefing = briefingWith({}, [])
  const load = detectReportedLoad('ayer hice 20 km de bici')!
  const withMemory: AxisBriefing = { ...briefing, reportedLoads: [{ ...load, reportedAt: '2026-09-07T09:00:00.000Z', messageId: 'm1' }] }

  const verdict = evaluateChange(parseChangeRequest('quiero hacer piernas'), withMemory)
  assert.match(verdict.text, /si ya la cargaste como me cuentas, ve con calma/)
  assert.doesNotMatch(verdict.text, UNTOUCHED_AS_FACT)
})

test('ninguna respuesta de pedir una zona convierte la ausencia de datos en un hecho', () => {
  const escenarios = [
    briefingWith({}, []),
    briefingWith({}, [session()]),
    briefingWith({}, [session({ dayKey: '2026-09-05', muscleGroups: ['core'] })]),
    briefingWith({}, [session({ dayKey: '2026-09-01' })]),
  ]
  for (const briefing of escenarios) {
    for (const message of ['quiero hacer piernas', 'quiero hacer tren superior', 'ayer hice 20 km de bici, quiero hacer piernas']) {
      const { text } = evaluateChange(parseChangeRequest(message), briefing)
      assert.doesNotMatch(text, UNTOUCHED_AS_FACT, `«${message}» → ${text}`)
    }
  }
})

test('pedir la zona que ya está prevista no cambia nada', () => {
  const briefing = briefingWith({}, [session()])
  const focus = briefing.proposal!.session!.focus
  const nombre = focus === 'tren_inferior' ? 'piernas' : 'tren superior'

  const verdict = evaluateChange(parseChangeRequest(`quiero hacer ${nombre}`), briefing)
  assert.equal(verdict.proposedTarget, null)
})

// ---------------------------------------------------------------------------
// Modo cambio
// ---------------------------------------------------------------------------

test('el mensaje de apertura parte de la sesión real y pide el motivo', () => {
  const briefing = briefingWith({}, [session()])
  const opening = changeOpeningMessage(briefing)

  assert.match(opening, /qué te gustaría cambiar/i)
  assert.match(opening, new RegExp(String(briefing.proposal!.session!.estimatedMinutes)))
})

test('sin sesión, el mensaje de apertura usa el titular tal cual, sin «hoy» repetido ni dos puntos', () => {
  const base = briefingWith({}, [session()])
  const briefing = { ...base, proposal: { ...base.proposal!, session: null, headline: 'Hoy toca descansar.' } }
  const opening = changeOpeningMessage(briefing)

  assert.ok(opening.startsWith('Hoy toca descansar. '))
  assert.doesNotMatch(opening, /\.\./)
})

test('en modo cambio, un mensaje suelto se lee como petición de cambio', () => {
  const briefing = briefingWith({}, [session()])
  const answer = negotiate('hoy no quiero hacer piernas', briefing)

  assert.equal(answer.intent, 'change')
  assert.match(answer.text, /no es lo que yo har[ií]a/i)
})

test('en modo cambio, una molestia física sigue yendo al aviso médico', () => {
  const briefing = briefingWith({}, [session()])
  const answer = negotiate('me duele la rodilla', briefing)

  assert.equal(answer.intent, 'medical')
})

test('en modo cambio, preguntar por los datos sigue respondiendo con datos', () => {
  const briefing = briefingWith({}, [session()])
  const answer = negotiate('¿cómo tengo la recuperación?', briefing)

  assert.equal(answer.intent, 'recovery')
})

test('sin propuesta no hay nada que negociar y se dice', () => {
  const briefing = briefingWith({ profile: null })
  const verdict = evaluateChange(parseChangeRequest('quiero cambiar'), briefing)

  if (briefing.proposal === null) {
    assert.equal(verdict.outcome, 'need_info')
    assert.match(verdict.text, /no tengo una sesi[oó]n/i)
  }
})

// ---------------------------------------------------------------------------
// Más tiempo (`longer`)
//
// Regresión del fallo visto en producción: «quiero poner 15 minutos más de
// ejercicios» se leía como acortar porque contiene «15 minutos», y «más larga»
// heredaba ese `shorter`. AXIS contestaba a quien pedía más que no tenía una
// versión más corta.
// ---------------------------------------------------------------------------

const LONGER_MESSAGES = [
  'quiero una sesión más larga',
  'quiero más tiempo',
  'quiero poner 15 minutos más de ejercicios',
  'añade 10 minutos',
  '+15 min',
  '10 minutos extra',
  'quiero alargar la sesión',
  'más larga',
]

test('reconoce las peticiones de más tiempo como `longer`', () => {
  for (const message of LONGER_MESSAGES) {
    assert.equal(parseChangeRequest(message).kind, 'longer', message)
  }
})

test('negar el «más tiempo» no es pedirlo', () => {
  assert.notEqual(parseChangeRequest('no tengo más tiempo').kind, 'longer')
  assert.notEqual(parseChangeRequest('no quiero una sesión más larga').kind, 'longer')
  // Un «no» en otro tramo de la frase no niega la petición.
  assert.equal(parseChangeRequest('no tengo partido, quiero más tiempo').kind, 'longer')
})

test('las cifras de duración sin «más» siguen siendo acortar', () => {
  for (const message of [
    'solo tengo 15 minutos',
    'quiero algo de 20 minutos',
    'quiero una sesión más corta',
    'tengo menos tiempo hoy',
    'hoy voy justo, ¿algo más corto?',
  ]) {
    assert.equal(parseChangeRequest(message).kind, 'shorter', message)
  }
})

test('«más» a secas no es pedir tiempo: intensidad y volumen conservan su sentido', () => {
  assert.equal(parseChangeRequest('quiero más intensidad').kind, 'harder')
  assert.equal(parseChangeRequest('quiero más volumen').kind, 'harder')
  assert.equal(parseChangeRequest('quiero algo más intenso').kind, 'harder')
})

test('«15 minutos más» no se clasifica como acortar en la intención', () => {
  assert.notEqual(matchIntent('quiero poner 15 minutos más de ejercicios').intent, 'shorten')
  assert.notEqual(matchIntent('10 minutos extra').intent, 'shorten')
  // Sin «más», la cifra sigue siendo acortar.
  assert.equal(matchIntent('solo tengo 15 minutos').intent, 'shorten')
})

function withLoad(briefing: AxisBriefing, band: 'baja' | 'moderada' | 'alta'): AxisBriefing {
  return { ...briefing, load: { known: true, value: 80, band, sessionCount: 6, windowDays: 7 } }
}

/** El mismo día, pero con una alternativa de entrenamiento más larga preparada. */
function withLongerAlternative(briefing: AxisBriefing): AxisBriefing {
  const proposal = briefing.proposal!
  // Con la recuperación baja el motor propone recuperar y no hay sesión.
  const current = proposal.session?.estimatedMinutes ?? 0
  return {
    ...briefing,
    proposal: {
      ...proposal,
      alternatives: [
        ...proposal.alternatives,
        { id: 'longer', label: 'Sesión completa', type: 'TRAINING', focus: 'tren_inferior', estimatedMinutes: current + 15 },
      ],
    },
  }
}

const LOW_RECOVERY = recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5 })

test('más tiempo con la recuperación baja se rechaza', () => {
  const briefing = withLongerAlternative(briefingWith({ recoveryInputs: LOW_RECOVERY }))
  const verdict = evaluateChange(parseChangeRequest('quiero una sesión más larga'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.match(verdict.text, /^no\b/i, 'la primera palabra es el veredicto')
  assert.equal(verdict.proposedTarget, null)
  assert.doesNotMatch(verdict.text, SYCOPHANCY)

  // El motor propone recuperar: no hay sesión que «se quede como está».
  assert.equal(briefing.proposal?.session ?? null, null)
  assert.doesNotMatch(verdict.text, /se queda como est[aá]/i)
  assert.match(verdict.text, /no alargo el entrenamiento/i)
  assert.match(verdict.text, /priorizar la recuperaci[oó]n/i)
})

test('con la carga desconocida, aceptar más tiempo no afirma nada de la carga', () => {
  const briefing = withLongerAlternative(briefingWith())
  assert.equal(briefing.load.known, false, 'sin sesiones en la ventana no hay carga')

  const verdict = evaluateChange(parseChangeRequest('quiero una sesión más larga'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.doesNotMatch(verdict.text, /carga/i)
  assert.doesNotMatch(verdict.text, /lo permite/i)
})

test('con la carga conocida y compatible, aceptar más tiempo puede citarla', () => {
  const briefing = withLongerAlternative(withLoad(briefingWith(), 'moderada'))
  const verdict = evaluateChange(parseChangeRequest('quiero una sesión más larga'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /la carga acumulada lo permite/i)
})

test('con la carga desconocida, aceptar más caña no afirma que la carga lo permita', () => {
  const briefing = briefingWith()
  assert.equal(briefing.load.known, false)

  const verdict = evaluateChange(parseChangeRequest('ponme algo más duro'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.doesNotMatch(verdict.text, /carga acumulada/i)
  assert.doesNotMatch(verdict.text, /lo permite/i)
})

test('con la carga conocida y compatible, aceptar más caña puede citarla', () => {
  const verdict = evaluateChange(parseChangeRequest('ponme algo más duro'), withLoad(briefingWith(), 'moderada'))

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /la carga acumulada lo permite/i)
})

test('más tiempo con la carga acumulada alta se concede, avisando (D-030)', () => {
  const briefing = withLongerAlternative(withLoad(briefingWith(), 'alta'))
  const verdict = evaluateChange(parseChangeRequest('quiero más tiempo'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /carga acumulada ya est[aá] alta/i)
  assert.match(verdict.text, /lo decides t[uú]/i)
  assert.ok(verdict.proposedTarget)
  assert.doesNotMatch(verdict.text, SYCOPHANCY)
})

test('más tiempo con la recuperación baja sigue siendo que no', () => {
  const briefing = withLongerAlternative(briefingWith({ recoveryInputs: LOW_RECOVERY }))
  const verdict = evaluateChange(parseChangeRequest('quiero más tiempo'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.equal(verdict.proposedTarget, null)
})

test('sin recuperación registrada alarga la sesión si la hay, avisando (D-030)', () => {
  const briefing = withLongerAlternative(briefingWith({ recoveryInputs: null }))
  const verdict = evaluateChange(parseChangeRequest('añade 10 minutos'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /no s[eé] c[oó]mo llegas hoy/i)
  assert.ok(verdict.proposedTarget)
})

test('con recuperación suficiente y una alternativa más larga preparada, la propone', () => {
  const briefing = withLongerAlternative(withLoad(briefingWith(), 'moderada'))
  const verdict = evaluateChange(parseChangeRequest('quiero poner 15 minutos más de ejercicios'), briefing)

  assert.equal(verdict.outcome, 'accept')
  assert.deepEqual(verdict.proposedTarget, { type: 'TRAINING', focus: 'tren_inferior' })
  assert.match(verdict.text, /«Sesión completa»/)
  assert.doesNotMatch(verdict.text, SYCOPHANCY)
})

test('sin alternativa más larga preparada, compromiso honesto: no inventa ejercicios ni volumen', () => {
  const briefing = briefingWith()
  const current = briefing.proposal!.session!.estimatedMinutes
  assert.ok(
    // Más larga es al menos 5 minutos más (D-050): un par de minutos de estimación no son otra sesión.
    briefing.proposal!.alternatives.every((a) => a.estimatedMinutes === null || a.estimatedMinutes < current + 5),
    'el motor no prepara hoy nada más largo',
  )

  const verdict = evaluateChange(parseChangeRequest('quiero una sesión más larga'), briefing)

  assert.equal(verdict.outcome, 'compromise')
  assert.equal(verdict.proposedTarget, null)
  assert.match(verdict.text, /hoy la dejo como est[aá]/i)
  assert.doesNotMatch(verdict.text, /m[aá]s corta/i)
  assert.doesNotMatch(verdict.text, /a[nñ]ade|series?\b|repetici/i, 'no receta volumen que el motor no preparó')
  assert.doesNotMatch(verdict.text, SYCOPHANCY)
})

test('ninguna respuesta a pedir más tiempo abre con un cumplido', () => {
  const variants = [
    briefingWith(),
    withLongerAlternative(briefingWith()),
    withLoad(briefingWith(), 'alta'),
    briefingWith({ recoveryInputs: null }),
    briefingWith({ recoveryInputs: LOW_RECOVERY }),
  ]
  for (const briefing of variants) {
    for (const message of LONGER_MESSAGES) {
      const answer = negotiate(message, briefing)
      assert.equal(answer.changeRequest?.kind, 'longer', message)
      assert.doesNotMatch(answer.text, SYCOPHANCY, message)
    }
  }
})

test('producción: «15 minutos más» y después «más larga» no heredan `shorter`', () => {
  const briefing = briefingWith()

  // Primer mensaje, desde Inicio, sin pulsar nada.
  const first = answerFromBriefing('quiero poner 15 minutos más de ejercicios', briefing)
  assert.equal(first.intent, 'change')
  assert.deepEqual(first.changeRequest, { kind: 'longer', focus: null })
  assert.doesNotMatch(first.text, /m[aá]s corta/i)

  // La conversación queda en modo cambio con esa petición pendiente.
  const second = answerFromBriefing('más larga', briefing, {
    lastIntent: 'change',
    changeMode: true,
    lastChangeRequest: first.changeRequest ?? null,
  })
  assert.equal(second.intent, 'change')
  assert.deepEqual(second.changeRequest, { kind: 'longer', focus: null })
  assert.doesNotMatch(second.text, /m[aá]s corta/i)
})

test('una petición de más tiempo corrige un `shorter` anterior, no lo hereda', () => {
  const answer = answerFromBriefing('más larga', briefingWith(), {
    lastIntent: 'change',
    changeMode: true,
    lastChangeRequest: { kind: 'shorter', focus: null },
  })

  assert.deepEqual(answer.changeRequest, { kind: 'longer', focus: null })
  assert.doesNotMatch(answer.text, /m[aá]s corta/i)
})
