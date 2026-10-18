/**
 * AXIS y el escáner corporal (D-023): informa, ofrece opciones y el usuario
 * decide (`P-017`). Nada del escaneo sale hacia la capa de lenguaje.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import type { ScanZone } from '../scanner/summary'
import type { ScanRecord } from '../scanner/types'
import type { WorkoutSession } from '../workouts/types'
import { proposeAction } from './action-engine'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { toAiBriefing, type AxisAiTransportRequest, type AxisAiTransport } from './conversation/ai'
import { answerFromBriefing } from './conversation/deterministic'
import { createAxisConversation } from './conversation/index'
import { decide } from './engine'

const NOW = new Date(2026, 8, 7, 10, 0)
const SCAN_DAY = '2026-09-03'

const profile: UserProfile = {
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
}

const GOOD: RecoveryInputs = { dayKey: '2026-09-07', sleepHours: 9, energy: 4, muscleFatigue: 2, stress: 2, hydrationGlasses: 6, updatedAt: '2026-09-07T08:00:00.000Z' }

function session(dayKey: string, focus: WorkoutSession['focus'], muscleGroups: WorkoutSession['muscleGroups']): WorkoutSession {
  return {
    id: `s-${dayKey}`, dayKey, startedAt: `${dayKey}T18:00:00.000Z`, completedAt: `${dayKey}T19:00:00.000Z`, durationSeconds: 3600,
    focus, title: 'Fuerza', intensity: 'moderada', muscleGroups, exercises: [], totalVolumeKg: 0, status: 'completed',
    perceivedEffort: 3, proposal: null, modifications: [], notes: null,
  }
}

function scan(weakZones: ScanZone[]): ScanRecord {
  return {
    id: 'scan-1',
    dayKey: SCAN_DAY,
    createdAt: `${SCAN_DAY}T18:00:00.000Z`,
    protocolVersion: 1,
    selfReport: { build: 'media', strongZones: [], weakZones, priority: 'musculo' },
    measurements: {
      front: [{ shoulderTiltDeg: { value: 0.5 }, hipTiltDeg: { value: 0.4 } }, { shoulderTiltDeg: { value: 0.7 }, hipTiltDeg: { value: 0.5 } }],
      side: [{ headForwardPct: { value: 18 } }, { headForwardPct: { value: 19 } }],
    },
    result: { index: 74, scores: { symmetry: 100, postureMobility: 13 } },
    thumbnails: { front: 'data:image/jpeg;base64,/9j/AAAA' },
  }
}

function setup(scans: ScanRecord[], sessions = [session('2026-09-05', 'tren_inferior', ['piernas', 'gluteos'])]) {
  const context = buildAxisContext({ profile, recoveryInputs: GOOD, recentSessions: sessions, activities: [], scans, now: NOW })
  const decision = decide(context)
  const briefing = buildBriefing(context, decision, sessions, decision.primary)
  return { context, decision, briefing, day: { context, decision, selected: decision.primary } }
}

test('sin escaneo: lo dice y explica dónde está, sin inventar nada', () => {
  const answer = answerFromBriefing('¿Qué tal mi escaneo?', setup([]).briefing)
  assert.equal(answer.intent, 'scan')
  assert.match(answer.text, /Todavía no tienes ningún escaneo corporal/)
  assert.equal(answer.proposedTarget ?? null, null)
})

test('con escaneo: la conclusión del resumen, las opciones y «tú decides»', () => {
  const { briefing } = setup([scan(['espalda'])])
  assert.ok(briefing.scan)
  const answer = answerFromBriefing('¿Qué dice mi escaneo?', briefing)
  assert.equal(answer.intent, 'scan')
  assert.match(answer.text, /^En tu escaneo del jueves 3 de septiembre: /)
  assert.match(answer.text, /Tus opciones: 1\) /)
  assert.match(answer.text, /Tú decides\.$/)
})

test('si hoy ya se trabaja la zona floja, la opción es seguir con la sesión de hoy y no se propone cambio', () => {
  const { briefing } = setup([scan(['espalda'])])
  assert.equal(briefing.proposal?.session?.focus, 'tren_superior', 'el motor propone tren superior tras piernas')
  const answer = answerFromBriefing('¿y mi escaneo?', briefing)
  assert.match(answer.text, /seguir con la sesión de hoy, que ya trabaja espalda/)
  assert.equal(answer.proposedTarget ?? null, null)
})

test('si hoy no se trabaja, propone una alternativa ya preparada por el motor, que el usuario confirma', () => {
  const { briefing, day } = setup([scan(['piernas'])])
  const answer = answerFromBriefing('¿Qué opciones me da mi escaneo?', briefing)
  if (answer.proposedTarget) {
    // La alternativa existe en la decisión de hoy: se convierte en una acción con botón.
    assert.match(answer.text, /cambiar hoy a «.+», que trabaja piernas/)
    assert.ok(briefing.proposal?.alternatives.some((alt) => alt.focus === answer.proposedTarget?.focus))
    const action = proposeAction(day, answer)
    assert.equal(action?.type, 'change_training')
  } else {
    // Si el motor no preparó ninguna, no se inventa: solo se informa.
    assert.doesNotMatch(answer.text, /cambiar hoy a/)
  }
  assert.match(answer.text, /seguir con la sesión de hoy tal como está/)
})

test('un seguimiento como «¿qué opciones tengo?» sigue hablando del escaneo', () => {
  const { briefing } = setup([scan(['espalda'])])
  const answer = answerFromBriefing('¿qué opciones tengo?', briefing, { lastIntent: 'scan', changeMode: false, lastChangeRequest: null })
  assert.equal(answer.intent, 'scan')
})

test('el escaneo nunca sale hacia la capa de lenguaje: ni la clave ni sus datos', async () => {
  const { briefing } = setup([scan(['espalda'])])
  const sent = toAiBriefing(briefing)
  assert.equal('scan' in sent, false)
  assert.doesNotMatch(JSON.stringify(sent), /data:image|2026-09-03|weakZones|espalda.*musculo/)

  const requests: AxisAiTransportRequest[] = []
  const transport: AxisAiTransport = { isConfigured: () => true, async send(request) { requests.push(request); return { text: 'Hoy toca tren superior.' } } }
  const conversation = createAxisConversation({ transport })
  // Una pregunta que sí puede pasar por el modelo: su briefing no lleva el escaneo.
  await conversation.ask('¿Por qué este entrenamiento?', briefing)
  for (const request of requests) {
    assert.equal('scan' in request.briefing, false)
    assert.doesNotMatch(JSON.stringify(request), /data:image|weakZones|2026-09-03/)
  }
})

test('las preguntas sobre el escaneo nunca llegan al proveedor', async () => {
  const { briefing } = setup([scan(['espalda'])])
  const requests: AxisAiTransportRequest[] = []
  const transport: AxisAiTransport = { isConfigured: () => true, async send(request) { requests.push(request); return { text: 'No debería llamarse.' } } }
  const conversation = createAxisConversation({ transport })
  for (const question of ['¿Qué dice mi escaneo?', '¿cómo está mi simetría?', '¿qué tal mi físico?']) {
    const result = await conversation.ask(question, briefing)
    assert.equal(result.intent, 'scan', question)
  }
  assert.equal(requests.length, 0)
})

test('D-041: el motor usa el escaneo: no cambia si se entrena, sí cómo, y lo explica', () => {
  const without = setup([]).decision
  const withScan = setup([scan(['piernas', 'pecho'])]).decision

  // Si se entrena hoy lo siguen decidiendo la recuperación y el calendario.
  assert.equal(withScan.primary.type, without.primary.type)

  // Cómo: la cabeza adelantada (18–19 %) pide movilidad de hombro en el calentamiento…
  const warmup = withScan.primary.session!.exercises.filter((item) => item.phase === 'calentamiento').map((item) => item.exerciseId)
  assert.ok(warmup.includes('angeles-pared'), warmup.join(', '))
  // …y lo dice, entre los factores del día.
  const factor = withScan.primary.factors.find((item) => item.key === 'body_scan')
  assert.ok(factor)
  assert.match(factor!.detail, /^Por tu escaneo, priorizo .*piernas.*pecho|^Por tu escaneo, priorizo .*pecho.*piernas/)
  assert.ok(!without.primary.factors.some((item) => item.key === 'body_scan'))
})

test('D-041: AXIS cuenta lo que el escaneo ya cambia en las sesiones', () => {
  const { briefing } = setup([scan(['piernas'])])
  const answer = answerFromBriefing('¿qué tal mi escaneo?', briefing)
  assert.match(answer.text, /Con tu escaneo ya ajusto tus sesiones: .*cabeza se adelanta/)
})

test('con dos escaneos, AXIS cuenta qué ha cambiado desde el anterior (y sigue sin salir nada)', () => {
  const older: ScanRecord = {
    ...scan(['espalda']),
    id: 'scan-0',
    dayKey: '2026-08-01',
    createdAt: '2026-08-01T18:00:00.000Z',
    measurements: { side: [{ headForwardPct: { value: 30 } }, { headForwardPct: { value: 31 } }] },
    result: { index: 60, scores: {} },
  }
  const { briefing } = setup([scan(['espalda']), older])
  assert.ok(briefing.scan?.comparison)
  const answer = answerFromBriefing('¿Qué dice mi escaneo?', briefing)
  assert.match(answer.text, /desde tu escaneo del sábado 1 de agosto/)
  assert.match(answer.text, /llevas la cabeza menos adelantada \(30,5 % → 18,5 %\)/)
  assert.equal('scan' in toAiBriefing(briefing), false)
})
