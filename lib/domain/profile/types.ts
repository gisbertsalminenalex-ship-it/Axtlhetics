/**
 * Perfil del usuario.
 *
 * Esto es **contexto para AXIS**, no una red social ni un perfil completo. Se guarda
 * lo mínimo que AXIS necesita para personalizar una recomendación.
 *
 * Perfil NO es una pestaña principal: se edita desde una pantalla interna.
 */

import { weekdayOfKey, type DayKey, type Weekday } from '../shared/dates'
import { isUserEquipment, type UserEquipment } from '../workouts/equipment'
import { isHealthScreen, isTrainingBackground, type HealthScreen, type TrainingBackground } from './screening'
import { isNutritionPlan, type NutritionPlan } from '../nutrition/targets'
import { isEcosystemSharing, type EcosystemSharing } from '../ecosystem/sharing'
import {
  isArrayOf,
  isDayKey,
  isFiniteNumber,
  isIsoDate,
  isNullableNumber,
  isOneOf,
  isRecord,
} from '../shared/guards'

/**
 * Objetivos de entrenamiento.
 *
 * Todos están orientados a rendimiento, entrenamiento y salud. Deliberadamente **no
 * hay objetivos de pérdida de grasa ni estéticos**: AXTHLETICS no entra ahí, y menos
 * con un usuario adolescente.
 */
export type TrainingGoal =
  | 'fuerza'
  | 'hipertrofia'
  | 'resistencia'
  | 'rendimiento_deportivo'
  | 'movilidad'
  | 'tecnica'
  | 'salud_general'

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, string> = {
  fuerza: 'Ganar fuerza',
  hipertrofia: 'Ganar masa muscular',
  resistencia: 'Mejorar resistencia',
  rendimiento_deportivo: 'Rendimiento deportivo',
  movilidad: 'Mejorar movilidad',
  tecnica: 'Aprender técnica',
  salud_general: 'Salud general',
}

/** Orden estable para mostrar y para recorrer los objetivos. Nunca es una prioridad. */
export const TRAINING_GOAL_ORDER: readonly TrainingGoal[] = [
  'fuerza',
  'hipertrofia',
  'rendimiento_deportivo',
  'resistencia',
  'movilidad',
  'tecnica',
  'salud_general',
]

/** Hace falta al menos un objetivo: sin él AXIS no sabe hacia dónde empujar. */
export const MIN_GOALS = 1

/**
 * Tope de objetivos simultáneos.
 *
 * No es una restricción arbitraria: con más de tres, la sesión resultante deja de
 * parecerse a ninguno de ellos y AXIS ya no puede explicar por qué propone lo que
 * propone.
 */
export const MAX_GOALS = 3

export function isGoalSelectionValid(goals: readonly TrainingGoal[]): boolean {
  return goals.length >= MIN_GOALS && goals.length <= MAX_GOALS
}

/** Devuelve los objetivos en el orden canónico, sin duplicados. */
export function normalizeGoals(goals: readonly TrainingGoal[]): TrainingGoal[] {
  return TRAINING_GOAL_ORDER.filter((goal) => goals.includes(goal))
}

/** Zonas que el usuario quiere cuidar (D-051): AXIS deja fuera lo que las carga. */
export type CareZone =
  | 'rodilla'
  | 'tobillo'
  | 'cadera'
  | 'espalda_baja'
  | 'hombro'
  | 'codo'
  | 'muneca'
  | 'cuello'

export const CARE_ZONE_LABELS: Record<CareZone, string> = {
  rodilla: 'Rodilla',
  tobillo: 'Tobillo',
  cadera: 'Cadera',
  espalda_baja: 'Espalda baja',
  hombro: 'Hombro',
  codo: 'Codo',
  muneca: 'Muñeca',
  cuello: 'Cuello',
}

/** Orden estable para enseñar y para guardar. */
export const CARE_ZONE_ORDER = Object.keys(CARE_ZONE_LABELS) as CareZone[]

/** Sexo (D-051). Opcional: sin dato, AXIS no supone ninguno. */
export type Sex = 'hombre' | 'mujer'

export const SEX_LABELS: Record<Sex, string> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
}

