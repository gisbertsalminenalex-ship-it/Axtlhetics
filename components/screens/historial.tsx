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

      <VolumeChart points={stats.points} periodLabel={stats.periodLabel} />

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
    <figure className="mt-5">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{periodLabel}</span>
        {hasData && (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            máx. {formatVolume(max)}
          </span>
        )}
      </figcaption>

      <div
        className="mt-2.5 flex h-32 items-end gap-px border-b border-border"
        role="img"
        aria-label={
          hasData
            ? `Volumen por ${points.length > 12 ? 'día' : 'periodo'} en ${periodLabel}`
            : `Sin volumen registrado en ${periodLabel}`
        }
      >
        {points.map((point, index) => (
          <div key={index} className="flex h-full flex-1 items-end">
            {point.value > 0 && (
              <div
                className="ax-bar mx-auto w-full max-w-[16px] rounded-t-[3px] bg-primary"
                style={
                  {
                    // Mínimo visible: un volumen pequeño no debe desaparecer.
                    height: `${Math.max(4, safeDivide(point.value, max, 0) * 100)}%`,
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
                'absolute -translate-x-1/2 text-[11.5px] tabular-nums',
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
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Todavía no hay volumen registrado en este periodo.
        </p>
      )}
    </figure>
  )
}
