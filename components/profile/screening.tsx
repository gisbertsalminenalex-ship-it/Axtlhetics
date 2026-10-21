'use client'

import { ChoiceGroup } from '@/components/profile/controls'
import {
  HEALTH_QUESTION_LABELS,
  HEALTH_QUESTION_ORDER,
  TRAINING_HISTORY_LABELS,
  TRAINING_STATUS_LABELS,
  type HealthQuestion,
  type HealthScreen,
  type TrainingBackground,
  type TrainingHistory,
  type TrainingStatus,
} from '@/lib/domain/profile/screening'
import { cn } from '@/lib/utils'

/**
 * La evaluación inicial (D-058): la historia de entrenamiento y las preguntas
 * de salud. Los comparten el onboarding y Perfil, como el resto del formulario.
 */

const HISTORY_OPTIONS = (Object.keys(TRAINING_HISTORY_LABELS) as TrainingHistory[]).map((value) => ({
  value,
  label: TRAINING_HISTORY_LABELS[value],
}))

const STATUS_OPTIONS = (Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((value) => ({
  value,
  label: TRAINING_STATUS_LABELS[value],
}))

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: TrainingBackground | undefined
  onChange: (next: TrainingBackground) => void
}) {
  return (
    <>
      <ChoiceGroup
        label="Cuánto llevas entrenando"
        options={HISTORY_OPTIONS}
        value={value?.history ?? null}
        // Quien nunca ha entrenado empieza de cero: lo mismo que volver tras un parón largo.
        onChange={(history) => {
          const keep = value && value.history !== 'nunca' ? value.status : 'entrenando'
          onChange({ history, status: history === 'nunca' ? 'parado_largo' : keep })
        }}
      />
      {value && value.history !== 'nunca' && (
        <ChoiceGroup
          label="Ahora mismo"
          options={STATUS_OPTIONS}
          value={value.status}
          onChange={(status) => onChange({ ...value, status })}
        />
      )}
    </>
  )
}

export const NO_HEALTH_FLAGS: HealthScreen = { flags: [], cleared: false }

export function HealthQuestions({
  value,
  onChange,
  showClearance = false,
}: {
  value: HealthScreen | undefined
  onChange: (next: HealthScreen) => void
  /** En Perfil: marcar que un médico ya dio el visto bueno. */
  showClearance?: boolean
}) {
  const current = value ?? NO_HEALTH_FLAGS
  const set = (question: HealthQuestion, yes: boolean) => {
    const flags = HEALTH_QUESTION_ORDER.filter((item) => (item === question ? yes : current.flags.includes(item)))
    // Una respuesta nueva con «sí» pide un visto bueno nuevo.
    onChange({ flags, cleared: yes && !current.flags.includes(question) ? false : current.cleared })
  }

  return (
    <div className="py-1">
      <ul className="divide-y divide-border">
        {HEALTH_QUESTION_ORDER.map((question) => {
          const yes = current.flags.includes(question)
          return (
            <li key={question} className="flex items-center gap-3 py-3">
              <span className="flex-1 text-[14px] leading-snug text-pretty">{HEALTH_QUESTION_LABELS[question]}</span>
              <span className="flex shrink-0 gap-1.5" role="group" aria-label={HEALTH_QUESTION_LABELS[question]}>
                <AnswerButton selected={!yes} onClick={() => set(question, false)}>
                  No
                </AnswerButton>
                <AnswerButton selected={yes} onClick={() => set(question, true)}>
                  Sí
                </AnswerButton>
              </span>
            </li>
          )
        })}
      </ul>
      {current.flags.length > 0 && (
        <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-pretty">
          Consulta con tu médico antes de empezar a entrenar o de subir la intensidad. AXIS no diagnostica nada; hasta
          que te dé el visto bueno, no te propondrá días fuertes.
        </p>
      )}
      {showClearance && current.flags.length > 0 && (
        <button
          type="button"
          onClick={() => onChange({ ...current, cleared: !current.cleared })}
          aria-pressed={current.cleared}
          className={cn(
            'ax-press mt-3 min-h-11 w-full rounded-full border px-4 text-[14px] font-medium transition-colors',
            current.cleared
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground',
          )}
        >
          Mi médico me ha dado el visto bueno
        </button>
      )}
    </div>
  )
}

function AnswerButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'ax-press h-11 min-w-11 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}
