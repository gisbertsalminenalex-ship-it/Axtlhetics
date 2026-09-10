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

export const EXERCISE_CATALOG: readonly Exercise[] = [
  // ---------------------------------------------------------------------------
  // EMPUJE
  // ---------------------------------------------------------------------------
  {
    id: 'flexiones-inclinadas',
    name: 'Flexiones inclinadas',
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
      'Apoya las manos en una superficie estable a la altura de la cadera. Cuanto más alta la superficie, más fácil.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'flexiones-negativas',
    name: 'Flexiones negativas',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'flexiones',
    regressionId: 'flexiones-inclinadas',
    stimulus: 'fuerza',
    instructions: 'Baja lento, controlando el descenso, y vuelve arriba apoyando las rodillas.',
    work: { sets: 3, reps: 6, restSeconds: 90, isTimed: false, tempo: '4-0-1' },
    imageUrl: null,
  },
  {
    id: 'flexiones',
    name: 'Flexiones',
    category: 'empuje',
    primaryMuscles: ['pecho'],
    secondaryMuscles: ['hombros', 'brazos', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 3,
    progressionId: 'flexiones-diamante',
    regressionId: 'flexiones-negativas',
    stimulus: 'fuerza',
    instructions: 'Cuerpo en línea de los talones a la cabeza. Codos algo cerrados, no abiertos del todo.',
    work: { sets: 3, reps: 10, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'flexiones-diamante',
    name: 'Flexiones diamante',
    category: 'empuje',
    primaryMuscles: ['pecho', 'brazos'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 4,
    progressionId: null,
    regressionId: 'flexiones',
    stimulus: 'fuerza',
    instructions: 'Manos juntas bajo el pecho formando un triángulo. Carga más el tríceps.',
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
    instructions: 'Pesa a la altura del hombro, empuja arriba sin arquear la espalda. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'extension-triceps-unilateral',
    name: 'Extensión de tríceps unilateral',
    category: 'empuje',
    primaryMuscles: ['brazos'],
    secondaryMuscles: ['hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 2,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Pesa por detrás de la cabeza con el codo apuntando arriba. Sube y baja sin mover el codo.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: null },
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
    instructions: 'Boca abajo, eleva brazos y piernas a la vez sin forzar el cuello. Baja despacio.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: '1-2-1' },
    imageUrl: null,
  },
  {
    id: 'remo-unilateral',
    name: 'Remo unilateral con pesa',
    category: 'tiron',
    primaryMuscles: ['espalda'],
    secondaryMuscles: ['brazos', 'core'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'remo-renegado',
    regressionId: 'superman',
    stimulus: 'fuerza',
    instructions: 'Inclina el tronco con la espalda recta y lleva la pesa hacia la cadera. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'remo-renegado',
    name: 'Remo renegado',
    category: 'tiron',
    primaryMuscles: ['espalda', 'core'],
    secondaryMuscles: ['brazos', 'hombros'],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 4,
    progressionId: null,
    regressionId: 'remo-unilateral',
    stimulus: 'estabilidad',
    instructions: 'Desde posición de plancha con una mano en la pesa, rema sin girar la cadera.',
    work: { sets: 3, reps: 8, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'curl-biceps-unilateral',
    name: 'Curl de bíceps unilateral',
    category: 'tiron',
    primaryMuscles: ['brazos'],
    secondaryMuscles: [],
    equipment: ['pesa'],
    unilateral: true,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Codo pegado al cuerpo, sube la pesa sin balanceo y baja controlando. Alterna los lados.',
    work: { sets: 3, reps: 12, restSeconds: 60, isTimed: false, tempo: '1-1-2' },
    imageUrl: null,
  },

  // ---------------------------------------------------------------------------
  // PIERNAS
  // ---------------------------------------------------------------------------
  {
    id: 'sentadilla',
    name: 'Sentadilla',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'sentadilla-con-pesa',
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Pies a la anchura de los hombros, baja la cadera atrás manteniendo los talones en el suelo.',
    work: { sets: 3, reps: 15, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'sentadilla-con-pesa',
    name: 'Sentadilla con pesa',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: ['gluteos', 'core'],
    equipment: ['pesa'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'Sujeta la pesa contra el pecho con las dos manos y haz la sentadilla con el torso erguido.',
    work: { sets: 3, reps: 12, restSeconds: 90, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancadas',
    name: 'Zancadas',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'Da un paso adelante y baja la rodilla de atrás hacia el suelo. Alterna las piernas.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancada-atras',
    name: 'Zancada atrás',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['ninguno'],
    unilateral: true,
    difficulty: 2,
    progressionId: 'zancada-bulgara',
    regressionId: 'sentadilla',
    stimulus: 'fuerza',
    instructions: 'Paso atrás en lugar de adelante. Suele ser más cómoda para la rodilla delantera.',
    work: { sets: 3, reps: 10, restSeconds: 75, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'zancada-bulgara',
    name: 'Zancada búlgara',
    category: 'piernas',
    primaryMuscles: ['piernas', 'gluteos'],
    secondaryMuscles: ['core'],
    equipment: ['superficie_elevada'],
    unilateral: true,
    difficulty: 4,
    progressionId: null,
    regressionId: 'zancadas',
    stimulus: 'fuerza',
    instructions: 'Pie de atrás apoyado en una silla. Baja recto y sube con la pierna delantera.',
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
    instructions: 'Sobre una pierna, baja la pesa hacia el suelo con la espalda recta. Alterna los lados.',
    work: { sets: 3, reps: 10, restSeconds: 90, isTimed: false, tempo: '3-0-1' },
    imageUrl: null,
  },
  {
    id: 'puente-gluteos',
    name: 'Puente de glúteos',
    category: 'piernas',
    primaryMuscles: ['gluteos'],
    secondaryMuscles: ['piernas', 'core'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: 'peso-muerto-unilateral',
    regressionId: null,
    stimulus: 'fuerza',
    instructions: 'Tumbado boca arriba con las rodillas dobladas, eleva la cadera y aprieta arriba.',
    work: { sets: 3, reps: 15, restSeconds: 60, isTimed: false, tempo: '1-1-2' },
    imageUrl: null,
  },
  {
    id: 'elevacion-gemelos',
    name: 'Elevación de gemelos',
    category: 'piernas',
    primaryMuscles: ['piernas'],
    secondaryMuscles: [],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 1,
    progressionId: null,
    regressionId: null,
    stimulus: 'resistencia',
    instructions: 'De pie, sube sobre las puntas de los pies y baja despacio.',
    work: { sets: 3, reps: 20, restSeconds: 45, isTimed: false, tempo: null },
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
    instructions: 'Boca arriba, extiende brazo y pierna contrarios sin despegar la zona lumbar del suelo.',
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
    instructions: 'A cuatro patas, extiende brazo y pierna contrarios sin girar la cadera.',
    work: { sets: 3, reps: 10, restSeconds: 45, isTimed: false, tempo: null },
    imageUrl: null,
  },
  {
    id: 'plancha',
    name: 'Plancha',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: ['hombros'],
    equipment: ['ninguno'],
    unilateral: false,
    difficulty: 2,
    progressionId: 'hollow-hold',
    regressionId: 'dead-bug',
    stimulus: 'estabilidad',
    instructions: 'Antebrazos en el suelo, cuerpo en línea. Aprieta glúteos y abdomen.',
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
    instructions: 'De lado sobre un antebrazo, cadera elevada y alineada. Un lado cada vez.',
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
    instructions: 'Boca arriba, zona lumbar pegada al suelo, brazos y piernas estirados y elevados.',
    work: { sets: 3, reps: 20, restSeconds: 60, isTimed: true, tempo: null },
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
