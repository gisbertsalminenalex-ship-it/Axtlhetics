'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FieldLabel, PrimaryButton, SectionTitle, StepperField } from '@/components/profile/controls'
import { addDays, formatShortDate, type DayKey } from '@/lib/domain/shared/dates'
import { EXERCISE_CATALOG, findExercise } from '@/lib/domain/workouts/catalog'
import { TARGET_STATUS_LABELS, targetProgress } from '@/lib/domain/workouts/targets'
import { useAxtlhetics } from '@/lib/state/store'

/** Ejercicios que admiten un objetivo: todo menos la movilidad, que no se mide en marcas. */
const TARGET_EXERCISES = EXERCISE_CATALOG.filter((exercise) => exercise.category !== 'movilidad' && !exercise.warmupOnly).sort((a, b) =>
  a.name.localeCompare(b.name, 'es'),
)

/**
 * Objetivos medibles (D-035): un ejercicio, una cifra y una fecha, con cómo vas.
 *
 * Vive en Perfil, junto a los objetivos generales, con sus propias acciones:
 * guardar el formulario del perfil no los toca.
 */
export function GoalTargets() {
  const { profile, sessions, today, addTarget, removeTarget, assessments } = useAxtlhetics()
  const targets = profile?.targets ?? []

  return (
    <>
      <SectionTitle>Objetivos medibles</SectionTitle>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        Un ejercicio, una cifra y una fecha. AXIS mide tu mejor serie y te dice si vas bien.
      </p>

      <ul className="mt-4 space-y-2.5">
        {targets.map((target) => {
          const exercise = findExercise(target.exerciseId)
          const progress = targetProgress(target, sessions, today, assessments.assessments)
          const unit = exercise?.work.isTimed ? 's' : 'reps'
          return (
            <li key={target.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">
                  {exercise?.name ?? 'Ejercicio retirado'} · {target.target} {unit}
                </span>
                <span className="block text-[12.5px] text-muted-foreground tabular-nums">
                  Antes del {formatShortDate(target.deadline).toLowerCase()} · llevas {progress.current} {unit} ·{' '}
                  <span className={progress.status === 'behind' || progress.status === 'expired' ? 'text-foreground' : 'text-primary'}>
                    {TARGET_STATUS_LABELS[progress.status]}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => void removeTarget(target.id)}
                aria-label={`Eliminar el objetivo de ${exercise?.name ?? 'este ejercicio'}`}
                className="ax-press flex h-11 w-11 items-center justify-center text-muted-foreground"
              >
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </li>
          )
        })}
        {targets.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
            Todavía no tienes ningún objetivo medible.
          </li>
        )}
      </ul>

      <TargetForm today={today} onAdd={addTarget} />
    </>
  )
}

function TargetForm({
  today,
  onAdd,
}: {
  today: DayKey
  onAdd: (draft: { exerciseId: string; target: number; deadline: DayKey }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [exerciseId, setExerciseId] = useState(TARGET_EXERCISES[0]?.id ?? '')
  const [target, setTarget] = useState(10)
  const [weeks, setWeeks] = useState(8)
  const [saving, setSaving] = useState(false)

  const exercise = findExercise(exerciseId)
  const unit = exercise?.work.isTimed ? 's' : 'reps'
  const deadline = addDays(today, weeks * 7)

  const submit = async () => {
    if (!exercise) return
    setSaving(true)
    await onAdd({ exerciseId, target, deadline })
    setSaving(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ax-press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[14px] font-semibold text-primary"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Añadir objetivo
      </button>
    )
  }

  return (
    <div className="ax-enter mt-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3 py-2">
        <FieldLabel>Ejercicio</FieldLabel>
        <select
          value={exerciseId}
          onChange={(event) => setExerciseId(event.target.value)}
          aria-label="Ejercicio"
          className="h-11 max-w-[60%] rounded-2xl border border-border bg-background px-3 text-[15px] font-semibold outline-none"
        >
          {TARGET_EXERCISES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <StepperField
        label={unit === 's' ? 'Segundos' : 'Repeticiones'}
        value={target}
        unit={unit}
        step={unit === 's' ? 5 : 1}
        min={1}
        max={unit === 's' ? 300 : 100}
        onChange={setTarget}
      />
      <StepperField label="Plazo" value={weeks} unit="sem" min={2} max={52} onChange={setWeeks} />
      <p className="pb-3 text-[12.5px] text-muted-foreground">
        Hasta el {formatShortDate(deadline).toLowerCase()}. En una sola serie.
      </p>
      <PrimaryButton onClick={() => void submit()} disabled={!exercise || saving}>
        {saving ? 'Guardando…' : 'Añadir'}
      </PrimaryButton>
    </div>
  )
}
