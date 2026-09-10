'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react'
import {
  ChoiceGroup,
  FieldLabel,
  MultiChoiceGroup,
  PrimaryButton,
  StepperField,
  TextField,
  WeekdayPicker,
} from '@/components/profile/controls'
import type { ActivityIntensity, TrainingGoal, UserProfileDraft } from '@/lib/domain/profile/types'
import {
  EXPERIENCE_LABELS,
  isGoalSelectionValid,
  MAX_GOALS,
  normalizeGoals,
  TRAINING_GOAL_LABELS,
  TRAINING_GOAL_ORDER,
  type ExperienceLevel,
} from '@/lib/domain/profile/types'
import { WEEKDAY_LABELS, type Weekday } from '@/lib/domain/shared/dates'
import { MUSCLE_GROUP_LABELS } from '@/lib/domain/workouts/types'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * Onboarding paso a paso.
 *
 * Una pantalla, una pregunta. Las respuestas viven en un único borrador, así que
 * volver atrás no pierde nada.
 *
 * Los deportes generan pasos propios: por cada deporte añadido se pregunta qué días
 * se practica y con qué intensidad. Al terminar, cada par (deporte × día) se guarda
 * como una **actividad del calendario**, que es la estructura que AXIS ya usa para
 * decidir. No hay una lista de deportes aparte.
 */

const DEFAULT_DRAFT: UserProfileDraft = {
  name: '',
  age: 15,
  heightCm: 170,
  weightKg: 65,
  goals: [],
  experience: 'principiante',
  availableWeekdays: [0, 2, 4],
  typicalSessionMinutes: 45,
}

type SportDraft = {
  name: string
  weekdays: Weekday[]
  intensity: ActivityIntensity
  /** AXIS lo usa para no encadenar una sesión de piernas con el deporte. */
  loadsLegs: boolean
}

const GOAL_OPTIONS = TRAINING_GOAL_ORDER.map((value) => ({
  value,
  label: TRAINING_GOAL_LABELS[value],
}))

const EXPERIENCE_OPTIONS = Object.entries(EXPERIENCE_LABELS).map(([value, label]) => ({
  value: value as ExperienceLevel,
  label,
}))

/** Con una explicación corta para que la elección signifique algo. */
const INTENSITY_OPTIONS: { value: ActivityIntensity; label: string; hint: string }[] = [
  { value: 'baja', label: 'Suave', hint: 'Acabas fresco. Técnica, paseo, sesión tranquila.' },
  { value: 'media', label: 'Moderada', hint: 'Sudas y cansa, pero podrías repetir el mismo día.' },
  { value: 'alta', label: 'Alta', hint: 'Acabas fundido. Partido, competición, entreno duro.' },
]

type StepId =
  | 'name'
  | 'age'
  | 'goals'
  | 'experience'
  | 'weekdays'
  | 'duration'
  | 'body'
  | 'sports'
  | { kind: 'sport-days'; sportIndex: number }
  | { kind: 'sport-intensity'; sportIndex: number }

type Step = {
  key: string
  id: StepId
  question: string
  hint?: string
  canContinue: boolean
}

