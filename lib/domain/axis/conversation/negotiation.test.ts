import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../../profile/types'
import type { RecoveryInputs } from '../../recovery/types'
import type { WorkoutSession } from '../../workouts/types'
import { buildBriefing, type AxisBriefing } from '../briefing'
import { buildAxisContext } from '../context'
import { decide } from '../engine'
import { answerFromBriefing } from './deterministic'
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

/** Responde como lo hará la aplicación al pulsar «Cambiar entrenamiento». */
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
  assert.match(answer.text, /no me conste registrado|no est[eé] registrado/i)
  assert.doesNotMatch(answer.text, SYCOPHANCY, 'no debe empezar dándole la razón')
})

test('lo que el usuario cuenta se tiene en cuenta pero no se presenta como comprobado', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(
    parseChangeRequest('ayer hice 20 km de bici por montaña, hoy piernas no'),
    briefing,
  )

  assert.equal(verdict.outcome, 'accept')
  assert.match(verdict.text, /me f[ií]o de lo que me cuentas/i)
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
// AXIS no cede por insistencia
// ---------------------------------------------------------------------------

test('evitar una zona sin ningún motivo se rechaza, con el porqué', () => {
  const briefing = briefingWith({}, [session()])
  const verdict = evaluateChange(parseChangeRequest('hoy no quiero hacer piernas'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.equal(verdict.applyProposalId, null, 'una negativa no cambia la sesión')
  assert.match(verdict.text, /no lo quitar[ií]a/i)
  assert.doesNotMatch(verdict.text, SYCOPHANCY)
})

test('con la recuperación baja, pedir más caña se rechaza', () => {
  const briefing = briefingWith({
    recoveryInputs: recovery({ sleepHours: 4, energy: 1, muscleFatigue: 5, stress: 5 }),
  })
  const verdict = evaluateChange(parseChangeRequest('ponme algo más duro'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.match(verdict.text, /^no\b/i, 'la primera palabra es el veredicto')
  assert.equal(verdict.applyProposalId, null)
})

test('sin recuperación registrada no sube la carga a ciegas', () => {
  const briefing = briefingWith({ recoveryInputs: null })
  const verdict = evaluateChange(parseChangeRequest('quiero algo más intenso'), briefing)

  assert.equal(verdict.outcome, 'need_info')
  assert.match(verdict.text, /registra tu recuperaci[oó]n|a ciegas/i)
})

test('llevando días sin entrenar y sin motivo, no acepta el descanso', () => {
  // Última sesión hace ocho días: nada en los datos pide parar hoy.
  const briefing = briefingWith({}, [session({ dayKey: '2026-08-30' })])
  const verdict = evaluateChange(parseChangeRequest('hoy no quiero entrenar'), briefing)

  assert.equal(verdict.outcome, 'decline')
  assert.match(verdict.text, /d[ií]as sin entrenar/i)
})

test('insistir sin aportar nada nuevo no cambia el veredicto', () => {
  const briefing = briefingWith({}, [session()])
  const primero = evaluateChange(parseChangeRequest('hoy no quiero hacer piernas'), briefing)
  const segundo = evaluateChange(parseChangeRequest('venga, de verdad, piernas no'), briefing)

  assert.equal(primero.outcome, 'decline')
  assert.equal(segundo.outcome, 'decline')
  assert.equal(segundo.applyProposalId, null)
})

test('insistir sin argumentos mantiene el criterio y no repite el párrafo entero', () => {
  const briefing = briefingWith({}, [session()])

  const primera = answerFromBriefing('hoy no quiero hacer piernas', briefing, {
    lastIntent: 'change',
    changeMode: true,
  })
  assert.match(primera.text, /no lo quitar[ií]a/i)
  assert.ok(primera.changeRequest, 'la petición debe quedar registrada para el siguiente turno')

  const insistiendo = answerFromBriefing('venga porfa, de verdad', briefing, {
    lastIntent: 'change',
    changeMode: true,
    lastChangeRequest: primera.changeRequest,
  })

  assert.match(insistiendo.text, /sigo pensando lo mismo/i)
  assert.equal(insistiendo.applyProposalId, null, 'insistir no cambia la sesión')
  assert.notEqual(insistiendo.text, primera.text, 'no repite la misma parrafada')
  assert.ok(
    insistiendo.text.length < primera.text.length,
    'la respuesta a la insistencia es más corta, no más larga',
  )
})

test('aportar el dato que faltaba reabre la petición y cambia el veredicto', () => {
  const briefing = briefingWith({}, [session()])
  const memoria = { lastIntent: 'change' as const, changeMode: true }

  const negativa = answerFromBriefing('hoy no quiero hacer piernas', briefing, memoria)
  assert.match(negativa.text, /no lo quitar[ií]a/i, 'sin motivo, se niega')

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
  assert.match(conEvidencia.text, /me f[ií]o de lo que me cuentas/i)
  assert.ok(conEvidencia.applyProposalId, 'con la evidencia, la sesión cambia de verdad')
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

  if (verdict.applyProposalId !== null) {
    const ids = briefing.proposal!.alternatives.map((a) => a.id)
    assert.ok(
      ids.includes(verdict.applyProposalId),
      'no puede inventarse una sesión: elige entre las que ya existen',
    )
  }
})

test('pedir la zona que ya está prevista no cambia nada', () => {
  const briefing = briefingWith({}, [session()])
  const focus = briefing.proposal!.session!.focus
  const nombre = focus === 'tren_inferior' ? 'piernas' : 'tren superior'

  const verdict = evaluateChange(parseChangeRequest(`quiero hacer ${nombre}`), briefing)
  assert.equal(verdict.applyProposalId, null)
})

// ---------------------------------------------------------------------------
// Modo cambio
// ---------------------------------------------------------------------------

test('el mensaje de apertura parte de la sesión real y pide el motivo', () => {
  const briefing = briefingWith({}, [session()])
  const opening = changeOpeningMessage(briefing)

  assert.match(opening, /qué quieres cambiar/i)
  assert.match(opening, new RegExp(String(briefing.proposal!.session!.estimatedMinutes)))
})

test('en modo cambio, un mensaje suelto se lee como petición de cambio', () => {
  const briefing = briefingWith({}, [session()])
  const answer = negotiate('hoy no quiero hacer piernas', briefing)

  assert.equal(answer.intent, 'change')
  assert.match(answer.text, /no lo quitar[ií]a/i)
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
