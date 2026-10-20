'use client'

import { ScalePicker } from '@/components/recovery/scale-picker'
import { QUICK_SLEEP_OPTIONS, quickSleepOptionOf } from '@/lib/domain/recovery/scales'
import { ENERGY_LABELS, FATIGUE_LABELS, RECOVERY_FACTOR_LABELS } from '@/lib/domain/recovery/types'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * «¿Cómo llegas hoy?» (D-049): sueño, energía y fatiga en tres toques. Cada uno
 * se guarda al momento; con los tres hay recuperación, AXIS vuelve a decidir y
 * la tarjeta desaparece. Solo se muestra mientras hoy no hay recuperación.
 */
export function QuickCheckIn({ onMore }: { onMore: () => void }) {
  const { recoveryInputs, recoveryScore, updateRecovery } = useAxtlhetics()
  if (recoveryScore.status === 'ok') return null

  const sleep = quickSleepOptionOf(recoveryInputs.sleepHours)

  return (
    <section className="ax-enter mt-6 rounded-3xl border border-border bg-background p-5">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">¿Cómo llegas hoy?</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        Tres toques y AXIS decide con tus datos.
      </p>

      <p className="mt-5 text-[13px] font-medium text-muted-foreground">{RECOVERY_FACTOR_LABELS.sleep}</p>
      <div className="mt-2.5 flex gap-1.5">
        {QUICK_SLEEP_OPTIONS.map((option) => {
          const selected = sleep?.label === option.label
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => void updateRecovery({ sleepHours: option.hours })}
              aria-pressed={selected}
              aria-label={`Dormí ${option.label}`}
              className={cn(
                'h-11 flex-1 rounded-full border text-[13px] font-semibold tabular-nums transition-colors',
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

      <p className="mt-5 text-[13px] font-medium text-muted-foreground">{RECOVERY_FACTOR_LABELS.energy}</p>
      <ScalePicker
        value={recoveryInputs.energy}
        labels={ENERGY_LABELS}
        onSelect={(energy) => void updateRecovery({ energy })}
        className="mt-2.5"
      />

      <p className="mt-4 text-[13px] font-medium text-muted-foreground">{RECOVERY_FACTOR_LABELS.muscleFatigue}</p>
      <ScalePicker
        value={recoveryInputs.muscleFatigue}
        labels={FATIGUE_LABELS}
        onSelect={(muscleFatigue) => void updateRecovery({ muscleFatigue })}
        className="mt-2.5"
      />

      <button
        type="button"
        onClick={onMore}
        className="ax-press mt-3 min-h-11 w-full text-[13.5px] font-semibold text-primary"
      >
        Estrés y agua, en Recuperación
      </button>
    </section>
  )
}
