/**
 * Tests de evolución construidos como los construye la aplicación: con
 * `startAssessment` y `recordResult`, nunca a mano. Solo para tests.
 */

import { recordResult, startAssessment } from './assessment'
import type { Assessment } from './types'

export type TestValues = {
  push: number
  core: number
  legs: number
  pull: [left: number, right: number]
}

export const SAMPLE_VALUES: TestValues = { push: 11, core: 56, legs: 62, pull: [10, 12] }

/** Un instante del día indicado, para que las fechas sean deterministas. */
export function at(dayKey: string, time = '18:00:00'): Date {
  return new Date(`${dayKey}T${time}.000Z`)
}

export function started(dayKey: string, variant = 'flexiones-inclinadas', id = `test-${dayKey}`): Assessment {
  const assessment = startAssessment({ dayKey, pushUpVariantId: variant, now: at(dayKey), id })
  if (!assessment) throw new Error(`variante no válida: ${variant}`)
  return assessment
}

export function completed(
  dayKey: string,
  values: TestValues = SAMPLE_VALUES,
  variant = 'flexiones-inclinadas',
): Assessment {
  let assessment = started(dayKey, variant)
  for (const value of [values.push, values.core, values.legs, values.pull[0], values.pull[1]]) {
    assessment = recordResult(assessment, value, at(dayKey, '18:10:00'))
  }
  return assessment
}