export type ExperienceLevel = 'principiante' | 'intermedio' | 'avanzado'

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

/** Cuánto carga una actividad externa. AXIS la usa para no solapar esfuerzo. */
export type ActivityIntensity = 'baja' | 'media' | 'alta'

export const ACTIVITY_INTENSITY_LABELS: Record<ActivityIntensity, string> = {
  baja: 'Suave',
  media: 'Moderada',
  alta: 'Exigente',
}

/**
 * Una actividad del calendario: «Lunes, baloncesto, 20:00–22:00».
 *
 * Dos formas (D-018):
 *
 * - **Recurrente** (`date` ausente o `null`): ocurre cada semana en `weekday`.
 *   Es el caso de los entrenamientos de un deporte.
 * - **De un día concreto** (`date`): ocurre solo ese día. Es el caso de un
 *   partido, que puede ser sábado una semana y domingo la siguiente, o no
 *   haberlo. `weekday` se mantiene igual al día de la semana de `date`, pero
 *   quien manda es la fecha.
 */
export type ScheduledActivity = {
  id: string
  name: string
  weekday: Weekday
  /**
   * Día local (`YYYY-MM-DD`) en que ocurre, si es de un día concreto. Los
   * registros anteriores a D-018 no lo tienen: son recurrentes.
   */
  date?: DayKey | null
  /**
   * Minutos desde medianoche. `20:00` → `1200`.
   *
   * Puede ser `null`: en el onboarding se pregunta qué días y con qué intensidad,
   * no a qué hora. Sin hora AXIS sigue sabiendo que hoy hay deporte y cuánto carga,
   * pero no puede razonar sobre el margen que queda antes de empezar.
   */
  startMinute: number | null
  endMinute: number | null
  intensity: ActivityIntensity
  /**
   * Grupos musculares que la actividad carga de forma notable. Permite que AXIS
   * evite proponer una sesión que solape con ella.
   */
  loadsMuscleGroups: string[]
  createdAt: string
  updatedAt: string
}

/**
 * Core v0.1 es local y sin cuentas, así que hay exactamente un perfil.
 * El identificador es constante para poder leerlo sin buscar.
 */
export const PRIMARY_PROFILE_ID = 'primary'

export type UserProfile = {
  id: typeof PRIMARY_PROFILE_ID
  name: string
  /**
   * Edad en años. AXIS la necesita sobre todo para interpretar el sueño: la
   * referencia de un adolescente no es la de un adulto.
   */
  age: number
  heightCm: number
  weightKg: number
  /**
   * Objetivos simultáneos, entre 1 y 3. No hay un «objetivo principal»: AXIS los
   * considera todos a la vez y combina sus parámetros de forma explícita.
   */
  goals: TrainingGoal[]
  experience: ExperienceLevel
  /** Días de la semana en que el usuario puede entrenar (lunes = 0). */
  availableWeekdays: Weekday[]
  /** Duración habitual disponible por sesión, en minutos. */
  typicalSessionMinutes: number
  /**
   * Objetivos medibles (D-035): un ejercicio, una cifra y una fecha. Ausente en
   * los perfiles anteriores. El formulario de perfil no los toca: tienen sus
   * propias acciones.
   */
  targets?: GoalTarget[]
  /**
   * Ejercicios que el usuario ha dicho que no le gustan (D-037). AXIS no los
   * propone mientras haya alternativas. Ausente en los perfiles anteriores.
   */
  dislikedExercises?: string[]
  /**
   * El nivel elegido en cada familia de ejercicios (D-065): `familia → id`. AXIS
   * parte de esa variante y sube cuando se domina. Ausente en los perfiles anteriores.
   */
  exerciseLevels?: Record<string, string>
  /**
   * El material con el que entrena (D-046). Ausente en los perfiles anteriores,
   * que se leen como una pesa de 5 kg (`equipmentOf`).
   */
  equipment?: UserEquipment
  /** Sexo (D-051). Ausente o `null`: prefiere no decirlo. */
  sex?: Sex | null
  /** Zonas a cuidar (D-051). Ausente en los perfiles anteriores. */
  careZones?: CareZone[]
  /** Las preguntas de salud de la evaluación inicial (D-058). Ausente si no se contestaron. */
  health?: HealthScreen
  /** Cuánto ha entrenado y si lo hace ahora (D-058). Ausente si no se contestó. */
  background?: TrainingBackground
  /** El objetivo de alimentación y los ajustes aceptados (D-061). Ausente si no se eligió. */
  nutrition?: NutritionPlan
  /**
   * Lo que se comparte con la app AXIS del ecosistema (D-076). Ausente: nada.
   * El formulario de perfil no lo toca: tiene su propia acción.
   */
  ecosystem?: EcosystemSharing
  createdAt: string
  updatedAt: string
}

