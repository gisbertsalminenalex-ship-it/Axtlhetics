'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { recommendTargets } from '@/lib/domain/assessment/targets'
import type { Assessment } from '@/lib/domain/assessment/types'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * Los objetivos que AXIS propone con el primer test (D-040): uno por prueba,
 * con la marca de partida y la cifra a la que llegar. Se añaden todos con un
 * toque y se quitan o se cambian desde Perfil.
 */
export function TargetRecommendations({ assessment }: { assessment: Assessment }) {
  const { profile, addTargets } = useAxtlhetics()
  const [added, setAdded] = useState(false)
  const [saving, setSaving] = useState(false)
  const drafts = recommendTargets(assessment, profile?.targets ?? [])

  if (added) {
    return (
      <p className="mt-6 flex items-start gap-2 text-subhead leading-relaxed text-muted-foreground text-pretty">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
        Objetivos añadidos. Los verás en Entrenamiento, con cómo vas, y los meto en tus sesiones.
      </p>
    )
  }
  if (drafts.length === 0 || !profile) return null

  const add = async () => {
    setSaving(true)
    await addTargets(drafts)
    setSaving(false)
    setAdded(true)
  }

  return (
    <section className="mt-7">
      <h2 className="text-body font-semibold">Objetivos que te propongo</h2>
      <p className="mt-2 flex items-start gap-2 text-footnote leading-relaxed text-muted-foreground text-pretty">
        <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        Con tu primer test ya sé de dónde partes. Te propongo mejorar cada prueba en unas 8 semanas: llegarás a los dos
        tests siguientes con algo concreto que mirar.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {drafts.map((draft) => (
          <li key={draft.exerciseId} className="flex items-baseline justify-between gap-3 py-3">
            <span className="text-callout font-medium">{findExercise(draft.exerciseId)?.name ?? draft.exerciseId}</span>
            <span className="text-footnote tabular-nums text-muted-foreground">
              {draft.startValue} → <span className="font-semibold text-foreground">{draft.target}</span> {draft.unit}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-caption text-muted-foreground">
        Hasta el {formatShortDate(drafts[0].deadline).toLowerCase()}. Puedes quitarlos o cambiarlos en tu perfil.
      </p>
      <button
        type="button"
        onClick={() => void add()}
        disabled={saving}
        className="ax-press mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-surface text-subhead font-semibold text-primary disabled:opacity-40"
      >
        {saving ? 'Añadiendo…' : 'Añadir estos objetivos'}
      </button>
    </section>
  )
}
