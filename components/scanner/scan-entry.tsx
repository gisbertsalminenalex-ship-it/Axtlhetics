'use client'

import { scanDue } from '@/lib/domain/scanner/types'
import { formatDayInSentence, todayKey } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * La entrada al escáner corporal (D-023), junto a la del test de evolución en
 * Entrenamiento. Secundaria, como la del test: no compite con «Empezar
 * entrenamiento». Cada 28 días recuerda repetirlo; antes, recuerda el último.
 */
export function ScanEntry({ onOpen }: { onOpen: () => void }) {
  const { scans } = useAxtlhetics()
  if (scans.status !== 'ready') return null

  const due = scanDue(scans.scans, todayKey())
  const text =
    due.kind === 'first'
      ? 'Descubre tus puntos fuertes y qué te hará avanzar más.'
      : due.kind === 'due'
        ? 'Ha pasado un mes: repítelo para ver cómo has cambiado.'
        : `Último: ${due.last.result.index ?? '—'}/100, ${formatDayInSentence(due.last.dayKey)}. Lo tienes en Historial.`
  const label = due.kind === 'first' ? 'Hacer escaneo' : due.kind === 'due' ? 'Repetir' : 'Hacer otro'

  return (
    <section className="ax-enter mb-3 flex items-center gap-3 rounded-3xl bg-surface shadow-card-lg p-4 pl-5">
      <div className="flex-1">
        <p className="text-callout font-semibold">Escáner corporal</p>
        <p className="mt-0.5 text-footnote text-muted-foreground text-pretty">{text}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="ax-press min-h-11 shrink-0 rounded-full bg-background px-4 text-footnote font-semibold"
      >
        {label}
      </button>
    </section>
  )
}
