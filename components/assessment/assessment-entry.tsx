'use client'

import { StaleTestNotice } from '@/components/assessment/stale-test-notice'
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
 *
 * Si un test de otro día quedó abierto y se acaba de cerrar, se dice encima.
 */
export function AssessmentEntry({ onOpen }: { onOpen: () => void }) {
  const { briefing, assessments } = useAxtlhetics()
  if (!briefing || assessments.status !== 'ready') return null

  const assessment = briefing.assessment
  const resumable = assessments.active !== null
  const available = assessment.status === 'available'
  const notice = <StaleTestNotice className="mb-3 px-1" />

  if (resumable || available) {
    return (
      <>
        {notice}
        <section className="ax-enter mb-3 flex items-center gap-3 rounded-3xl bg-surface p-4 pl-5">
          <div className="flex-1">
            <p className="text-callout font-semibold">Test de evolución</p>
            <p className="mt-0.5 text-footnote text-muted-foreground text-pretty">
              {resumable
                ? 'Lo dejaste a medias hoy. Sigue donde estabas.'
                : assessment.completedCount === 0
                  ? 'Mide tu punto de partida para seguir tu evolución.'
                  : 'Ya puedes volver a medir tu evolución.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="ax-press min-h-11 shrink-0 rounded-full bg-background px-4 text-footnote font-semibold"
          >
            {resumable ? 'Continuar test' : 'Hacer test'}
          </button>
        </section>
      </>
    )
  }

  const reason = assessmentEntryReason(assessment)
  if (!reason) return notice
  return (
    <>
      {notice}
      <p className="mb-3 px-1 text-footnote text-muted-foreground text-pretty">
        <span className="font-semibold text-foreground">Test de evolución:</span> hoy no. {reason}
      </p>
    </>
  )
}
