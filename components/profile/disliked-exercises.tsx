'use client'

import { SectionTitle } from '@/components/profile/controls'
import { EXERCISE_CATALOG, findExercise } from '@/lib/domain/workouts/catalog'
import { frequentlySkipped } from '@/lib/domain/workouts/history'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * Lo que AXIS recuerda que no te gusta (D-037): lo que le has dicho y lo que
 * sueles saltarte. Lo dicho se puede quitar aquí; lo deducido caduca solo
 * cuando dejas de saltarlo.
 */
export function DislikedExercises() {
  const { profile, sessions, today, setExerciseDisliked } = useAxtlhetics()
  const told = profile?.dislikedExercises ?? []
  const skipped = frequentlySkipped(sessions, today, EXERCISE_CATALOG).filter((id) => !told.includes(id))
  if (told.length === 0 && skipped.length === 0) return null

  return (
    <>
      <SectionTitle>Ejercicios que evito proponerte</SectionTitle>
      <p className="mt-1 text-footnote leading-relaxed text-muted-foreground text-pretty">
        Mientras haya alternativas, no entran en tus sesiones.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {told.map((id) => (
          <li key={id} className="flex min-h-11 items-center gap-3 py-2">
            <span className="flex-1">
              <span className="block text-callout font-medium">{findExercise(id)?.name ?? id}</span>
              <span className="block text-caption text-muted-foreground">Me dijiste que no te gusta</span>
            </span>
            <button
              type="button"
              onClick={() => void setExerciseDisliked(id, false)}
              className="ax-press min-h-11 px-2 text-subhead font-semibold text-primary"
            >
              Quitar
            </button>
          </li>
        ))}
        {skipped.map((id) => (
          <li key={id} className="flex min-h-11 items-center gap-3 py-2">
            <span className="flex-1">
              <span className="block text-callout font-medium">{findExercise(id)?.name ?? id}</span>
              <span className="block text-caption text-muted-foreground">Lo has saltado varias veces este mes</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
