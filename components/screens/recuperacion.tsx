'use client'

import { useId, useState, type CSSProperties } from 'react'
import { Activity, ChevronDown, Droplet, Dumbbell, Moon, Zap } from 'lucide-react'
import { CircularMetric } from '@/components/circular-metric'
import { StepButton } from '@/components/profile/controls'
import { ScalePicker } from '@/components/recovery/scale-picker'
import { BAND_COLOR, BAND_HEADLINE, BAND_TONE } from '@/components/recovery-band'
import { SectionHeader } from '@/components/section-header'
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
import { fromDayKey } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'
import { NutritionSection } from '@/components/nutrition-section'
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
  const { profile, recoveryInputs, recoveryScore, updateRecovery, toggleHydrationGlass, today } =
    useAxtlhetics()
  const [expanded, setExpanded] = useState<RecoveryFactorKey | null>(null)

  const toggle = (key: RecoveryFactorKey) =>
    setExpanded((current) => (current === key ? null : key))

  const scoreValue = recoveryScore.status === 'ok' ? recoveryScore.value : null
  const animatedScore = useCountUp(scoreValue)

  const filled = recoveryInputs.hydrationGlasses ?? 0
  const sleepReference = sleepReferenceForAge(profile?.age ?? 30)
  const dateLabel = fromDayKey(today)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, (c) => c.toUpperCase())

  return (
    <div className="px-5 pb-12">
      {/* Header */}
      <header className="ax-enter pt-6">
        <h1 className="text-title-lg font-bold">Recuperación</h1>
        <p className="mt-1.5 text-callout text-muted-foreground">{dateLabel}</p>
      </header>

      {/* Score — protagonist. Superficie lisa y un anillo grande: el número manda (D-075). */}
      <section
        className="ax-enter mt-7 flex flex-col items-center rounded-3xl bg-surface px-6 pt-7 pb-8 text-center"
        style={{ animationDelay: '60ms' }}
      >
        <p className="text-overline font-semibold tracking-[0.16em] text-muted-foreground">TU RECUPERACIÓN</p>

        <CircularMetric
          value={animatedScore}
          tone={recoveryScore.status === 'ok' ? BAND_TONE[recoveryScore.band] : 'neutral'}
          size={168}
          stroke={10}
          className="mt-5"
        >
          <span className="text-display font-bold leading-none tabular-nums">
            {recoveryScore.status === 'ok' ? animatedScore : '—'}
          </span>
          <span className="mt-1 text-footnote text-muted-foreground">/100</span>
        </CircularMetric>

        {recoveryScore.status === 'ok' ? (
          <>
            <p className={cn('mt-6 text-headline font-semibold', BAND_COLOR[recoveryScore.band])}>
              {BAND_HEADLINE[recoveryScore.band]}
            </p>
            <p className="mt-2 max-w-[30ch] text-subhead text-muted-foreground text-pretty">
              {explainScore(recoveryScore.band, recoveryScore.weakest[0])}
            </p>
          </>
        ) : (
          <>
            <p className="mt-6 text-headline font-semibold">Datos insuficientes</p>
            <p className="mt-2 max-w-[30ch] text-subhead text-muted-foreground text-pretty">
              {recoveryScore.reason}
            </p>
          </>
        )}
      </section>

      {/* Factores clave: una lista agrupada; cada fila se abre en su sitio. */}
      <SectionHeader title="Factores clave" />
      <ul className="overflow-hidden rounded-2xl border border-border">
        {/* Sueño */}
        <li className="ax-stagger border-b border-border" style={{ '--ax-index': 0 } as CSSProperties}>
          <FactorRow
            icon={Moon}
            label={RECOVERY_FACTOR_LABELS.sleep}
            value={recoveryInputs.sleepHours === null ? null : formatSleepHours(recoveryInputs.sleepHours)}
            status={recoveryInputs.sleepHours === null ? null : `Referencia ${sleepReference.label}`}
            expanded={expanded === 'sleep'}
            onToggle={() => toggle('sleep')}
          />
          {expanded === 'sleep' && (
            <div className="ax-fade flex items-center justify-between gap-3 px-4 pb-4">
              <span className="text-footnote text-muted-foreground">Horas dormidas</span>
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
                <span className="min-w-[60px] text-center text-body font-semibold tabular-nums">
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
              className="ax-stagger border-b border-border last:border-b-0"
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
                  className="ax-fade px-4 pb-4"
                />
              )}
            </li>
          )
        })}
      </ul>

      {/* Hidratación: su propio módulo, con la cuenta arriba y los vasos a lo ancho. */}
      <section
        className="ax-stagger mt-3 rounded-2xl bg-surface px-4 pt-4 pb-2"
        style={{ '--ax-index': SCALE_ORDER.length + 1 } as CSSProperties}
        aria-labelledby="hydration"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background">
            <Droplet className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
          </span>
          <span id="hydration" className="flex-1 text-callout font-medium">
            {RECOVERY_FACTOR_LABELS.hydration}
          </span>
          <span className="text-subhead tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{filled}</span> / {HYDRATION_GLASS_COUNT} vasos
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-1">
          {Array.from({ length: HYDRATION_GLASS_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void toggleHydrationGlass(i)}
              aria-label={`Vaso ${i + 1}`}
              aria-pressed={i < filled}
              className="ax-press min-h-12 flex-1"
            >
              <Glass filled={i < filled} />
            </button>
          ))}
        </div>
      </section>

      {/* Alimentación (D-061). */}
      <NutritionSection />
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
      className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 active:bg-surface"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface">
        <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
      </span>
      <span className="flex-1 text-callout font-medium">{label}</span>
      {value === null ? (
        <span className="rounded-full bg-secondary px-3 py-1.5 text-caption font-semibold text-primary">Registrar</span>
      ) : (
        <span className="text-right">
          <span className="block text-subhead font-semibold tabular-nums">{value}</span>
          {status && <span className="block text-caption text-muted-foreground">{status}</span>}
        </span>
      )}
      <ChevronDown
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0 text-muted-nontext transition-transform duration-200', expanded && 'rotate-180')}
      />
    </button>
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
    <svg viewBox="0 0 20 26" className="mx-auto h-8 w-auto" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={GLASS_PATH} />
        </clipPath>
      </defs>

      <path d={GLASS_PATH} fill="var(--background)" />

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
        stroke={filled ? 'var(--primary)' : 'var(--border-strong)'}
        strokeWidth="1.2"
        className="transition-[stroke] duration-200"
      />
    </svg>
  )
}
