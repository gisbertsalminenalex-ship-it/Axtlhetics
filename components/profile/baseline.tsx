'use client'

import { ChoiceGroup, StepperField } from '@/components/profile/controls'
import type { GoalMeasures } from '@/lib/domain/body/goal-measures'
import {
  PERIMETER_HINTS,
  PERIMETER_LABELS,
  PERIMETER_LIMITS,
  PERIMETER_START,
  type PerimeterKey,
} from '@/lib/domain/body/measurements'

const TAPE_OPTIONS = [
  { value: 'ahora' as const, label: 'Medir ahora' },
  { value: 'luego' as const, label: 'Lo mido luego' },
]

/**
 * El punto de partida (D-067) en el onboarding: las medidas que piden los
 * objetivos, con dónde tomarlas. Hay que elegir medir ahora o luego, para no
 * guardar como medida un valor que no se ha medido; luego, AXIS lo recuerda.
 * El test de evolución no se hace aquí: se anuncia.
 */
export function BaselinePicker({
  measures,
  weightKg,
  tape,
  onTape,
}: {
  measures: GoalMeasures
  weightKg: number
  /** `undefined`: sin elegir; `null`: sin cinta ahora, se medirá luego. */
  tape: Partial<Record<PerimeterKey, number>> | null | undefined
  onTape: (next: Partial<Record<PerimeterKey, number>> | null) => void
}) {
  return (
    <div>
      {measures.weight && (
        <p className="py-3 text-subhead leading-relaxed text-pretty">
          Tu peso de partida: <span className="font-semibold tabular-nums">{weightKg.toLocaleString('es-ES')} kg</span>, el que
          has puesto antes.
        </p>
      )}

      {measures.perimeters.length > 0 && (
        <>
          <ChoiceGroup
            label="Con una cinta métrica"
            options={TAPE_OPTIONS}
            value={tape === undefined ? null : tape === null ? 'luego' : 'ahora'}
            onChange={(choice) => onTape(choice === 'luego' ? null : (tape ?? startingTape(measures)))}
          />
          {tape && (
            <div className="divide-y divide-border">
              {measures.perimeters.map((key) => (
                <div key={key}>
                  <StepperField
                    label={PERIMETER_LABELS[key]}
                    value={tape[key] ?? PERIMETER_START[key]}
                    unit="cm"
                    step={0.5}
                    min={PERIMETER_LIMITS.min}
                    max={PERIMETER_LIMITS.max}
                    onChange={(next) => onTape({ ...tape, [key]: next })}
                  />
                  <p className="-mt-2 pb-3 text-caption text-muted-foreground">{PERIMETER_HINTS[key]}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {measures.test && (
        <p className="mt-4 rounded-2xl bg-surface shadow-card px-4 py-3 text-footnote leading-relaxed text-pretty">
          Para la fuerza y la resistencia, tu punto de partida es el <span className="font-semibold">test de evolución</span>:
          te lo propongo en Entrenamiento, en «Tu evaluación inicial», el primer día que llegues bien.
        </p>
      )}
    </div>
  )
}

/** La cinta de partida: el centro de un rango común en cada perímetro que piden los objetivos. */
export function startingTape(measures: GoalMeasures): Partial<Record<PerimeterKey, number>> {
  return Object.fromEntries(measures.perimeters.map((key) => [key, PERIMETER_START[key]]))
}
