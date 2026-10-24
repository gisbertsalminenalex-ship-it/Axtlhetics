/**
 * Los XP (D-071): el nivel no se guarda aparte, se calcula del historial.
 *
 * `xpLedger` recorre lo registrado —sesiones, tests, escaneos y medidas— y
 * devuelve cada concesión como un apunte con su fecha y su motivo. Es una
 * función pura: el mismo historial da siempre los mismos XP, una copia de
 * seguridad restaurada reconstruye el nivel y cada XP se puede comprobar.
 *
 * Las reglas premian seguir el plan, no entrenar más: una sesión al día, la
 * semana cumplida con los días del perfil (también en la descarga), el bloque
 * cerrado con su descarga, el test y la revisión del mes como mucho cada 28
 * días. Descansar nunca resta. Si las reglas cambian, sube `XP_RULES_VERSION`
 * y se registra en D-071: los niveles de todos se recalculan con las nuevas.
 */

import { compareAssessment } from '../assessment/compare'
import { ASSESSMENT_INTERVAL_DAYS } from '../assessment/protocol'
import type { Assessment } from '../assessment/types'
import { MONTHLY_CHECK_DAYS } from '../body/goal-measures'
import type { BodyMeasurement } from '../body/measurements'
import type { ScanRecord } from '../scanner/types'
import { daysBetween, startOfWeek, type DayKey } from '../shared/dates'
import { LOADED_WEEK_MIN_SESSIONS } from '../workouts/deload'
import { personalRecords } from '../workouts/history'
import { isMainExercise, type WorkoutSession } from '../workouts/types'

/** Versión de las reglas de abajo. Cambiar un valor es cambiar de versión. */
export const XP_RULES_VERSION = 1

export const XP = {
  /** Una sesión completada, como mucho una al día. */
  session: 100,
  /** La semana con todas las sesiones previstas en el perfil. */
  week: 150,
  /** Cada récord personal, como mucho `MAX_RECORDS_PER_DAY` al día. */
  record: 50,
  /** El bloque cerrado: su semana de descarga hecha. */
  block: 300,
  /** Un test de evolución completado. */
  test: 200,
  /** Cada prueba del test que mejora frente al anterior compatible. */
  testImprovement: 50,
  /** La revisión del mes: un escaneo o la cinta, como mucho cada 28 días. */
  review: 100,
} as const

export const MAX_RECORDS_PER_DAY = 2

export type XpKind = 'session' | 'week' | 'record' | 'block' | 'test' | 'test_improvement' | 'review'

export type XpEvent = {
  kind: XpKind
  xp: number
  dayKey: DayKey
  /** Para ordenar dentro del día. */
  at: string
  /** «Sesión», «Semana cumplida», «Marca personal · Flexiones»… */
  label: string
  /** La sesión que lo ganó, si lo ganó una sesión. */
  sessionId?: string
}

export type XpInput = {
  sessions: readonly WorkoutSession[]
  assessments: readonly Assessment[]
  scans: readonly ScanRecord[]
  measurements: readonly BodyMeasurement[]
  /** Los días que el usuario tiene para entrenar: lo que pide su semana. */
  plannedDaysPerWeek: number
}

/** Una sesión que cuenta: completada y con al menos una serie de entrenamiento hecha. */
function counts(session: WorkoutSession): boolean {
  return (
    session.status === 'completed' &&
    session.exercises.some((exercise) => isMainExercise(exercise) && exercise.sets.some((set) => set.completed))
  )
}

function timeOf(session: WorkoutSession): string {
  return session.completedAt ?? session.startedAt
}

function byTime(a: WorkoutSession, b: WorkoutSession): number {
  return a.dayKey.localeCompare(b.dayKey) || timeOf(a).localeCompare(timeOf(b))
}

