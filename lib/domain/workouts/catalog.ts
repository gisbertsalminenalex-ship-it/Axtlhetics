/**
 * Catálogo de ejercicios.
 *
 * Está construido para el equipamiento **real** disponible: peso corporal y **una
 * sola pesa de 5 kg**. Nada de barras, bancos, máquinas ni pares de mancuernas. Todo
 * lo que carga peso está modelado como unilateral, porque solo hay una pesa.
 *
 * El catálogo es **dato reemplazable**, no lógica. Añadir ejercicios o cambiar el
 * equipamiento disponible no obliga a tocar el motor de decisión: basta con que los
 * metadatos estén completos.
 */

import type {
  Difficulty,
  Equipment,
  Exercise,
  MuscleGroup,
  SessionFocus,
} from './types'
import { FOCUS_CATEGORIES } from './types'

/**
 * Equipamiento disponible hoy.
 *
 * `superficie_elevada` no es material comprado: es una silla, un sofá o un escalón.
 * Cambiar esta lista cambia qué ejercicios puede proponer AXIS, sin tocar nada más.
 */
export const AVAILABLE_EQUIPMENT: readonly Equipment[] = ['ninguno', 'pesa', 'superficie_elevada']

/** La única pesa que hay. El sistema no puede suponer que la carga sube sin límite. */
export const MAX_AVAILABLE_LOAD_KG = 5

/** Escalón de carga. Con una sola pesa, en la práctica solo hay un salto: 0 → 5. */
export const LOAD_STEP_KG = 2.5

/**
 * Los únicos ejercicios que usan la pesa con las dos manos (D-008, D-020).
 *
 * Con una sola pesa, todo lo que carga peso es unilateral. Estos son las
 * excepciones razonables: la pesa se sujeta entera con las dos manos, no se
 * reparte entre dos mancuernas. Es una lista cerrada, no una regla: añadir uno
 * es una decisión, y un test lo vigila.
 */
export const SINGLE_WEIGHT_BILATERAL_IDS: readonly string[] = [
  'sentadilla-con-pesa',
  'pullover-con-pesa',
  'hip-thrust-con-pesa',
]

