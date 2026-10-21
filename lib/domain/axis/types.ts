/**
 * AXIS — tipos del sistema de decisión.
 *
 * AXIS no es un chatbot. Recibe un contexto, aplica reglas explícitas y devuelve
 * una propuesta con su razón. Toda la lógica vive detrás de la interfaz
 * `AxisEngine`, para que el motor determinista de Core v0.1 pueda sustituirse
 * más adelante por uno basado en IA sin tocar la aplicación.
 */

import type { ScheduledActivity, UserProfile } from '../profile/types'
import type { Assessment } from '../assessment/types'
import type { ScanRecord } from '../scanner/types'
import type { RecoveryInputs, RecoveryScore } from '../recovery/types'
import type { DayKey } from '../shared/dates'
import type { Exercise, MuscleGroup, PlannedSession, WorkoutSession } from '../workouts/types'
import type { TrainingLoadBand } from '../workouts/load'
import type { PhysiquePlan } from '../scanner/physique'

export type AxisRecommendationType =
  | 'TRAINING'
  | 'LIGHT_TRAINING'
  | 'MODIFIED_TRAINING'
  | 'RECOVERY'
  | 'REST'

/** Recomendaciones en las que la acción principal NO es entrenar. */
export const NON_TRAINING_TYPES: readonly AxisRecommendationType[] = ['RECOVERY', 'REST']

export function isTrainingRecommendation(type: AxisRecommendationType): boolean {
  return !NON_TRAINING_TYPES.includes(type)
}

/** Qué miró AXIS para decidir. Se usa para explicar, no para decorar. */
export type AxisFactorKey =
  | 'recovery_score'
  | 'recovery_unknown'
  | 'sleep'
  | 'energy'
  | 'muscle_fatigue'
  | 'stress'
  | 'hydration'
  | 'days_since_last_workout'
  | 'trained_today'
  /** Hoy hubo un test de evolución, completo o interrumpido (D-021). */
  | 'assessment_today'
  | 'recent_muscle_groups'
  | 'scheduled_activity'
  | 'activity_tomorrow'
  | 'availability'
  | 'goal'
  | 'session_duration'
  | 'progression'
  /** Semana de descarga tras varias semanas cargadas (D-031). */
  | 'deload_week'
  /** Carga de los últimos 7 días alta (D-034). */
  | 'training_load'
  /** Lo que el escaneo corporal pide a las sesiones (D-041). */
  | 'body_scan'
  /** Hoy es día fuerte (D-048). */
  | 'hard_day'
  /** Zonas que el usuario cuida (D-051). */
  | 'care_zones'
  /** Una respuesta de salud con «sí» sin visto bueno del médico (D-058). */
  | 'health_check'
  /** Las primeras sesiones de quien empieza o vuelve tras un parón (D-058). */
  | 'ramp_up'

/**
 * `supports` empuja hacia entrenar más, `limits` hacia entrenar menos.
 * Permite explicar la decisión sin exponer números internos al usuario.
 */
export type AxisFactorDirection = 'supports' | 'limits' | 'neutral'

export type AxisFactor = {
  key: AxisFactorKey
  label: string
  detail: string
  direction: AxisFactorDirection
}

export type AxisProposal = {
  id: string
  dayKey: DayKey
  createdAt: string
  type: AxisRecommendationType
  /** Frase corta y accionable. Es el protagonista de la tarjeta de AXIS. */
  headline: string
  /** Por qué. Siempre presente: AXIS nunca recomienda sin explicar. */
  reason: string
  /** La sesión concreta. `null` cuando la recomendación es no entrenar. */
  session: PlannedSession | null
  factors: AxisFactor[]
  /** Etiqueta corta para la lista de alternativas: `Más ligera`, `Recuperación`… */
  label: string
  /**
   * Qué decidió esta propuesta: el id de la regla que ganó (`good_recovery`,
   * `low_recovery`…) o, en una alternativa, por qué existe (`alternative_lighter`).
   * Sirve para explicar, depurar y testar; nunca se muestra tal cual.
   */
  rule: string
}

/**
 * Resultado completo de una decisión: la propuesta principal y las alternativas
 * que el usuario puede elegir desde «Cambiar entrenamiento».
 *
 * Las alternativas también las genera AXIS. No hay editor manual de rutinas.
 */
export type AxisDecision = {
  primary: AxisProposal
  alternatives: AxisProposal[]
}

/**
 * Todo lo que AXIS puede mirar. Se construye en `buildAxisContext` a partir de los
 * repositorios, de modo que el motor sea una función pura del contexto.
 */
