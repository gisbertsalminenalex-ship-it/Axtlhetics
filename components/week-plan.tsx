'use client'

import { useState } from 'react'
import type { WeekDayView } from '@/lib/domain/axis/week-view'
import { WEEKDAY_INITIALS, WEEKDAY_LABELS, weekdayOfKey } from '@/lib/domain/shared/dates'
import { cn } from '@/lib/utils'

/**
 * La semana en una línea (D-048): de lunes a domingo, cada día con su estado.
 * Al tocar un día se ve debajo lo que se hizo, lo de hoy o lo previsto.
 *
 * Mismo lenguaje que la tira de actividad: punto lleno, hecho; anillo, hoy;
 * punto suave, previsto; borde, descanso.
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
          return (
            <button
              key={day.dayKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`${WEEKDAY_LABELS[weekdayOfKey(day.dayKey)]}: ${statusLabel(day)}`}
              onClick={() => setSelectedKey(day.dayKey)}
              className={cn(
                'ax-press flex h-14 w-11 flex-col items-center justify-center gap-2 rounded-2xl transition-colors',
                isSelected && 'bg-surface',
              )}
            >
              <span className={cn('text-footnote font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                {WEEKDAY_INITIALS[index]}
              </span>
              <span
                className={cn(
                  'h-3.5 w-3.5 rounded-full',
                  day.status === 'done' && 'bg-primary',
                  day.status === 'today' && 'border-2 border-primary bg-background',
                  day.status === 'planned' && 'bg-secondary',
                  day.status === 'rest' && (day.isToday ? 'border-2 border-primary bg-background' : 'border border-border bg-background'),
                )}
              />
            </button>
          )
        })}
      </div>

      {selected && (
        <div key={selected.dayKey} className="ax-fade mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
          <p className="text-caption font-medium text-muted-foreground">
            {WEEKDAY_LABELS[weekdayOfKey(selected.dayKey)]} · {statusLabel(selected)}
          </p>
          <p className="mt-1 text-callout font-semibold">{selected.title ?? (selected.isToday ? 'Hoy toca recuperar' : 'Descanso')}</p>
          {(selected.hard || selected.activities.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.hard && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-caption font-semibold text-primary">Día fuerte</span>
              )}
              {selected.activities.map((name) => (
                <span key={name} className="rounded-full border border-border bg-background px-2.5 py-1 text-caption font-medium text-muted-foreground">
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
