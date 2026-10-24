/**
 * Diagnóstico automático del escaneo (D-068): lo que antes se preguntaba
 * («¿cómo es tu complexión?», «¿dónde te ves con más y con menos músculo?») se
 * deduce de las medidas de las fotos y del perfil.
 *
 * - **Complexión**: ectomorfa, mesomorfa o endomorfa, con la escala de
 *   Heath-Carter (`BUILD_SCALE`): el índice altura/peso del perfil, el % de grasa
 *   estimado y la «V» hombros/cintura de la foto.
 * - **Zonas que destacan y zonas que van por detrás**: la foto de frente frente
 *   a un físico equilibrado (`PHYSIQUE_REFERENCE`, D-041).
 * - **Asimetrías**: lo que queda claramente fuera en la simetría.
 *
 * Es la forma en la foto y una estimación, nunca un diagnóstico médico, y se
 * dice así. Recibe un lector de medidas estables (como `body-fat.ts`) para no
 * depender del resumen.
 */

import type { PerimeterKey } from '../body/measurements'
import type { ScanSex, StableReader } from './body-fat'
import { BUILD_SCALE, clearly, PHYSIQUE_REFERENCE, STRONG_ZONE_MARGIN, SYMMETRY_SCALES, TAPE_REFERENCE } from './scales'
import type { ScanZone } from './summary'

export type Somatotype = 'ectomorfa' | 'mesomorfa' | 'endomorfa'
export const SOMATOTYPE_LABELS: Record<Somatotype, string> = {
  ectomorfa: 'Ectomorfa',
  mesomorfa: 'Mesomorfa',
  endomorfa: 'Endomorfa',
}

export type BuildEstimate = {
  type: Somatotype
  /** El segundo componente, si queda cerca del primero: «mesomorfa con tendencia ectomorfa». */
  leaning: Somatotype | null
  /** Escala 1–7 de Heath-Carter, solo de los componentes que se pudieron estimar. */
  ratings: Partial<Record<Somatotype, number>>
}

/** De dónde sale una zona fuerte o floja: la «V» o el equilibrio brazo/muslo de la foto, o la cinta (D-069). */
export type ZoneReading = {
  source: 'shoulderToWaist' | 'armToThigh' | 'tapeArmToThigh' | 'tapeChestToWaist'
  value: number
  /** La referencia con la que se compara (para la «V», la de su sexo). */
  reference: number
  strong: ScanZone[]
  weak: ScanZone[]
}

export type ScanDiagnosis = {
  build: BuildEstimate | null
  /** Zonas con más desarrollo relativo en la foto. */
  strongZones: ScanZone[]
  /** Zonas con menos desarrollo relativo en la foto. */
  weakZones: ScanZone[]
  /** Diferencias claras entre lados, una frase cada una. */
  asymmetries: string[]
}

export type DiagnosisInput = {
  read: StableReader
  sex?: ScanSex | null
  body?: { heightCm: number; weightKg?: number } | null
  bodyFatPct?: number | null
  /** Los últimos perímetros con cinta, en cm (D-069). */
  tape?: Partial<Record<PerimeterKey, number>> | null
}

export function diagnoseScan(input: DiagnosisInput): ScanDiagnosis {
  const { strong, weak } = zonesOf(allZoneReadings(input.read, input.sex, input.tape ?? null))
  return {
    build: estimateBuild(input),
    strongZones: strong,
    weakZones: weak,
    asymmetries: detectAsymmetries(input.read),
  }
}

/** La foto y la cinta juntas. La cinta mide el perímetro: donde la hay, manda sobre la anchura en la foto (D-069). */
export function allZoneReadings(read: StableReader, sex?: ScanSex | null, tape?: Partial<Record<PerimeterKey, number>> | null): ZoneReading[] {
  const fromTape = tapeReadings(tape ?? null, sex)
  const photo = zoneReadings(read, sex).filter((r) => !(r.source === 'armToThigh' && fromTape.some((t) => t.source === 'tapeArmToThigh')))
  return [...photo, ...fromTape]
}

/** Las zonas fuertes y flojas de unas lecturas. Si dos lecturas no coinciden en una zona, no es ni una cosa ni otra. */
export function zonesOf(readings: readonly ZoneReading[]): { strong: ScanZone[]; weak: ScanZone[] } {
  const strong = unique(readings.flatMap((r) => r.strong))
  const weak = unique(readings.flatMap((r) => r.weak))
  return { strong: strong.filter((z) => !weak.includes(z)), weak: weak.filter((z) => !strong.includes(z)) }
}

/**
 * La foto de frente frente a un físico equilibrado. Por debajo de la «V» de
 * referencia, hombros y espalda van por detrás; claramente por encima,
 * destacan. Con el brazo por detrás del muslo, destacan las piernas, y al revés.
 */