export type AxisContext = {
  dayKey: DayKey
  /** Minutos desde medianoche en el momento de decidir. Para las actividades del día. */
  minuteOfDay: number
  profile: UserProfile | null
  recoveryInputs: RecoveryInputs | null
  recoveryScore: RecoveryScore | null
  /** Sesiones recientes, de la más nueva a la más antigua. */
  recentSessions: readonly WorkoutSession[]
  activities: readonly ScheduledActivity[]
  /**
   * Nombres de actividades que hoy no ocurren, según ha dicho el usuario.
   *
   * No se quitan de `activities`: siguen estando registradas, y AXIS debe poder
   * decir que las tienes aunque hoy no las juegues. Lo que hacen es no contar
   * para la decisión de hoy.
   */
  cancelledToday: readonly string[]
  catalog: readonly Exercise[]
  /**
   * Minutos que el usuario ha dicho tener hoy, confirmados en la conversación
   * (D-022). Solo pueden bajar el tiempo disponible, nunca subirlo. Ausente o
   * `null` si no ha dicho nada.
   */
  availableMinutesToday?: number | null
  /**
   * El entrenamiento de ayer se movió a hoy (D-022). Hace de hoy un día
   * disponible aunque no esté marcado en el perfil; el resto de reglas sigue
   * mandando.
   */
  movedFromYesterday?: boolean
  /**
   * Hoy se entrena sin material (D-046): «estoy de viaje», confirmado en la
   * conversación. Solo cuenta para hoy; el perfil no cambia.
   */
  withoutEquipmentToday?: boolean
  /** La recuperación registrada de días anteriores a hoy (D-049). */
  recentRecovery?: readonly RecoveryInputs[]
  /**
   * Los tests de evolución guardados (D-021): modelos del dominio, nunca filas del
   * almacén. AXIS solo deriva de ellos si hoy hubo test y si el siguiente está
   * disponible; no los usa para elegir ni para cargar una sesión.
   */
  assessments?: readonly Assessment[]
  /**
   * Los escaneos corporales guardados (D-023). AXIS solo los explica y ofrece
   * opciones cuando se le pregunta; el motor no los lee para decidir (`P-017`).
   */
  scans?: readonly ScanRecord[]
}

/**
 * La frontera que hace sustituible el motor.
 *
 * Un motor con IA externa implementaría esta misma interfaz; la aplicación no
 * distingue cuál está detrás.
 */
export type AxisEngine = {
  readonly id: string
  decide(context: AxisContext): AxisDecision
}

/** Hechos derivados del contexto. Los calcula `deriveFacts` y los usan las reglas. */
export type AxisFacts = {
  recoveryValue: number | null
  recoveryKnown: boolean
  /**
   * Ayer o anteayer la recuperación registrada estuvo por debajo de «buena»
   * (D-049). Sin la de hoy, decide si el día es normal o ligero.
   */
  recentLowRecovery: boolean
  fatigueLevel: number | null
  energyLevel: number | null
  stressLevel: number | null
  sleepHours: number | null
  trainedToday: boolean
  /** Hoy se completó un test de evolución (D-021). Cuenta como actividad del día. */
  assessmentCompletedToday: boolean
  /** Hay un test de hoy a medias. Se reanuda; no es actividad todavía. */
  assessmentInProgressToday: boolean
  /** Hoy se interrumpió un test con algo registrado. Cuenta como actividad del día. */
  assessmentInterruptedToday: boolean
  daysSinceLastWorkout: number | null
  /** Grupos trabajados en las sesiones recientes, del más reciente al más antiguo. */
  recentMuscleGroups: MuscleGroup[]
  isAvailableToday: boolean
  /** Actividad más exigente de hoy, si la hay. */
  todayActivity: ScheduledActivity | null
  /** Todas las actividades de hoy: puede haber más de un deporte el mismo día. */
  todayActivities: ScheduledActivity[]
  /** La más exigente de mañana. Condiciona cuánta carga conviene meter hoy. */
  tomorrowActivity: ScheduledActivity | null
  tomorrowActivities: ScheduledActivity[]
  /** Minutos hasta que empieza esa actividad. Negativo si ya ha terminado. */
  minutesUntilActivity: number | null
  /** Minutos realmente disponibles para entrenar hoy. */
  availableMinutes: number
  /**
   * Cuánto lleva cada grupo de su objetivo semanal de series, de 0 en adelante
   * (1 = cumplido). Ordena qué zona toca (D-034).
   */
  weeklyFulfilment: Record<MuscleGroup, number>
  /** Banda de la Carga de los últimos 7 días (D-008), o `null` sin sesiones en la ventana. */
  trainingLoadBand: TrainingLoadBand | null
  /** Lo que el último escaneo pide a las sesiones (D-041), o `null` sin escaneo reciente. */
  physique: PhysiquePlan | null
}
