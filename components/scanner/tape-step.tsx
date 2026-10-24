'use client'

import { ChoiceGroup, StepperField } from '@/components/profile/controls'
import {
  PERIMETER_HINTS,
  PERIMETER_LABELS,
  PERIMETER_LIMITS,
  PERIMETER_START,
  type PerimeterKey,
} from '@/lib/domain/body/measurements'
import { SCAN_TAPE_KEYS, type TapeReading } from '@/lib/domain/scanner/coach'

type Tape = Partial<Record<PerimeterKey, number>>

const cm = (n: number) => `${n.toLocaleString('es-ES')} cm`

/**
 * La cinta en el escáner (D-069): la foto ve la forma, la cinta sigue el
 * músculo. Opcional, como en el punto de partida (D-067): hay que elegir medir
 * ahora o no, para no guardar como medida un valor que no se midió. Con una
 * medida reciente, se usa esa y se puede volver a medir.
 */
export function TapeStep({
  previous,
  tape,
  onTape,
  onNext,
}: {
  /** La cinta reciente que ya hay, si la hay. */
  previous: TapeReading | null
  /** `undefined`: sin elegir; `null`: sin medir ahora. */
  tape: Tape | null | undefined
  onTape: (next: Tape | null) => void
  onNext: () => void
}) {
  const known = previous ? SCAN_TAPE_KEYS.filter((key) => previous.latest[key] !== undefined) : []
  const starting = (): Tape => Object.fromEntries(SCAN_TAPE_KEYS.map((key) => [key, previous?.latest[key] ?? PERIMETER_START[key]]))
  return (
    <>
      <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.03em] text-balance">Tu músculo, con cinta</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
        La foto ve tu postura, cómo te mueves y tus proporciones, pero no el músculo. La cinta sí: con el brazo, el pecho y el
        muslo sigo cómo crece mes a mes, junto con tu fuerza. Son 2 minutos.
      </p>

      {known.length > 0 && (
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-pretty">
          Uso tu última medida: {known.map((key) => `${PERIMETER_LABELS[key].toLowerCase()} ${cm(previous!.latest[key]!)}`).join(', ')}.
        </p>
      )}

      <div className="mt-2">
        <ChoiceGroup
          label="Con una cinta métrica"
          options={[
            { value: 'ahora' as const, label: known.length ? 'Medir de nuevo' : 'Medir ahora' },
            { value: 'luego' as const, label: known.length ? 'Usar la última' : 'Lo mido luego' },
          ]}
          value={tape === undefined ? null : tape === null ? 'luego' : 'ahora'}
          onChange={(choice) => onTape(choice === 'luego' ? null : (tape ?? starting()))}
        />
        {tape && (
          <div className="divide-y divide-border">
            {SCAN_TAPE_KEYS.map((key) => (
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
                <p className="-mt-2 pb-3 text-[12px] text-muted-foreground">{PERIMETER_HINTS[key]}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto pt-8">
        <button type="button" onClick={onNext} className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground">
          Continuar
        </button>
      </div>
    </>
  )
}
