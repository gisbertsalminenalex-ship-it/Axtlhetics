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
  waistToHip: 0.05,
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
  // Por zona, respecto a la longitud del hueso: área media (`Mean`) y contorno
  // máximo (`Peak`). El máximo sale de un solo corte y es más ruidoso que la
  // media de once. Provisionales: con fotos reales se ajustarán (P-015).
  upperArmMean: 0.025,
  upperArmPeak: 0.035,
  forearmMean: 0.025,
  forearmPeak: 0.035,
  thighMean: 0.025,
  thighPeak: 0.035,
  calfMean: 0.02,
  calfPeak: 0.03,
  shoulderToTorso: 0.06,
  // Enmienda del 2026-10-14: brazos y core. Provisionales (P-015).
  armToForearm: 0.08,
  flexArmMean: 0.03,
  flexArmPeak: 0.04,
  /** El core se mueve con la respiración: margen amplio. */
  flankBulgePct: 1.5,
  bellyBulgePct: 2,
  // Grasa estimada: anchuras (de frente) y profundidades (de perfil), en fracción
  // de la altura del cuerpo en la foto.
  neckWidthH: 0.004,
  neckDepthH: 0.004,
  waistWidthH: 0.008,
  waistNarrowWidthH: 0.008,
  waistDepthH: 0.008,
  waistNarrowDepthH: 0.008,
  hipWidthH: 0.008,
  hipDepthH: 0.008,
}

/**
 * Dónde caen las costillas flotantes y la cresta ilíaca sobre la línea que va de
 * los hombros (0) a los puntos de cadera del modelo (1). El modelo de pose no
 * tiene puntos para ellas: se sitúan por proporción, como hace el otro escáner
 * (D-023, enmienda del 2026-10-14). Los puntos de cadera del modelo están en la
 * articulación, por debajo de la cresta. Provisionales (P-015).
 */
export const CORE_LINE = { ribs: 0.55, crest: 0.85 } as const

/**
 * Una anchura del tronco mayor que esta fracción de su longitud incluye los
 * brazos pegados o la silueta está rota: no se mide.
 */
export const MAX_TORSO_WIDTH_RATIO = 1

/**
 * Estimación del % de grasa con la fórmula de la Marina de EE. UU. (D-023,
 * enmienda del 2026-10-14). Provisionales (P-015).
 *
 * - `navel`: altura del ombligo sobre la línea hombros (0) → caderas (1), donde
 *   la fórmula mide la cintura de los hombres. En las mujeres, la cintura es la
 *   parte más estrecha.
 * - `marginPct`: margen que se enseña siempre con la estimación.
 * - `validPct`: fuera de este rango, la estimación no es creíble y no se da.
 */
export const NAVY = {
  navel: 0.8,
  marginPct: 4,
  validPct: { min: 3, max: 60 },
} as const

/**
 * Guía general de alimentación del escáner (D-023, enmienda del 2026-10-14).
 * No es un plan: rangos de referencia habituales para gente que entrena.
 *
 * - `adultAge`: por debajo, nunca déficit ni cifras (ni calorías ni gramos).
 * - `proteinPerKg`: gramos de proteína por kilo de peso y día, según la prioridad.
 * - `surplusKcal` / `deficitKcal`: el «ligero» superávit o déficit diario.
 * - `leanFatPct`: con la grasa estimada en o por debajo de esto, no se propone
 *   déficit: lo que falta para que se note el músculo es músculo.
 */
export const NUTRITION = {
  adultAge: 18,
  proteinPerKg: {
    musculo: [1.6, 2.0],
    definir: [1.8, 2.2],
    fuerza: [1.6, 2.0],
    equilibrio: [1.4, 1.8],
  },
  surplusKcal: [200, 300],
  deficitKcal: [300, 500],
  leanFatPct: { hombre: 12, mujer: 20 },
} as const

/**
 * Luz de las fotos (D-023, enmienda del 2026-10-14), sobre el cuerpo:
 * - `minMeanLuma`: por debajo de este brillo medio (0–255), poca luz;
 * - `maxSideRatio`: si una mitad del cuerpo es más brillante que la otra en más
 *   de esta proporción, la luz viene de un lado.
 * Provisionales (P-015).
 */
export const LIGHTING = { minMeanLuma: 60, maxSideRatio: 1.8 } as const

/** Cuánto tiene que cambiar la grasa estimada entre escaneos para contarlo como cambio, en puntos. */
export const BODY_FAT_CHANGE_PCT = 1.5

/**
 * Cómo se lee el core respecto a la recta costillas–cresta, en % de la longitud
 * del tronco: hasta `flat` es recto (o hacia dentro); desde `out`, claramente
 * hacia fuera. Es forma: puede ser músculo o grasa. Provisionales (P-015).
 */
export const CORE_SHAPE = {
  belly: { flat: 1.5, out: 4 },
  flanks: { flat: 1, out: 3 },
} as const

/**
 * Por encima de esta asimetría de longitud entre lados (%), lo más probable es
 * que la foto esté girada o el cuerpo no esté de frente: la longitud de los huesos
 * no cambia entrenando. Sirve para avisar de la foto, no para puntuar.
 */
export const LIMB_LENGTH_PHOTO_CHECK_PCT = 6

/** Umbrales para destacar: a partir de aquí, punto fuerte; hasta aquí, área de mejora. */
export const STRENGTH_FROM = 80
export const IMPROVE_UNTIL = 55