function sessionEvents(sessions: readonly WorkoutSession[], plannedDaysPerWeek: number): XpEvent[] {
  const ordered = sessions.filter(counts).sort(byTime)
  const planned = Math.max(0, Math.min(7, Math.round(plannedDaysPerWeek)))
  const events: XpEvent[] = []
  const rewardedDays = new Set<DayKey>()
  const recordsByDay = new Map<DayKey, number>()
  // Días entrenados por semana (lunes), y si ese día era de descarga.
  const weekDays = new Map<DayKey, Set<DayKey>>()
  const deloadDays = new Map<DayKey, Set<DayKey>>()

  ordered.forEach((session, index) => {
    const at = timeOf(session)
    const base = { dayKey: session.dayKey, at, sessionId: session.id }
    const firstToday = !rewardedDays.has(session.dayKey)
    if (firstToday) {
      rewardedDays.add(session.dayKey)
      events.push({ ...base, kind: 'session', xp: XP.session, label: 'Sesión' })
    }

    // Solo frente a lo anterior: una sesión posterior no le quita su marca.
    const used = recordsByDay.get(session.dayKey) ?? 0
    const records = personalRecords(session, ordered.slice(0, index)).slice(0, Math.max(0, MAX_RECORDS_PER_DAY - used))
    recordsByDay.set(session.dayKey, used + records.length)
    for (const record of records) {
      events.push({ ...base, kind: 'record', xp: XP.record, label: `Marca personal · ${record.name}` })
    }

    if (!firstToday) return
    const monday = startOfWeek(session.dayKey)
    const days = weekDays.get(monday) ?? new Set<DayKey>()
    days.add(session.dayKey)
    weekDays.set(monday, days)
    // Se gana el día que se completa lo previsto; entrenar más no da más.
    if (planned > 0 && days.size === planned) {
      events.push({ ...base, kind: 'week', xp: XP.week, label: 'Semana cumplida' })
    }

    if (session.proposal?.deload !== true) return
    const deload = deloadDays.get(monday) ?? new Set<DayKey>()
    deload.add(session.dayKey)
    deloadDays.set(monday, deload)
    // La descarga cierra el bloque con las sesiones de una semana cargada (D-031).
    if (planned > 0 && deload.size === Math.min(LOADED_WEEK_MIN_SESSIONS, planned)) {
      events.push({ ...base, kind: 'block', xp: XP.block, label: 'Bloque cerrado' })
    }
  })

  return events
}

function testEvents(assessments: readonly Assessment[]): XpEvent[] {
  const done = assessments
    .filter((assessment) => assessment.status === 'completed')
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.startedAt.localeCompare(b.startedAt))
  const events: XpEvent[] = []
  let lastRewarded: DayKey | null = null
  for (const assessment of done) {
    // Repetirlo antes de tiempo, buscando un resultado mejor, no da más.
    if (lastRewarded && daysBetween(lastRewarded, assessment.dayKey) < ASSESSMENT_INTERVAL_DAYS) continue
    lastRewarded = assessment.dayKey
    const base = { dayKey: assessment.dayKey, at: assessment.endedAt ?? assessment.startedAt }
    events.push({ ...base, kind: 'test', xp: XP.test, label: 'Test de evolución' })
    for (const row of compareAssessment(assessment, assessments) ?? []) {
      if (row.delta.kind !== 'baseline' && row.delta.trend === 'up') {
        events.push({ ...base, kind: 'test_improvement', xp: XP.testImprovement, label: `Mejora · ${row.test.name}` })
      }
    }
  }
  return events
}

function reviewEvents(scans: readonly ScanRecord[], measurements: readonly BodyMeasurement[]): XpEvent[] {
  const taped = measurements.filter((record) => Object.values(record.perimeters).some((value) => typeof value === 'number'))
  const candidates = [
    ...scans.map((scan) => ({ dayKey: scan.dayKey, at: scan.createdAt })),
    ...taped.map((record) => ({ dayKey: record.dayKey, at: `${record.dayKey}T23:59:59.000Z` })),
  ].sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.at.localeCompare(b.at))
  const events: XpEvent[] = []
  let lastRewarded: DayKey | null = null
  for (const candidate of candidates) {
    if (lastRewarded && daysBetween(lastRewarded, candidate.dayKey) < MONTHLY_CHECK_DAYS) continue
    lastRewarded = candidate.dayKey
    events.push({ ...candidate, kind: 'review', xp: XP.review, label: 'Revisión del mes' })
  }
  return events
}

/** Todos los XP ganados, del más antiguo al más reciente. */
export function xpLedger(input: XpInput): XpEvent[] {
  return [
    ...sessionEvents(input.sessions, input.plannedDaysPerWeek),
    ...testEvents(input.assessments),
    ...reviewEvents(input.scans, input.measurements),
  ].sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.at.localeCompare(b.at))
}

export function totalXp(events: readonly XpEvent[]): number {
  return events.reduce((total, event) => total + event.xp, 0)
}
