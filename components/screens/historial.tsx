'use client'

import { useState, type CSSProperties } from 'react'
import { BarChart3, Clock, Dumbbell } from 'lucide-react'
import type { ChartPoint, HistoryRange } from '@/lib/domain/history/stats'
import { formatTotalTime, formatVolume, HISTORY_RANGE_LABELS } from '@/lib/domain/history/stats'
import { formatDuration, formatShortDate } from '@/lib/domain/shared/dates'
import { safeDivide } from '@/lib/domain/shared/ids'
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

  const stats = historyStats(range)
  const recent = sessions.filter((session) => session.status === 'completed').slice(0, 5)

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Historial</h1>
      </header>

      {/* Segmented control */}
      <div className="flex rounded-2xl bg-muted p-1">
        {RANGES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setRange(option)}
            aria-pressed={range === option}
            className={cn(
              'ax-press min-h-11 flex-1 rounded-xl text-[14px] font-medium transition-colors',
              range === option
                ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(10,10,11,0.08)]'
                : 'text-muted-foreground',
            )}
          >
            {HISTORY_RANGE_LABELS[option]}
          </button>
        ))}
      </div>

      {/* Rendimiento */}
      <p className="mt-7 text-[13px] font-medium text-muted-foreground">Rendimiento</p>
      {stats.performance.available && stats.performance.percent !== null ? (
        <>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums text-primary">
            {stats.performance.percent > 0 ? '+' : ''}
            {stats.performance.percent}%
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {stats.performance.comparisonLabel}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.02em] text-muted-foreground">
            —
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Sin datos suficientes para comparar
          </p>
        </>
      )}

      <LineChart points={stats.points} />

      {/* Resumen del periodo */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        {SUMMARY_TITLES[range]}
      </h3>
      <ul className="mt-2 divide-y divide-border">
        <SummaryRow
          index={0}
          icon={Dumbbell}
          label="Entrenamientos"
          value={String(stats.sessionCount)}
        />
        <SummaryRow
          index={1}
          icon={Clock}
          label="Tiempo total"
          value={formatTotalTime(stats.totalSeconds)}
        />
        <SummaryRow
          index={2}
          icon={BarChart3}
          label="Volumen total"
          value={formatVolume(stats.totalVolumeKg)}
        />
      </ul>

      {/* Últimos entrenamientos */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Últimos entrenamientos
      </h3>
      {recent.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {recent.map((session, index) => (
            <li
              key={session.id}
              className="ax-stagger"
              style={{ '--ax-index': index } as CSSProperties}
            >
              <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left">
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">{session.title}</span>
                  <span className="block text-[12.5px] text-muted-foreground tabular-nums">
                    {formatShortDate(session.dayKey)} ·{' '}
                    {formatDuration(session.durationSeconds)}
                  </span>
                </span>
                <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                  {formatVolume(session.totalVolumeKg)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted-foreground">
          Cuando completes tu primer entrenamiento aparecerá aquí.
        </p>
      )}
    </div>
  )
}

function SummaryRow({
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
      className="ax-stagger flex items-center gap-3 py-3.5"
      style={{ '--ax-index': index } as CSSProperties}
    >
      <Icon className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums">{value}</span>
    </li>
  )
}

/**
 * Gráfico de línea del periodo.
 *
 * Tolera todos los casos límite: sin datos, un único punto y todos los valores
 * iguales. Cuando no hay variación, dibuja una línea plana a media altura en lugar
 * de dividir entre cero.
 */
function LineChart({ points }: { points: ChartPoint[] }) {
  const width = 320
  const height = 130
  const padding = 10

  if (points.length === 0) return null

  const values = points.map((point) => point.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min

  const stepX = safeDivide(width - padding * 2, Math.max(points.length - 1, 1), 0)
  const usableHeight = height - padding * 2

  const coords = points.map((point, index) => {
    // Sin variación no hay escala que aplicar: la línea va plana a media altura.
    const ratio = span === 0 ? 0.5 : safeDivide(point.value - min, span, 0)
    return {
      x: padding + index * stepX,
      y: padding + (1 - ratio) * usableHeight,
    }
  })

  const path = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`)
    .join(' ')

  const hasData = max > 0

  return (
    <div className="mt-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={hasData ? 'Volumen de entrenamiento del periodo' : 'Sin datos todavía'}
      >
        <path
          key={path}
          className="ax-draw"
          pathLength={1}
          d={path}
          fill="none"
          stroke={hasData ? 'var(--primary)' : 'var(--border)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hasData &&
          coords.map((coord, index) => (
            <circle
              key={index}
              className="ax-stagger-fade"
              style={{ '--ax-index': index } as CSSProperties}
              cx={coord.x}
              cy={coord.y}
              r={index === coords.length - 1 ? 4.5 : 3}
              fill="var(--background)"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
          ))}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {points.map((point, index) => (
          <span key={index} className="text-[12px] text-muted-foreground">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  )
}