export const EXERCISE_CATALOG: readonly Exercise[] = [
  // ---------------------------------------------------------------------------
  // EMPUJE
  // ---------------------------------------------------------------------------
  {
    id: 'flexiones-inclinadas',
    name: 'Flexiones inclinadas',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos'],
    equipment: ['superficie_elevada'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'flexiones-negativas',
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Apoya las manos en una superficie estable a la altura de la cadera, algo más abiertas que los hombros, y echa los pies atrás con el cuerpo recto. Baja el pecho hacia el borde doblando los codos y empuja hasta estirar los brazos. Cuanto más alta la superficie, más fácil.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'flexiones-negativas',
    name: 'Flexiones negativas',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'flexiones',
    regressionId: 'flexiones-inclinadas',
    stimulus: 'fuerza',
    instructions: 'Empieza arriba en posición de flexión, con el cuerpo recto de los talones a la cabeza. Baja el pecho muy despacio, unos tres segundos, hasta casi tocar el suelo. Apoya las rodillas para volver arriba y repite.',
    work: { sets: 3, reps: 6, restSeconds: 90, isTimed: false, tempo: '4-0-1' },
    imageUrl: null,
  },
  {
    id: 'flexiones',
    name: 'Flexiones',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: 'flexiones-diamante',
    regressionId: 'flexiones-negativas',
    stimulus: 'fuerza',
    instructions: 'Manos en el suelo algo más abiertas que los hombros y cuerpo recto de los talones a la cabeza. Baja el pecho hasta casi tocar el suelo, con los codos algo cerrados, no abiertos del todo. Empuja hasta estirar los brazos sin hundir la cadera.',
    work: { sets: 3, reps: 10, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'flexiones-diamante',
    name: 'Flexiones diamante',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho', 'brazos'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 4,
    progressionId: null,
    regressionId: 'flexiones',
    stimulus: 'fuerza',
    instructions: 'En posición de flexión, junta las manos bajo el pecho formando un triángulo con pulgares e índices. Baja el pecho hacia las manos con los codos pegados al cuerpo y empuja arriba. Carga más el tríceps; si cuesta, apoya las rodillas.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'press-hombro-unilateral',
    name: 'Press de hombro unilateral',
    category: 'empuje',
    primaryMuscles: ['hombros'],
    secondaryMuscles: ['brazos', 'core'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'De pie, con el abdomen apretado, sujeta la pesa a la altura del hombro con la palma hacia delante. Empuja hacia arriba hasta estirar el brazo sin arquear la espalda y baja despacio al hombro. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'extension-triceps-unilateral',
    name: 'Extensión de tríceps unilateral',
    family: 'triceps',
    category: 'empuje',
    primaryMuscles: ['brazos'],
    secondaryMuscles: ['hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Sube la pesa por encima de la cabeza y déjala caer por detrás doblando el codo, que apunta al techo. Estira el brazo hacia arriba sin mover el codo y baja controlando. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. El único empuje de pecho con carga. El suelo limita el recorrido del hombro.
    id: 'press-suelo-unilateral',
    name: 'Press de suelo unilateral con pesa',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['brazos', 'hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Tumbado boca arriba con las rodillas dobladas, empuja la pesa hacia el techo desde el pecho. Baja hasta que el codo toque el suelo, no más. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Pecho más exigente que la flexión. La silla, contra la pared.
    id: 'flexiones-declinadas',
    name: 'Flexiones declinadas',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos', 'core'],
    equipment: ['superficie_elevada'],
    unilateral: false,
    difficulty: 4,
    progressionId: null,
    regressionId: 'flexiones',
    stimulus: 'fuerza',
    instructions:
      'Pies sobre una silla apoyada contra la pared y manos en el suelo. Cuerpo en línea; baja controlando y empuja arriba.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Hombro sin material.
    id: 'flexion-pica',
    name: 'Flexión pica',
    category: 'empuje',
    primaryMuscles: ['hombros'],
    secondaryMuscles: ['brazos', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Cadera alta, formando una V invertida. Baja la cabeza despacio hacia el suelo entre las manos y empuja arriba.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Tríceps sin llevar el hombro a extensión con carga (sustituye a los fondos en silla).
    id: 'patada-triceps-unilateral',
    name: 'Patada de tríceps unilateral',
    family: 'triceps',
    category: 'empuje',
    primaryMuscles: ['brazos'],
    secondaryMuscles: ['hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Tronco inclinado con la mano libre apoyada. Codo pegado al cuerpo; extiende el brazo hacia atrás sin mover el codo. Alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-025. Flexión de iniciación sin material: hermana de las inclinadas, no las sustituye.
    id: 'flexiones-rodillas',
    name: 'Flexiones con rodillas',
    family: 'flexion',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'flexiones-negativas',
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Rodillas apoyadas en el suelo y manos bajo los hombros. Cuerpo en línea de las rodillas a la cabeza; baja el pecho controlando y empuja arriba sin hundir la cadera.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // TIRÓN
  // ---------------------------------------------------------------------------
  {
    id: 'superman',
    name: 'Superman',
    category: 'tiron',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['gluteos'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'remo-unilateral',
    regressionId: null,
    stimulus: 'resistencia',
    instructions: 'Túmbate boca abajo con los brazos estirados por delante. Eleva a la vez brazos, pecho y piernas unos centímetros, mirando al suelo para no forzar el cuello. Aguanta un segundo y baja despacio.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: '1-2-1' },
    imageUrl: null,
  },
  {
    id: 'remo-unilateral',
    name: 'Remo unilateral con pesa',
    family: 'remo',
    category: 'tiron',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['brazos', 'core'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'remo-renegado',
    regressionId: 'superman',
    stimulus: 'fuerza',
    instructions: 'Apoya la mano y la rodilla del mismo lado en una silla o un sofá, con la espalda recta y la pesa colgando en la otra mano. Tira de la pesa hacia la cadera llevando el codo atrás, pegado al cuerpo, y bájala despacio. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'remo-renegado',
    name: 'Remo renegado',
    family: 'remo',
    category: 'tiron',
    primaryMuscles: ['espalda', 'core'],
    secondaryMuscles: ['brazos', 'hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 4,
    progressionId: null,
    regressionId: 'remo-unilateral',
    stimulus: 'estabilidad',
    instructions: 'En plancha alta con los pies separados y una mano sobre la pesa. Tira de la pesa hacia la cadera sin girar el tronco ni la cadera, y vuelve a apoyarla. Alterna los lados; si te tambaleas, separa más los pies.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'curl-biceps-unilateral',
    name: 'Curl de bíceps unilateral',
    family: 'curl',
    category: 'tiron',
    primaryMuscles: ['brazos'],
    secondaryMuscles: [],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'De pie, con la pesa en una mano, el brazo estirado y la palma hacia delante. Sube la pesa hacia el hombro doblando el codo, que se queda pegado al cuerpo, sin balancearte, y baja controlando. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: '1-1-2' },
    imageUrl: null,
  },
  {
    // D-020. Espalda alta y postura sin material: hasta ahora solo había Superman.
    id: 'ytw-boca-abajo',
    name: 'Y-T-W boca abajo',
    category: 'tiron',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'resistencia',
    instructions:
      'Boca abajo, eleva los brazos formando una Y, luego una T y luego una W, sin dar tirones con el cuello. Cada secuencia es una repetición.',
    work: { sets: 3, reps: 8, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Tirón con carga distinto del remo. Pesa a dos manos: excepción de D-008.
    id: 'pullover-con-pesa',
    name: 'Pullover con pesa',
    category: 'tiron',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['pecho', 'core'],
    equipment: ['pesa'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Tumbado en el suelo con las rodillas dobladas y la zona lumbar apoyada. Sujeta la pesa con las dos manos sobre el pecho y llévala atrás solo hasta donde la espalda no se arquee.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Agarre neutro: la variante de agarre es un ejercicio propio, sin campo nuevo.
    id: 'curl-martillo-unilateral',
    name: 'Curl martillo unilateral',
    family: 'curl',
    category: 'tiron',
    primaryMuscles: ['brazos'],
    secondaryMuscles: [],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Palma mirando hacia el cuerpo (agarre neutro) y codo pegado. Sube sin balanceo y baja controlando. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: '1-1-2' },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // PIERNAS
  // ---------------------------------------------------------------------------
  {
    id: 'sentadilla',
    name: 'Sentadilla',
    family: 'sentadilla',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'sentadilla-con-pesa',
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'De pie, con los pies a la anchura de los hombros y las puntas algo abiertas. Baja llevando la cadera atrás y abajo, como si te sentaras, con los talones en el suelo y el pecho erguido. Sube empujando el suelo hasta estirarte del todo.',
    work: { sets: 3, reps: 15, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'sentadilla-con-pesa',
    name: 'Sentadilla con pesa',
    family: 'sentadilla',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos', 'core'],
    equipment: ['pesa'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'Sujeta la pesa vertical contra el pecho con las dos manos y separa los pies a la anchura de los hombros. Baja como en una sentadilla, con el torso erguido y los codos entre las rodillas, y sube empujando con los talones.',
    work: { sets: 3, reps: 12, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancadas',
    name: 'Zancadas',
    family: 'zancada',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'De pie, da un paso largo adelante y baja hasta que la rodilla de atrás casi toque el suelo, con el tronco recto y la rodilla de delante sobre el pie. Empuja con la pierna de delante para volver al inicio. Alterna las piernas.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancada-atras',
    name: 'Zancada atrás',
    family: 'zancada',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'De pie, da un paso largo atrás y baja hasta que la rodilla de atrás casi toque el suelo, con el tronco recto. Empuja con la pierna de delante para volver al inicio. Suele ser más cómoda para la rodilla que la zancada adelante; alterna las piernas.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancada-bulgara',
    name: 'Zancada búlgara',
    family: 'zancada',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['superficie_elevada'],
    unilateral: true,
    difficulty: 4,
    progressionId: null,
    regressionId: 'zancadas',
    stimulus: 'fuerza',
    instructions: 'De espaldas a una silla, apoya en ella el empeine del pie de atrás y adelanta el otro pie un paso largo. Baja recto hasta que el muslo de delante quede casi paralelo al suelo y sube empujando con esa pierna. Haz todas las de un lado y cambia.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'peso-muerto-unilateral',
    name: 'Peso muerto unilateral',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['espalda', 'core'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 3,
    progressionId: null,
    regressionId: 'puente-gluteos',
    stimulus: 'estabilidad',
    instructions: 'De pie sobre una pierna, con la rodilla un poco flexionada y la pesa en la mano contraria. Inclina el tronco adelante con la espalda recta mientras la otra pierna se estira hacia atrás y baja la pesa hacia el suelo. Vuelve arriba apretando el glúteo; alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 90, isTimed: false, tempo: '3-0-1' },
    imageUrl: null,
  },
  {
    id: 'puente-gluteos',
    name: 'Puente de glúteos',
    family: 'puente',
    category: 'piernas',
    primaryMuscles: ['gluteos'],
    secondaryMuscles: ['piernas', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'peso-muerto-unilateral',
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Túmbate boca arriba con las rodillas dobladas y los pies apoyados cerca de los glúteos. Empuja con los talones para elevar la cadera hasta que el cuerpo quede recto de los hombros a las rodillas. Aprieta los glúteos un segundo y baja despacio.',
    work: { sets: 3, reps: 15, restSeconds: 60, isTimed: false, tempo: '1-1-2' },
    imageUrl: null,
  },
  {
    id: 'elevacion-gemelos',
    name: 'Elevación de gemelos',
    family: 'gemelos',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    // D-020: ya tiene a dónde progresar cuando se domina.
    progressionId: 'elevacion-gemelos-una-pierna',
    regressionId: null,
    stimulus: 'resistencia',
    instructions: 'De pie, con los pies a la anchura de la cadera y una mano en la pared si lo necesitas. Sube sobre las puntas de los pies lo más alto que puedas, aguanta un segundo arriba y baja despacio.',
    work: { sets: 3, reps: 20, restSeconds: 45, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Progresión de gemelos sin material.
    id: 'elevacion-gemelos-una-pierna',
    name: 'Elevación de gemelos a una pierna',
    family: 'gemelos',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: 'elevacion-gemelos',
    stimulus: 'resistencia',
    instructions:
      'Sobre una pierna, con una mano en la pared para el equilibrio. Sube sobre la punta y baja despacio. Alterna las piernas.',
    work: { sets: 3, reps: 12, restSeconds: 45, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Cuádriceps sin impacto. Base de 30 s: su techo de progresión cabe en el selector.
    id: 'sentadilla-isometrica-pared',
    name: 'Sentadilla isométrica en pared',
    family: 'sentadilla',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: 'sentadilla',
    stimulus: 'resistencia',
    instructions:
      'Espalda apoyada en la pared. Baja hasta que los muslos queden como mucho paralelos al suelo y mantén la posición.',
    work: { sets: 3, reps: 30, restSeconds: 60, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Pierna unilateral entre la zancada y la búlgara. Solo superficie firme.
    id: 'subida-escalon',
    name: 'Subida al escalón',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['superficie_elevada'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions:
      'Usa un escalón o una superficie firme a la altura de la rodilla o más baja; nunca un sofá. Sube empujando con la pierna de arriba y baja controlando. Alterna las piernas.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Isquios: hasta ahora solo el peso muerto unilateral (sustituye al puente a una pierna).
    id: 'puente-talones-silla',
    name: 'Puente con talones en silla',
    family: 'puente',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['superficie_elevada'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: 'puente-gluteos',
    stimulus: 'fuerza',
    instructions:
      'Tumbado boca arriba con los talones apoyados en una silla estable. Eleva la cadera apretando la parte de atrás de los muslos y baja despacio.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Glúteo con carga. Pesa a dos manos sobre la cadera: excepción de D-008.
    id: 'hip-thrust-con-pesa',
    name: 'Hip thrust con pesa',
    family: 'puente',
    category: 'piernas',
    primaryMuscles: ['gluteos'],
    secondaryMuscles: ['piernas', 'core'],
    equipment: ['superficie_elevada', 'pesa'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: 'puente-gluteos',
    stimulus: 'fuerza',
    instructions:
      'Parte alta de la espalda apoyada en un sofá o en una silla contra la pared, y la pesa sujeta con las dos manos sobre la cadera. Sube hasta alinear la cadera con el tronco y aprieta arriba.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020.1. El único movimiento lateral de piernas: aductores, glúteo medio y
    // cuádriceps. Sin familia a propósito: es otro plano, puede ir con una zancada.
    id: 'zancada-lateral',
    name: 'Zancada lateral',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions:
      'Da un paso amplio hacia un lado y baja la cadera atrás sobre esa pierna, con la otra estirada. La rodilla sigue la dirección del pie, sin irse hacia dentro; baja solo hasta donde controles. Alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // CORE
  // ---------------------------------------------------------------------------
  {
    id: 'dead-bug',
    name: 'Dead bug',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'plancha',
    regressionId: null,
    stimulus: 'estabilidad',
    instructions: 'Boca arriba, con los brazos estirados hacia el techo y las rodillas dobladas en ángulo recto. Estira a la vez un brazo hacia atrás y la pierna contraria hacia delante sin despegar la zona lumbar del suelo, y vuelve. Alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 45, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'bird-dog',
    name: 'Bird dog',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: ['espalda', 'gluteos'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 1,
    progressionId: 'plancha-lateral',
    regressionId: null,
    stimulus: 'estabilidad',
    instructions: 'A cuatro patas, con las manos bajo los hombros y las rodillas bajo la cadera. Estira a la vez un brazo hacia delante y la pierna contraria hacia atrás, sin girar la cadera ni arquear la espalda. Aguanta un segundo, vuelve y alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 45, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'plancha',
    name: 'Plancha',
    family: 'plancha',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'hollow-hold',
    regressionId: 'dead-bug',
    stimulus: 'estabilidad',
    instructions: 'Apoya los antebrazos en el suelo con los codos bajo los hombros y estira las piernas atrás. Mantén el cuerpo en línea de los talones a la cabeza, apretando glúteos y abdomen, sin hundir ni subir la cadera.',
    work: { sets: 3, reps: 30, restSeconds: 60, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    id: 'plancha-lateral',
    name: 'Plancha lateral',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'hollow-hold',
    regressionId: 'bird-dog',
    stimulus: 'estabilidad',
    instructions: 'Túmbate de lado apoyado en el antebrazo, con el codo bajo el hombro y las piernas estiradas una sobre otra. Eleva la cadera hasta que el cuerpo quede recto y mantén la posición. Un lado cada vez.',
    work: { sets: 3, reps: 25, restSeconds: 60, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    id: 'hollow-hold',
    name: 'Hollow hold',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: null,
    regressionId: 'plancha',
    stimulus: 'estabilidad',
    instructions: 'Boca arriba, pega la zona lumbar al suelo apretando el abdomen. Eleva un poco los hombros y las piernas estiradas, con los brazos estirados hacia atrás, y mantén la posición sin que la espalda se despegue. Si cuesta, dobla las rodillas.',
    work: { sets: 3, reps: 20, restSeconds: 60, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    // D-020. Antirrotación.
    id: 'plancha-toque-hombro',
    name: 'Plancha con toque de hombro',
    family: 'plancha',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: null,
    regressionId: 'plancha',
    stimulus: 'estabilidad',
    instructions:
      'En plancha alta con los pies algo separados, toca el hombro contrario con una mano sin mover la cadera. Alterna las manos.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // PLIOMETRÍA (D-033)
  //
  // Saltos y aterrizajes para quien juega a un deporte de salto o de cambio de
  // dirección. No entran por ningún foco: los añade el bloque de deporte, al
  // principio del entrenamiento, con las piernas frescas.
  // ---------------------------------------------------------------------------
  {
    id: 'saltos-tobillo',
    name: 'Saltos de tobillo',
    category: 'pliometria',
    primaryMuscles: ['piernas'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Saltitos seguidos y rápidos sobre las puntas, con las rodillas casi rectas: el rebote sale del tobillo. Toca el suelo lo menos posible y cae siempre en el mismo sitio.',
    work: { sets: 3, reps: 20, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'aterrizaje-controlado',
    name: 'Aterrizaje controlado',
    family: 'salto-vertical',
    category: 'pliometria',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'sentadilla-salto',
    regressionId: null,
    stimulus: 'estabilidad',
    instructions:
      'Salta poco y cae suave sobre las dos piernas en media sentadilla, quieto dos segundos. Las rodillas apuntan a los pies y no se van hacia dentro. Es aprender a caer, no saltar alto.',
    work: { sets: 3, reps: 6, restSeconds: 60, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'sentadilla-salto',
    name: 'Sentadilla con salto',
    family: 'salto-vertical',
    category: 'pliometria',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: null,
    regressionId: 'aterrizaje-controlado',
    stimulus: 'fuerza',
    instructions:
      'Baja a media sentadilla llevando los brazos atrás y salta lo más alto que puedas lanzándolos arriba. Cae suave, con las rodillas alineadas, y vuelve a empezar sin prisa: cada salto, el mejor.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'saltos-patinador',
    name: 'Saltos de patinador',
    category: 'pliometria',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 3,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions:
      'Salta de lado de una pierna a la otra y cae sobre una sola, con la otra cruzada detrás. Aguanta un instante la caída antes del siguiente salto. Es el cambio de dirección de la pista.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // MOVILIDAD (D-020)
  //
  // Movilizan, no cargan: dificultad 2, en el centro de la escala, para quedar a
  // la menor distancia posible de cualquier nivel. Sus músculos dicen dónde se
  // nota el trabajo, pero no cuentan como grupos cargados de la sesión.
  // ---------------------------------------------------------------------------
  {
    id: 'gato-camello',
    name: 'Gato-camello',
    category: 'movilidad',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'A cuatro patas, redondea la espalda llevando el ombligo hacia dentro y después arquéala suave mirando al frente. Lento y sin forzar.',
    work: { sets: 2, reps: 10, restSeconds: 30, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'rotacion-toracica',
    name: 'Rotación torácica a cuatro patas',
    category: 'movilidad',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'A cuatro patas con una mano en la nuca, gira el codo hacia el techo siguiendo con la mirada y vuelve. Haz todas las de un lado y cambia.',
    work: { sets: 2, reps: 8, restSeconds: 30, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'estiramiento-flexor-cadera',
    name: 'Estiramiento de flexor de cadera',
    category: 'movilidad',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'Rodilla de atrás apoyada en el suelo. Adelanta la cadera hasta notar el estiramiento en la parte delantera del muslo de atrás, sin rebotes. Un lado cada vez.',
    work: { sets: 2, reps: 30, restSeconds: 30, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    // D-020.1. Cadena posterior. Base de 30 s: su techo cabe en el selector.
    id: 'estiramiento-isquiotibiales',
    name: 'Estiramiento de isquiotibiales',
    category: 'movilidad',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'De pie, con un talón adelantado y apoyado, inclina el tronco desde la cadera con la espalda recta hasta notar el estiramiento detrás del muslo. Sin rebotes y sin forzar el rango. Un lado cada vez.',
    work: { sets: 2, reps: 30, restSeconds: 30, isTimed: true, tempo: null },
    imageUrl: null,
  },
  {
    // D-020.1. Dorsiflexión de tobillo: da profundidad a sentadillas y zancadas.
    // «Tobillo» y no «Movilidad de…»: la primera palabra identifica el ejercicio.
    id: 'tobillo-pared',
    name: 'Tobillo a la pared',
    category: 'movilidad',
    primaryMuscles: ['piernas'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'Frente a una pared, con el pie a un palmo de ella. Lleva la rodilla hacia la pared sin levantar el talón; si llegas sin esfuerzo, aleja un poco el pie. Un lado cada vez.',
    work: { sets: 2, reps: 10, restSeconds: 30, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-020.1. Movilidad de hombro y torácica, de pie. No es Y-T-W: aquel es
    // fuerza boca abajo; este moviliza.
    id: 'angeles-pared',
    name: 'Ángeles en la pared',
    category: 'movilidad',
    primaryMuscles: ['hombros'],
    secondaryMuscles: ['espalda'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'movilidad',
    instructions:
      'De pie con la espalda, la cabeza y los brazos apoyados en la pared, desliza los brazos arriba y abajo sin despegarlos. Solo hasta donde llegues sin dolor; no fuerces el rango.',
    work: { sets: 2, reps: 10, restSeconds: 30, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    // D-033. Prevención de tobillo y rodilla: el calentamiento de quien salta.
    id: 'equilibrio-una-pierna',
    name: 'Equilibrio a una pierna',
    category: 'movilidad',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'estabilidad',
    instructions:
      'De pie sobre una pierna, con la rodilla un poco flexionada y la otra en el aire. Aguanta sin que el tobillo baile; si es fácil, cierra los ojos. Un lado cada vez.',
    work: { sets: 2, reps: 30, restSeconds: 30, isTimed: true, tempo: null },
    imageUrl: null,
  },
]

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function findExercise(
  id: string,
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
): Exercise | null {
  return catalog.find((exercise) => exercise.id === id) ?? null
}

/** `true` si todo lo que el ejercicio necesita está disponible. */
export function isAvailable(
  exercise: Exercise,
  available: readonly Equipment[] = AVAILABLE_EQUIPMENT,
): boolean {
  return exercise.equipment.every((item) => available.includes(item))
}

export function availableExercises(
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
  available: readonly Equipment[] = AVAILABLE_EQUIPMENT,
): Exercise[] {
  return catalog.filter((exercise) => isAvailable(exercise, available))
}

/** Ejercicios cuyo patrón de movimiento entra dentro del foco de la sesión. */
export function exercisesForFocus(
  focus: SessionFocus,
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
): Exercise[] {
  const categories = FOCUS_CATEGORIES[focus]
  return catalog.filter((exercise) => categories.includes(exercise.category))
}

/** Ejercicios que no cargan ninguno de los grupos indicados. */
export function exercisesAvoidingGroups(
  exercises: readonly Exercise[],
  avoid: readonly MuscleGroup[],
): Exercise[] {
  if (avoid.length === 0) return [...exercises]
  return exercises.filter(
    (exercise) =>
      !exercise.primaryMuscles.some((group) => avoid.includes(group)) &&
      !exercise.secondaryMuscles.some((group) => avoid.includes(group)),
  )
}

/**
 * Variante más fácil o más difícil del mismo patrón.
 *
 * Es lo que permite que AXIS diga «hoy toca una variante más ligera de empuje» y
 * seleccione algo concreto en lugar de bajar series a ciegas. Si la variante no
 * existe o no es ejecutable con el equipamiento disponible, devuelve el original.
 */
export function variantOf(
  exercise: Exercise,
  direction: 'easier' | 'harder',
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
  available: readonly Equipment[] = AVAILABLE_EQUIPMENT,
): Exercise {
  const id = direction === 'easier' ? exercise.regressionId : exercise.progressionId
  if (!id) return exercise

  const variant = findExercise(id, catalog)
  if (!variant || !isAvailable(variant, available)) return exercise
  return variant
}

/** Dificultad objetivo dentro de la que AXIS busca ejercicios. */
export function closestToDifficulty(
  exercises: readonly Exercise[],
  target: Difficulty,
): Exercise[] {
  return [...exercises].sort(
    (a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target),
  )
}
