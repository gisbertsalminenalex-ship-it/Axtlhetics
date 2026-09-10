'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import {
  ChoiceGroup,
  FieldLabel,
  MultiChoiceGroup,
  PrimaryButton,
  SectionTitle,
  StepperField,
  TextField,
  WeekdayPicker,
} from '@/components/profile/controls'
import type { ActivityIntensity, UserProfileDraft } from '@/lib/domain/profile/types'
import {
  ACTIVITY_INTENSITY_LABELS,
  EXPERIENCE_LABELS,
  isGoalSelectionValid,
  MAX_GOALS,
  normalizeGoals,
  TRAINING_GOAL_LABELS,
  TRAINING_GOAL_ORDER,
  type ExperienceLevel,
  type TrainingGoal,
} from '@/lib/domain/profile/types'
import { formatMinutesOfDay, minutesFromMidnight, WEEKDAY_LABELS, type Weekday } from '@/lib/domain/shared/dates'
import { MUSCLE_GROUP_LABELS } from '@/lib/domain/workouts/types'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * Perfil y actividades.
 *
 * Pantalla **interna**, nunca una pestaña. Es el contexto que AXIS necesita para
 * personalizar sus recomendaciones, no un perfil social.
 */

const DEFAULT_DRAFT: UserProfileDraft = {
  name: '',
  age: 15,
  heightCm: 170,
  weightKg: 65,
  goals: ['salud_general'],
  experience: 'principiante',
  availableWeekdays: [0, 2, 4],
  typicalSessionMinutes: 45,
}

const GOAL_OPTIONS = TRAINING_GOAL_ORDER.map((value) => ({
  value,
  label: TRAINING_GOAL_LABELS[value],
}))

const EXPERIENCE_OPTIONS = Object.entries(EXPERIENCE_LABELS).map(([value, label]) => ({
  value: value as ExperienceLevel,
  label,
}))

const INTENSITY_OPTIONS = Object.entries(ACTIVITY_INTENSITY_LABELS).map(([value, label]) => ({
  value: value as ActivityIntensity,
  label,
}))

