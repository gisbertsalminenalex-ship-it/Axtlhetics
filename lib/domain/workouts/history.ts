/**
 * Lo que dicen las sesiones anteriores de un ejercicio (D-019).
 *
 * Tres usos, los tres deterministas y sin inventar nada:
 *
 * - La progresión de AXIS (`session-builder.ts`) parte de la última vez.
 * - El ejercicio activo enseña la última vez, para comparar.
 * - El resumen destaca un récord solo si supera algo registrado antes.
 *
 * Solo cuentan las sesiones completadas: una interrumpida no dice qué es capaz
 * de hacer el usuario, dice dónde paró.
 */

import { daysBetween, type DayKey } from '../shared/dates'
import type { CompletedSet, Exercise, PerformedExercise, WorkoutSession } from './types'
import { metTarget } from './types'

export type LastPerformance = {
  weightKg: number | null
  reps: number
  /**
   * `true` si la última vez se hizo lo previsto: todas las series y ninguna por
   * debajo del objetivo. Es lo que decide si la progresión sube o repite.
   */
  allSetsCompleted: boolean
  sets: number
}

/** El ejercicio tal y como se hizo en la sesión completada más reciente que lo tenga. */
export function lastPerformedExercise(
  exerciseId: string,
  history: readonly WorkoutSession[],
): PerformedExercise | null {
  for (const session of history) {
    if (session.status !== 'completed') continue
    const performed = session.exercises.find((item) => item.exerciseId === exerciseId)
    if (performed && performed.sets.length > 0) return performed
  }
  return null
}

export function lastPerformanceOf(
  exerciseId: string,
  history: readonly WorkoutSession[],
): LastPerformance | null {
  const performed = lastPerformedExercise(exerciseId, history)
  if (!performed) return null

  return {
    weightKg: maxWeight(performed.sets),
    reps: Math.max(...performed.sets.map((set) => set.reps)),
    allSetsCompleted: metTarget(performed),
    sets: performed.sets.length,
  }
}

function maxWeight(sets: readonly CompletedSet[]): number | null {
  const weights = sets.map((set) => set.weightKg).filter((weight): weight is number => weight !== null)
  return weights.length > 0 ? Math.max(...weights) : null
}

// ---------------------------------------------------------------------------
// Cómo se dice una serie
// ---------------------------------------------------------------------------

