'use client'

import { useState, type CSSProperties } from 'react'
import { BarChart3, Clock, Dumbbell } from 'lucide-react'
import type { ChartPoint, HistoryRange } from '@/lib/domain/history/stats'
import { formatTotalTime, formatVolume, HISTORY_RANGE_LABELS } from '@/lib/domain/history/stats'
import { formatDuration, formatShortDate } from '@/lib/domain/shared/dates'
import { safeDivide } from '@/lib/domain/shared/ids'
import { AssessmentDetail, AssessmentHistoryList } from '@/components/assessment/assessment-history'
import { ScanDetail, ScanHistoryList } from '@/components/scanner/scan-history'
import { EmptyNote, SectionHeader } from '@/components/section-header'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

const RANGES: HistoryRange[] = ['semana', 'mes', 'anio']

const SUMMARY_TITLES: Record<HistoryRange, string> = {
  semana: 'Resumen de la semana',
  mes: 'Resumen del mes',
  anio: 'Resumen del año',
}

export function HistorialScreen() {
  const { historyStats, sessions } = useAxtlhetics()
  const [range, setRange] = useState<HistoryRange>('semana')
  // El detalle de un test de evolución se abre en lugar del historial (D-021).
  const [openTestId, setOpenTestId] = useState<string | null>(null)
  // Y el de un escaneo corporal (D-023).
  const [openScanId, setOpenScanId] = useState<string | null>(null)

  const stats = historyStats(range)
  const recent = sessions.filter((session) => session.status === 'completed').slice(0, 5)

  if (openTestId) return <AssessmentDetail id={openTestId} onBack={() => setOpenTestId(null)} />
  if (openScanId) return <ScanDetail id={openScanId} onBack={() => setOpenScanId(null)} />

  const rangeIndex = RANGES.indexOf(range)

  return (
    <div className="px-5 pb-12">
      {/* Header */}
      <header className="ax-enter pt-6">
        <p className="text-caption font-bold tracking-[0.08em] text-primary uppercase">Tu evolución</p>
        <h1 className="mt-1.5 text-title-lg font-extrabold">Historial</h1>
      </header>

      {/*
        Segmented control. El pulgar es una sola pieza que se desliza entre
        opciones con la curva de la barra inferior (D-075); su sombra es la única
        aprobada (P-008, D-016).
      */}
      <div className="relative mt-6 flex rounded-full border border-border bg-surface p-1 shadow-card">
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 rounded-full bg-secondary transition-transform duration-[var(--ax-slide)] ease-[var(--ax-spring)]"
          style={{ width: `calc((100% - 8px) / ${RANGES.length})`, transform: `translateX(${rangeIndex * 100}%)` }}
        />
        {RANGES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setRange(option)}
            aria-pressed={range === option}
            className={cn(
              'ax-press relative min-h-10 flex-1 rounded-full text-subhead font-medium transition-colors duration-200',
              range === option ? 'font-bold text-primary' : 'text-muted-foreground',
            )}
          >
            {HISTORY_RANGE_LABELS[option]}
          </button>
        ))}
      </div>

      {/* Rendimiento y volumen, en un solo módulo */}
      <section key={range} className="ax-fade mt-4 rounded-3xl bg-surface shadow-card-lg p-5">
        <p className="text-overline font-semibold tracking-[0.16em] text-muted-foreground">RENDIMIENTO</p>
        {stats.performance.available && stats.performance.percent !== null ? (
          <>
            <p className="mt-2 text-display font-bold tabular-nums text-primary">
              {stats.performance.percent > 0 ? '+' : ''}
              {stats.performance.percent}%
            </p>
            <p className="mt-1 text-footnote text-muted-foreground">{stats.performance.comparisonLabel}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-display font-bold text-muted-nontext">—</p>
            <p className="mt-1 text-footnote text-muted-foreground">Sin datos suficientes para comparar</p>
          </>
        )}

        <VolumeChart points={stats.points} periodLabel={stats.periodLabel} />
      </section>

      {/* Resumen del periodo: tres cifras, una al lado de otra. */}
      <SectionHeader title={SUMMARY_TITLES[range]} />
      <ul className="grid grid-cols-3 gap-2">
        <SummaryTile index={0} icon={Dumbbell} label="Entrenamientos" value={String(stats.sessionCount)} />
        <SummaryTile index={1} icon={Clock} label="Tiempo total" value={formatTotalTime(stats.totalSeconds)} />
        <SummaryTile index={2} icon={BarChart3} label="Volumen total" value={formatVolume(stats.totalVolumeKg)} />
      </ul>

      {/* Últimos entrenamientos */}
      <SectionHeader title="Últimos entrenamientos" />
      {recent.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {recent.map((session, index) => (
            <li
              key={session.id}
              className="ax-stagger flex min-h-16 items-center gap-3.5 border-b border-border px-4 py-3 last:border-b-0"
              style={{ '--ax-index': index } as CSSProperties}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill">
                <Dumbbell className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-semibold">{session.title}</span>
                <span className="block text-footnote tabular-nums text-muted-foreground">
                  {formatShortDate(session.dayKey)} · {formatDuration(session.durationSeconds)}
                </span>
              </span>
              <span className="shrink-0 text-footnote font-medium tabular-nums text-muted-foreground">
                {formatVolume(session.totalVolumeKg)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote>Cuando completes tu primer entrenamiento aparecerá aquí.</EmptyNote>
      )}

      {/* Tests de evolución (D-021): una sección más del historial. */}
      <AssessmentHistoryList onOpen={setOpenTestId} />
      {/* Escáneres corporales (D-023). */}
      <ScanHistoryList onOpen={setOpenScanId} />
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: typeof Dumbbell
  label: string
  value: string
  index: number
}) {
  return (
    <li
      className="ax-stagger flex flex-col rounded-2xl border border-border bg-surface p-3.5 shadow-card"
      style={{ '--ax-index': index } as CSSProperties}
    >
      <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
      <span className="mt-4 text-headline font-semibold tabular-nums">{value}</span>
      <span className="mt-0.5 text-caption text-muted-foreground">{label}</span>
    </li>
  )
}

/**
 * Qué etiquetas del eje se escriben.
 *
 * Con siete días o doce meses caben todas. Con un mes de 31 días no: se escriben
 * el 1, los múltiplos de 5 y el último, y se descarta el múltiplo de 5 si quedaría
 * pegado al último (el 30 y el 31 no caben juntos).
 */
function axisLabelIndices(count: number): Set<number> {
  if (count <= 12) return new Set(Array.from({ length: count }, (_, i) => i))

  const picks = [0]
  for (let day = 5; day < count; day += 5) picks.push(day - 1)

  const last = count - 1
  if (last - picks[picks.length - 1] < 2) picks.pop()
  picks.push(last)

  return new Set(picks)
}

/**
 * Volumen del periodo, una barra por unidad natural.
 *
 * Barras y no línea: el volumen diario es una cantidad discreta y llena de ceros
 * (los días de descanso). Una línea uniría los días de entreno pasando por el
 * suelo, dando a entender una caída continua donde solo hay un día libre.
 *
 * Lo que no ha pasado no se dibuja. Un día futuro ocupa su sitio en el eje pero
 * no tiene barra, ni siquiera de altura cero: no es que no entrenaras, es que aún
 * no ha llegado.
 */
function VolumeChart({ points, periodLabel }: { points: ChartPoint[]; periodLabel: string }) {
  if (points.length === 0) return null

  const max = Math.max(...points.map((point) => point.value))
  const hasData = max > 0

  const labelled = axisLabelIndices(points.length)
  // El último punto ya ocurrido: hoy en semana y mes, el mes en curso en el año.
  const currentIndex = points.reduce((last, point, index) => (point.future ? last : index), -1)

  return (
    <figure className="mt-6">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-footnote font-medium">{periodLabel}</span>
        {hasData && (
          <span className="text-caption tabular-nums text-muted-foreground">
            máx. {formatVolume(max)}
          </span>
        )}
      </figcaption>

      <div
        className={cn(
          'relative mt-3 flex h-32 items-end border-b border-border-strong/60',
          // Separación entre barras: menor cuando hay muchas (el mes tiene ~30).
          points.length > 12 ? 'gap-[3px]' : 'gap-1.5',
        )}
        role="img"
        aria-label={
          hasData
            ? `Volumen por ${points.length > 12 ? 'día' : 'periodo'} en ${periodLabel}`
            : `Sin volumen registrado en ${periodLabel}`
        }
      >
        {/*
          Guías en los días rotulados. Son lo que deja leer la posición exacta de
          una barra: el día 11 cae justo a la derecha de la guía del 10.
        */}
        {points.map((point, index) =>
          hasData && labelled.has(index) ? (
            <span
              key={`guide-${index}`}
              aria-hidden="true"
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${((index + 0.5) / points.length) * 100}%` }}
            />
          ) : null,
        )}

        {points.map((point, index) => (
          <div key={index} className="relative flex h-full flex-1 items-end">
            {point.value > 0 && (
              <div
                // Punta redonda, como las barras de «Tu progreso» (D-040). Aquí no hay
                // barra seleccionada: todas en el azul primario.
                className="ax-bar w-full rounded-t-full bg-primary"
                style={
                  {
                    // Mínimo visible: un volumen pequeño no desaparece y su punta redonda se ve entera.
                    height: `max(${points.length > 12 ? 8 : 12}px, ${safeDivide(point.value, max, 0) * 100}%)`,
                    '--ax-index': index,
                  } as CSSProperties
                }
              />
            )}
          </div>
        ))}
      </div>

      <div className="relative mt-2 h-4">
        {points.map((point, index) =>
          labelled.has(index) ? (
            <span
              key={index}
              className={cn(
                'absolute -translate-x-1/2 text-overline tabular-nums',
                index === currentIndex ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
              style={{ left: `${((index + 0.5) / points.length) * 100}%` }}
            >
              {point.label}
            </span>
          ) : null,
        )}
      </div>

      {!hasData && (
        <p className="mt-1 text-caption text-muted-foreground">
          Todavía no hay volumen registrado en este periodo.
        </p>
      )}
    </figure>
  )
}
