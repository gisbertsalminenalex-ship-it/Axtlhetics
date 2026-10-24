/**
 * La memoria que viaja con cada pregunta a la IA (D-070, bloque 2), como en
 * Mentax: la IA no guarda nada y cada vez empieza de cero, así que la app le
 * manda lo necesario para que haya continuidad.
 *
 * - **Los días anteriores**: lo que el usuario le dijo a AXIS, las molestias y
 *   las cargas que contó. Así puede decir «como el martes…».
 * - **Las últimas sesiones**, sus **objetivos** y lo que AXIS ha **aprendido**
 *   de él (ejercicios que no le gustan, zonas que cuidar).
 * - **Alimentación y peso** con las cifras de la app, la **revisión de la
 *   semana**, y los **resúmenes** del escáner y del test de evolución. Nunca
 *   fotos ni medidas en bruto, y nunca el nombre: se escribe `{nombre}`.
 *
 * Todo recortado: unos pocos días, unas pocas frases cortas. Es puro.
 */

import { completedAssessments } from '../../assessment/assessment'
import { compareAssessment } from '../../assessment/compare'
import type { Assessment } from '../../assessment/types'
import { dayIntake, type MealEntry } from '../../nutrition/intake'
import type { NutritionTargets } from '../../nutrition/targets'
import { CARE_ZONE_LABELS, TRAINING_GOAL_LABELS, type UserProfile } from '../../profile/types'
import { daysBetween, type DayKey } from '../../shared/dates'
import type { Exercise, WorkoutSession } from '../../workouts/types'
import type { BriefingScan } from '../briefing'
import type { AxisDayMemory } from '../memory'
import type { WeeklyReview } from '../weekly-review'

/** Cuántos días atrás se recuerdan, y cuánto de cada uno. */
export const MEMORY_DAYS = 6
export const MEMORY_MESSAGES_PER_DAY = 3
export const MEMORY_MESSAGE_CHARACTERS = 160
export const MEMORY_SESSIONS = 6

export type AxisAiMemory = {
  /** Del más reciente al más antiguo; solo los días con algo que recordar. */
  recentDays: { dayKey: DayKey; said: string[]; discomforts: string[]; told: string[] }[]
  recentSessions: { dayKey: DayKey; title: string; minutes: number; effort: number | null }[]
  goals: string[]
  learned: { dislikedExercises: string[]; careZones: string[] }
  nutrition: { todayKcal: number; todayProteinG: number; meals: number; targetKcal: number; targetProteinG: [number, number] } | null
  weekReview: { sessions: number; planned: number; averageSleepHours: number | null; improvements: string[]; next: string[] } | null
  scan: { dayKey: DayKey; overview: string; strongZones: string[]; weakZones: string[]; improvements: string[]; plan: string | null } | null
  test: { completed: number; lastDay: DayKey | null; trend: string[] } | null
}

export type AxisAiMemoryInput = {
  today: DayKey
  /** Se sustituye por `{nombre}` en todo lo que el usuario escribió. */
  name: string | null
  pastDays: readonly AxisDayMemory[]
  sessions: readonly WorkoutSession[]
  profile: UserProfile | null
  catalog: readonly Exercise[]
  nutrition: { targets: NutritionTargets | null; todayMeals: readonly MealEntry[] | undefined } | null
  weeklyReview: WeeklyReview | null
  scan: BriefingScan | null
  assessments: readonly Assessment[]
}

const TREND_TEXT = { up: 'sube', down: 'baja', same: 'igual', mixed: 'mixto' } as const

export function buildAiMemory(input: AxisAiMemoryInput): AxisAiMemory {
  const scrub = (text: string) => (input.name ? text.split(input.name).join('{nombre}') : text).slice(0, MEMORY_MESSAGE_CHARACTERS)

  const recentDays = [...input.pastDays]
    .filter((day) => {
      const age = daysBetween(day.dayKey, input.today)
      return age > 0 && age <= MEMORY_DAYS
    })
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .map((day) => ({
      dayKey: day.dayKey,
      said: day.messages.filter((m) => m.role === 'user').slice(-MEMORY_MESSAGES_PER_DAY).map((m) => scrub(m.text)),
      discomforts: [...new Set((day.discomforts ?? []).map((d) => d.zone))],
      told: day.reportedLoads.map((load) => scrub(load.quote)),
    }))
    .filter((day) => day.said.length + day.discomforts.length + day.told.length > 0)

  const recentSessions = input.sessions
    .filter((s) => s.status === 'completed' && s.dayKey <= input.today && daysBetween(s.dayKey, input.today) <= 14)
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .slice(0, MEMORY_SESSIONS)
    .map((s) => ({ dayKey: s.dayKey, title: s.title, minutes: Math.round(s.durationSeconds / 60), effort: s.perceivedEffort }))

  const nameOf = (id: string) => input.catalog.find((exercise) => exercise.id === id)?.name ?? id
  const profile = input.profile

  const targets = input.nutrition?.targets ?? null
  const intake = dayIntake(input.nutrition?.todayMeals)
  const nutrition = targets
    ? {
        todayKcal: Math.round(intake.kcal),
        todayProteinG: Math.round(intake.proteinG),
        meals: intake.meals,
        targetKcal: targets.kcal,
        targetProteinG: [targets.proteinGrams[0], targets.proteinGrams[1]] as [number, number],
      }
    : null

  const review = input.weeklyReview
  const weekReview = review
    ? {
        sessions: review.sessions,
        planned: review.planned,
        averageSleepHours: review.averageSleepHours,
        improvements: review.improvements.map((i) => `${i.name}: ${i.from} → ${i.to} ${i.unit}`),
        next: review.next,
      }
    : null

  const scan = input.scan
    ? {
        dayKey: input.scan.dayKey,
        overview: input.scan.overview,
        strongZones: [...input.scan.strongZones],
        weakZones: [...input.scan.weakZones],
        improvements: input.scan.improvements.slice(0, 4),
        plan: input.scan.plan,
      }
    : null

  const done = completedAssessments(input.assessments)
  const comparisons = done.length ? (compareAssessment(done[0], input.assessments) ?? []) : []
  const test = done.length
    ? {
        completed: done.length,
        lastDay: done[0].dayKey,
        trend: comparisons.map((c) => `${c.test.area}: ${c.delta.kind === 'baseline' ? 'línea base' : TREND_TEXT[c.delta.trend]}`),
      }
    : null

  return {
    recentDays,
    recentSessions,
    goals: (profile?.goals ?? []).map((goal) => TRAINING_GOAL_LABELS[goal]),
    learned: {
      dislikedExercises: (profile?.dislikedExercises ?? []).map(nameOf),
      careZones: (profile?.careZones ?? []).map((zone) => CARE_ZONE_LABELS[zone]),
    },
    nutrition,
    weekReview,
    scan,
    test,
  }
}