/** `5`, `4,5` — la coma decimal, como en el resto de la interfaz. */
export function formatKg(kg: number): string {
  return kg.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * Las series de un ejercicio en una línea: `3 × 10 · 5 kg`, `10, 8, 6 · 5 kg`,
 * `3 × 30 s`. Si las repeticiones no fueron iguales en todas, se dicen todas:
 * resumirlas en una sola sería contar algo que no pasó.
 */
export function formatSets(sets: readonly CompletedSet[], options: { isTimed: boolean }): string {
  if (sets.length === 0) return ''
  const unit = options.isTimed ? ' s' : ''
  const reps = sets.map((set) => set.reps)
  const allEqual = reps.every((value) => value === reps[0])
  const work = allEqual ? `${sets.length} × ${reps[0]}${unit}` : `${reps.join(', ')}${unit}`
  const weight = maxWeight(sets)
  return weight === null ? work : `${work} · ${formatKg(weight)} kg`
}

// ---------------------------------------------------------------------------
// Récords personales
// ---------------------------------------------------------------------------

export type PersonalRecordKind = 'weight' | 'reps'

export type PersonalRecord = {
  exerciseId: string
  name: string
  kind: PersonalRecordKind
  value: number
  previous: number
}

type Best = { weight: number | null; repsAtWeight: number }

/** Lo mejor de unas series: el mayor peso y, con ese peso, las mayores repeticiones. */
function bestOf(sets: readonly CompletedSet[]): Best | null {
  const done = sets.filter((set) => set.completed)
  if (done.length === 0) return null
  const weight = maxWeight(done)
  const atWeight = done.filter((set) => set.weightKg === weight)
  return { weight, repsAtWeight: Math.max(...atWeight.map((set) => set.reps)) }
}

/**
 * Los récords de una sesión frente a todo lo completado antes.
 *
 * Un récord es superar algo **registrado**: la primera vez que se hace un
 * ejercicio no hay récord, porque no hay con qué comparar. Con carga, cuenta
 * subir el peso o, con el mismo peso, hacer más repeticiones. Sin carga, más
 * repeticiones (o segundos). `history` puede incluir la propia sesión: se ignora.
 */
export function personalRecords(
  session: WorkoutSession,
  history: readonly WorkoutSession[],
): PersonalRecord[] {
  const previous = history.filter((item) => item.id !== session.id && item.status === 'completed')
  const records: PersonalRecord[] = []

  for (const exercise of session.exercises) {
    const now = bestOf(exercise.sets)
    if (!now) continue

    const before = previous
      .flatMap((item) => item.exercises.filter((done) => done.exerciseId === exercise.exerciseId))
      .map((done) => bestOf(done.sets))
      .filter((best): best is Best => best !== null)
    if (before.length === 0) continue

    const base = { exerciseId: exercise.exerciseId, name: exercise.name }

    if (now.weight !== null) {
      const weights = before.map((best) => best.weight).filter((w): w is number => w !== null)
      const bestWeight = weights.length > 0 ? Math.max(...weights) : null
      if (bestWeight !== null && now.weight > bestWeight) {
        records.push({ ...base, kind: 'weight', value: now.weight, previous: bestWeight })
        continue
      }
      if (bestWeight !== null && now.weight === bestWeight) {
        const repsBefore = Math.max(...before.filter((best) => best.weight === bestWeight).map((best) => best.repsAtWeight))
        if (now.repsAtWeight > repsBefore) {
          records.push({ ...base, kind: 'reps', value: now.repsAtWeight, previous: repsBefore })
        }
      }
      continue
    }

    const repsBefore = Math.max(...before.filter((best) => best.weight === null).map((best) => best.repsAtWeight), 0)
    if (repsBefore > 0 && now.repsAtWeight > repsBefore) {
      records.push({ ...base, kind: 'reps', value: now.repsAtWeight, previous: repsBefore })
    }
  }

  return records
}

// ---------------------------------------------------------------------------
// Cuándo se usó por última vez cada ejercicio (D-020, rotación)
// ---------------------------------------------------------------------------

/**
 * Días durante los que un ejercicio saltado cuenta como usado para la rotación.
 *
 * Saltarlo es una señal de rechazo, no de que se hizo: durante este tiempo AXIS
 * no lo vuelve a proponer de inmediato. Pasado, la señal caduca y el ejercicio
 * compite como cualquier otro. No toca la progresión ni los récords, que solo
 * miran series hechas.
 */
export const SKIP_PENALTY_DAYS = 14

/**
 * El texto con el que `skipExercise` deja constancia de un salto. La sesión no
 * guarda el id del saltado, solo esta frase con su nombre; los nombres del
 * catálogo son únicos (un test lo vigila), así que el nombre basta. Otro test
 * comprueba el contrato con el texto real de `skipExercise`.
 */
const SKIPPED_DETAIL = /^(.+) sin completar\.$/

/** Los nombres de los ejercicios saltados en una sesión. */
export function skippedExerciseNames(session: WorkoutSession): string[] {
  return session.modifications
    .filter((modification) => modification.kind === 'exercise_skipped')
    .map((modification) => SKIPPED_DETAIL.exec(modification.detail)?.[1] ?? null)
    .filter((name): name is string => name !== null)
}

/** El uso de un ejercicio para la rotación: cuándo fue la última vez y cuántas. */
export type ExerciseUsage = {
  lastUse: DayKey
  /** Sesiones en las que se usó. Desempata cuando dos se usaron el mismo día. */
  uses: number
}

/**
 * El uso de cada ejercicio, por id. Lo que la rotación ordena.
 *
 * - **Hecho**: cualquier sesión, completada o interrumpida, en la que tenga al
 *   menos una serie. Una interrumpida también lo puso delante del usuario.
 * - **Saltado**: cuenta como usado ese día, pero solo durante `SKIP_PENALTY_DAYS`
 *   respecto a `today`. Sin `today`, la señal no caduca.
 * - Nunca usado: no aparece en el mapa.
 *
 * Una sesión cuenta una vez por ejercicio aunque se hiciera y se saltara. No
 * depende del orden del historial.
 */
export function exerciseUsage(
  history: readonly WorkoutSession[],
  options: { catalog: readonly Exercise[]; today?: DayKey },
): Map<string, ExerciseUsage> {
  const idByName = new Map(options.catalog.map((exercise) => [exercise.name, exercise.id]))
  const usage = new Map<string, ExerciseUsage>()

  for (const session of history) {
    const used = new Set<string>()
    for (const exercise of session.exercises) {
      if (exercise.sets.length > 0) used.add(exercise.exerciseId)
    }

    const expired =
      options.today !== undefined && daysBetween(session.dayKey, options.today) > SKIP_PENALTY_DAYS
    if (!expired) {
      for (const name of skippedExerciseNames(session)) {
        const id = idByName.get(name)
        if (id) used.add(id)
      }
    }

    for (const id of used) {
      const current = usage.get(id)
      usage.set(id, {
        lastUse: !current || session.dayKey > current.lastUse ? session.dayKey : current.lastUse,
        uses: (current?.uses ?? 0) + 1,
      })
    }
  }

  return usage
}