/**
 * Un objetivo medible (D-035): «12 flexiones seguidas antes del 1 de marzo».
 * Se mide con la mejor serie registrada del ejercicio: repeticiones, o segundos
 * si el ejercicio es isométrico.
 */
export type GoalTarget = {
  id: string
  exerciseId: string
  /** Repeticiones (o segundos) en una sola serie. */
  target: number
  /** Hasta cuándo. */
  deadline: DayKey
  /** La mejor serie al crearlo: el punto de partida de la línea de progreso. */
  startValue: number
  createdAt: string
}

export function isGoalTarget(value: unknown): value is GoalTarget {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.exerciseId !== 'string') return false
  if (!isFiniteNumber(value.target) || value.target <= 0) return false
  if (!isFiniteNumber(value.startValue) || value.startValue < 0) return false
  return isDayKey(value.deadline) && isIsoDate(value.createdAt)
}

export type UserProfileDraft = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Un deporte tal y como lo declara el usuario: un nombre, los días que lo practica
 * y con qué intensidad.
 *
 * **No es una entidad persistida.** Es la vista agrupada de las `ScheduledActivity`
 * que comparten nombre, para no tener dos fuentes de verdad sobre lo mismo. Se
 * guardan como actividades porque eso es lo que el calendario y AXIS ya entienden.
 */
export type Sport = {
  name: string
  weekdays: Weekday[]
  intensity: ActivityIntensity
  loadsMuscleGroups: string[]
}

/**
 * Reconstruye los deportes agrupando las actividades por nombre.
 *
 * Solo las recurrentes: un partido de un día concreto no es «un deporte que
 * practicas los sábados», y contarlo así diría algo falso de las demás semanas.
 */
export function sportsFromActivities(
  activities: readonly ScheduledActivity[],
): Sport[] {
  const byName = new Map<string, Sport>()

  for (const activity of activities) {
    if (isDatedActivity(activity)) continue
    const existing = byName.get(activity.name)
    if (existing) {
      if (!existing.weekdays.includes(activity.weekday)) {
        existing.weekdays.push(activity.weekday)
        existing.weekdays.sort((a, b) => a - b)
      }
      continue
    }
    byName.set(activity.name, {
      name: activity.name,
      weekdays: [activity.weekday],
      intensity: activity.intensity,
      loadsMuscleGroups: [...activity.loadsMuscleGroups],
    })
  }

  return [...byName.values()]
}

export function isAvailableOn(profile: UserProfile, weekday: Weekday): boolean {
  return profile.availableWeekdays.includes(weekday)
}

/** `true` si la actividad es de un día concreto (D-018), no recurrente. */
export function isDatedActivity(
  activity: Pick<ScheduledActivity, 'date'>,
): activity is { date: DayKey } {
  return activity.date != null
}

/**
 * Si la actividad ocurre el día `dayKey` (local).
 *
 * Una de un día concreto, solo ese día: por eso un partido que ya pasó deja de
 * contar sin que nadie lo borre. Una recurrente, cada semana en su `weekday`.
 */
export function activityOccursOn(
  activity: Pick<ScheduledActivity, 'weekday' | 'date'>,
  dayKey: DayKey,
): boolean {
  if (isDatedActivity(activity)) return activity.date === dayKey
  return activity.weekday === weekdayOfKey(dayKey)
}

/** Lo que se puede cambiar de una actividad ya guardada. */
export type ActivityChanges = Partial<
  Pick<
    ScheduledActivity,
    'name' | 'weekday' | 'date' | 'startMinute' | 'endMinute' | 'intensity' | 'loadsMuscleGroups'
  >
