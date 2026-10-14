'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { ScanSummaryView } from '@/components/scanner/scan-summary-view'
import { Confirmation } from '@/components/workout/confirmation'
import { compareScans } from '@/lib/domain/scanner/compare'
import { SCAN_POSE_GUIDE } from '@/lib/domain/scanner/protocol'
import { summarizeScan } from '@/lib/domain/scanner/summary'
import { formatDayInSentence } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** «Escáneres corporales» dentro de Historial (D-023). Sin escaneos, la sección no aparece. */
export function ScanHistoryList({ onOpen }: { onOpen: (id: string) => void }) {
  const { scans } = useAxtlhetics()
  if (scans.scans.length === 0) return null
  return (
    <>
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Escáneres corporales</h3>
      <ul className="mt-2 divide-y divide-border">
        {scans.scans.map((scan) => (
          <li key={scan.id}>
            <button type="button" onClick={() => onOpen(scan.id)} className="ax-press flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
              <span>
                <span className="block text-[15px] font-semibold">{capital(formatDayInSentence(scan.dayKey))}</span>
                <span className="block text-[13px] text-muted-foreground">
                  Índice de equilibrio {scan.result.index ?? '—'}/100
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Un escaneo guardado: sus miniaturas y el resumen. El resumen se vuelve a
 * calcular con lo medido y lo respondido entonces, y con la fuerza y el
 * entrenamiento de hoy. Se puede borrar: son fotos del cuerpo de alguien.
 */
export function ScanDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { scans, assessments, sessions, profile } = useAxtlhetics()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [])
  const scan = scans.scans.find((item) => item.id === id) ?? null

  if (confirming && scan) {
    return (
      <Confirmation
        title="¿Borrar este escaneo?"
        body="Se borran sus resultados y sus fotos de este dispositivo. No se puede deshacer."
        stayLabel="Conservarlo"
        leaveLabel="Borrar escaneo"
        leaveTone="error"
        onStay={() => setConfirming(false)}
        onLeave={async () => {
          const removed = await scans.remove(scan.id)
          setConfirming(false)
          if (removed) onBack()
        }}
      />
    )
  }

  // Frente al escaneo anterior a este, si lo hay: la lista va del más reciente al más antiguo.
  const older = scan ? scans.scans[scans.scans.findIndex((item) => item.id === scan.id) + 1] ?? null : null
  const summary = scan
    ? summarizeScan({
        shots: scan.measurements,
        assessments: assessments.assessments,
        sessions,
        experience: profile?.experience ?? null,
        selfReport: scan.selfReport,
        body: profile ? { heightCm: profile.heightCm, age: profile.age, weightKg: profile.weightKg } : null,
        previous: older,
        today: scan.dayKey,
      })
    : null

  const comparison =
    scan && summary && older
      ? compareScans(
          {
            shots: scan.measurements,
            index: summary.index,
            scores: Object.fromEntries(summary.categories.map((c) => [c.key, c.score])),
            // La grasa de ese día, tal como se guardó: no se recalcula con la altura de hoy.
            bodyFatPct: scan.result.bodyFatPct ?? null,
          },
          older,
        )
      : null

  return (
    <div className="ax-enter px-6 pb-10">
      <header className="flex items-center pt-2 pb-1">
        <button type="button" onClick={onBack} aria-label="Volver al historial" className="ax-press -ml-2 flex h-11 w-11 items-center justify-center">
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
      </header>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">Escáner corporal</h1>
      {scan && <p className="mt-1.5 text-[14px] text-muted-foreground">{capital(formatDayInSentence(scan.dayKey))}</p>}

      {scan && summary ? (
        <>
          {scan.thumbnails && Object.keys(scan.thumbnails).length > 0 && (
            <ul className="mt-5 grid grid-cols-5 gap-2">
              {SCAN_POSE_GUIDE.filter((g) => scan.thumbnails?.[g.pose]).map((g) => (
                <li key={g.pose}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scan.thumbnails![g.pose]} alt={g.name} className="w-full rounded-lg" />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <ScanSummaryView summary={summary} comparison={comparison} />
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ax-press mt-8 min-h-11 w-full text-[14px] font-semibold text-error"
          >
            Borrar escaneo
          </button>
        </>
      ) : (
        <p className="mt-6 text-[14px] text-muted-foreground">Este escaneo ya no está en el dispositivo.</p>
      )}
    </div>
  )
}