export function OnboardingScreen() {
  const { saveProfile, addActivity } = useAxtlhetics()

  const [draft, setDraft] = useState<UserProfileDraft>(DEFAULT_DRAFT)
  const [sports, setSports] = useState<SportDraft[]>([])
  const [sportName, setSportName] = useState('')
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)

  /**
   * Los pasos se recalculan a partir de los deportes añadidos: añadir uno inserta
   * sus dos preguntas antes del final, y quitarlo las retira.
   */
  const steps = useMemo<Step[]>(() => {
    const base: Step[] = [
      {
        key: 'name',
        id: 'name',
        question: '¿Cómo te llamas?',
        hint: 'Solo para saludarte. No sale de este dispositivo.',
        canContinue: draft.name.trim().length > 0,
      },
      {
        key: 'age',
        id: 'age',
        question: '¿Cuántos años tienes?',
        hint: 'AXIS la usa para interpretar tu descanso: la referencia de sueño no es la misma a los 15 que a los 40.',
        canContinue: true,
      },
      {
        key: 'goals',
        id: 'goals',
        question: '¿Qué quieres conseguir?',
        hint: `Puedes elegir hasta ${MAX_GOALS}. AXIS los tiene todos en cuenta a la vez.`,
        canContinue: isGoalSelectionValid(draft.goals),
      },
      {
        key: 'experience',
        id: 'experience',
        question: '¿Cuánta experiencia tienes entrenando?',
        hint: 'Marca el punto de partida de la dificultad.',
        canContinue: true,
      },
      {
        key: 'weekdays',
        id: 'weekdays',
        question: '¿Qué días puedes entrenar?',
        hint: 'AXIS no te propondrá entrenar un día que no has marcado.',
        canContinue: draft.availableWeekdays.length > 0,
      },
      {
        key: 'duration',
        id: 'duration',
        question: '¿Cuánto tiempo sueles tener?',
        hint: 'Determina cuántos ejercicios entran en la sesión.',
        canContinue: true,
      },
      {
        key: 'body',
        id: 'body',
        question: '¿Cuánto mides y cuánto pesas?',
        hint: 'Contexto para AXIS. Puedes cambiarlo cuando quieras.',
        canContinue: true,
      },
      {
        key: 'sports',
        id: 'sports',
        question: '¿Practicas algún deporte?',
        hint: 'AXIS los tendrá en cuenta para no proponerte una sesión que choque con ellos.',
        canContinue: true,
      },
    ]

    const perSport = sports.flatMap((sport, sportIndex) => [
      {
        key: `sport-days-${sportIndex}`,
        id: { kind: 'sport-days' as const, sportIndex },
        question: `¿Qué días haces ${sport.name}?`,
        hint: 'Marca todos los que correspondan.',
        canContinue: sport.weekdays.length > 0,
      },
      {
        key: `sport-intensity-${sportIndex}`,
        id: { kind: 'sport-intensity' as const, sportIndex },
        question: `¿Con qué intensidad sueles hacer ${sport.name}?`,
        canContinue: true,
      },
    ])

    return [...base, ...perSport]
  }, [draft.name, draft.goals, draft.availableWeekdays, sports])

  const safeIndex = Math.min(index, steps.length - 1)
  const step = steps[safeIndex]
  const isLast = safeIndex === steps.length - 1

  const patch = (changes: Partial<UserProfileDraft>) =>
    setDraft((current) => ({ ...current, ...changes }))

  const patchSport = (sportIndex: number, changes: Partial<SportDraft>) =>
    setSports((current) =>
      current.map((sport, i) => (i === sportIndex ? { ...sport, ...changes } : sport)),
    )

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

  const addSport = () => {
    const name = sportName.trim()
    if (name.length === 0) return
    if (sports.some((sport) => sport.name.toLowerCase() === name.toLowerCase())) return

    setSports((current) => [
      ...current,
      { name, weekdays: [], intensity: 'media', loadsLegs: false },
    ])
    setSportName('')
  }

  const removeSport = (sportIndex: number) =>
    setSports((current) => current.filter((_, i) => i !== sportIndex))

  const goBack = () => setIndex((current) => Math.max(0, current - 1))

  const goNext = async () => {
    if (!step.canContinue || saving) return

    if (!isLast) {
      setIndex((current) => current + 1)
      return
    }

    setSaving(true)
    await saveProfile({ ...draft, name: draft.name.trim() })

    // Cada par (deporte × día) es una actividad del calendario. Sin hora: en el
    // onboarding se pregunta qué días y cuánto carga, no a qué hora.
    for (const sport of sports) {
      for (const weekday of sport.weekdays) {
        await addActivity({
          name: sport.name,
          weekday,
          startMinute: null,
          endMinute: null,
          intensity: sport.intensity,
          loadsMuscleGroups: sport.loadsLegs ? ['piernas', 'gluteos'] : [],
        })
      }
    }

    setSaving(false)
  }

  const sportForStep =
    typeof step.id === 'object' ? sports[step.id.sportIndex] : undefined

  return (
    <div className="flex min-h-full flex-col px-6 pb-10">
      <header className="flex items-center justify-between pt-2 pb-8">
        {safeIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver a la pregunta anterior"
            className="ax-press -ml-2 flex h-11 w-11 items-center justify-center"
          >
            <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
          </button>
        ) : (
          <span className="text-[15px] font-bold tracking-[0.18em] text-foreground">
            AXTHLETICS
          </span>
        )}

        <span className="text-[12.5px] font-medium tabular-nums text-muted-foreground">
          {safeIndex + 1} de {steps.length}
        </span>
      </header>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${((safeIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div key={step.key} className="ax-enter flex flex-1 flex-col pt-10">
        <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-balance">
          {step.question}
        </h1>
        {step.hint && (
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {step.hint}
          </p>
        )}

        <div className="mt-8">
          {step.id === 'name' && (
            <TextField
              label="Tu nombre"
              value={draft.name}
              placeholder="Alex"
              onChange={(name) => patch({ name })}
            />
          )}

          {step.id === 'age' && (
            <StepperField
              label="Edad"
              value={draft.age}
              unit="años"
              min={10}
              max={99}
              onChange={(age) => patch({ age })}
            />
          )}

          {step.id === 'goals' && (
            <MultiChoiceGroup
              label="Selecciona uno o varios"
              options={GOAL_OPTIONS}
              value={draft.goals}
              max={MAX_GOALS}
              onToggle={toggleGoal}
            />
          )}

          {step.id === 'experience' && (
            <ChoiceGroup
              label="Tu nivel"
              options={EXPERIENCE_OPTIONS}
              value={draft.experience}
              onChange={(experience) => patch({ experience })}
            />
          )}

          {step.id === 'weekdays' && (
            <WeekdayPicker
              label="Días disponibles"
              value={draft.availableWeekdays}
              onToggle={toggleWeekday}
            />
          )}

          {step.id === 'duration' && (
            <StepperField
              label="Duración habitual"
              value={draft.typicalSessionMinutes}
              unit="min"
              step={5}
              min={20}
              max={120}
              onChange={(typicalSessionMinutes) => patch({ typicalSessionMinutes })}
            />
          )}

          {step.id === 'body' && (
            <div className="divide-y divide-border">
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
          )}

          {step.id === 'sports' && (
            <SportsPicker
              sports={sports}
              value={sportName}
              onChange={setSportName}
              onAdd={addSport}
              onRemove={removeSport}
            />
          )}

          {typeof step.id === 'object' && step.id.kind === 'sport-days' && sportForStep && (
            <WeekdayPicker
              label={`Días de ${sportForStep.name}`}
              value={sportForStep.weekdays}
              onToggle={(weekday) => {
                const current = sportForStep.weekdays
                patchSport((step.id as { sportIndex: number }).sportIndex, {
                  weekdays: current.includes(weekday as Weekday)
                    ? current.filter((day) => day !== weekday)
                    : [...current, weekday as Weekday].sort((a, b) => a - b),
                })
              }}
            />
          )}

          {typeof step.id === 'object' && step.id.kind === 'sport-intensity' && sportForStep && (
            <IntensityPicker
              sport={sportForStep}
              onSelect={(intensity) =>
                patchSport((step.id as { sportIndex: number }).sportIndex, { intensity })
              }
              onToggleLegs={() =>
                patchSport((step.id as { sportIndex: number }).sportIndex, {
                  loadsLegs: !sportForStep.loadsLegs,
                })
              }
            />
          )}
        </div>
      </div>

      <div className="mt-10">
        <PrimaryButton onClick={() => void goNext()} disabled={!step.canContinue || saving}>
          {isLast ? 'Empezar' : 'Continuar'}
          <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  )
}

/** Añadir deportes uno a uno. Sin lista cerrada: cada persona practica lo suyo. */
function SportsPicker({
  sports,
  value,
  onChange,
  onAdd,
  onRemove,
}: {
  sports: SportDraft[]
  value: string
  onChange: (next: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  return (
    <div>
      <TextField label="Deporte" value={value} placeholder="Baloncesto" onChange={onChange} />

      <button
        type="button"
        onClick={onAdd}
        disabled={value.trim().length === 0}
        className="ax-press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[14px] font-semibold text-primary disabled:opacity-35"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Añadir deporte
      </button>

      {sports.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {sports.map((sport, index) => (
            <li
              key={sport.name}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{sport.name}</span>
                {sport.weekdays.length > 0 && (
                  <span className="block text-[12.5px] text-muted-foreground">
                    {sport.weekdays.map((day) => WEEKDAY_LABELS[day]).join(', ')}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Quitar ${sport.name}`}
                className="ax-press flex h-11 w-11 items-center justify-center text-muted-foreground"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13.5px] text-muted-foreground">
          Puedes seguir sin añadir ninguno y hacerlo más tarde desde tu perfil.
        </p>
      )}
    </div>
  )
}

/** Intensidad con una explicación por opción, para que la elección signifique algo. */
function IntensityPicker({
  sport,
  onSelect,
  onToggleLegs,
}: {
  sport: SportDraft
  onSelect: (intensity: ActivityIntensity) => void
  onToggleLegs: () => void
}) {
  return (
    <div>
      <ul className="space-y-2.5">
        {INTENSITY_OPTIONS.map((option) => {
          const selected = sport.intensity === option.value
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => onSelect(option.value)}
                aria-pressed={selected}
                className={cn(
                  'ax-press w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background',
                )}
              >
                <span className="block text-[15px] font-semibold">{option.label}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-[13px] leading-snug',
                    selected ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {option.hint}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-6">
        <FieldLabel>¿Carga mucho las piernas?</FieldLabel>
        <button
          type="button"
          onClick={onToggleLegs}
          aria-pressed={sport.loadsLegs}
          className={cn(
            'ax-press mt-2.5 min-h-11 rounded-full border px-4 text-[14px] font-medium transition-colors',
            sport.loadsLegs
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground',
          )}
        >
          Sí, carga {MUSCLE_GROUP_LABELS.piernas.toLowerCase()}
        </button>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          Si lo marcas, AXIS evitará encadenar una sesión de piernas exigente el mismo día.
        </p>
      </div>
    </div>
  )
}
