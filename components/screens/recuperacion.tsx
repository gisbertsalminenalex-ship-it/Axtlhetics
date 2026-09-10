'use client'

import { useId, useState, type CSSProperties } from 'react'
import { Activity, Droplet, Dumbbell, Moon, Zap } from 'lucide-react'
import { CircularMetric } from '@/components/circular-metric'
import { StepButton } from '@/components/profile/controls'
import { BAND_COLOR, BAND_HEADLINE, BAND_TONE } from '@/components/recovery-band'
import { useCountUp } from '@/components/use-count-up'
import type { RecoveryFactorKey, Scale5 } from '@/lib/domain/recovery/types'
import {
  ENERGY_LABELS,
  FATIGUE_LABELS,
  HYDRATION_GLASS_COUNT,
  RECOVERY_FACTOR_LABELS,
  STRESS_LABELS,
} from '@/lib/domain/recovery/types'
import {
  adjustSleepHours,
  DEFAULT_SLEEP_HOURS,
  formatSleepHours,
  sleepReferenceForAge,
} from '@/lib/domain/recovery/scales'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

type ScaleFactorKey = Extract<RecoveryFactorKey, 'energy' | 'muscleFatigue' | 'stress'>

const SCALE_LABELS: Record<ScaleFactorKey, Record<Scale5, string>> = {
  energy: ENERGY_LABELS,
  muscleFatigue: FATIGUE_LABELS,
  stress: STRESS_LABELS,
}

const SCALE_ICONS: Record<ScaleFactorKey, typeof Zap> = {
  energy: Zap,
  muscleFatigue: Dumbbell,
  stress: Activity,
}

/** El orden de la lista es el aprobado en el prototipo. */
const SCALE_ORDER: ScaleFactorKey[] = ['stress', 'muscleFatigue', 'energy']

export function RecuperacionScreen() {
  const { profile, recoveryInputs, recoveryScore, updateRecovery, toggleHydrationGlass } =
    useAxtlhetics()
  const [expanded, setExpanded] = useState<RecoveryFactorKey | null>(null)

  const toggle = (key: RecoveryFactorKey) =>
    setExpanded((current) => (current === key ? null : key))

  const scoreValue = recoveryScore.status === 'ok' ? recoveryScore.value : null
  const animatedScore = useCountUp(scoreValue)

  const filled = recoveryInputs.hydrationGlasses ?? 0
  const sleepReference = sleepReferenceForAge(profile?.age ?? 30)

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Recuperación</h1>
      </header>

      {/* Score — protagonist */}
      <section className="flex flex-col items-center rounded-3xl border border-border bg-background px-5 py-8 text-center shadow-[0_1px_2px_rgba(10,10,11,0.04)]">
        <p className="text-[13px] font-medium text-muted-foreground">Tu recuperación</p>

        <CircularMetric
          value={animatedScore}
          tone={recoveryScore.status === 'ok' ? BAND_TONE[recoveryScore.band] : 'neutral'}
          size={150}
          stroke={9}
          className="mt-4"
        >
          <span className="text-[46px] font-bold leading-none tracking-[-0.03em]">
            {recoveryScore.status === 'ok' ? animatedScore : '—'}
          </span>
          <span className="text-[13px] text-muted-foreground">/100</span>
        </CircularMetric>

        {recoveryScore.status === 'ok' ? (
          <>
            <p className={cn('mt-5 text-[16px] font-semibold', BAND_COLOR[recoveryScore.band])}>
              {BAND_HEADLINE[recoveryScore.band]}
            </p>
            <p className="mt-2 max-w-[16rem] text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              {explainScore(recoveryScore.band, recoveryScore.weakest[0])}
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-[16px] font-semibold text-muted-foreground">
              Datos insuficientes
            </p>
            <p className="mt-2 max-w-[16rem] text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              {recoveryScore.reason}
            </p>
          </>
        )}
      </section>

      {/* Factores clave */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Factores clave</h3>
      <ul className="mt-2 divide-y divide-border">
        {/* Sueño */}
        <li className="ax-stagger py-1" style={{ '--ax-index': 0 } as CSSProperties}>
          <FactorRow
            icon={Moon}
            label={RECOVERY_FACTOR_LABELS.sleep}
            value={recoveryInputs.sleepHours === null ? null : formatSleepHours(recoveryInputs.sleepHours)}
            status={recoveryInputs.sleepHours === null ? null : `Referencia ${sleepReference.label}`}
            expanded={expanded === 'sleep'}
            onToggle={() => toggle('sleep')}
          />
          {expanded === 'sleep' && (
            <div className="flex items-center justify-between gap-3 pb-3 pl-8">
              <span className="text-[13px] text-muted-foreground">Horas dormidas</span>
              <div className="flex items-center gap-1">
                <StepButton
                  ariaLabel="Reducir horas de sueño"
                  icon="minus"
                  onClick={() =>
                    void updateRecovery({
                      sleepHours: adjustSleepHours(recoveryInputs.sleepHours, -1),
                    })
                  }
                />
                <span className="min-w-[60px] text-center text-[16px] font-semibold tabular-nums">
                  {formatSleepHours(recoveryInputs.sleepHours ?? DEFAULT_SLEEP_HOURS)}
                </span>
                <StepButton
                  ariaLabel="Aumentar horas de sueño"
                  icon="plus"
                  onClick={() =>
                    void updateRecovery({
                      sleepHours: adjustSleepHours(recoveryInputs.sleepHours, 1),
                    })
                  }
                />
              </div>
            </div>
          )}
        </li>

        {/* Estrés, fatiga y energía */}
        {SCALE_ORDER.map((key, index) => {
          const level = recoveryInputs[key]
          const Icon = SCALE_ICONS[key]
          return (
            <li
              key={key}
              className="ax-stagger py-1"
              style={{ '--ax-index': index + 1 } as CSSProperties}
            >
              <FactorRow
                icon={Icon}
                label={RECOVERY_FACTOR_LABELS[key]}
                value={level === null ? null : SCALE_LABELS[key][level]}
                status={null}
                expanded={expanded === key}
                onToggle={() => toggle(key)}
              />
              {expanded === key && (
                <ScalePicker
                  value={level}
                  labels={SCALE_LABELS[key]}
                  onSelect={(next) => void updateRecovery({ [key]: next })}
                />
              )}
            </li>
          )
        })}

        {/* Hidratación */}
        <li className="ax-stagger py-4" style={{ '--ax-index': SCALE_ORDER.length + 1 } as CSSProperties}>
          <div className="flex items-center gap-3">
            <Droplet className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
            <span className="flex-1 text-[15px] font-medium">
              {RECOVERY_FACTOR_LABELS.hydration}
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-1.5 pl-8">
            {Array.from({ length: HYDRATION_GLASS_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void toggleHydrationGlass(i)}
                aria-label={`Vaso ${i + 1}`}
                aria-pressed={i < filled}
                className="min-h-11 flex-1"
              >
                <Glass filled={i < filled} />
              </button>
            ))}
          </div>
          <p className="mt-2 pl-8 text-[12.5px] text-muted-foreground tabular-nums">
            {filled} / {HYDRATION_GLASS_COUNT} vasos
          </p>
        </li>
      </ul>
    </div>
  )
}

