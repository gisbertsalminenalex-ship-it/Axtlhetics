'use client'

import { useState } from 'react'
import { StepperField } from '@/components/profile/controls'
import { StrengthChart } from '@/components/progress/strength-chart'
import {
  currentWeight,
  latestPerimeters,
  PERIMETER_HINTS,
  PERIMETER_INTERVAL_DAYS,
  PERIMETER_LABELS,
  PERIMETER_LIMITS,
  PERIMETER_ORDER,
  PERIMETER_START,
  perimeterChanges,
  perimetersDue,
  WEIGHT_LIMITS,
  weeklyWeightChange,
  weeklyWeights,
  type PerimeterKey,
} from '@/lib/domain/body/measurements'
import { goalEvolution, type MeasureEvolution } from '@/lib/domain/body/goal-measures'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * Tu cuerpo (D-060), dentro de «Tu progreso»: el peso de hoy, la media de cada
 * semana, la evolución de lo que piden tus objetivos (D-067) y las medidas con
 * cinta, una vez al mes.
 */
export function BodySection() {
  const { profile, measurements, today, saveWeight, savePerimeters } = useAxtlhetics()
  const evolution = goalEvolution(profile?.goals ?? [], measurements)
  const todayRecord = measurements.find((record) => record.dayKey === today) ?? null
  const [weight, setWeight] = useState(() => todayRecord?.weightKg ?? currentWeight(measurements, profile?.weightKg ?? 70))
  const latest = latestPerimeters(measurements)
  const [measuring, setMeasuring] = useState(false)
  const [tape, setTape] = useState<Record<PerimeterKey, number>>(() => {
    const start = { ...PERIMETER_START }
    for (const key of PERIMETER_ORDER) start[key] = latest[key]?.cm ?? start[key]
    return start
  })

  const weeks = weeklyWeights(measurements, today)
  const change = weeklyWeightChange(weeks)
  const due = perimetersDue(measurements, today)
  const changes = perimeterChanges(measurements)
  const savedToday = todayRecord?.weightKg ?? null

  return (
    <>
      <p className="mt-7 text-footnote font-medium text-muted-foreground">Tu cuerpo</p>

      <div className="mt-1 divide-y divide-border">
        <StepperField
          label="Peso de hoy"
          value={weight}
          unit="kg"
          step={0.1}
          min={WEIGHT_LIMITS.min}
          max={WEIGHT_LIMITS.max}
          onChange={(next) => setWeight(Math.round(next * 10) / 10)}
        />
      </div>
      <button
        type="button"
        onClick={() => void saveWeight(weight)}
        disabled={savedToday === weight}
        className="ax-press mt-2 min-h-11 w-full rounded-full border border-border bg-background px-4 text-footnote font-semibold disabled:text-muted-foreground"
      >
        {savedToday === weight ? 'Peso de hoy guardado' : savedToday === null ? 'Guardar peso' : 'Cambiar el peso de hoy'}
      </button>
      <p className="mt-2 text-caption leading-snug text-muted-foreground text-pretty">
        Mejor por la mañana, tras ir al baño y antes de comer. Cuenta la media de la semana, no el día.
      </p>

      {weeks.length > 0 && (
        <>
          <StrengthChart
            points={weeks.map((week) => ({ dayKey: week.weekStart, best: week.averageKg }))}
            unit="kg"
            title="Peso medio por semana"
          />
          {change !== null && (
            <p className="mt-1 text-footnote tabular-nums text-muted-foreground">
              {change === 0
                ? 'Estable en las últimas semanas.'
                : `${change > 0 ? '+' : '−'}${Math.abs(change).toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg por semana en las últimas semanas.`}
            </p>
          )}
        </>
      )}

      {evolution.length > 0 && (
        <>
          <p className="mt-6 text-footnote font-medium">Tu evolución</p>
          <ul className="mt-2 divide-y divide-border">
            {evolution.map((item) => (
              <EvolutionRow key={item.key} item={item} />
            ))}
          </ul>
        </>
      )}

      {/* Medidas con cinta, una vez al mes (D-067). */}
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <span className="text-footnote font-medium">Medidas</span>
        <span className="text-caption text-muted-foreground">
          {due ? 'Toca medir' : `Cada ${PERIMETER_INTERVAL_DAYS} días`}
        </span>
      </div>

      {!measuring && Object.keys(latest).length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {PERIMETER_ORDER.filter((key) => latest[key]).map((key) => {
            const diff = changes[key] ? Math.round((changes[key]!.to - changes[key]!.from) * 10) / 10 : 0
            return (
              <li key={key} className="flex items-baseline justify-between py-2.5 text-subhead">
                <span>{PERIMETER_LABELS[key]}</span>
                <span className="tabular-nums">
                  {latest[key]!.cm.toLocaleString('es-ES')} cm
                  {diff !== 0 && (
                    <span className="ml-1.5 text-caption text-muted-foreground">
                      ({diff > 0 ? '+' : '−'}
                      {Math.abs(diff).toLocaleString('es-ES')})
                    </span>
                  )}
                </span>
              </li>
            )
          })}
          <li className="py-2 text-caption text-muted-foreground">
            Última vez: {formatShortDate(Object.values(latest).map((item) => item!.dayKey).sort().reverse()[0]).toLowerCase()}
          </li>
        </ul>
      )}

      {measuring ? (
        <>
          <div className="mt-1 divide-y divide-border">
            {PERIMETER_ORDER.map((key) => (
              <div key={key}>
                <StepperField
                  label={PERIMETER_LABELS[key]}
                  value={tape[key]}
                  unit="cm"
                  step={0.5}
                  min={PERIMETER_LIMITS.min}
                  max={PERIMETER_LIMITS.max}
                  onChange={(next) => setTape((current) => ({ ...current, [key]: next }))}
                />
                <p className="-mt-2 pb-3 text-caption text-muted-foreground">{PERIMETER_HINTS[key]}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              void savePerimeters(tape)
              setMeasuring(false)
            }}
            className="ax-press mt-2 h-[52px] w-full rounded-2xl bg-primary text-callout font-semibold text-primary-foreground"
          >
            Guardar medidas
          </button>
          <button
            type="button"
            onClick={() => setMeasuring(false)}
            className="ax-press mt-1 min-h-11 w-full text-footnote font-medium text-muted-foreground"
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setMeasuring(true)}
          className="ax-press mt-2 min-h-11 w-full rounded-full border border-border bg-background px-4 text-footnote font-semibold"
        >
          {Object.keys(latest).length === 0 ? 'Tomar mis medidas' : due ? 'Medir ahora' : 'Medir antes de tiempo'}
        </button>
      )}
    </>
  )
}

const number = (value: number) => (Math.round(value * 10) / 10).toLocaleString('es-ES')
const signed = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return rounded === 0 ? '=' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('es-ES')}`
}

/** Una medida de tus objetivos: del primer día a hoy, y cuánto en el último mes (D-067). */
function EvolutionRow({ item }: { item: MeasureEvolution }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-subhead">
        <span>{item.label}</span>
        <span className="tabular-nums">
          {number(item.first.value)} → <span className="font-semibold">{number(item.latest.value)}</span> {item.unit}
        </span>
      </div>
      <p className="mt-0.5 text-right text-caption tabular-nums text-muted-foreground">
        {signed(item.latest.value - item.first.value)} desde el principio
        {item.previous ? ` · ${signed(item.latest.value - item.previous.value)} en el último mes` : ''}
      </p>
    </li>
  )
}
