import assert from 'node:assert/strict'
import test from 'node:test'

import { computeRecoveryScore } from './score'
import {
  adjustSleepHours,
  DEFAULT_SLEEP_HOURS,
  formatSleepHours,
  MAX_SLEEP_HOURS,
  MIN_SLEEP_HOURS,
  normalizeEnergy,
  normalizeHydration,
  normalizeMuscleFatigue,
  normalizeSleep,
  normalizeStress,
  sleepReferenceForAge,
  SLEEP_OVERSHOOT_FLOOR,
} from './scales'
import type { RecoveryInputs, Scale5 } from './types'
import { bandFor, RECOVERY_MIN_FACTORS, RECOVERY_WEIGHTS } from './weights'

function inputs(partial: Partial<RecoveryInputs> = {}): RecoveryInputs {
  return {
    dayKey: '2026-09-08',
    sleepHours: null,
    energy: null,
    muscleFatigue: null,
    stress: null,
    hydrationGlasses: null,
    updatedAt: '2026-09-08T08:00:00.000Z',
    ...partial,
  }
}

test('los pesos aprobados suman exactamente 1', () => {
  const total = Object.values(RECOVERY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
  assert.equal(Math.round(total * 1000) / 1000, 1)
  assert.equal(RECOVERY_WEIGHTS.sleep, 0.35)
  assert.equal(RECOVERY_WEIGHTS.energy, 0.2)
  assert.equal(RECOVERY_WEIGHTS.muscleFatigue, 0.2)
  assert.equal(RECOVERY_WEIGHTS.stress, 0.15)
  assert.equal(RECOVERY_WEIGHTS.hydration, 0.1)
})

test('con todos los factores al máximo el score es 100', () => {
  const score = computeRecoveryScore(
    inputs({ sleepHours: 9, energy: 5, muscleFatigue: 1, stress: 1, hydrationGlasses: 8 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
  if (score.status !== 'ok') return
  assert.equal(score.value, 100)
  assert.equal(score.band, 'good')
})

test('con todos los factores al mínimo el score es 0', () => {
  const score = computeRecoveryScore(
    inputs({ sleepHours: 3, energy: 1, muscleFatigue: 5, stress: 5, hydrationGlasses: 0 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
  if (score.status !== 'ok') return
  assert.equal(score.value, 0)
  assert.equal(score.band, 'low')
})

test('la ponderación aplica los pesos aprobados', () => {
  // sueño 100 (9 h con 15 años), energía 50 (3), fatiga 50 (3), estrés 50 (3), hidratación 50 (4).
  // 0.35*100 + 0.65*50 = 67,5 → 68 redondeado.
  const score = computeRecoveryScore(
    inputs({ sleepHours: 9, energy: 3, muscleFatigue: 3, stress: 3, hydrationGlasses: 4 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
  if (score.status !== 'ok') return
  assert.equal(score.value, 68)
  assert.equal(score.band, 'moderate')
})

test('sin sueño registrado no se calcula nada, aunque sobren los demás datos', () => {
  const score = computeRecoveryScore(
    inputs({ energy: 5, muscleFatigue: 1, stress: 1, hydrationGlasses: 8 }),
  )
  assert.equal(score.status, 'insufficient_data')
  if (score.status !== 'insufficient_data') return
  assert.ok(score.missing.includes('sleep'))
  assert.match(score.reason, /sueño/i)
})

test('solo con sueño no hay factores suficientes', () => {
  const score = computeRecoveryScore(inputs({ sleepHours: 8 }), { age: 15 })
  assert.equal(score.status, 'insufficient_data')
})

test(`con sueño y ${RECOVERY_MIN_FACTORS - 1} factores más ya se calcula`, () => {
  const score = computeRecoveryScore(
    inputs({ sleepHours: 9, energy: 5, hydrationGlasses: 8 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
})

test('los factores ausentes no arrastran el resultado hacia abajo', () => {
  // Sueño 100 y energía 100; fatiga, estrés e hidratación sin registrar.
  // El peso se renormaliza sobre 0,35 + 0,20, así que el resultado es 100 y no 55.
  const score = computeRecoveryScore(
    inputs({ sleepHours: 9, energy: 5, hydrationGlasses: 8 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
  if (score.status !== 'ok') return
  assert.equal(score.value, 100)
})

test('el resultado nunca es NaN aunque las horas de sueño sean absurdas', () => {
  const score = computeRecoveryScore(
    inputs({ sleepHours: Number.NaN, energy: 3, muscleFatigue: 3, stress: 3 }),
    { age: 15 },
  )
  assert.equal(score.status, 'ok')
  if (score.status !== 'ok') return
  assert.ok(Number.isFinite(score.value))
})

test('las bandas semánticas respetan los umbrales aprobados', () => {
  // 0–49 rojo, 50–74 naranja, 75–100 verde.
  assert.equal(bandFor(0), 'low')
  assert.equal(bandFor(49), 'low')
  assert.equal(bandFor(50), 'moderate')
  assert.equal(bandFor(74), 'moderate')
  assert.equal(bandFor(75), 'good')
  assert.equal(bandFor(100), 'good')
})

test('el score calculado cae en la banda que le corresponde', () => {
  const good = computeRecoveryScore(
    inputs({ sleepHours: 9, energy: 5, muscleFatigue: 1, stress: 1, hydrationGlasses: 8 }),
    { age: 15 },
  )
  const low = computeRecoveryScore(
    inputs({ sleepHours: 4.5, energy: 1, muscleFatigue: 5, stress: 5, hydrationGlasses: 0 }),
    { age: 15 },
  )
  assert.equal(good.status === 'ok' && good.band, 'good')
  assert.equal(low.status === 'ok' && low.band, 'low')
})

// ---------------------------------------------------------------------------
// Sueño y edad
// ---------------------------------------------------------------------------

test('la referencia de sueño de un adolescente es 8–10 h', () => {
  assert.deepEqual(sleepReferenceForAge(15), { min: 8, max: 10, label: '8–10 h' })
  assert.deepEqual(sleepReferenceForAge(13), { min: 8, max: 10, label: '8–10 h' })
  assert.deepEqual(sleepReferenceForAge(18), { min: 8, max: 10, label: '8–10 h' })
})

test('la referencia de un adulto es 7–9 h', () => {
  assert.deepEqual(sleepReferenceForAge(30), { min: 7, max: 9, label: '7–9 h' })
})

test('8 horas puntúan 100 con 15 años pero 10 horas también', () => {
  assert.equal(normalizeSleep(8, 15), 100)
  assert.equal(normalizeSleep(10, 15), 100)
})

test('la misma cantidad de sueño se juzga distinto según la edad', () => {
  // 10 h está dentro de banda para un adolescente y por encima para un adulto.
  assert.equal(normalizeSleep(10, 15), 100)
  assert.ok(normalizeSleep(10, 30) < 100)
  // 7 h es suficiente para un adulto y escaso para un adolescente.
  assert.equal(normalizeSleep(7, 30), 100)
  assert.ok(normalizeSleep(7, 15) < 100)
})

test('dormir de más no se penaliza de forma rígida', () => {
  const twelve = normalizeSleep(12, 15)
  const fourteen = normalizeSleep(14, 15)
  assert.ok(twelve >= SLEEP_OVERSHOOT_FLOOR, `12 h debería seguir siendo alto, fue ${twelve}`)
  assert.ok(fourteen >= SLEEP_OVERSHOOT_FLOOR, `14 h no debería hundirse, fue ${fourteen}`)
  assert.ok(twelve > fourteen || twelve === fourteen)
})

test('la falta de sueño baja de forma progresiva, no de golpe', () => {
  assert.equal(normalizeSleep(4, 15), 0)
  assert.equal(normalizeSleep(6, 15), 50)
  assert.ok(normalizeSleep(2, 15) === 0)
  assert.ok(normalizeSleep(7, 15) > normalizeSleep(6, 15))
})

test('el selector de sueño sube y baja en medias horas y respeta los límites', () => {
  assert.equal(adjustSleepHours(null, 1), DEFAULT_SLEEP_HOURS + 0.5)
  assert.equal(adjustSleepHours(null, -1), DEFAULT_SLEEP_HOURS - 0.5)
  assert.equal(adjustSleepHours(8, 2), 9)

  let low = 8
  for (let i = 0; i < 100; i += 1) low = adjustSleepHours(low, -1)
  assert.equal(low, MIN_SLEEP_HOURS)

  let high = 8
  for (let i = 0; i < 100; i += 1) high = adjustSleepHours(high, 1)
  assert.equal(high, MAX_SLEEP_HOURS)
})

test('el formato de sueño distingue horas enteras de horas y minutos', () => {
  assert.equal(formatSleepHours(null), '—')
  assert.equal(formatSleepHours(8), '8h')
  assert.equal(formatSleepHours(8.5), '8h 30m')
  assert.equal(formatSleepHours(Number.NaN), '—')
})

// ---------------------------------------------------------------------------
// Escalas simples
// ---------------------------------------------------------------------------

test('energía va de 0 a 100 en sentido directo', () => {
  const expected: Record<Scale5, number> = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 }
  for (const [level, value] of Object.entries(expected)) {
    assert.equal(normalizeEnergy(Number(level) as Scale5), value)
  }
})

test('fatiga y estrés se invierten: más alto es peor', () => {
  assert.equal(normalizeMuscleFatigue(1), 100)
  assert.equal(normalizeMuscleFatigue(5), 0)
  assert.equal(normalizeStress(1), 100)
  assert.equal(normalizeStress(5), 0)
})

test('la hidratación se mide sobre 8 vasos', () => {
  assert.equal(normalizeHydration(0), 0)
  assert.equal(normalizeHydration(4), 50)
  assert.equal(normalizeHydration(8), 100)
  assert.equal(normalizeHydration(12), 100, 'pasarse de 8 no puntúa por encima de 100')
  assert.equal(normalizeHydration(-3), 0)
})
