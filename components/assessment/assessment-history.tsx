'use client'

import { useEffect } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { AssessmentResults } from '@/components/assessment/assessment-results'
import { ASSESSMENT_PROTOCOL_VERSION } from '@/lib/domain/assessment/protocol'
import { assessmentHistory, type HistoryEntry } from '@/lib/domain/assessment/summary'
import { formatDayInSentence } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * «Tests de evolución» dentro de Historial (D-021): una sección del historial
 * existente, no una pestaña. Cada test con su fecha; al abrirlo, sus cuatro
 * resultados, la comparación con el anterior y las mejores marcas. Sin
 * gráficas, sin puntuación. Sin tests, la sección no aparece.
 */
export function AssessmentHistoryList({ onOpen }: { onOpen: (id: string) => void }) {
  const { assessments } = useAxtlhetics()
  const entries = assessmentHistory(assessments.assessments)
  if (entries.length === 0) return null

  return (
    <>
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Tests de evolución</h3>
      <ul className="mt-2 divide-y divide-border">
        {entries.map((entry) =>
          entry.status === 'completed' ? (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="ax-press flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
              >
                <EntryText entry={entry} />
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ) : (
            // Un test interrumpido no tiene comparación que abrir.
            <li key={entry.id} className="flex min-h-14 items-center py-2">
              <EntryText entry={entry} />
            </li>
          ),
        )}
      </ul>
    </>
  )
}

function EntryText({ entry }: { entry: HistoryEntry }) {
  const detail =
    entry.status === 'interrupted'
      ? `Interrumpido · ${entry.testsDone} de 4 pruebas · no se compara`
      : entry.summary?.isFirst
        ? 'Test completado · línea base'
        : 'Test completado'
  return (
    <span>
      <span className="block text-[15px] font-semibold">{capitalize(formatDayInSentence(entry.dayKey))}</span>
      <span className="block text-[13px] text-muted-foreground">{detail}</span>
    </span>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** El detalle de un test del historial, en lugar del historial, con su vuelta atrás. */
export function AssessmentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { assessments } = useAxtlhetics()
  // Se abre desde abajo del historial: empieza arriba, con su cabecera a la vista.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [])
  const entry = assessmentHistory(assessments.assessments).find((item) => item.id === id)
  const summary = entry?.summary ?? null

  return (
    <div className="ax-enter px-6 pb-10">
      <header className="flex items-center pt-2 pb-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al historial"
          className="ax-press -ml-2 flex h-11 w-11 items-center justify-center"
        >
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
      </header>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">Test de evolución</h1>
      {entry && (
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {capitalize(formatDayInSentence(entry.dayKey))} · Protocolo {ASSESSMENT_PROTOCOL_VERSION}
        </p>
      )}
      {summary?.isFirst && (
        <p className="mt-0.5 text-[14px] text-muted-foreground">Primera referencia: no había un test anterior.</p>
      )}
      {summary ? (
        <>
          <div className="mt-5">
            <AssessmentResults rows={summary.rows} showPrevious />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Remo: izquierdo / derecho. Cada lado se compara por separado.
          </p>
        </>
      ) : (
        <p className="mt-6 text-[14px] text-muted-foreground">Este test ya no está en el dispositivo.</p>
      )}
    </div>
  )
}
