/**
 * El punto de partida y la revisión del mes (D-067).
 *
 * Lo que se mide depende de los objetivos de entreno: quien quiere ganar masa
 * muscular se mide brazo, pecho y muslo; quien busca salud general, la
 * cintura; quien quiere fuerza, resistencia o rendimiento, hace el test de
 * evolución (D-021). En el onboarding se toma el punto de partida y cada 28
 * días AXIS pide repetirlo para comparar con el primer día y con el mes
 * anterior.
 *
 * Todo lo de aquí es puro.
 */

import { lastCompletedAssessment } from '../assessment/assessment'
import type { Assessment } from '../assessment/types'
import type { TrainingGoal } from '../profile/types'
import { daysBetween, type DayKey } from '../shared/dates'
import { listNames } from '../shared/text'
import { PERIMETER_LABELS, PERIMETER_ORDER, sortMeasurements, type BodyMeasurement, type PerimeterKey } from './measurements'

/** Cada cuánto se repite la revisión: el mismo intervalo que el test de evolución. */
export const MONTHLY_CHECK_DAYS = 28

export type GoalMeasures = {
  /** Pesarse forma parte de la revisión. */
  weight: boolean
  perimeters: PerimeterKey[]
  /** El test de evolución es el punto de partida (fuerza, resistencia, rendimiento). */
  test: boolean
}

const BY_GOAL: Record<TrainingGoal, Partial<GoalMeasures>> = {
  hipertrofia: { weight: true, perimeters: ['brazo', 'pecho', 'muslo'] },
  salud_general: { weight: true, perimeters: ['cintura'] },
  fuerza: { test: true },
  resistencia: { test: true },
  rendimiento_deportivo: { test: true },
  movilidad: {},
  tecnica: {},
}

/** Lo que piden los objetivos, juntos y sin repetir. */
export function goalMeasures(goals: readonly TrainingGoal[]): GoalMeasures {
  const parts = goals.map((goal) => BY_GOAL[goal] ?? {})
  return {
    weight: parts.some((part) => part.weight),
    perimeters: PERIMETER_ORDER.filter((key) => parts.some((part) => part.perimeters?.includes(key))),
    test: parts.some((part) => part.test),
  }
}

export function needsBaseline(measures: GoalMeasures): boolean {
  return measures.weight || measures.perimeters.length > 0 || measures.test
}

/** El último día en que se midió alguno de estos perímetros, o `null`. */
function lastTaped(records: readonly BodyMeasurement[], keys: readonly PerimeterKey[]): DayKey | null {
  const last = sortMeasurements(records)
    .reverse()
    .find((record) => keys.some((key) => typeof record.perimeters[key] === 'number'))
  return last?.dayKey ?? null
}

export type MonthlyCheck = {
  /** Los perímetros que toca medir hoy; vacío si no toca. */
  perimeters: PerimeterKey[]
  /** Toca pesarse junto a la cinta. */
  weight: boolean
  /** Toca el test de evolución. */
  test: boolean
}

/**
 * Lo que toca en la revisión del mes, o `null` si hoy no toca nada: la cinta
 * cuando nunca se midió o hace 28 días o más, y el test cuando nunca se hizo o
 * hace 28 días o más.
 */
export function monthlyCheckDue(input: {
  goals: readonly TrainingGoal[]
  records: readonly BodyMeasurement[]
  assessments: readonly Assessment[]
  today: DayKey
}): MonthlyCheck | null {
  const measures = goalMeasures(input.goals)
  const taped = measures.perimeters.length > 0 ? lastTaped(input.records, measures.perimeters) : null
  const tapeDue =
    measures.perimeters.length > 0 && (taped === null || daysBetween(taped, input.today) >= MONTHLY_CHECK_DAYS)
  const lastTest = measures.test ? lastCompletedAssessment(input.assessments) : null
  const testDue = measures.test && (lastTest === null || daysBetween(lastTest.dayKey, input.today) >= MONTHLY_CHECK_DAYS)
  if (!tapeDue && !testDue) return null
  return { perimeters: tapeDue ? measures.perimeters : [], weight: tapeDue && measures.weight, test: testDue }
}

/** La nota de AXIS para el día de la revisión (D-038). */
export function monthlyCheckText(check: MonthlyCheck, firstTime: boolean): string {
  const parts: string[] = []
  if (check.perimeters.length > 0) {
    const zones = listNames(check.perimeters.map((key) => PERIMETER_LABELS[key].toLowerCase()))
    parts.push(`${check.weight ? 'pésate y mide' : 'mide'} ${zones}`)
  }
  if (check.test) parts.push('haz el test de evolución')
  const what = listNames(parts)
  return firstTime
    ? `Falta tu punto de partida: ${what}. Así cada mes verás cuánto has cambiado.`
    : `Toca tu revisión del mes: ${what}, y verás cuánto has cambiado desde el principio.`
}

export type MeasureKey = 'peso' | PerimeterKey

export type MeasureEvolution = {
  key: MeasureKey
  label: string
  unit: 'kg' | 'cm'
  first: { dayKey: DayKey; value: number }
  /** La medida de hace un mes (la última al menos 21 días antes de la actual), si la hay. */
  previous: { dayKey: DayKey; value: number } | null
  latest: { dayKey: DayKey; value: number }
}

/** Margen para considerar «el mes anterior» una medida algo adelantada. */
const PREVIOUS_MIN_DAYS = 21

/**
 * La evolución de lo que piden los objetivos: el primer día, el mes anterior y
 * ahora. Solo las medidas con al menos dos registros.
 */
export function goalEvolution(goals: readonly TrainingGoal[], records: readonly BodyMeasurement[]): MeasureEvolution[] {
  const measures = goalMeasures(goals)
  const sorted = sortMeasurements(records)
  const keys: MeasureKey[] = [...(measures.weight ? (['peso'] as const) : []), ...measures.perimeters]
  const result: MeasureEvolution[] = []
  for (const key of keys) {
    const points = sorted.flatMap((record) => {
      const value = key === 'peso' ? record.weightKg : record.perimeters[key]
      return typeof value === 'number' ? [{ dayKey: record.dayKey, value }] : []
    })
    if (points.length < 2) continue
    const latest = points[points.length - 1]
    const previous =
      [...points].reverse().find((point) => point !== points[0] && daysBetween(point.dayKey, latest.dayKey) >= PREVIOUS_MIN_DAYS) ?? null
    result.push({
      key,
      label: key === 'peso' ? 'Peso' : PERIMETER_LABELS[key],
      unit: key === 'peso' ? 'kg' : 'cm',
      first: points[0],
      previous,
      latest,
    })
  }
  return result
}
