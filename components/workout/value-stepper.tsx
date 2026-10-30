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
    // El número entre sus dos botones, en una fila (D-075): se ajusta con el
    // pulgar sin mover la mano y la cifra queda en el centro de la mirada.
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-4">
      <StepperButton label={decreaseLabel} onClick={onDecrease}>
        <Minus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
      </StepperButton>
      <div className="min-w-0 flex-1 text-center">
      {onInput ? (
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={inputLabel}
          value={value}
          onChange={(event) => onInput(event.target.value)}
          className="mx-auto block w-full bg-transparent text-center text-title-lg font-bold leading-none tabular-nums outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      ) : (
        <p className="text-title-lg font-bold leading-none tabular-nums">{value}</p>
      )}
        <p className="mt-1 text-footnote text-muted-foreground">{unit}</p>
      </div>
      <StepperButton label={increaseLabel} onClick={onIncrease}>
        <Plus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
      </StepperButton>
    </div>
  )
}

function StepperButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ax-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background"
    >
      {children}
    </button>
  )
}
