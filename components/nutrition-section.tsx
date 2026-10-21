'use client'

import { ChoiceGroup } from '@/components/profile/controls'
import { currentWeight, weeklyWeights } from '@/lib/domain/body/measurements'
import {
  NUTRITION_GOAL_LABELS,
  NUTRITION_GOAL_ORDER,
  nutritionTargets,
  proposeAdjustment,
} from '@/lib/domain/nutrition/targets'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

const GOAL_OPTIONS = NUTRITION_GOAL_ORDER.map((value) => ({ value, label: NUTRITION_GOAL_LABELS[value] }))

/**
 * Alimentación (D-061), al final de Recuperación: el objetivo, las calorías y la
 * proteína del día, si hoy llegaste a la proteína y, cuando el peso lo pide, el
 * ajuste que propone AXIS. Los menores de edad la ven sin cifras (D-023).
 */
export function NutritionSection() {
  const { profile, measurements, today, setNutritionGoal, applyNutritionAdjustment, saveProteinCheck } = useAxtlhetics()
  if (!profile) return null

  const plan = profile.nutrition ?? null
  const weightKg = currentWeight(measurements, profile.weightKg)
  const targets = plan
    ? nutritionTargets({
        plan,
        age: profile.age,
        weightKg,
        heightCm: profile.heightCm,
        sex: profile.sex ?? null,
        trainingDays: profile.availableWeekdays.length,
      })
    : null
  const adjustment = plan
    ? proposeAdjustment({ plan, age: profile.age, weightKg, weeks: weeklyWeights(measurements, today) })
    : null
  const protein = measurements.find((record) => record.dayKey === today)?.protein ?? null

  return (
    <section aria-labelledby="nutrition">
      <h3 id="nutrition" className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Alimentación
      </h3>
      <ChoiceGroup
        label={plan ? 'Tu objetivo' : '¿Qué buscas con lo que comes?'}
        options={GOAL_OPTIONS}
        value={plan?.goal ?? null}
        onChange={(goal) => {
          if (goal !== plan?.goal) void setNutritionGoal(goal)
        }}
      />

      {targets?.kind === 'adult' && (
        <div className="mt-1 rounded-3xl bg-surface px-5 py-4">
          <p className="text-[22px] font-bold tracking-[-0.02em] tabular-nums">
            {targets.kcal.toLocaleString('es-ES')} <span className="text-[13px] font-medium text-muted-foreground">kcal al día</span>
          </p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
            {targets.proteinGrams[0]}–{targets.proteinGrams[1]} g{' '}
            <span className="text-[13px] font-medium text-muted-foreground">de proteína</span>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">{targets.text}</p>
        </div>
      )}
      {targets?.kind === 'minor' && (
        <p className="mt-1 rounded-3xl bg-surface px-5 py-4 text-[14px] leading-relaxed text-pretty">{targets.text}</p>
      )}

      {adjustment && (
        <div className="mt-3 rounded-3xl border border-border px-5 py-4">
          <p className="text-[14px] leading-relaxed text-pretty">{adjustment.reason}</p>
          <button
            type="button"
            onClick={() => void applyNutritionAdjustment(adjustment.deltaKcal)}
            className="ax-press mt-3 min-h-11 w-full rounded-full bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground"
          >
            Aplicar ajuste ({adjustment.deltaKcal > 0 ? '+' : '−'}
            {Math.abs(adjustment.deltaKcal)} kcal)
          </button>
        </div>
      )}

      {plan && (
        <div className="mt-4 flex items-center gap-3">
          <span className="flex-1 text-[14px] font-medium">
            {targets?.kind === 'adult' ? '¿Hoy llegaste a tu proteína?' : '¿Hoy comiste proteína en cada comida?'}
          </span>
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => void saveProteinCheck(value)}
              aria-pressed={protein === value}
              className={cn(
                'ax-press h-11 min-w-11 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
                protein === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {value ? 'Sí' : 'No'}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
