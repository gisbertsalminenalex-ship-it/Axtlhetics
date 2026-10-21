'use client'

import { useState } from 'react'
import { GoalTargets } from '@/components/profile/goal-targets'
import { DislikedExercises } from '@/components/profile/disliked-exercises'
import { DailyReminder } from '@/components/profile/daily-reminder'
import { TrainingNotifications } from '@/components/profile/training-notifications'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { BackupControls } from '@/components/profile/backup-controls'
import { EquipmentPicker } from '@/components/profile/equipment-picker'
import { CareZonesPicker, SexPicker } from '@/components/profile/about-you'
import { BackgroundPicker, HealthQuestions, NO_HEALTH_FLAGS } from '@/components/profile/screening'
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
  isDatedActivity,
  isGoalSelectionValid,
  MAX_GOALS,
  normalizeGoals,
  TRAINING_GOAL_LABELS,
  TRAINING_GOAL_ORDER,
  type ExperienceLevel,
  type TrainingGoal,
} from '@/lib/domain/profile/types'
import {
  addDays,
  formatMinutesOfDay,
  formatShortDate,
  minutesFromMidnight,
  WEEKDAY_LABELS,
  weekdayOfKey,
  type DayKey,
  type Weekday,
} from '@/lib/domain/shared/dates'
import { MUSCLE_GROUP_LABELS } from '@/lib/domain/workouts/types'
import { equipmentOf, NO_EQUIPMENT } from '@/lib/domain/workouts/equipment'
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
  equipment: NO_EQUIPMENT,
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

/** Cada semana, o solo un día concreto, como un partido (D-018). */
type ActivityRecurrence = 'weekly' | 'dated'

const RECURRENCE_OPTIONS: { value: ActivityRecurrence; label: string }[] = [
  { value: 'weekly', label: 'Cada semana' },
  { value: 'dated', label: 'Un día concreto' },
]

/** Cuántos días por delante se pueden elegir para un partido. */
const DATE_CHOICE_DAYS = 28

/**
 * Los días que se pueden elegir, en `DayKey` local desde hoy. Si la actividad ya
 * tiene una fecha fuera de esa ventana —un partido pasado—, se incluye para que
 * el selector no la cambie sin que el usuario lo pida.
 */
function dateChoices(today: DayKey, current: DayKey | null = null): DayKey[] {
  const days = Array.from({ length: DATE_CHOICE_DAYS }, (_, i) => addDays(today, i))
  return current && !days.includes(current) ? [current, ...days] : days
}

function dateLabel(key: DayKey, today: DayKey): string {
  if (key === today) return 'Hoy'
  if (key === addDays(today, 1)) return 'Mañana'
  return formatShortDate(key)
}

