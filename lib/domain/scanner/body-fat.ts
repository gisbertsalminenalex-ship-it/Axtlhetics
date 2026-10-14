/**
 * Porcentaje de grasa estimado (D-023, enmienda del 2026-10-14).
 *
 * Fórmula de la Marina de EE. UU. (Hodgdon y Beckett), con perímetros en
 * centímetros. Cada perímetro se estima como una elipse: la anchura de frente y
 * la profundidad de perfil, medidas en la foto como fracción de la altura del
 * cuerpo, que la altura del perfil pasa a centímetros.
 *
 * Es una **estimación con margen**, nunca una medida médica: no ve la grasa
 * interna, y la ropa y la postura la mueven. No se usa ninguna textura, sombra ni
 * IA que mire la foto: solo perímetros y altura.
 */

import { NAVY } from './scales'
import type { ScanPose } from './measure'

export type ScanSex = 'hombre' | 'mujer'
export const SCAN_SEXES: readonly ScanSex[] = ['hombre', 'mujer']

export type BodyFatEstimate = {
  pct: number
  marginPct: number
  /** Perímetros estimados, en cm, para el detalle. La cadera solo en mujeres. */
  neckCm: number
  waistCm: number
  hipCm: number | null
}

export type BodyFatMissing = 'no_sex' | 'no_height' | 'no_front' | 'no_side' | 'out_of_range'

/** Lee una medida estable de una pose (la mediana de sus fotos, si no varían más que su margen). */
export type StableReader = (pose: ScanPose, key: string) => number | null

/** Perímetro de una elipse con estos dos diámetros (aproximación de Ramanujan). */
export function ellipsePerimeter(width: number, depth: number): number {
  const a = width / 2
  const b = depth / 2
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

/**
 * Fórmula de la Marina, en centímetros. `null` si los perímetros no tienen
 * sentido (la cintura no supera al cuello) o el resultado cae fuera del rango
 * creíble (`NAVY.validPct`).
 */
export function navyBodyFat(sex: ScanSex, cm: { neck: number; waist: number; hip?: number | null; height: number }): number | null {
  const log = Math.log10
  let pct: number
  if (sex === 'hombre') {
    if (cm.waist - cm.neck <= 0) return null
    pct = 495 / (1.0324 - 0.19077 * log(cm.waist - cm.neck) + 0.15456 * log(cm.height)) - 450
  } else {
    if (!cm.hip || cm.waist + cm.hip - cm.neck <= 0) return null
    pct = 495 / (1.29579 - 0.35004 * log(cm.waist + cm.hip - cm.neck) + 0.221 * log(cm.height)) - 450
  }
  if (!Number.isFinite(pct) || pct < NAVY.validPct.min || pct > NAVY.validPct.max) return null
  return pct
}

/**
 * La estimación a partir de las fotos de frente y de perfil. Los hombres usan la
 * cintura a la altura del ombligo; las mujeres, la más estrecha, y la cadera.
 */
export function estimateBodyFat(
  read: StableReader,
  sex: ScanSex | null | undefined,
  heightCm: number | null | undefined,
): { ok: true; estimate: BodyFatEstimate } | { ok: false; missing: BodyFatMissing } {
  if (!sex) return { ok: false, missing: 'no_sex' }
  if (!heightCm || heightCm <= 0) return { ok: false, missing: 'no_height' }
  const waistKey = sex === 'hombre' ? 'waist' : 'waistNarrow'
  const front = { neck: read('front', 'neckWidthH'), waist: read('front', `${waistKey}WidthH`), hip: read('front', 'hipWidthH') }
  const side = { neck: read('side', 'neckDepthH'), waist: read('side', `${waistKey}DepthH`), hip: read('side', 'hipDepthH') }
  const needsHip = sex === 'mujer'
  if (front.neck === null || front.waist === null || (needsHip && front.hip === null)) return { ok: false, missing: 'no_front' }
  if (side.neck === null || side.waist === null || (needsHip && side.hip === null)) return { ok: false, missing: 'no_side' }
  const perimeter = (width: number, depth: number) => ellipsePerimeter(width * heightCm, depth * heightCm)
  const neckCm = perimeter(front.neck, side.neck)
  const waistCm = perimeter(front.waist, side.waist)
  const hipCm = needsHip ? perimeter(front.hip!, side.hip!) : null
  const pct = navyBodyFat(sex, { neck: neckCm, waist: waistCm, hip: hipCm, height: heightCm })
  if (pct === null) return { ok: false, missing: 'out_of_range' }
  const round1 = (n: number) => Math.round(n * 10) / 10
  return { ok: true, estimate: { pct: round1(pct), marginPct: NAVY.marginPct, neckCm: round1(neckCm), waistCm: round1(waistCm), hipCm: hipCm === null ? null : round1(hipCm) } }
}
