'use client'

import { assessmentEntryReason } from '@/lib/domain/axis/conversation/assessment-answer'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * La entrada al test de evolución dentro de Entrenamiento (D-021).
 *
 * Secundaria a propósito: una superficie gris y un botón en pastilla, debajo de
 * la sesión de hoy, sin competir con «Empezar entrenamiento». Aparece solo
 * cuando el test se puede hacer o está a medias; si ya tocaría pero hoy no se
 * puede, una línea con el motivo. Antes de los 28 días no se muestra nada: sin
 * contador. Todo sale del dominio a través del briefing; aquí no se decide nada.
 */
export function AssessmentEntry({ onOpen }: { onOpen: () => void }) {
  const { briefing, assessments } = useAxtlhetics()
  if (!briefing || assessments.status !== 'ready') return null

  const assessment = briefing.assessment
  const resumable = assessments.active !== null
  const available = assessment.status === 'available'

  if (resumable || available) {
    return (
      <section className="ax-enter mt-4 flex items-center gap-3 rounded-3xl bg-surface p-4 pl-5">
        <div className="flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">Test de evolución</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground text-pretty">
            {resumable ? 'Lo dejaste a medias hoy. Sigue donde estabas.' : 'Ya puedes volver a medir tu evolución.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="ax-press min-h-11 shrink-0 rounded-full border border-border bg-background px-4 text-[13.5px] font-semibold"
        >
          {resumable ? 'Continuar test' : 'Hacer test'}
        </button>
      </section>
    )
  }

  const reason = assessmentEntryReason(assessment)
  if (!reason) return null
  return (
    <p className="mt-4 px-1 text-[13px] leading-snug text-muted-foreground text-pretty">
      <span className="font-semibold text-foreground">Test de evolución:</span> hoy no. {reason}
    </p>
  )
}