export function PerfilScreen({
  mode,
  onClose,
}: {
  mode: 'onboarding' | 'edit'
  onClose?: () => void
}) {
  const { profile, activities, saveProfile, addActivity, removeActivity } = useAxtlhetics()

  const [draft, setDraft] = useState<UserProfileDraft>(() =>
    profile
      ? {
          name: profile.name,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          goals: [...profile.goals],
          experience: profile.experience,
          availableWeekdays: [...profile.availableWeekdays],
          typicalSessionMinutes: profile.typicalSessionMinutes,
        }
      : DEFAULT_DRAFT,
  )
  const [saving, setSaving] = useState(false)

  const isOnboarding = mode === 'onboarding'
  const canSave =
    draft.name.trim().length > 0 &&
    draft.availableWeekdays.length > 0 &&
    isGoalSelectionValid(draft.goals)

  const patch = (changes: Partial<UserProfileDraft>) =>
    setDraft((current) => ({ ...current, ...changes }))

  const toggleGoal = (goal: TrainingGoal) =>
    setDraft((current) => ({
      ...current,
      goals: current.goals.includes(goal)
        ? current.goals.filter((item) => item !== goal)
        : normalizeGoals([...current.goals, goal]),
    }))

  const toggleWeekday = (weekday: number) =>
    setDraft((current) => ({
      ...current,
      availableWeekdays: current.availableWeekdays.includes(weekday as Weekday)
        ? current.availableWeekdays.filter((day) => day !== weekday)
        : [...current.availableWeekdays, weekday as Weekday].sort((a, b) => a - b),
    }))

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    await saveProfile({
      ...draft,
      name: draft.name.trim(),
    })
    setSaving(false)
    onClose?.()
  }

  return (
    <div className="px-6 pb-10">
      <header className="flex items-center justify-between pt-2 pb-6">
        {isOnboarding ? (
          <span className="text-[15px] font-bold tracking-[0.18em] text-foreground">
            AXTHLETICS
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver"
              className="-ml-2 flex h-11 w-11 items-center justify-center"
            >
              <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
            </button>
            <h1 className="text-[16px] font-semibold tracking-[-0.01em]">Tu perfil</h1>
            <span className="h-11 w-11" aria-hidden="true" />
          </>
        )}
      </header>

      {isOnboarding && (
        <>
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-balance">
            Empecemos por ti.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            AXIS necesita conocerte para decidir qué entrenamiento tiene sentido cada día.
            Puedes cambiarlo cuando quieras.
          </p>
        </>
      )}

      <SectionTitle>Sobre ti</SectionTitle>
      <div className="mt-1 divide-y divide-border">
        <TextField
          label="Nombre"
          value={draft.name}
          placeholder="¿Cómo te llamas?"
          onChange={(name) => patch({ name })}
        />
        <StepperField
          label="Edad"
          value={draft.age}
          unit="años"
          min={10}
          max={99}
          onChange={(age) => patch({ age })}
        />
        <StepperField
          label="Altura"
          value={draft.heightCm}
          unit="cm"
          min={120}
          max={230}
          onChange={(heightCm) => patch({ heightCm })}
        />
        <StepperField
          label="Peso"
          value={draft.weightKg}
          unit="kg"
          step={0.5}
          min={30}
          max={200}
          onChange={(weightKg) => patch({ weightKg })}
        />
      </div>

      <SectionTitle>Tu objetivo</SectionTitle>
      <div className="mt-1 divide-y divide-border">
        <MultiChoiceGroup
          label="¿Qué buscas ahora mismo?"
          hint={`Puedes elegir hasta ${MAX_GOALS}.`}
          options={GOAL_OPTIONS}
          value={draft.goals}
          max={MAX_GOALS}
          onToggle={toggleGoal}
        />
        <ChoiceGroup
          label="Experiencia entrenando"
          options={EXPERIENCE_OPTIONS}
          value={draft.experience}
          onChange={(experience) => patch({ experience })}
        />
      </div>

      <SectionTitle>Tu disponibilidad</SectionTitle>
      <div className="mt-1 divide-y divide-border">
        <WeekdayPicker
          label="Días que puedes entrenar"
          value={draft.availableWeekdays}
          onToggle={toggleWeekday}
        />
        <StepperField
          label="Duración habitual"
          value={draft.typicalSessionMinutes}
          unit="min"
          step={5}
          min={20}
          max={120}
          onChange={(typicalSessionMinutes) => patch({ typicalSessionMinutes })}
        />
      </div>

      <SectionTitle>Actividades con horario</SectionTitle>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        Si tienes entrenamientos o partidos fijos, AXIS los tendrá en cuenta para no
        proponerte una sesión que interfiera.
      </p>

      <ul className="mt-4 space-y-2.5">
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{activity.name}</span>
              <span className="block text-[12.5px] text-muted-foreground">
                {WEEKDAY_LABELS[activity.weekday]}
                {activity.startMinute !== null && activity.endMinute !== null
                  ? ` · ${formatMinutesOfDay(activity.startMinute)}–${formatMinutesOfDay(activity.endMinute)}`
                  : ''}
                {` · ${ACTIVITY_INTENSITY_LABELS[activity.intensity]}`}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void removeActivity(activity.id)}
              aria-label={`Eliminar ${activity.name}`}
              className="ax-press flex h-11 w-11 items-center justify-center text-muted-foreground"
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </li>
        ))}
        {activities.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
            Todavía no has añadido ninguna actividad.
          </li>
        )}
      </ul>

      <ActivityForm onAdd={addActivity} />

      <div className="mt-9">
        <PrimaryButton onClick={() => void handleSave()} disabled={!canSave || saving}>
          {isOnboarding ? 'Empezar' : 'Guardar cambios'}
          {isOnboarding && <ArrowRight className="h-4 w-4" />}
        </PrimaryButton>
        {!canSave && (
          <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
            Añade tu nombre, un objetivo y al menos un día disponible.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alta de actividad
// ---------------------------------------------------------------------------

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => 7 + i)

function ActivityForm({
  onAdd,
}: {
  onAdd: (draft: {
    name: string
    weekday: Weekday
    startMinute: number
    endMinute: number
    intensity: ActivityIntensity
    loadsMuscleGroups: string[]
  }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [weekday, setWeekday] = useState<Weekday>(0)
  const [startHour, setStartHour] = useState(20)
  const [durationHours, setDurationHours] = useState(2)
  const [intensity, setIntensity] = useState<ActivityIntensity>('alta')
  const [loadsLegs, setLoadsLegs] = useState(true)

  const reset = () => {
    setName('')
    setStartHour(20)
    setDurationHours(2)
    setIntensity('alta')
    setLoadsLegs(true)
    setOpen(false)
  }

  const submit = async () => {
    if (name.trim().length === 0) return
    await onAdd({
      name: name.trim(),
      weekday,
      startMinute: minutesFromMidnight(startHour, 0),
      endMinute: minutesFromMidnight(Math.min(startHour + durationHours, 23), 0),
      intensity,
      loadsMuscleGroups: loadsLegs ? ['piernas', 'gluteos'] : [],
    })
    reset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ax-press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[14px] font-semibold text-primary"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Añadir actividad
      </button>
    )
  }

  return (
    <div className="ax-enter mt-3 rounded-2xl border border-border bg-surface p-4">
      <TextField
        label="Actividad"
        value={name}
        placeholder="Baloncesto"
        onChange={setName}
      />

      <div className="py-3">
        <FieldLabel>Día</FieldLabel>
        <div className="mt-2.5 flex justify-between gap-1.5">
          {(['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const).map((initial, index) => (
            <button
              key={initial}
              type="button"
              onClick={() => setWeekday(index as Weekday)}
              aria-pressed={weekday === index}
              aria-label={WEEKDAY_LABELS[index as Weekday]}
              className={
                weekday === index
                  ? 'h-11 flex-1 rounded-full border border-primary bg-primary text-[14px] font-semibold text-primary-foreground'
                  : 'h-11 flex-1 rounded-full border border-border bg-background text-[14px] font-semibold text-muted-foreground'
              }
            >
              {initial}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 py-3">
        <FieldLabel>Empieza a las</FieldLabel>
        <select
          value={startHour}
          onChange={(event) => setStartHour(Number(event.target.value))}
          aria-label="Hora de inicio"
          className="h-11 rounded-2xl border border-border bg-background px-3 text-[15px] font-semibold tabular-nums outline-none"
        >
          {HOUR_OPTIONS.map((hour) => (
            <option key={hour} value={hour}>
              {formatMinutesOfDay(minutesFromMidnight(hour, 0))}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 py-3">
        <FieldLabel>Duración</FieldLabel>
        <select
          value={durationHours}
          onChange={(event) => setDurationHours(Number(event.target.value))}
          aria-label="Duración"
          className="h-11 rounded-2xl border border-border bg-background px-3 text-[15px] font-semibold tabular-nums outline-none"
        >
          {[1, 2, 3].map((hours) => (
            <option key={hours} value={hours}>
              {hours} h
            </option>
          ))}
        </select>
      </div>

      <ChoiceGroup
        label="Exigencia"
        options={INTENSITY_OPTIONS}
        value={intensity}
        onChange={setIntensity}
      />

      <button
        type="button"
        onClick={() => setLoadsLegs((current) => !current)}
        aria-pressed={loadsLegs}
        className={
          loadsLegs
            ? 'min-h-11 rounded-full border border-primary bg-primary px-4 text-[14px] font-medium text-primary-foreground'
            : 'min-h-11 rounded-full border border-border bg-background px-4 text-[14px] font-medium text-muted-foreground'
        }
      >
        Carga {MUSCLE_GROUP_LABELS.piernas.toLowerCase()}
      </button>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="h-12 flex-1 rounded-2xl border border-border bg-background text-[14px] font-semibold text-muted-foreground"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={name.trim().length === 0}
          className="h-12 flex-1 rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          Añadir
        </button>
      </div>
    </div>
  )
}