export function PerfilScreen({
  mode,
  onClose,
}: {
  mode: 'onboarding' | 'edit'
  onClose?: () => void
}) {
  const { profile, activities, today, saveProfile, addActivity, updateActivity, removeActivity } =
    useAxtlhetics()

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
          // Un perfil anterior a D-046 se enseña con la pesa de 5 kg que se le supone.
          equipment: equipmentOf(profile),
          sex: profile.sex ?? null,
          careZones: [...(profile.careZones ?? [])],
          // La evaluación inicial (D-058): sin contestar sigue sin contestar hasta que se toque.
          ...(profile.health ? { health: { ...profile.health, flags: [...profile.health.flags] } } : {}),
          ...(profile.background ? { background: { ...profile.background } } : {}),
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
      // Las preguntas de salud se ven contestadas con «no» de partida: guardar las da por contestadas (D-058).
      health: draft.health ?? NO_HEALTH_FLAGS,
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
        <SexPicker value={draft.sex} onChange={(sex) => patch({ sex })} />
        <CareZonesPicker value={draft.careZones} onChange={(careZones) => patch({ careZones })} />
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
        <BackgroundPicker value={draft.background} onChange={(background) => patch({ background })} />
      </div>

      <SectionTitle>Tu salud</SectionTitle>
      <HealthQuestions value={draft.health} onChange={(health) => patch({ health })} showClearance />

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

      <SectionTitle>Tu material</SectionTitle>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        AXIS solo te propone ejercicios que puedes hacer con él, y con los pesos que tienes.
      </p>
      <div className="mt-1">
        <EquipmentPicker
          value={draft.equipment ?? NO_EQUIPMENT}
          onChange={(equipment) => patch({ equipment })}
        />
      </div>

      <SectionTitle>Tus deportes</SectionTitle>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        Entrenamientos de cada semana y partidos de un día concreto. AXIS los tiene en
        cuenta para no proponerte una sesión que interfiera.
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
                {isDatedActivity(activity)
                  ? `Solo el ${formatShortDate(activity.date).toLowerCase()}`
                  : `Cada ${WEEKDAY_LABELS[activity.weekday].toLowerCase()}`}
                {activity.startMinute !== null && activity.endMinute !== null
                  ? ` · ${formatMinutesOfDay(activity.startMinute)}–${formatMinutesOfDay(activity.endMinute)}`
                  : ''}
                {` · ${ACTIVITY_INTENSITY_LABELS[activity.intensity]}`}
              </span>
              {/* Un partido cambia de día sin borrarlo ni volver a crearlo. */}
              {isDatedActivity(activity) && (
                <select
                  value={activity.date}
                  onChange={(event) => void updateActivity(activity.id, { date: event.target.value })}
                  aria-label={`Fecha de ${activity.name}`}
                  className="mt-2 h-11 rounded-2xl border border-border bg-background px-3 text-[14px] font-semibold outline-none"
                >
                  {dateChoices(today, activity.date).map((day) => (
                    <option key={day} value={day}>
                      {dateLabel(day, today)}
                    </option>
                  ))}
                </select>
              )}
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

      <ActivityForm today={today} onAdd={addActivity} />

      {/* Objetivos medibles (D-035): necesitan un perfil guardado donde vivir. */}
      {!isOnboarding && <GoalTargets />}
      {!isOnboarding && <DislikedExercises />}
      {!isOnboarding && <TrainingNotifications />}
      {!isOnboarding && <DailyReminder />}

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

      {!isOnboarding && <BackupControls />}
      {!isOnboarding && <DangerZone />}
    </div>
  )
}

/**
 * Borrar todos los datos.
 *
 * No hay cuenta que cerrar: los datos viven solo en este dispositivo. «Cerrar
 * sesión» aquí significa borrarlos, y no hay copia en ningún sitio desde la que
 * recuperarlos, así que se pide confirmación explícita.
 *
 * La confirmación es un segundo botón dentro de la pantalla, no un `confirm()`
 * del navegador: un diálogo del sistema rompe la interfaz y bloquea la página.
 */
