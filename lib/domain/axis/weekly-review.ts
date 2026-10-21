/**
 * La revisión de la semana (D-059): lo que un entrenador repasa cada lunes.
 *
 * De la semana natural anterior: cuántas sesiones se hicieron de las
 * previstas, qué ejercicios mejoraron (1RM estimado con carga, mejor serie sin
 * ella), cómo se durmió y se recuperó, y qué hace AXIS con la semana que
 * viene. Todo determinista y del historial local; las decisiones que anuncia
 * son las que el motor ya toma (bloque, descarga, zona atrasada), nunca otras.
 */

import type { UserProfile } from '../profile/types'
import { computeRecoveryScore } from '../recovery/score'
import { weeklyWeights, type BodyMeasurement } from '../body/measurements'
import type { RecoveryInputs } from '../recovery/types'
import { addDays, startOfWeek, type DayKey } from '../shared/dates'
import { listNames } from '../shared/text'
import { currentBlock } from '../workouts/blocks'
import { findExercise } from '../workouts/catalog'
import { DELOAD_AFTER_WEEKS } from '../workouts/deload'
import { formatKg } from '../workouts/history'
import { bestOneRepMax, roundKg } from '../workouts/strength'
import { isMainExercise, MUSCLE_GROUP_LABELS, type Exercise, type WorkoutSession } from '../workouts/types'
import { laggingGroup, weeklyVolume } from '../workouts/weekly-volume'

type ProfileForReview = Pick<UserProfile, 'age' | 'availableWeekdays' | 'experience'>

export type ReviewImprovement = {
  exerciseId: string
  name: string
  unit: 'kg' | 'reps' | 's'
  from: number
  to: number
}

export type WeeklyReview = {
  /** Lunes de la semana revisada. */
  weekStart: DayKey
  sessions: number
  /** Las previstas: los días disponibles del perfil. */
  planned: number
  improvements: ReviewImprovement[]
  /** Media de la semana, o `null` sin días registrados. */
  averageSleepHours: number | null
  averageRecovery: number | null
  /** El peso medio de la semana y su cambio frente a la anterior con pesos (D-060). `null` sin pesos. */
  weight: { averageKg: number; changeKg: number | null } | null
  /** Lo que AXIS hace con la semana que viene, frase a frase. */
  next: string[]
}

/** Mejoras que se cuentan, como mucho: las más grandes. */
export const MAX_IMPROVEMENTS = 3

/** Por debajo de esto, la semana se durmió poco (horas). */
export const SHORT_SLEEP_HOURS = 7

/**
 * La revisión de la semana anterior a `today`, o `null` si en ella no se
 * entrenó: sin sesiones no hay nada que revisar.
 */
export function weeklyReview(input: {
  today: DayKey
  profile: ProfileForReview | null
  sessions: readonly WorkoutSession[]
  recovery: readonly RecoveryInputs[]
  catalog: readonly Exercise[]
  /** Peso y medidas (D-060). */
  measurements?: readonly BodyMeasurement[]
}): WeeklyReview | null {
  const { today, profile, sessions, recovery, catalog } = input
  const monday = startOfWeek(today)
  const weekStart = addDays(monday, -7)
  const inWeek = (dayKey: DayKey) => dayKey >= weekStart && dayKey < monday
  const done = sessions.filter((session) => session.status === 'completed' && inWeek(session.dayKey))
  if (done.length === 0) return null

  const days = recovery.filter((inputs) => inWeek(inputs.dayKey))
  const sleep = days.map((inputs) => inputs.sleepHours).filter((hours): hours is number => hours !== null)
  const scores = days
    .map((inputs) => computeRecoveryScore(inputs, { age: profile?.age }))
    .flatMap((score) => (score.status === 'ok' ? [score.value] : []))

  const review: WeeklyReview = {
    weekStart,
    sessions: done.length,
    planned: profile?.availableWeekdays.length ?? done.length,
    improvements: improvementsOf(done, sessions.filter((session) => session.status === 'completed' && session.dayKey < weekStart)),
    averageSleepHours: sleep.length > 0 ? Math.round((sleep.reduce((a, b) => a + b, 0) / sleep.length) * 10) / 10 : null,
    averageRecovery: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    weight: weightOf(input.measurements ?? [], weekStart),
    next: [],
  }
  review.next = nextWeek(review, { today, sessions, catalog, experience: profile?.experience ?? 'intermedio' })
  return review
}

/**
 * Lo mejor de cada ejercicio en la semana frente a su última vez antes de
 * ella: 1RM estimado si lleva carga, mejor serie si no. Solo lo que subió.
 */