export function zoneReadings(read: StableReader, sex?: ScanSex | null): ZoneReading[] {
  const out: ZoneReading[] = []
  const v = read('front', 'shoulderToWaist')
  const vTarget = PHYSIQUE_REFERENCE.shoulderToWaist[sex ?? 'sin_dato']
  if (v !== null) {
    if (v < vTarget) out.push({ source: 'shoulderToWaist', value: v, reference: vTarget, strong: [], weak: ['hombros', 'espalda'] })
    else if (v >= vTarget * (1 + STRONG_ZONE_MARGIN)) out.push({ source: 'shoulderToWaist', value: v, reference: vTarget, strong: ['hombros', 'espalda'], weak: [] })
  }
  const arm = read('front', 'upperArmMean')
  const thigh = read('front', 'thighMean')
  if (arm !== null && thigh !== null && thigh > 0) {
    const ratio = arm / thigh
    const { min, max } = PHYSIQUE_REFERENCE.armToThigh
    if (ratio < min) out.push({ source: 'armToThigh', value: ratio, reference: min, strong: ['piernas'], weak: ['brazos'] })
    else if (ratio > max) out.push({ source: 'armToThigh', value: ratio, reference: max, strong: ['brazos'], weak: ['piernas'] })
  }
  return out
}

/**
 * La cinta (D-069): brazo frente a muslo y, en hombres, pecho frente a cintura,
 * con las referencias provisionales de `TAPE_REFERENCE`.
 */
export function tapeReadings(tape: Partial<Record<PerimeterKey, number>> | null, sex?: ScanSex | null): ZoneReading[] {
  if (!tape) return []
  const out: ZoneReading[] = []
  const { brazo, muslo, pecho, cintura } = tape
  if (brazo && muslo) {
    const ratio = brazo / muslo
    const { min, max } = TAPE_REFERENCE.armToThigh[sex ?? 'sin_dato']
    if (ratio < min) out.push({ source: 'tapeArmToThigh', value: ratio, reference: min, strong: ['piernas'], weak: ['brazos'] })
    else if (ratio > max) out.push({ source: 'tapeArmToThigh', value: ratio, reference: max, strong: ['brazos'], weak: ['piernas'] })
  }
  if (sex === 'hombre' && pecho && cintura) {
    const ratio = pecho / cintura
    const { min, strong } = TAPE_REFERENCE.chestToWaist
    if (ratio < min) out.push({ source: 'tapeChestToWaist', value: ratio, reference: min, strong: [], weak: ['pecho'] })
    else if (ratio >= strong) out.push({ source: 'tapeChestToWaist', value: ratio, reference: strong, strong: ['pecho'], weak: [] })
  }
  return out
}

/** Diferencias entre lados claramente fuera de lo normal en una foto. */
export function detectAsymmetries(read: StableReader): string[] {
  const out: string[] = []
  const shoulders = read('front', 'shoulderTiltDeg')
  if (shoulders !== null && Math.abs(shoulders) > clearly(SYMMETRY_SCALES.shoulderTiltDeg)) {
    out.push(`El hombro ${shoulders > 0 ? 'izquierdo' : 'derecho'} queda más alto que el otro`)
  }
  const hips = read('front', 'hipTiltDeg')
  if (hips !== null && Math.abs(hips) > clearly(SYMMETRY_SCALES.hipTiltDeg)) {
    out.push(`La cadera ${hips > 0 ? 'izquierda' : 'derecha'} queda más alta que la otra`)
  }
  const arms = read('arms_up', 'armsDiffDeg')
  if (arms !== null && Math.abs(arms) > clearly(SYMMETRY_SCALES.armsDiffDeg)) {
    out.push(`El brazo ${arms > 0 ? 'derecho' : 'izquierdo'} sube menos que el otro`)
  }
  return out
}

/** La complexión en la escala de Heath-Carter, con al menos dos de sus tres componentes. */
export function estimateBuild(input: DiagnosisInput): BuildEstimate | null {
  const ratings: Partial<Record<Somatotype, number>> = {}
  const { heightCm, weightKg } = input.body ?? {}
  if (heightCm && weightKg && heightCm > 0 && weightKg > 0) ratings.ectomorfa = ectomorphy(heightCm / Math.cbrt(weightKg))

  if (typeof input.bodyFatPct === 'number' && Number.isFinite(input.bodyFatPct)) {
    const { low, high } = BUILD_SCALE.fatPct[input.sex ?? 'sin_dato']
    ratings.endomorfa = clampRating(1 + (6 * (input.bodyFatPct - low)) / (high - low))
  }

  const v = input.read('front', 'shoulderToWaist')
  if (v !== null) {
    const reference = PHYSIQUE_REFERENCE.shoulderToWaist[input.sex ?? 'sin_dato']
    ratings.mesomorfa = clampRating(BUILD_SCALE.mesoAtReference + (v - reference) / BUILD_SCALE.mesoStep)
  }

  const ranked = (Object.entries(ratings) as [Somatotype, number][]).sort((a, b) => b[1] - a[1])
  if (ranked.length < 2) return null
  const [[type, top], [second, next]] = ranked
  return { type, leaning: top - next < BUILD_SCALE.closeRating ? second : null, ratings }
}

/** Ectomorfia de Heath-Carter a partir del índice altura / raíz cúbica del peso. */
function ectomorphy(hwr: number): number {
  const { upper, lower } = BUILD_SCALE.ecto
  if (hwr >= upper) return round1(0.732 * hwr - 28.58)
  if (hwr > lower) return round1(0.463 * hwr - 17.63)
  return 0.1
}

const round1 = (n: number) => Math.round(n * 10) / 10
const clampRating = (n: number) => round1(Math.min(9, Math.max(0.1, n)))
const unique = <T,>(items: T[]) => [...new Set(items)]
