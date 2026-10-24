/**
 * Los XP (D-071).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { completed, SAMPLE_VALUES } from '../assessment/test-fixtures'
import type { BodyMeasurement } from '../body/measurements'
import type { ScanRecord } from '../scanner/types'
import { addDays } from '../shared/dates'
import { session } from './test-fixtures'
import { totalXp, xpLedger, XP, type XpInput } from './xp'

// Lunes 5 de octubre de 2026.
const MONDAY = '2026-10-05'

function input(partial: Partial<XpInput>): XpInput {
  return { sessions: [], assessments: [], scans: [], measurements: [], plannedDaysPerWeek: 3, ...partial }
}

const kinds = (partial: Partial<XpInput>) => xpLedger(input(partial)).map((event) => event.kind)

test('sin historial no hay XP: se empieza en cero', () => {
  assert.deepEqual(xpLedger(input({})), [])
})

test('una sesión al día: entrenar dos veces no da el doble', () => {
  const sessions = [session(MONDAY, { time: '08:00:00' }), session(MONDAY, { time: '19:00:00' })]
  assert.deepEqual(kinds({ sessions }), ['session'])
})

test('una sesión interrumpida o sin ninguna serie hecha no cuenta', () => {
  const empty = session(MONDAY)
  empty.exercises[0].sets[0].completed = false
  assert.deepEqual(kinds({ sessions: [session(MONDAY, { status: 'abandoned' }), empty] }), [])
})

test('la semana cumplida es la del plan del usuario, sin un día de más', () => {
  const sessions = [0, 2, 4, 5].map((day) => session(addDays(MONDAY, day)))
  const ledger = xpLedger(input({ sessions, plannedDaysPerWeek: 3 }))
  const week = ledger.filter((event) => event.kind === 'week')
  // Se gana el día que se completa la tercera; la cuarta no da otra.
  assert.equal(week.length, 1)
  assert.equal(week[0].dayKey, addDays(MONDAY, 4))
  // Quien entrena 4 días cumple con 4: no con 3.
  assert.equal(xpLedger(input({ sessions: sessions.slice(0, 3), plannedDaysPerWeek: 4 })).some((e) => e.kind === 'week'), false)
})

test('descansar no resta: una semana sin entrenar no quita nada', () => {
  const before = [0, 2, 4].map((day) => session(addDays(MONDAY, day)))
  const after = [14, 16, 18].map((day) => session(addDays(MONDAY, day)))
  const total = totalXp(xpLedger(input({ sessions: [...before, ...after] })))
  assert.equal(total, 2 * (3 * XP.session + XP.week))
})

test('marca personal: solo superando lo registrado antes, y como mucho dos al día', () => {
  const sessions = [session(MONDAY, { reps: 10 }), session(addDays(MONDAY, 2), { reps: 12 }), session(addDays(MONDAY, 4), { reps: 12 })]
  const records = xpLedger(input({ sessions })).filter((event) => event.kind === 'record')
  // La primera vez no hay marca y repetir el mismo resultado tampoco.
  assert.deepEqual(records.map((event) => event.dayKey), [addDays(MONDAY, 2)])
  // Una sesión posterior no le quita la marca a la anterior.
  const later = [...sessions, session(addDays(MONDAY, 7), { reps: 20 })]
  assert.equal(xpLedger(input({ sessions: later })).filter((event) => event.kind === 'record').length, 2)
})

test('el bloque se cierra con la descarga hecha, no antes', () => {
  const one = [session(MONDAY, { deload: true })]
  assert.equal(kinds({ sessions: one }).includes('block'), false)
  const two = [...one, session(addDays(MONDAY, 2), { deload: true }), session(addDays(MONDAY, 4), { deload: true })]
  const blocks = xpLedger(input({ sessions: two })).filter((event) => event.kind === 'block')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].xp, XP.block)
  // La semana de descarga se cumple con su plan, como cualquier otra.
  assert.equal(kinds({ sessions: two }).filter((kind) => kind === 'week').length, 1)
})

test('test: 200 al completarlo y 50 por prueba mejorada; repetirlo antes de 28 días no da más', () => {
  const first = completed(MONDAY)
  const better = completed(addDays(MONDAY, 28), { ...SAMPLE_VALUES, push: SAMPLE_VALUES.push + 2, core: SAMPLE_VALUES.core + 5 })
  const ledger = xpLedger(input({ assessments: [first, better] }))
  assert.deepEqual(ledger.map((event) => event.kind), ['test', 'test', 'test_improvement', 'test_improvement'])
  const retry = { ...completed(addDays(MONDAY, 30)), id: 'retry' }
  assert.equal(totalXp(xpLedger(input({ assessments: [first, better, retry] }))), totalXp(ledger))
})

test('no mejorar en el test no resta', () => {
  const worse = completed(addDays(MONDAY, 28), { ...SAMPLE_VALUES, push: SAMPLE_VALUES.push - 3 })
  assert.equal(totalXp(xpLedger(input({ assessments: [completed(MONDAY), worse] }))), 2 * XP.test)
})

test('revisión del mes: escaneo o cinta, una vez cada 28 días; pesarse no cuenta', () => {
  const scan = { dayKey: MONDAY, createdAt: `${MONDAY}T10:00:00.000Z` } as ScanRecord
  const scanAgain = { dayKey: addDays(MONDAY, 3), createdAt: `${addDays(MONDAY, 3)}T10:00:00.000Z` } as ScanRecord
  const tape: BodyMeasurement = { dayKey: addDays(MONDAY, 28), weightKg: null, perimeters: { brazo: 32 }, updatedAt: '' }
  const weight: BodyMeasurement = { dayKey: addDays(MONDAY, 60), weightKg: 70, perimeters: {}, updatedAt: '' }
  assert.deepEqual(kinds({ scans: [scan, scanAgain], measurements: [tape, weight] }), ['review', 'review'])
})

test('el mismo historial da siempre los mismos XP, en cualquier orden', () => {
  const sessions = [0, 2, 4, 7, 9].map((day, i) => session(addDays(MONDAY, day), { reps: 10 + i }))
  const a = xpLedger(input({ sessions }))
  const b = xpLedger(input({ sessions: [...sessions].reverse() }))
  assert.deepEqual(a, b)
})
