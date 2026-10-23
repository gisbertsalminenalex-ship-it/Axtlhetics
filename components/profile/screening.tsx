'use client'

import { useEffect, useState } from 'react'
import { ChoiceGroup } from '@/components/profile/controls'
import { describeHealthReading, hasNewFlag, type HealthReading } from '@/lib/domain/profile/health-note'
import {
  MAX_HEALTH_NOTE_LENGTH,
  TRAINING_HISTORY_LABELS,
  TRAINING_STATUS_LABELS,
  type HealthScreen,
  type TrainingBackground,
  type TrainingHistory,
  type TrainingStatus,
} from '@/lib/domain/profile/screening'
import type { CareZone } from '@/lib/domain/profile/types'
import { cn } from '@/lib/utils'

/**
 * La evaluación inicial (D-058): la historia de entrenamiento y la salud,
 * contada con palabras (D-064). Los comparten el onboarding y Perfil, como el resto del formulario.
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

type HealthChoice = 'ninguno' | 'escribir'

const HEALTH_OPTIONS: { value: HealthChoice; label: string }[] = [
  { value: 'ninguno', label: 'No tengo ningún problema de salud' },
  { value: 'escribir', label: 'Tengo algo que contar' },
]

function initialChoice(value: HealthScreen | undefined): HealthChoice | null {
  if (!value) return null
  // Un perfil anterior a D-064 con algún «sí» se enseña como algo contado.
  return value.note !== undefined || value.flags.length > 0 ? 'escribir' : 'ninguno'
}

/**
 * La salud contada con palabras (D-064): ninguna molestia, o lo que el usuario
 * escriba, que AXIS lee y convierte en señales y zonas a cuidar.
 *
 * Lo leído no se aplica hasta pulsar «Que AXIS lo lea»: mientras el texto
 * cambie sin leerse, `onPendingChange(true)` para que la pantalla no avance ni
 * guarde una nota que AXIS no ha entendido. Las zonas se entregan aparte
 * (`onZones`): el onboarding las pone tal cual, Perfil las suma a las suyas.
 */
export function HealthNote({
  value,
  onChange,
  onZones,
  onPendingChange,
  read,
  showClearance = false,
}: {
  value: HealthScreen | undefined
  onChange: (next: HealthScreen) => void
  onZones: (zones: CareZone[]) => void
  onPendingChange: (pending: boolean) => void
  read: (note: string) => Promise<HealthReading>
  /** En Perfil: marcar que un médico ya dio el visto bueno. */
  showClearance?: boolean
}) {
  const current = value ?? NO_HEALTH_FLAGS
  const [choice, setChoice] = useState<HealthChoice | null>(() => initialChoice(value))
  const [text, setText] = useState(value?.note ?? '')
  // El texto que refleja lo guardado en `value`: el de una nota ya leída cuenta como leído.
  const [readText, setReadText] = useState(value?.note ?? '')
  const [reading, setReading] = useState<HealthReading | null>(null)
  const [busy, setBusy] = useState(false)

  const note = text.trim()
  const pending =
    choice === 'escribir' &&
    (busy || note !== readText.trim() || (note.length === 0 && current.flags.length === 0))

  useEffect(() => {
    onPendingChange(pending)
  }, [pending, onPendingChange])

  const choose = (next: HealthChoice) => {
    setChoice(next)
    if (next === 'ninguno') {
      setText('')
      setReadText('')
      setReading(null)
      onChange(NO_HEALTH_FLAGS)
      onZones([])
    }
  }

  const readNote = async () => {
    if (note.length === 0 || busy) return
    setBusy(true)
    const result = await read(note)
    setBusy(false)
    setReading(result)
    setReadText(note)
    // Una señal nueva pide un visto bueno nuevo.
    onChange({ flags: result.flags, cleared: hasNewFlag(current.flags, result.flags) ? false : current.cleared, note })
    onZones(result.zones)
  }

  return (
    <div className="py-1">
      <ChoiceGroup label="¿Algo que AXIS deba tener en cuenta?" options={HEALTH_OPTIONS} value={choice} onChange={choose} />

      {choice === 'escribir' && (
        <div className="pb-1">
          <textarea
            value={text}
            maxLength={MAX_HEALTH_NOTE_LENGTH}
            rows={4}
            aria-label="Tu salud, con tus palabras"
            placeholder="Por ejemplo: me operaron de la rodilla derecha hace un año y tengo la tensión alta."
            onChange={(event) => setText(event.target.value)}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
            AXIS lo lee con su modelo de lenguaje para entenderlo. No se guarda fuera de tu dispositivo.
          </p>

          {note.length > 0 && note !== readText.trim() && (
            <button
              type="button"
              onClick={() => void readNote()}
              disabled={busy}
              className="ax-press mt-3 min-h-11 w-full rounded-full border border-primary px-4 text-[14px] font-medium text-primary transition-opacity disabled:opacity-60"
            >
              {busy ? 'Leyendo…' : 'Que AXIS lo lea'}
            </button>
          )}

          {reading && note === readText.trim() && (
            <div className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-pretty">
              {describeHealthReading(reading).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {reading.source === 'local' && (
                <p className="text-muted-foreground">Sin conexión con AXIS lo he leído de forma sencilla: revisa que esté bien.</p>
              )}
            </div>
          )}
        </div>
      )}

      {choice === 'escribir' && current.flags.length > 0 && (
        <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-pretty">
          Consulta con tu médico antes de empezar a entrenar o de subir la intensidad. AXIS no diagnostica nada; hasta
          que te dé el visto bueno, no te propondrá días fuertes.
        </p>
      )}
      {showClearance && choice === 'escribir' && current.flags.length > 0 && (
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
