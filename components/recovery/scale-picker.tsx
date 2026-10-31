'use client'

import type { Scale5 } from '@/lib/domain/recovery/types'
import { cn } from '@/lib/utils'

/** Escala de 1 a 5 en un toque: energía, fatiga y estrés en Recuperación. */
export function ScalePicker({
  value,
  labels,
  onSelect,
  className,
}: {
  value: Scale5 | null
  labels: Record<Scale5, string>
  onSelect: (next: Scale5) => void
  className?: string
}) {
  const levels: Scale5[] = [1, 2, 3, 4, 5]
  return (
    <div className={className}>
      <div className="flex gap-1.5">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onSelect(level)}
            aria-pressed={value === level}
            aria-label={labels[level]}
            className={cn(
              'ax-press h-11 flex-1 rounded-full text-subhead font-semibold tabular-nums transition-colors duration-200',
              value === level ? 'bg-primary text-primary-foreground' : 'bg-fill text-muted-foreground',
            )}
          >
            {level}
          </button>
        ))}
      </div>
      <p className="mt-2 text-caption text-muted-foreground">
        {value === null ? `1 · ${labels[1]} — 5 · ${labels[5]}` : labels[value]}
      </p>
    </div>
  )
}
