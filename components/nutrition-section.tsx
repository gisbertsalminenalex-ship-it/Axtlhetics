'use client'

import { FoodLog } from '@/components/food-log'
import { ChoiceGroup } from '@/components/profile/controls'
import { currentWeight, weeklyWeights } from '@/lib/domain/body/measurements'
import { averageIntake } from '@/lib/domain/nutrition/intake'
import { NUTRITION_GOAL_LABELS, NUTRITION_GOAL_ORDER, proposeAdjustment } from '@/lib/domain/nutrition/targets'
import { addDays } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

const GOAL_OPTIONS = NUTRITION_GOAL_ORDER.map((value) => ({ value, label: NUTRITION_GOAL_LABELS[value] }))

/**
 * Alimentación (D-061, D-066), al final de Recuperación: el objetivo, las
 * cifras del día con sus macros, la comida apuntada hoy y, cuando el peso lo
 * pide, lo que propone AXIS. Sin comidas apuntadas sigue la pregunta de la
 * proteína; con ellas, la contestan los gramos.
 */
export function NutritionSection() {
  const {
    profile,
    measurements,
    today,
    nutritionTargets: targets,
    setNutritionGoal,
    applyNutritionAdjustment,
    saveProteinCheck,
    addMeal,
    removeMeal,
  } = useAxtlhetics()
  if (!profile) return null

  const plan = profile.nutrition ?? null
  const todayRecord = measurements.find((record) => record.dayKey === today)
  const meals = todayRecord?.meals ?? []
  const adjustment =
    plan && targets
      ? proposeAdjustment({
          plan,
          age: profile.age,
          weightKg: currentWeight(measurements, profile.weightKg),
          weeks: weeklyWeights(measurements, today),
          // Lo comido de verdad desde el último ajuste, sin hoy, que aún no ha acabado (D-066).
          targetKcal: targets.kcal,
          intake: averageIntake(measurements, plan.since, addDays(today, -1)),
        })
      : null
  const protein = todayRecord?.protein ?? null

  return (
    <section aria-labelledby="nutrition">
      <h3 id="nutrition" className="mt-10 mb-1 text-body font-semibold">
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

      {targets && (
        <div className="mt-1 rounded-3xl bg-surface shadow-card-lg p-5">
          <p className="text-title font-bold tabular-nums">
            {targets.kcal.toLocaleString('es-ES')} <span className="text-footnote font-medium text-muted-foreground">kcal al día</span>
          </p>
          <p className="mt-1 text-callout font-semibold tabular-nums">
            {targets.proteinGrams[0]}–{targets.proteinGrams[1]} g{' '}
            <span className="text-footnote font-medium text-muted-foreground">de proteína</span>
          </p>
          <p className="mt-0.5 text-footnote text-muted-foreground tabular-nums">
            Carbohidratos {targets.carbsGrams[0]}–{targets.carbsGrams[1]} g · Grasa {targets.fatGrams[0]}–{targets.fatGrams[1]} g
          </p>
          <p className="mt-3 border-t border-border pt-3 text-footnote text-muted-foreground text-pretty">{targets.text}</p>
        </div>
      )}

      {adjustment && (
        <div className="mt-3 rounded-3xl border border-border bg-surface shadow-card p-5">
          <p className="text-subhead leading-relaxed text-pretty">{adjustment.reason}</p>
          {adjustment.kind === 'adjust' && (
            <button
              type="button"
              onClick={() => void applyNutritionAdjustment(adjustment.deltaKcal)}
              className="ax-press mt-3 min-h-11 w-full rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground"
            >
              Aplicar ajuste ({adjustment.deltaKcal > 0 ? '+' : '−'}
              {Math.abs(adjustment.deltaKcal)} kcal)
            </button>
          )}
        </div>
      )}

      <FoodLog meals={meals} targets={targets} onAdd={addMeal} onRemove={removeMeal} />

      {plan && meals.length === 0 && (
        <div className="mt-4 flex items-center gap-3">
          <span className="flex-1 text-subhead font-medium">¿Hoy llegaste a tu proteína?</span>
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => void saveProteinCheck(value)}
              aria-pressed={protein === value}
              className={cn(
                'ax-press h-11 min-w-14 rounded-full px-4 text-subhead font-medium transition-colors duration-200',
                protein === value ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground',
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
