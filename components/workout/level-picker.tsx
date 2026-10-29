'use client'

import type { Exercise } from '@/lib/domain/workouts/types'
import { cn } from '@/lib/utils'

/**
 * El nivel del ejercicio en curso (D-065): las variantes de su familia, de la
 * más accesible a la más exigente, con la actual marcada. Solo antes de la
 * primera serie; la elegida se recuerda para las siguientes sesiones.
 */
export function LevelPicker({
  options,
  currentId,
  recommendedId,
  onChange,
}: {
  options: readonly Exercise[]
  currentId: string
  /** La que propuso AXIS para esta sesión. */
  recommendedId: string | null
  onChange: (exerciseId: string) => void
}) {
  if (options.length === 0) return null
  const recommended = recommendedId !== currentId ? options.find((option) => option.id === recommendedId) : undefined

  return (
    <section className="mt-5">
      <h3 className="text-caption font-semibold tracking-[0.14em] text-muted-foreground">NIVEL</h3>
      <div
        role="radiogroup"
        aria-label="Nivel del ejercicio"
        className="-mx-6 mt-2 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]"
      >
        {options.map((option) => {
          const selected = option.id === currentId
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => !selected && onChange(option.id)}
              className={cn(
                'ax-press min-h-11 shrink-0 rounded-full border px-4 text-subhead font-medium whitespace-nowrap transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {option.name}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground text-pretty">
        {recommended
          ? `AXIS proponía ${recommended.name.toLowerCase()}. Recordaré tu nivel para la próxima vez.`
          : 'Si no es tu nivel, cámbialo antes de la primera serie. Lo recordaré.'}
      </p>
    </section>
  )
}
