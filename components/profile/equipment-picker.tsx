'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ChoiceGroup, FieldLabel, MultiChoiceGroup } from '@/components/profile/controls'
import {
  describeWeight,
  GEAR_ITEM_LABELS,
  GEAR_ITEM_ORDER,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  normalizeEquipment,
  WEIGHT_KIND_LABELS,
  type GearItem,
  type UserEquipment,
  type WeightKind,
} from '@/lib/domain/workouts/equipment'

/**
 * El material con el que entrena el usuario (D-046): lo que no es una pesa, en
 * chips, y la lista de sus pesas, una a una. Es el mismo en el onboarding y en
 * Perfil. El peso corporal y una silla no se preguntan: se dan por supuestos.
 */

const ITEM_OPTIONS = GEAR_ITEM_ORDER.map((value) => ({ value, label: GEAR_ITEM_LABELS[value] }))

const KIND_OPTIONS = (Object.keys(WEIGHT_KIND_LABELS) as WeightKind[]).map((value) => ({
  value,
  label: WEIGHT_KIND_LABELS[value],
}))

const COUNT_OPTIONS: { value: 'una' | 'par'; label: string }[] = [
  { value: 'una', label: 'Una' },
  { value: 'par', label: 'Un par' },
]

/** «12,5» o «12.5» → 12,5. `null` si no es un peso que se pueda guardar. */
function parseKg(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  if (!Number.isFinite(value) || value < MIN_WEIGHT_KG || value > MAX_WEIGHT_KG) return null
  // Medios kilos como mucho: no hay pesas de 7,3 kg.
  return Math.round(value * 2) / 2
}

export function EquipmentPicker({
  value,
  onChange,
}: {
  value: UserEquipment
  onChange: (next: UserEquipment) => void
}) {
  const [kind, setKind] = useState<WeightKind>('mancuerna')
  const [count, setCount] = useState<'una' | 'par'>('par')
  const [kgText, setKgText] = useState('')
  const kg = parseKg(kgText)

  const toggleItem = (item: GearItem) =>
    onChange(
      normalizeEquipment({
        ...value,
        items: value.items.includes(item) ? value.items.filter((other) => other !== item) : [...value.items, item],
      }),
    )

  const addWeight = () => {
    if (kg === null) return
    onChange(normalizeEquipment({ ...value, weights: [...value.weights, { kind, kg, pair: count === 'par' }] }))
    setKgText('')
  }

  const removeWeight = (index: number) =>
    onChange({ ...value, weights: value.weights.filter((_, i) => i !== index) })

  return (
    <div>
      <MultiChoiceGroup
        label="Material"
        hint="El peso corporal y una silla siempre cuentan."
        options={ITEM_OPTIONS}
        value={value.items}
        onToggle={toggleItem}
      />

      <div className="py-3">
        <FieldLabel>Tus pesas</FieldLabel>
        {value.weights.length > 0 ? (
          <ul className="mt-2.5 space-y-2">
            {value.weights.map((weight, index) => (
              <li
                key={`${weight.kind}-${weight.kg}`}
                className="flex items-center gap-3 rounded-2xl bg-surface pl-4"
              >
                <span className="flex-1 text-callout font-medium">{describeWeight(weight)}</span>
                <button
                  type="button"
                  onClick={() => removeWeight(index)}
                  aria-label={`Quitar ${describeWeight(weight).toLowerCase()}`}
                  className="ax-press flex h-11 w-11 items-center justify-center text-muted-foreground"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-caption text-muted-foreground">
            Sin pesas, AXIS te propone ejercicios con tu peso corporal.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <ChoiceGroup label="Añadir una pesa" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        <ChoiceGroup label="Cuántas" options={COUNT_OPTIONS} value={count} onChange={setCount} />
        <label className="block py-3">
          <FieldLabel>Kilos de cada una</FieldLabel>
          <input
            type="text"
            inputMode="decimal"
            value={kgText}
            placeholder="10"
            onChange={(event) => setKgText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addWeight()
            }}
            className="mt-2 h-12 w-full rounded-2xl border border-transparent bg-surface focus-visible:border-primary px-4 text-callout tabular-nums outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          type="button"
          onClick={addWeight}
          disabled={kg === null}
          className="ax-press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-surface text-subhead font-semibold text-primary disabled:opacity-35"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          Añadir {kind === 'mancuerna' ? (count === 'par' ? 'mancuernas' : 'mancuerna') : count === 'par' ? 'kettlebells' : 'kettlebell'}
          {kg !== null ? ` de ${String(kg).replace('.', ',')} kg` : ''}
        </button>
      </div>
    </div>
  )
}
