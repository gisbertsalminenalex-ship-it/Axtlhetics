/**
 * AXIS habla primero (D-038): una nota corta cuando hay algo que decir sin que
 * se lo pregunten.
 *
 * Una sola nota cada vez, la más importante. Determinista y sin red: sale de
 * lo que la app ya sabe. Nunca decide nada ni cambia la sesión; como mucho,
 * invita a hablar.
 *
 * Por orden:
 *
 * 0. Una respuesta de salud con «sí» sin visto bueno del médico (D-058).
 * 1. Una molestia contada ayer: cómo va.
 * 2. El lunes, la semana pasada: el resumen de su revisión (D-059) o, sin
 *    ella, sesiones, series y la zona más atrasada.
 * 3. El primer día de una semana de descarga (D-031): avisarla.
 * 4. Un objetivo medible (D-035) que va por detrás.
 * 5. La recuperación de hoy sin registrar.
 */

import type { Assessment } from '../assessment/types'
import type { UserProfile } from '../profile/types'
import { needsMedicalClearance } from '../profile/screening'
import { reviewHeadline, type WeeklyReview } from './weekly-review'
import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import { findExercise } from '../workouts/catalog'
import { isDeloadWeek } from '../workouts/deload'
import { targetProgress } from '../workouts/targets'
import { MUSCLE_GROUP_LABELS, type Exercise, type WorkoutSession } from '../workouts/types'
import { laggingGroup, weeklyVolume } from '../workouts/weekly-volume'
import { weeklySetTotals } from '../workouts/progress'

export type ProactiveKind = 'health_check' | 'discomfort' | 'weekly_summary' | 'deload' | 'goal_behind' | 'register_recovery'

export type ProactiveNote = { kind: ProactiveKind; text: string }

export type ProactiveInput = {
  dayKey: DayKey
  profile: UserProfile | null
  sessions: readonly WorkoutSession[]
  catalog: readonly Exercise[]
  /** Zonas de las molestias que el usuario contó ayer (D-037). */
  discomfortsYesterday: readonly string[]
  /** `true` si hoy ya hay recuperación registrada. */
  recoveryRegistered: boolean
  /** Los tests de evolución: sus marcas cuentan para los objetivos (D-040). */
  assessments?: readonly Assessment[]
  /** La revisión de la semana pasada (D-059): el lunes, su resumen es la nota. */
  review?: WeeklyReview | null
}

export function proactiveNote(input: ProactiveInput): ProactiveNote | null {
  const { dayKey, profile, sessions, catalog } = input

  if (needsMedicalClearance(profile)) {
    return {
      kind: 'health_check',
      text: 'Contestaste que sí a una pregunta de salud. Antes de apretar, que te vea un médico; cuando te dé el visto bueno, márcalo en tu perfil.',
    }
  }

  const zone = input.discomfortsYesterday[0]
  if (zone) {
    return {
      kind: 'discomfort',
      text: `Ayer me contaste una molestia en ${withArticle(zone)}. ¿Cómo va? Si sigue, mejor que lo vea un profesional.`,
    }
  }

  const monday = startOfWeek(dayKey)
  if (dayKey === monday && input.review) {
    return { kind: 'weekly_summary', text: reviewHeadline(input.review) }
  }
  if (dayKey === monday) {
    const lastMonday = addDays(monday, -7)
    const lastWeek = sessions.filter(
      (session) => session.status === 'completed' && session.dayKey >= lastMonday && session.dayKey < monday,
    )
    if (lastWeek.length > 0) {
      // Las mismas series que enseña Progreso (D-036): solo el entrenamiento.
      const sets = weeklySetTotals(sessions, addDays(monday, -1), catalog, 1)[0].sets
      const lagging = laggingGroup(weeklyVolume(sessions, addDays(monday, -1), catalog, profile?.experience ?? 'intermedio'))
      return {
        kind: 'weekly_summary',
        text: `La semana pasada: ${lastWeek.length} ${lastWeek.length === 1 ? 'sesión' : 'sesiones'} y ${sets} series.${lagging ? ` Lo que más se quedó atrás: ${MUSCLE_GROUP_LABELS[lagging.group].toLowerCase()}; esta semana lo tengo en cuenta.` : ''}`,
      }
    }
  }

  // El primer día de la semana con sesiones de descarga por delante: el lunes, o el primero que se abre.
  const deloadStartsToday =
    isDeloadWeek(sessions, dayKey) &&
    !sessions.some((session) => session.dayKey >= monday && session.dayKey < dayKey && session.status === 'completed')
  if (deloadStartsToday) {
    // El cierre del bloque (D-062): con la descarga se llega fresco al test.
    const testedThisBlock = (input.assessments ?? []).some(
      (assessment) => assessment.status === 'completed' && assessment.dayKey >= addDays(monday, -28),
    )
    return {
      kind: 'deload',
      text: `Esta semana es de descarga: una serie menos por ejercicio y sin subir. Llevas cuatro semanas seguidas; ahora toca asimilarlas.${testedThisBlock ? '' : ' Es buen momento para repetir el test de evolución y cerrar el bloque.'}`,
    }
  }

  const behind = (profile?.targets ?? [])
    .map((target) => targetProgress(target, sessions, dayKey, input.assessments ?? []))
    .find((progress) => progress.status === 'behind')
  if (behind) {
    const exercise = findExercise(behind.target.exerciseId)
    const unit = exercise?.work.isTimed ? 's' : 'reps'
    return {
      kind: 'goal_behind',
      text: `Tu objetivo de ${exercise?.name.toLowerCase() ?? 'ese ejercicio'} va por detrás: llevas ${behind.current} ${unit} y a estas alturas tocaría ${formatNumber(behind.expected)}. Lo meto en tus sesiones cuando toque su zona.`,
    }
  }

  if (!input.recoveryRegistered) {
    return {
      kind: 'register_recovery',
      text: 'Todavía no has registrado tu recuperación de hoy. Con ella decido mejor qué te conviene.',
    }
  }

  return null
}

/** «la rodilla», «el hombro». */
function withArticle(zone: string): string {
  const feminine = ['rodilla', 'espalda', 'muñeca', 'cadera']
  return `${feminine.includes(zone) ? 'la' : 'el'} ${zone}`
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}