>

/**
 * La actividad con los cambios aplicados, sin borrarla ni recrearla: conserva
 * su `id` y su `createdAt`. Si tiene fecha, `weekday` se recalcula de ella para
 * que nunca digan cosas distintas.
 */
export function withActivityChanges(
  activity: ScheduledActivity,
  changes: ActivityChanges,
  now: string,
): ScheduledActivity {
  const next: ScheduledActivity = {
    ...activity,
    ...changes,
    id: activity.id,
    createdAt: activity.createdAt,
    updatedAt: now,
  }
  return isDatedActivity(next) ? { ...next, weekday: weekdayOfKey(next.date) } : next
}

// ---------------------------------------------------------------------------
// Comprobación de forma
//
// Necesarias para importar una copia de seguridad: el archivo lo puede haber
// escrito otra versión de la aplicación, o el propio usuario con un editor.
// ---------------------------------------------------------------------------

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/* Derivados de las etiquetas, que son la única lista: añadir un nivel no puede
   dejar la comprobación desincronizada. */
const EXPERIENCE_ORDER = Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]
const ACTIVITY_INTENSITY_ORDER = Object.keys(ACTIVITY_INTENSITY_LABELS) as ActivityIntensity[]

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && (WEEKDAYS as readonly number[]).includes(value)
}

function isTrainingGoal(value: unknown): value is TrainingGoal {
  return isOneOf(value, TRAINING_GOAL_ORDER)
}

export function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false
  if (value.id !== PRIMARY_PROFILE_ID) return false
  if (typeof value.name !== 'string') return false
  if (!isFiniteNumber(value.age) || !isFiniteNumber(value.heightCm)) return false
  if (!isFiniteNumber(value.weightKg) || !isFiniteNumber(value.typicalSessionMinutes)) {
    return false
  }
  // Al menos un objetivo: sin él AXIS no sabe hacia dónde empujar.
  if (!isArrayOf(value.goals, isTrainingGoal) || value.goals.length === 0) return false
  if (!isOneOf(value.experience, EXPERIENCE_ORDER)) return false
  if (!isArrayOf(value.availableWeekdays, isWeekday)) return false
  if (value.targets !== undefined && !isArrayOf(value.targets, isGoalTarget)) return false
  if (value.dislikedExercises !== undefined && !isArrayOf(value.dislikedExercises, (item): item is string => typeof item === 'string')) {
    return false
  }
  if (
    value.exerciseLevels !== undefined &&
    !(isRecord(value.exerciseLevels) && Object.values(value.exerciseLevels).every((id) => typeof id === 'string'))
  ) {
    return false
  }
  if (value.equipment !== undefined && !isUserEquipment(value.equipment)) return false
  if (value.sex !== undefined && value.sex !== null && !isOneOf(value.sex, Object.keys(SEX_LABELS) as Sex[])) return false
  if (value.careZones !== undefined && !isArrayOf(value.careZones, (item): item is CareZone => isOneOf(item, CARE_ZONE_ORDER))) {
    return false
  }
  if (value.health !== undefined && !isHealthScreen(value.health)) return false
  if (value.background !== undefined && !isTrainingBackground(value.background)) return false
  if (value.nutrition !== undefined && !isNutritionPlan(value.nutrition)) return false
  if (value.ecosystem !== undefined && !isEcosystemSharing(value.ecosystem)) return false
  return isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

export function isScheduledActivity(value: unknown): value is ScheduledActivity {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false
  if (!isWeekday(value.weekday)) return false
  // Ausente o `null`: recurrente, como todas las anteriores a D-018.
  if (value.date !== undefined && value.date !== null && !isDayKey(value.date)) return false
  if (!isNullableNumber(value.startMinute) || !isNullableNumber(value.endMinute)) return false
  if (!isOneOf(value.intensity, ACTIVITY_INTENSITY_ORDER)) return false
  if (!isArrayOf(value.loadsMuscleGroups, (item): item is string => typeof item === 'string')) {
    return false
  }
  return isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}