function explainScore(band: 'low' | 'moderate' | 'good', weakest?: RecoveryFactorKey): string {
  const base =
    band === 'good'
      ? 'Estás recuperado y listo para entrenar. Mantén la consistencia.'
      : band === 'moderate'
        ? 'Vas algo justo. Hoy conviene entrenar sin forzar.'
        : 'Hoy conviene priorizar el descanso antes que la carga.'

  if (!weakest || band === 'good') return base
  return `${base} Lo que más pesa hoy: ${RECOVERY_FACTOR_LABELS[weakest].toLowerCase()}.`
}


function FactorRow({
  icon: Icon,
  label,
  value,
  status,
  expanded,
  onToggle,
}: {
  icon: typeof Moon
  label: string
  value: string | null
  status: string | null
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex min-h-11 w-full items-center gap-3 py-2.5 text-left"
    >
      <Icon className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      {value === null ? (
        <span className="text-[13.5px] font-semibold text-primary">Registrar</span>
      ) : (
        <span className="text-right">
          <span className="block text-[14px] font-semibold tabular-nums">{value}</span>
          {status && (
            <span className="block text-[12px] font-medium text-muted-foreground">{status}</span>
          )}
        </span>
      )}
    </button>
  )
}

function ScalePicker({
  value,
  labels,
  onSelect,
}: {
  value: Scale5 | null
  labels: Record<Scale5, string>
  onSelect: (next: Scale5) => void
}) {
  const levels: Scale5[] = [1, 2, 3, 4, 5]
  return (
    <div className="pb-3 pl-8">
      <div className="flex gap-1.5">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onSelect(level)}
            aria-pressed={value === level}
            aria-label={labels[level]}
            className={cn(
              'h-11 flex-1 rounded-full border text-[14px] font-semibold transition-colors',
              value === level
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {level}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        {value === null ? `1 · ${labels[1]} — 5 · ${labels[5]}` : labels[value]}
      </p>
    </div>
  )
}

const GLASS_PATH = 'M3 2 H17 L15.3 23 A1.5 1.5 0 0 1 13.8 24.5 H6.2 A1.5 1.5 0 0 1 4.7 23 Z'

/**
 * Vaso de hidratación.
 *
 * El agua sube y baja de verdad: un rectángulo recortado con la silueta del vaso
 * que escala en vertical desde la base. Anima solo `transform`, así que ocho vasos
 * a la vez no cuestan nada, y el estado real cambia de forma instantánea — la
 * animación va por detrás y nunca bloquea un toque rápido.
 */
function Glass({ filled }: { filled: boolean }) {
  const clipId = useId()

  return (
    <svg viewBox="0 0 20 26" className="mx-auto h-7 w-auto" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={GLASS_PATH} />
        </clipPath>
      </defs>

      <path d={GLASS_PATH} fill="var(--muted)" />

      <g clipPath={`url(#${clipId})`}>
        <rect
          x="0"
          y="0"
          width="20"
          height="26"
          fill="var(--primary)"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'bottom',
            transform: filled ? 'scaleY(1)' : 'scaleY(0)',
            transition: 'transform var(--ax-fast) var(--ax-ease)',
          }}
        />
      </g>

      <path
        d={GLASS_PATH}
        fill="none"
        stroke={filled ? 'var(--primary)' : 'var(--border)'}
        strokeWidth="1.2"
        className="transition-[stroke] duration-200"
      />
    </svg>
  )
}
