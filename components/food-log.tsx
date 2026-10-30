'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ChoiceGroup } from '@/components/profile/controls'
import {
  dayIntake,
  MEAL_LIMITS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_ORDER,
  type MealEntry,
  type MealSlot,
} from '@/lib/domain/nutrition/intake'
import type { NutritionTargets } from '@/lib/domain/nutrition/targets'

/**
 * La comida de hoy (D-066): lo apuntado frente al objetivo, macro a macro, la
 * lista de comidas y el formulario para añadir una. Vive en «Alimentación», al
 * final de Recuperación.
 */

const SLOT_OPTIONS = MEAL_SLOT_ORDER.map((value) => ({ value, label: MEAL_SLOT_LABELS[value] }))

type Draft = { slot: MealSlot | null; kcal: string; proteinG: string; carbsG: string; fatG: string }
const EMPTY_DRAFT: Draft = { slot: null, kcal: '', proteinG: '', carbsG: '', fatG: '' }

/** Un número del formulario: vacío es 0; con coma o punto; fuera de límites, `null`. */
function parseAmount(text: string, max: number): number | null {
  if (text.trim() === '') return 0
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value * 10) / 10 : null
}

export function FoodLog({
  meals,
  targets,
  onAdd,
  onRemove,
}: {
  meals: readonly MealEntry[]
  targets: NutritionTargets | null
  onAdd: (meal: Omit<MealEntry, 'id' | 'createdAt'>) => Promise<void>
  onRemove: (mealId: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const intake = dayIntake(meals)

  const proteinG = parseAmount(draft?.proteinG ?? '', MEAL_LIMITS.grams)
  const carbsG = parseAmount(draft?.carbsG ?? '', MEAL_LIMITS.grams)
  const fatG = parseAmount(draft?.fatG ?? '', MEAL_LIMITS.grams)
  // Sin calorías escritas, salen de los macros: 4 kcal por gramo de proteína y carbohidratos, 9 de grasa.
  const fromMacros = proteinG !== null && carbsG !== null && fatG !== null ? Math.round(proteinG * 4 + carbsG * 4 + fatG * 9) : null
  const kcal = draft && draft.kcal.trim() === '' ? fromMacros : parseAmount(draft?.kcal ?? '', MEAL_LIMITS.kcal)
  const valid = draft?.slot && kcal !== null && kcal > 0 && proteinG !== null && carbsG !== null && fatG !== null

  const save = async () => {
    if (!draft?.slot || !valid) return
    await onAdd({ slot: draft.slot, kcal: kcal!, proteinG: proteinG!, carbsG: carbsG!, fatG: fatG! })
    setDraft(null)
  }

  return (
    <div className="mt-5">
      <p className="text-subhead font-semibold">Lo que llevas hoy</p>
      <div className="mt-3 space-y-4 rounded-2xl border border-border p-4">
        <MacroBar label="Calorías" unit="kcal" value={intake.kcal} range={targets ? [targets.kcal, targets.kcal] : null} />
        <MacroBar label="Proteína" unit="g" value={intake.proteinG} range={targets?.proteinGrams ?? null} />
        <MacroBar label="Carbohidratos" unit="g" value={intake.carbsG} range={targets?.carbsGrams ?? null} />
        <MacroBar label="Grasa" unit="g" value={intake.fatG} range={targets?.fatGrams ?? null} />
      </div>

      {meals.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {meals.map((meal) => (
            <li key={meal.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className="text-subhead font-medium">{MEAL_SLOT_LABELS[meal.slot]}</p>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {Math.round(meal.kcal)} kcal · P {format(meal.proteinG)} · C {format(meal.carbsG)} · G {format(meal.fatG)} g
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onRemove(meal.id)}
                aria-label={`Quitar ${MEAL_SLOT_LABELS[meal.slot].toLowerCase()}`}
                className="ax-press flex h-11 w-11 items-center justify-center text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="ax-fade mt-3 rounded-3xl bg-surface px-4 pb-4">
          <ChoiceGroup label="¿Qué comida?" options={SLOT_OPTIONS} value={draft.slot} onChange={(slot) => setDraft({ ...draft, slot })} />
          <div className="grid grid-cols-2 gap-3">
            <AmountField
              label="Calorías"
              unit="kcal"
              value={draft.kcal}
              placeholder={fromMacros ? String(fromMacros) : '0'}
              onChange={(value) => setDraft({ ...draft, kcal: value })}
            />
            <AmountField label="Proteína" unit="g" value={draft.proteinG} onChange={(value) => setDraft({ ...draft, proteinG: value })} />
            <AmountField label="Carbohidratos" unit="g" value={draft.carbsG} onChange={(value) => setDraft({ ...draft, carbsG: value })} />
            <AmountField label="Grasa" unit="g" value={draft.fatG} onChange={(value) => setDraft({ ...draft, fatG: value })} />
          </div>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground text-pretty">
            Sin calorías, las calculo con los macros. Lo que no sepas, déjalo vacío.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="ax-press min-h-11 flex-1 rounded-full bg-background px-4 text-subhead font-medium text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!valid}
              className="ax-press min-h-11 flex-1 rounded-full bg-primary px-4 text-subhead font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft(EMPTY_DRAFT)}
          className="ax-press mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-surface px-4 text-subhead font-semibold"
        >
          <Plus className="h-4 w-4" />
          Añadir comida
        </button>
      )}
    </div>
  )
}

const format = (value: number) => (Math.round(value * 10) / 10).toLocaleString('es-ES')

/** Lo apuntado frente al objetivo. Sin objetivo, solo la cifra. */
function MacroBar({
  label,
  unit,
  value,
  range,
}: {
  label: string
  unit: string
  value: number
  range: readonly [number, number] | null
}) {
  const top = range ? range[1] : null
  const target = range ? (range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`) : null
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-footnote">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{value.toLocaleString('es-ES')}</span>
          {target ? ` / ${target}` : ''} {unit}
        </span>
      </div>
      {top !== null && top > 0 && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((value / top) * 100))}%` }} />
        </div>
      )}
    </div>
  )
}

function AmountField({
  label,
  unit,
  value,
  placeholder = '0',
  onChange,
}: {
  label: string
  unit: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  return (
    <label className="block">
      <span className="text-footnote font-medium text-muted-foreground">{label}</span>
      <span className="mt-1.5 flex h-12 items-center rounded-2xl border border-transparent bg-background px-4 transition-colors focus-within:border-primary">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-callout tabular-nums outline-none placeholder:text-muted-foreground"
        />
        <span className="text-footnote text-muted-foreground">{unit}</span>
      </span>
    </label>
  )
}
