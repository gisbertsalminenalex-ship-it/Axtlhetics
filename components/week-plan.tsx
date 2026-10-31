'use client'

import { useState } from 'react'
import type { WeekDayView } from '@/lib/domain/axis/week-view'
import { Check } from 'lucide-react'
import { fromDayKey, WEEKDAY_INITIALS, WEEKDAY_LABELS, weekdayOfKey } from '@/lib/domain/shared/dates'
import { cn } from '@/lib/utils'

/**
 * La semana en una línea (D-048): de lunes a domingo, cada día con su estado.
 * Al tocar un día se ve debajo lo que se hizo, lo de hoy o lo previsto.
 *
 * Mismo lenguaje que la semana de Inicio (D-075): cada día con su número;
 * hecho, un check; hoy, azul lleno; previsto, un punto azul debajo; descanso,
 * el número en gris.
 */
export function WeekPlan({ days, className }: { days: readonly WeekDayView[]; className?: string }) {
  const todayKey = days.find((day) => day.isToday)?.dayKey ?? days[0]?.dayKey
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const selected = days.find((day) => day.dayKey === selectedKey) ?? days.find((day) => day.isToday) ?? null

  return (
    <div className={className}>
      <div className="flex items-center justify-between" role="tablist" aria-label="Días de esta semana">
        {days.map((day, index) => {
          const isSelected = day.dayKey === selected?.dayKey
          const trains = day.status === 'today' || day.status === 'planned'
          return (
            <button
              key={day.dayKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`${WEEKDAY_LABELS[weekdayOfKey(day.dayKey)]}: ${statusLabel(day)}`}
              onClick={() => setSelectedKey(day.dayKey)}
              className={cn(
                'ax-press flex w-11 flex-col items-center gap-1.5 rounded-2xl py-2 transition-colors duration-200',
                isSelected && 'bg-surface',
              )}
            >
              <span className={cn('text-caption font-medium', isSelected || day.isToday ? 'text-foreground' : 'text-muted-nontext')}>
                {WEEKDAY_INITIALS[index]}
              </span>
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-subhead tabular-nums transition-colors duration-200',
                  day.status === 'done' && 'bg-secondary text-primary',
                  day.isToday && day.status !== 'done' && 'bg-primary font-semibold text-primary-foreground',
                  !day.isToday && day.status === 'planned' && 'text-foreground',
                  !day.isToday && day.status === 'rest' && 'text-muted-nontext',
                )}
              >
                {day.status === 'done' ? <Check className="h-4 w-4" strokeWidth={2.5} /> : fromDayKey(day.dayKey).getDate()}
              </span>
              {/* Lo previsto, un punto debajo; el descanso, nada. */}
              <span
                aria-hidden="true"
                className={cn('h-1 w-1 rounded-full', trains && !day.isToday ? 'bg-primary' : 'bg-transparent')}
              />
            </button>
          )
        })}
      </div>

      {selected && (
        <div key={selected.dayKey} className="ax-fade mt-3 rounded-2xl bg-surface shadow-card px-4 py-4">
          <p className="text-caption font-medium text-muted-foreground">
            {WEEKDAY_LABELS[weekdayOfKey(selected.dayKey)]} · {statusLabel(selected)}
          </p>
          <p className="mt-1 text-body font-semibold">{selected.title ?? (selected.isToday ? 'Hoy toca recuperar' : 'Descanso')}</p>
          {(selected.hard || selected.activities.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.hard && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-caption font-semibold text-primary">Día fuerte</span>
              )}
              {selected.activities.map((name) => (
                <span key={name} className="rounded-full bg-background px-2.5 py-1 text-caption font-medium text-muted-foreground">
                  {name}
                </span>
              ))}
            </div>
          )}
          {selected.status === 'planned' && (
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
              AXIS lo vuelve a decidir ese día con tu recuperación.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function statusLabel(day: WeekDayView): string {
  switch (day.status) {
    case 'done':
      return 'Hecho'
    case 'today':
      return 'Hoy'
    case 'planned':
      return 'Previsto'
    case 'rest':
      return day.isToday ? 'Hoy' : 'Descanso'
  }
}