function improvementsOf(week: readonly WorkoutSession[], before: readonly WorkoutSession[]): ReviewImprovement[] {
  const ids = [...new Set(week.flatMap((session) => session.exercises.filter(isMainExercise).map((item) => item.exerciseId)))]
  const result: (ReviewImprovement & { gain: number })[] = []
  for (const exerciseId of ids) {
    const exercise = findExercise(exerciseId)
    if (!exercise || exercise.category === 'movilidad') continue
    const now = bestOf(exerciseId, week)
    const previous = latestBestOf(exerciseId, before)
    if (!now || !previous || now.unit !== previous.unit || now.value <= previous.value) continue
    result.push({
      exerciseId,
      name: exercise.name,
      unit: now.unit,
      from: previous.value,
      to: now.value,
      gain: (now.value - previous.value) / previous.value,
    })
  }
  return result
    .sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name, 'es'))
    .slice(0, MAX_IMPROVEMENTS)
    .map(({ gain: _gain, ...item }) => item)
}

type Best = { value: number; unit: ReviewImprovement['unit'] }

function bestOf(exerciseId: string, sessions: readonly WorkoutSession[]): Best | null {
  const sets = sessions.flatMap((session) =>
    session.exercises
      .filter((item) => item.exerciseId === exerciseId && isMainExercise(item))
      .flatMap((item) => item.sets.filter((set) => set.completed)),
  )
  if (sets.length === 0) return null
  const oneRepMax = bestOneRepMax(sets)
  if (oneRepMax !== null) return { value: roundKg(oneRepMax), unit: 'kg' }
  if (sets.some((set) => set.weightKg !== null)) return null
  const timed = findExercise(exerciseId)?.work.isTimed ?? false
  return { value: Math.max(...sets.map((set) => set.reps)), unit: timed ? 's' : 'reps' }
}

/** Lo mejor de la sesión más reciente que tenga el ejercicio. */
function latestBestOf(exerciseId: string, sessions: readonly WorkoutSession[]): Best | null {
  const latest = [...sessions]
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .find((session) => session.exercises.some((item) => item.exerciseId === exerciseId && isMainExercise(item) && item.sets.length > 0))
  return latest ? bestOf(exerciseId, [latest]) : null
}

/** Lo que AXIS hace con la semana que viene: solo lo que el motor de verdad hará. */
function nextWeek(
  review: WeeklyReview,
  context: { today: DayKey; sessions: readonly WorkoutSession[]; catalog: readonly Exercise[]; experience: UserProfile['experience'] },
): string[] {
  const lines: string[] = []
  const block = currentBlock(context.sessions, context.today)
  if (block.deload) {
    lines.push(`Esta semana es de descarga: llevas ${DELOAD_AFTER_WEEKS} semanas seguidas y toca asimilarlas.`)
  } else if (block.week === 1) {
    lines.push('Empieza un bloque nuevo: elijo tus ejercicios principales en la primera sesión de cada zona.')
  } else {
    lines.push(`Semana ${block.week} del bloque: repito tus ejercicios principales y subo donde hubo margen.`)
  }

  const lagging = laggingGroup(weeklyVolume(context.sessions, addDays(startOfWeek(context.today), -1), context.catalog, context.experience))
  if (lagging) {
    lines.push(`Lo que más se quedó atrás fue ${MUSCLE_GROUP_LABELS[lagging.group].toLowerCase()}: le doy prioridad.`)
  }

  if (review.sessions < review.planned) {
    const missed = review.planned - review.sessions
    lines.push(
      `Te ${missed === 1 ? 'faltó una sesión' : `faltaron ${missed} sesiones`}. Si esos días no te vienen bien, cámbialos en tu perfil y reparto la semana con los que sí.`,
    )
  }

  if (review.averageSleepHours !== null && review.averageSleepHours < SHORT_SLEEP_HOURS) {
    lines.push(`Dormiste ${formatHours(review.averageSleepHours)} de media: es lo que más te frena. Si registras tu recuperación, ajusto cada día.`)
  }
  return lines
}

/** La media de la semana revisada y el cambio frente a la semana con pesos anterior. */
function weightOf(measurements: readonly BodyMeasurement[], weekStart: DayKey): WeeklyReview['weight'] {
  const weeks = weeklyWeights(measurements, addDays(weekStart, 6), 5)
  const week = weeks.find((item) => item.weekStart === weekStart)
  if (!week) return null
  const before = weeks.filter((item) => item.weekStart < weekStart).pop()
  return { averageKg: week.averageKg, changeKg: before ? Math.round((week.averageKg - before.averageKg) * 10) / 10 : null }
}

/** Una mejora en una línea: «Remo unilateral: 1RM estimado 12 → 13 kg». */
export function describeImprovement(item: ReviewImprovement): string {
  if (item.unit === 'kg') return `${item.name}: 1RM estimado ${formatKg(item.from)} → ${formatKg(item.to)} kg`
  return `${item.name}: ${item.from} → ${item.to} ${item.unit}`
}

/** El resumen en una frase, para la nota del lunes (D-038). */
export function reviewHeadline(review: WeeklyReview): string {
  const sessions = `${review.sessions} de ${review.planned} ${review.planned === 1 ? 'sesión' : 'sesiones'}`
  const best = review.improvements.length > 0 ? ` Mejoraste en ${listNames(review.improvements.map((item) => item.name.toLowerCase()))}.` : ''
  return `La semana pasada: ${sessions}.${best} Tienes la revisión completa en Entrenamiento.`
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`
}