function DangerZone() {
  const { clearAllData, sessions } = useAxtlhetics()
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)

  return (
    <div className="mt-10 border-t border-border px-6 pt-6 pb-10">
      <SectionTitle>Tus datos</SectionTitle>

      {!confirming ? (
        <>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Todo lo que registras vive solo en este dispositivo. Puedes borrarlo cuando
            quieras y empezar de cero.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ax-press mt-4 min-h-11 w-full rounded-2xl border border-border bg-background text-[14px] font-semibold text-error"
          >
            Cerrar sesión y borrar mis datos
          </button>
        </>
      ) : (
        <div className="ax-enter mt-2">
          <p className="text-[13.5px] leading-relaxed">
            Se borrarán tu perfil, tus deportes, tu recuperación y{' '}
            {sessions.length === 1
              ? 'el entrenamiento que tienes guardado'
              : `los ${sessions.length} entrenamientos que tienes guardados`}
            . <span className="font-semibold">No se puede deshacer</span> y no hay copia
            en ningún otro sitio.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="ax-press h-12 flex-1 rounded-2xl border border-border bg-background text-[14px] font-semibold disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setClearing(true)
                void clearAllData()
              }}
              disabled={clearing}
              className="ax-press h-12 flex-1 rounded-2xl bg-error text-[14px] font-semibold text-white disabled:opacity-40"
            >
              {clearing ? 'Borrando…' : 'Borrar todo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
// ---------------------------------------------------------------------------
// Alta de actividad
// ---------------------------------------------------------------------------

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => 7 + i)

/**
 * Alta de un deporte, con el mismo modelo que usa el onboarding.
 *
 * Antes esto pedía **un** día y **una hora obligatoria**, mientras que el
 * onboarding pedía **varios días** y ninguna hora. Eran dos formas distintas de
 * registrar lo mismo, y el deporte que añadías aquí no se parecía al que habías
 * registrado al empezar.
 *
 * Ahora manda el modelo del onboarding: días e intensidad. La hora es opcional y
 * está plegada, porque casi nadie la necesita: AXIS solo la usa para saber si el
 * partido ya ha pasado, y sin ella lo trata como pendiente, que es lo prudente.
 *
 * Se crea una actividad por cada día marcado, igual que en el onboarding.
 *
 * Un partido puede ir en otra forma: **un día concreto** en vez de cada semana
 * (D-018). Entonces se elige una fecha y se crea una sola actividad con ella.
 */
function ActivityForm({
  today,
  onAdd,
}: {
  today: DayKey
  onAdd: (draft: {
    name: string
    weekday: Weekday
    date: DayKey | null
    startMinute: number | null
    endMinute: number | null
    intensity: ActivityIntensity
    loadsMuscleGroups: string[]
  }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [recurrence, setRecurrence] = useState<ActivityRecurrence>('weekly')
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [date, setDate] = useState<DayKey>(today)
  const [withSchedule, setWithSchedule] = useState(false)
  const [startHour, setStartHour] = useState(20)
  const [durationHours, setDurationHours] = useState(2)
  const [intensity, setIntensity] = useState<ActivityIntensity>('alta')
  const [loadsLegs, setLoadsLegs] = useState(true)
  const [saving, setSaving] = useState(false)

  const canSave =
    name.trim().length > 0 && (recurrence === 'dated' || weekdays.length > 0)

  const reset = () => {
    setName('')
    setRecurrence('weekly')
    setWeekdays([])
    setDate(today)
    setWithSchedule(false)
    setStartHour(20)
    setDurationHours(2)
    setIntensity('alta')
    setLoadsLegs(true)
    setOpen(false)
  }

  const toggleWeekday = (day: number) => {
    setWeekdays((current) =>
      current.includes(day as Weekday)
        ? current.filter((value) => value !== day)
        : [...current, day as Weekday].sort((a, b) => a - b),
    )
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)

    const common = {
      name: name.trim(),
      startMinute: withSchedule ? minutesFromMidnight(startHour, 0) : null,
      endMinute: withSchedule
        ? minutesFromMidnight(Math.min(startHour + durationHours, 23), 0)
        : null,
      intensity,
      loadsMuscleGroups: loadsLegs ? ['piernas', 'gluteos'] : [],
    }

    if (recurrence === 'dated') {
      // Un solo día: una sola actividad, con su fecha.
      await onAdd({ ...common, weekday: weekdayOfKey(date), date })
    } else {
      // Una actividad por día, como en el onboarding.
      for (const weekday of weekdays) {
        await onAdd({ ...common, weekday, date: null })
      }
    }

    setSaving(false)
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
      <TextField label="Actividad" value={name} placeholder="Baloncesto" onChange={setName} />

      <ChoiceGroup
        label="Cuándo"
        options={RECURRENCE_OPTIONS}
        value={recurrence}
        onChange={setRecurrence}
      />

      {recurrence === 'weekly' ? (
        <WeekdayPicker label="Qué días" value={weekdays} onToggle={toggleWeekday} />
      ) : (
        <div className="flex items-center justify-between gap-3 py-2">
          <FieldLabel>Qué día</FieldLabel>
          <select
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Qué día"
            className="h-11 rounded-2xl border border-border bg-background px-3 text-[15px] font-semibold outline-none"
          >
            {dateChoices(today, date).map((day) => (
              <option key={day} value={day}>
                {dateLabel(day, today)}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {/*
        La hora, plegada. AXIS funciona sin ella: sin horario trata la actividad
        como pendiente, que es lo conservador. Solo aporta si el deporte es
        siempre a la misma hora y quieres que AXIS sepa si ya ha pasado.
      */}
      <button
        type="button"
        onClick={() => setWithSchedule((current) => !current)}
        aria-pressed={withSchedule}
        className="ax-press mt-4 min-h-11 w-full text-left text-[13.5px] font-medium text-muted-foreground"
      >
        {withSchedule ? '− Quitar la hora' : '+ Añadir una hora fija (opcional)'}
      </button>

      {withSchedule && (
        <div className="ax-enter">
          <div className="flex items-center justify-between gap-3 py-2">
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

          <div className="flex items-center justify-between gap-3 py-2">
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
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="ax-press h-12 flex-1 rounded-2xl border border-border bg-background text-[14px] font-semibold text-muted-foreground disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSave || saving}
          className="ax-press h-12 flex-1 rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Añadir'}
        </button>
      </div>

      {!canSave && (
        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
          Ponle nombre y marca al menos un día.
        </p>
      )}
    </div>
  )
}
