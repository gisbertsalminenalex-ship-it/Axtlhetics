'use client'

import { ChoiceGroup, MultiChoiceGroup } from '@/components/profile/controls'
import {
  CARE_ZONE_LABELS,
  CARE_ZONE_ORDER,
  SEX_LABELS,
  type CareZone,
  type Sex,
} from '@/lib/domain/profile/types'

/**
 * Sexo y zonas a cuidar (D-051). Los comparten el onboarding y Perfil, como el
 * resto del formulario.
 */

type SexChoice = Sex | 'sin_dato'

const SEX_OPTIONS: { value: SexChoice; label: string }[] = [
  ...(Object.keys(SEX_LABELS) as Sex[]).map((value) => ({ value: value as SexChoice, label: SEX_LABELS[value] })),
  { value: 'sin_dato', label: 'Prefiero no decirlo' },
]

export function SexPicker({ value, onChange }: { value: Sex | null | undefined; onChange: (next: Sex | null) => void }) {
  return (
    <ChoiceGroup
      label="Sexo"
      options={SEX_OPTIONS}
      value={value ?? 'sin_dato'}
      onChange={(next) => onChange(next === 'sin_dato' ? null : next)}
    />
  )
}

const ZONE_OPTIONS = CARE_ZONE_ORDER.map((value) => ({ value, label: CARE_ZONE_LABELS[value] }))

export function CareZonesPicker({
  value,
  onChange,
}: {
  value: readonly CareZone[] | undefined
  onChange: (next: CareZone[]) => void
}) {
  const zones = value ?? []
  return (
    <MultiChoiceGroup
      label="Zonas a cuidar"
      hint="Molestias o lesiones que duran. AXIS deja fuera los ejercicios que las cargan."
      options={ZONE_OPTIONS}
      value={zones}
      onToggle={(zone) =>
        onChange(
          zones.includes(zone)
            ? zones.filter((item) => item !== zone)
            : CARE_ZONE_ORDER.filter((item) => item === zone || zones.includes(item)),
        )
      }
    />
  )
}
