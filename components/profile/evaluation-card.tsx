'use client'

import { Check } from 'lucide-react'
import { evaluationSteps } from '@/lib/domain/profile/screening'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * Tu evaluación inicial (D-058): lo que un entrenador mide antes de empezar.
 * Se ve en Entrenamiento hasta que están los cuatro pasos. Salud e historia se
 * contestan en el perfil; el test y el escaneo tienen su entrada justo debajo.
 */
export function EvaluationCard({ onOpenPerfil }: { onOpenPerfil: () => void }) {
  const { profile, assessments, scans } = useAxtlhetics()
  if (assessments.status !== 'ready' || scans.status !== 'ready') return null

  const steps = evaluationSteps({
    profile,
    completedTests: assessments.assessments.filter((assessment) => assessment.status === 'completed').length,
    scans: scans.scans.length,
  })
  const done = steps.filter((step) => step.done).length
  if (done === steps.length) return null
  const missingProfile = steps.some((step) => (step.key === 'salud' || step.key === 'historia') && !step.done)

  return (
    <section className="ax-enter mt-4 rounded-3xl bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-callout font-semibold tracking-[-0.01em]">Tu evaluación inicial</h3>
        <span className="text-caption tabular-nums text-muted-foreground">
          {done} de {steps.length}
        </span>
      </div>
      <p className="mt-0.5 text-footnote leading-snug text-muted-foreground text-pretty">
        Lo que mide un entrenador antes de empezar. Con ello AXIS ajusta tus sesiones.
      </p>
      <ul className="mt-3 space-y-2.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
              )}
              aria-hidden="true"
            >
              {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="flex-1">
              <span className={cn('block text-subhead font-medium', step.done && 'text-muted-foreground')}>{step.label}</span>
              {!step.done && <span className="block text-caption text-muted-foreground">{step.detail}</span>}
            </span>
            <span className="sr-only">{step.done ? 'Hecho' : 'Pendiente'}</span>
          </li>
        ))}
      </ul>
      {missingProfile && (
        <button
          type="button"
          onClick={onOpenPerfil}
          className="ax-press mt-4 min-h-11 w-full rounded-full border border-border bg-background px-4 text-footnote font-semibold"
        >
          Contestar salud e historia
        </button>
      )}
    </section>
  )
}
