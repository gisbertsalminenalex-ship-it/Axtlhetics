'use client'

import { Minus, Plus } from 'lucide-react'

/**
 * Selector de un valor con − y + (Design System §23, «Set Stepper»). Lo
 * comparten el entrenamiento (carga y repeticiones) y el test de evolución
 * (resultado).
 *
 * Con `onInput`, el valor además se puede escribir: el resultado de un test no
 * tiene el tope de 50 del entrenamiento y llegar a 120 segundos a toques no
 * tiene sentido.
 */
export function ValueStepper({
  value,
  unit,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  onInput,
  inputLabel,
}: {
  value: string
  unit: string
  onDecrease: () => void
  onIncrease: () => void
  decreaseLabel: string
  increaseLabel: string
  /** Si se da, el valor es un campo numérico editable. */
  onInput?: (text: string) => void
  inputLabel?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-4 text-center">
      {onInput ? (
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={inputLabel}
          value={value}
          onChange={(event) => onInput(event.target.value)}
          className="mx-auto block w-32 bg-transparent text-center text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      ) : (
        <p className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      )}
      <p className="mt-1.5 text-[13px] text-muted-foreground">{unit}</p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onDecrease}
          aria-label={decreaseLabel}
          className="ax-press flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
        >
          <Minus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onIncrease}
          aria-label={increaseLabel}
          className="ax-press flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
        >
          <Plus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
