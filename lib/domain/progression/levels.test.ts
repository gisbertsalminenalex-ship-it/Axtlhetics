/**
 * La curva de niveles (D-071), con la simulación que la justifica.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { completed, SAMPLE_VALUES } from '../assessment/test-fixtures'
import type { Assessment } from '../assessment/types'
import { addDays, daysBetween } from '../shared/dates'
import type { WorkoutSession } from '../workouts/types'
import { levelCost, levelState, rankOf, xpToReach } from './levels'
import { progression } from './progression'
import { session } from './test-fixtures'

test('cada nivel cuesta 100 XP más que el anterior', () => {
  assert.equal(levelCost(1), 400)
  assert.equal(levelCost(2), 500)
  assert.equal(xpToReach(1), 0)
  assert.equal(xpToReach(2), 400)
  assert.equal(xpToReach(3), 900)
})

test('el nivel y lo que falta salen de los XP acumulados', () => {
  assert.deepEqual(levelState(0), { level: 1, rank: 'arranque', rankLabel: 'Arranque', totalXp: 0, intoLevel: 0, levelXp: 400 })
  const state = levelState(1000)
  assert.equal(state.level, 3)
  assert.equal(state.intoLevel, 100)
  assert.equal(state.levelXp, 600)
})

test('rangos: Arranque, Plata, Oro, Legendario y Prime', () => {
  assert.deepEqual([1, 5, 10, 20, 35].map((level) => rankOf(level).label), ['Arranque', 'Plata', 'Oro', 'Legendario', 'Prime'])
  assert.equal(rankOf(9).label, 'Plata')
})

// ---------------------------------------------------------------------------
// Simulación: ¿cuánto tarda quien sigue razonablemente su plan?
//
// Bloques de 4 semanas + descarga. Un 10 % de las sesiones se pierden y una
// semana de cada 13 no se entrena. Una marca cada tres sesiones. Test cada 4
// semanas con dos pruebas mejoradas. Sin escaneos ni cinta: no hacen falta
// para progresar.
// ---------------------------------------------------------------------------

const START = '2026-01-05'
const DAYS_BY_PLAN: Record<number, number[]> = { 3: [0, 2, 4], 4: [0, 1, 3, 5], 6: [0, 1, 2, 3, 4, 5] }

function simulate(days: number, weeks: number) {
  const sessions: WorkoutSession[] = []
  const assessments: Assessment[] = []
  let count = 0
  let reps = 10
  for (let week = 0; week < weeks; week++) {
    if (week % 13 === 12) continue
    const monday = addDays(START, 7 * week)
    const deload = week % 5 === 4
    for (const offset of DAYS_BY_PLAN[days]) {
      count += 1
      if (count % 10 === 0) continue
      if (count % 3 === 0) reps += 1
      sessions.push(session(addDays(monday, offset), { reps, deload }))
    }
    if (week % 4 === 3) {
      const n = assessments.length
      assessments.push(completed(addDays(monday, 6), { ...SAMPLE_VALUES, push: SAMPLE_VALUES.push + n, core: SAMPLE_VALUES.core + n }))
    }
  }
  return progression({ sessions, assessments, scans: [], measurements: [], plannedDaysPerWeek: days })
}

function weeksTo(level: number, days: number): number | null {
  const reached = simulate(days, 160).levelsReached.find((item) => item.level === level)
  return reached ? Math.ceil((daysBetween(START, reached.dayKey) + 1) / 7) : null
}

test('simulación: al principio un nivel cada semana o así, y luego cuesta más', () => {
  const table = [3, 4, 6].map((days) => ({ days, ...Object.fromEntries([2, 5, 10, 20, 35].map((level) => [level, weeksTo(level, days)])) }))
  // Para ver la tabla: node --test … y descomentar.
  if (process.env.XP_TABLE) console.table(table)
  for (const row of table as Record<string, number | null>[]) {
    assert.ok(row[2]! <= 2, `nivel 2 en ${row[2]} semanas con ${row.days} días`)
    assert.ok(row[5]! >= 3 && row[5]! <= 8, `nivel 5 en ${row[5]} semanas con ${row.days} días`)
    assert.ok(row[10]! >= 8 && row[10]! <= 22, `nivel 10 en ${row[10]} semanas con ${row.days} días`)
    assert.ok(row[20] === null || row[20]! >= 26, `nivel 20 en ${row[20]} semanas con ${row.days} días`)
  }
  // Quien entrena 3 días no queda muy por detrás de quien entrena 6.
  const three = table[0] as Record<string, number>
  const six = table[2] as Record<string, number>
  assert.ok(three[10] <= six[10] * 1.8, `nivel 10: ${three[10]} semanas con 3 días frente a ${six[10]} con 6`)
})
