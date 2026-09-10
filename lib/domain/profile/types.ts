/**
 * Perfil del usuario.
 *
 * Esto es **contexto para AXIS**, no una red social ni un perfil completo. Se guarda
 * lo mínimo que AXIS necesita para personalizar una recomendación.
 *
 * Perfil NO es una pestaña principal: se edita desde una pantalla interna.
 */

import type { Weekday } from '../shared/dates'

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
 * Una actividad con horario fijo: «Lunes, baloncesto, 20:00–22:00».
 *
 * Se guarda por día de la semana porque el caso real es un horario recurrente,
 * no un evento suelto de calendario.
 */
export type ScheduledActivity = {
  id: string
  name: string
  weekday: Weekday
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
  createdAt: string
  updatedAt: string
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

/** Reconstruye los deportes agrupando las actividades por nombre. */
export function sportsFromActivities(
  activities: readonly ScheduledActivity[],
): Sport[] {
  const byName = new Map<string, Sport>()

  for (const activity of activities) {
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
