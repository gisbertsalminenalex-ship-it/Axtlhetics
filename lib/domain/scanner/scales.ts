/**
 * Escalas del escáner corporal (D-023). Único sitio donde viven los umbrales y
 * los pesos: se cambian aquí, nunca en la lógica.
 *
 * PROVISIONALES hasta cerrar `P-015` con los datos del prototipo de medición.
 * Son márgenes de orientación para el entrenamiento, no rangos clínicos: no
 * definen «normal» ni «patológico», y nunca se presentan como diagnóstico.
 *
 * Cada medida se convierte en 0–100 de forma lineal: 100 hasta `good`, 0 desde
 * `poor`, en línea recta entre medias. Se puntúa el valor absoluto salvo que se
 * diga otra cosa.
 */

/** Pesos del índice de equilibrio corporal (D-023). Postura y movimiento se presentan juntos. */
export const SCAN_INDEX_WEIGHTS = {
  symmetry: 0.35,
  postureMobility: 0.5,
  proportion: 0.15,
} as const

export type Scale = { good: number; poor: number }

/** Simetría funcional: diferencias entre lados que se pueden entrenar. */
export const SYMMETRY_SCALES = {
  shoulderTiltDeg: { good: 2, poor: 8 },
  hipTiltDeg: { good: 2, poor: 8 },
  armsDiffDeg: { good: 5, poor: 20 },
  /** Diferencia entre las dos rodillas al desplazarse hacia dentro, en % de la anchura de cadera. */
  kneesDiffPct: { good: 8, poor: 25 },
} as const satisfies Record<string, Scale>

/** Postura y movilidad. */
export const POSTURE_SCALES = {
  headForwardPct: { good: 5, poor: 20 },
  /** Ángulo de rodilla en el fondo de la sentadilla: menor = más profunda. */
  squatKneeAngleDeg: { good: 95, poor: 140 },
  trunkLeanDeg: { good: 45, poor: 65 },
  /** Desplazamiento de la rodilla hacia dentro respecto a su pie, en % de la anchura de cadera (solo cuenta hacia dentro). */
  kneeInwardPct: { good: 8, poor: 30 },
  /** Brazos arriba: 180 = vertical. Se puntúa el brazo más limitado. */
  armOverheadDeg: { good: 170, poor: 135 },
} as const satisfies Record<string, Scale>

/**
 * Cuánto pueden variar entre fotos de la misma pose para darse por estables.
 * Si varían más, el resultado no es fiable y no entra en el resumen.
 */
export const STABILITY_TOLERANCE: Record<string, number> = {
  shoulderTiltDeg: 3,
  hipTiltDeg: 3,
  armAsymmetryPct: 6,
  legAsymmetryPct: 6,
  legToTorso: 0.12,
  shoulderToWaist: 0.12,
  headForwardPct: 6,
  headAngleDeg: 8,
  kneeAngleDeg: 10,
  trunkLeanDeg: 8,
  kneeAnkleRatio: 0.15,
  leftKneeInPct: 10,
  rightKneeInPct: 10,
  leftArmDeg: 8,
  rightArmDeg: 8,
  armsDiffDeg: 8,
  // Anchuras relativas por zona (anchura / longitud del hueso). Provisionales: con
  // fotos reales se ajustarán (P-015).
  upperArmWidth: 0.03,
  thighWidth: 0.03,
  calfWidth: 0.025,
  shoulderToTorso: 0.06,
}

/**
 * Por encima de esta asimetría de longitud entre lados (%), lo más probable es
 * que la foto esté girada o el cuerpo no esté de frente: la longitud de los huesos
 * no cambia entrenando. Sirve para avisar de la foto, no para puntuar.
 */
export const LIMB_LENGTH_PHOTO_CHECK_PCT = 6

/** Umbrales para destacar: a partir de aquí, punto fuerte; hasta aquí, área de mejora. */
export const STRENGTH_FROM = 80
export const IMPROVE_UNTIL = 55
