/**
 * El protocolo del test de evolución (D-021).
 *
 * Cuatro pruebas fijas, siempre en el mismo orden, como datos. Cambiar una
 * prueba es cambiar de protocolo: se sube `ASSESSMENT_PROTOCOL_VERSION` y los
 * resultados antiguos dejan de compararse con los nuevos.
 *
 * Nada de esto es una métrica nueva: cada prueba mide repeticiones o segundos de
 * un ejercicio que ya está en el catálogo.
 */

import type { ExperienceLevel } from '../profile/types'

export const ASSESSMENT_PROTOCOL_VERSION = 1

/** Días mínimos desde el último test completado para poder repetirlo. */
export const ASSESSMENT_INTERVAL_DAYS = 28

/** Descanso estándar entre pruebas, en segundos. */
export const ASSESSMENT_REST_SECONDS = 120

export type AssessmentTestKey = 'push' | 'core' | 'legs' | 'pull'
export type AssessmentMeasure = 'reps' | 'seconds'

export type AssessmentTest = {
  key: AssessmentTestKey
  /** Qué capacidad mide, en mayúsculas en la interfaz. */
  area: string
  /** Nombre corto para frases y filas del resumen. */
  name: string
  /**
   * El ejercicio del catálogo. En empuje es `null`: lo fija la variante de
   * flexiones del usuario.
   */
  exerciseId: string | null
  measure: AssessmentMeasure
  /** Carga fija de la prueba. `null` si no lleva. */
  loadKg: number | null
  /** Se registra cada lado por separado, primero el izquierdo. */
  perSide: boolean
  instruction: string
}

const REPS_INSTRUCTION =
  'Haz tantas como puedas manteniendo una técnica correcta. Detente cuando ya no puedas mantenerla.'
const HOLD_INSTRUCTION =
  'Mantén la posición mientras puedas hacerlo con buena técnica. Detente cuando la técnica deje de ser válida.'

export const ASSESSMENT_PROTOCOL: readonly AssessmentTest[] = [
  {
    key: 'push',
    area: 'Empuje',
    name: 'Flexiones',
    exerciseId: null,
    measure: 'reps',
    loadKg: null,
    perSide: false,
    instruction: REPS_INSTRUCTION,
  },
  {
    key: 'core',
    area: 'Core',
    name: 'Plancha',
    exerciseId: 'plancha',
    measure: 'seconds',
    loadKg: null,
    perSide: false,
    instruction: HOLD_INSTRUCTION,
  },
  {
    key: 'legs',
    area: 'Piernas',
    name: 'Sentadilla en pared',
    exerciseId: 'sentadilla-isometrica-pared',
    measure: 'seconds',
    loadKg: null,
    perSide: false,
    instruction: HOLD_INSTRUCTION,
  },
  {
    key: 'pull',
    area: 'Tirón',
    name: 'Remo unilateral',
    exerciseId: 'remo-unilateral',
    measure: 'reps',
    loadKg: 5,
    perSide: true,
    instruction:
      'Con la pesa de 5 kg. Haz tantas como puedas con técnica correcta, primero con un brazo y después con el otro.',
  },
]

/**
 * Las variantes de flexiones que se pueden elegir. Las negativas no: son solo la
 * bajada controlada y sus repeticiones no se comparan con las demás.
 */
export const PUSH_UP_VARIANT_IDS: readonly string[] = [
  'flexiones-inclinadas',
  'flexiones',
  'flexiones-declinadas',
  'flexiones-diamante',
]

/**
 * La variante que AXIS recomienda para el primer test. Un principiante, la
 * inclinada; el resto, la estándar, que es la referencia y no penaliza el número
 * de repeticiones con una variante más difícil. El usuario puede elegir otra.
 */
const RECOMMENDED_PUSH_UP: Record<ExperienceLevel, string> = {
  principiante: 'flexiones-inclinadas',
  intermedio: 'flexiones',
  avanzado: 'flexiones',
}

export function recommendedPushUpVariant(experience: ExperienceLevel): string {
  return RECOMMENDED_PUSH_UP[experience] ?? RECOMMENDED_PUSH_UP.principiante
}

export function isPushUpVariant(id: unknown): id is string {
  return typeof id === 'string' && PUSH_UP_VARIANT_IDS.includes(id)
}

/** Límites de entrada. No son métricas: solo evitan guardar un valor imposible. */
export const MAX_ASSESSMENT_VALUE: Record<AssessmentMeasure, number> = {
  reps: 500,
  seconds: 3600,
}

export function isValidAssessmentValue(value: unknown, measure: AssessmentMeasure): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ASSESSMENT_VALUE[measure]
  )
}

/** El ejercicio de una prueba con la variante de flexiones del test. */
export function exerciseIdFor(test: AssessmentTest, pushUpVariantId: string): string {
  return test.exerciseId ?? pushUpVariantId
}
