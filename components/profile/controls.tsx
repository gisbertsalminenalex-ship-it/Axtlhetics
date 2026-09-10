'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Controles del formulario de perfil.
 *
 * Reutilizan el lenguaje visual ya aprobado: superficie neutra, radio grande,
 * azul primario solo para el estado activo y área táctil de 44 px.
 */

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground">{children}</p>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">{children}</h3>
  )
}

/** Campo numérico con dos pulsadores. Nunca abre el teclado, nunca acepta basura. */
export function StepperField({
  label,
  value,
  unit,
  step = 1,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit: string
  step?: number
  min: number
  max: number
  onChange: (next: number) => void
}) {
  const clampTo = (next: number) => Math.min(Math.max(next, min), max)

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1">
        <StepButton
          ariaLabel={`Reducir ${label.toLowerCase()}`}
          onClick={() => onChange(clampTo(value - step))}
          disabled={value <= min}
          icon="minus"
        />
        <span className="min-w-[76px] text-right text-[16px] font-semibold tabular-nums">
          {formatNumber(value)}
          <span className="ml-1 text-[13px] font-normal text-muted-foreground">{unit}</span>
        </span>
        <StepButton
          ariaLabel={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(clampTo(value + step))}
          disabled={value >= max}
          icon="plus"
        />
      </div>
    </div>
  )
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function StepButton({
  ariaLabel,
  onClick,
  disabled,
  icon,
}: {
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  icon: 'minus' | 'plus'
}) {
  const Icon = icon === 'minus' ? Minus : Plus
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="ax-press flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors disabled:opacity-35"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  )
}

/**
 * Grupo de opciones múltiples en forma de chips.
 *
 * El estado seleccionado es el azul primario lleno; el resto queda neutro. Se puede
 * deseleccionar tocando de nuevo, y se bloquea añadir por encima del máximo.
 */
export function MultiChoiceGroup<T extends string>({
  label,
  hint,
  options,
  value,
  max,
  onToggle,
}: {
  label: string
  hint?: string
  options: { value: T; label: string }[]
  value: readonly T[]
  max?: number
  onToggle: (next: T) => void
}) {
  const atMax = max !== undefined && value.length >= max

  return (
    <div className="py-3">
      <FieldLabel>{label}</FieldLabel>
      {hint && (
        <p className="mt-1 text-[12.5px] text-muted-foreground">{hint}</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value)
          const blocked = atMax && !selected
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              disabled={blocked}
              aria-pressed={selected}
              className={cn(
                'ax-press min-h-11 rounded-full border px-4 text-[14px] font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground',
                blocked && 'opacity-35',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Grupo de opciones excluyentes en forma de chips. */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="py-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={cn(
                'ax-press min-h-11 rounded-full border px-4 text-[14px] font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Selector múltiple de días de la semana, con el lunes primero. */
export function WeekdayPicker({
  label,
  value,
  onToggle,
}: {
  label: string
  value: number[]
  onToggle: (weekday: number) => void
}) {
  return (
    <div className="py-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2.5 flex justify-between gap-1.5">
        {WEEKDAY_SHORT.map((initial, index) => {
          const selected = value.includes(index)
          return (
            <button
              key={index}
              type="button"
              onClick={() => onToggle(index)}
              aria-pressed={selected}
              aria-label={`Día ${index + 1}`}
              className={cn(
                'ax-press h-11 flex-1 rounded-full border text-[14px] font-semibold transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {initial}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  return (
    <div className="py-3">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-primary"
      />
    </div>
  )
}

/** Botón primario de la aplicación: 52 px, azul, una sola acción por pantalla. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="ax-press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  )
}
