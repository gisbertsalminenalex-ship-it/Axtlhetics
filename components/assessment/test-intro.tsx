'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { StaleTestNotice } from '@/components/assessment/stale-test-notice'
import { AxisMark } from '@/components/axis-mark'
import { fixedPushUpVariant } from '@/lib/domain/assessment/assessment'
import {
  ASSESSMENT_PROTOCOL,
  PUSH_UP_VARIANT_IDS,
  recommendedPushUpVariant,
} from '@/lib/domain/assessment/protocol'
import { assessmentUnavailableText } from '@/lib/domain/axis/conversation/assessment-answer'
import { formatDayInSentence } from '@/lib/domain/shared/dates'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

const MEASURE_LABEL = { reps: 'repeticiones', seconds: 'segundos' } as const

/** «Flexiones inclinadas» → «Inclinadas»; «Flexiones» → «Estándar». */
function variantLabel(id: string): string {
  const name = findExercise(id)?.name ?? id
  const rest = name.replace(/^Flexiones\s*/i, '')
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Estándar'
}

/**
 * Introducción al test (D-021): qué mide, cuánto dura, la técnica antes que el
 * número y, en el primer test, la variante de flexiones. AXIS la recomienda por
 * nivel —principiante, inclinadas; intermedio y avanzado, estándar— y el usuario
 * puede elegir otra. Después queda fijada y aquí solo se enseña.
 */
export function TestIntro({
  onStart,
  onBack,
}: {
  /** `false` si no se pudo empezar: el botón vuelve a estar disponible. */
  onStart: (variantId: string) => Promise<boolean>
  onBack: () => void
}) {
  const { profile, briefing, assessments } = useAxtlhetics()

  const fixed = fixedPushUpVariant(assessments.assessments)
  const recommended = recommendedPushUpVariant(profile?.experience ?? 'principiante')
  const [variant, setVariant] = useState(fixed ?? recommended)
  const [starting, setStarting] = useState(false)

  const last = briefing?.assessment.lastCompletedDay ?? null
  // La disponibilidad es la del dominio, la misma que responde AXIS: si hoy no
  // se puede, aquí tampoco. Sin briefing aún no se sabe, así que no se ofrece.
  const unavailable = briefing ? assessmentUnavailableText(briefing.assessment) : null
  const canStart = briefing !== null && unavailable === null

  return (
    <div className="flex min-h-full flex-col px-5 pb-8">
      <header className="flex items-center pt-2 pb-1">
        <button type="button" onClick={onBack} aria-label="Volver" className="ax-press -ml-2 flex h-11 w-11 items-center justify-center">
          <ArrowLeft className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
        </button>
      </header>

      <h1 className="mt-3 text-title-lg font-bold">Test de evolución</h1>
      <p className="mt-1.5 text-callout text-muted-foreground">4 pruebas · 10–15 min</p>
      <StaleTestNotice className="mt-4" />
      <p className="mt-4 text-callout leading-relaxed text-pretty">
        {/* Sin ningún test completado no hay con qué comparar: este es la primera referencia. */}
        {fixed === null
          ? 'Este primer test establece tu línea base: los siguientes se compararán con él para medir tu evolución.'
          : 'Mide lo que rindes en cuatro pruebas fijas para comparar tu evolución con tu test anterior.'}
      </p>

      <ol className="mt-5 divide-y divide-border border-y border-border">
        {ASSESSMENT_PROTOCOL.map((test) => (
          <li key={test.key} className="flex min-h-12 items-center justify-between gap-3 py-2 text-callout">
            <span>
              {test.key === 'push' ? findExercise(variant)?.name ?? test.name : test.name}
              {test.loadKg ? ` · ${test.loadKg} kg` : ''}
            </span>
            <span className="text-footnote text-muted-foreground">
              {MEASURE_LABEL[test.measure]}
              {test.perSide ? ' por lado' : ''}
            </span>
          </li>
        ))}
      </ol>

      {last && (
        <p className="mt-3 text-footnote text-muted-foreground">Test anterior: {formatDayInSentence(last)}</p>
      )}

      {fixed === null && (
        <section className="mt-5 rounded-3xl bg-surface p-5">
          <p className="flex items-center gap-1.5 text-overline font-semibold tracking-[0.12em] text-primary">
            <AxisMark className="h-3 w-3" /> AXIS
          </p>
          <p className="mt-2 text-subhead leading-relaxed text-pretty">
            Para tu primer test recomendamos {findExercise(recommended)?.name.toLowerCase()}. Si prefieres, puedes
            elegir otra variante.
          </p>
          <div role="radiogroup" aria-label="Variante de flexiones" className="mt-3 flex flex-wrap gap-2">
            {PUSH_UP_VARIANT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={variant === id}
                onClick={() => setVariant(id)}
                className={cn(
                  'ax-press min-h-11 rounded-full px-4 text-footnote font-semibold',
                  variant === id ? 'bg-primary text-primary-foreground' : 'bg-surface',
                )}
              >
                {variantLabel(id)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-caption text-muted-foreground">La variante queda fijada para los próximos tests.</p>
        </section>
      )}

      <p className="mt-5 text-footnote leading-relaxed text-muted-foreground text-pretty">
        En cada prueba, para cuando ya no puedas mantener una buena técnica. Cuenta la técnica, no aguantar a toda costa.
      </p>

      <div className="mt-auto pt-8">
        {unavailable && (
          <p role="status" className="mb-4 text-footnote leading-relaxed text-pretty">
            {unavailable}
          </p>
        )}
        <button
          type="button"
          disabled={starting || !canStart}
          onClick={async () => {
            if (!canStart) return
            setStarting(true)
            // Si sale bien, el test en curso sustituye a esta pantalla; si no, el
            // aviso de error lo explica y se puede volver a intentar.
            if (!(await onStart(variant))) setStarting(false)
          }}
          className="ax-press h-[52px] w-full rounded-full bg-primary text-callout font-semibold text-primary-foreground disabled:opacity-60"
        >
          Empezar test
        </button>
        <button type="button" onClick={onBack} className="ax-press mt-2 min-h-11 w-full text-subhead font-semibold text-muted-foreground">
          Volver
        </button>
      </div>
    </div>
  )
}
