'use client'

import type { CSSProperties } from 'react'
import { ArrowRight, ChevronRight, Dumbbell, GlassWater, Heart, Moon, UserRound } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { CircularMetric } from '@/components/circular-metric'
import {
  BAND_COLOR,
  BAND_SHORT,
  BAND_TONE,
  LOAD_COLOR,
  LOAD_TONE,
} from '@/components/recovery-band'
import { useCountUp } from '@/components/use-count-up'
import { WeeklyActivity } from '@/components/weekly-activity'
import type { AxisRecommendationType } from '@/lib/domain/axis/types'
import { isTrainingRecommendation } from '@/lib/domain/axis/types'
import { formatSleepHours } from '@/lib/domain/recovery/scales'
 import { TRAINING_LOAD_BAND_LABELS } from '@/lib/domain/workouts/load'
import { useAxtlhetics } from '@/lib/state/store'

/** Titular editorial del día. Depende de lo que AXIS haya decidido, no de un mock. */
const DAY_TITLES: Record<AxisRecommendationType, { title: string; subtitle: string }> = {
  TRAINING: {
    title: 'Día de cumplir.',
    subtitle: 'Tu cuerpo está listo para avanzar. Aprovecha este momento.',
  },
  LIGHT_TRAINING: {
    title: 'Hoy, sin forzar.',
    subtitle: 'Mantener el ritmo también suma. Hazlo suave y bien hecho.',
  },
  MODIFIED_TRAINING: {
    title: 'Día de encajar.',
    subtitle: 'Tienes el día ocupado, así que la sesión se adapta a él.',
  },
  RECOVERY: {
    title: 'Día de recuperar.',
    subtitle: 'Recuperar es parte del entrenamiento, no una pausa en él.',
  },
  REST: {
    title: 'Día de descanso.',
    subtitle: 'Hoy no toca entrenar. Mañana llegarás mejor.',
  },
}

export function InicioScreen({
  onStartTraining,
  onGoRecuperacion,
  onGoHistorial,
  onOpenPerfil,
  onOpenAxis,
}: {
  onStartTraining: () => void
  onGoRecuperacion: () => void
  onGoHistorial: () => void
  onOpenPerfil: () => void
  onOpenAxis: () => void
}) {
  const {
    profile,
    proposal,
    openChangeConversation,
    recoveryScore,
    recoveryInputs,
    trainingLoad,
    weeklyActivity,
  } = useAxtlhetics()

  const copy = proposal ? DAY_TITLES[proposal.type] : DAY_TITLES.LIGHT_TRAINING
  const trains = proposal ? isTrainingRecommendation(proposal.type) : false
  const firstName = profile?.name.split(' ')[0] ?? ''

  const animatedScore = useCountUp(recoveryScore.status === 'ok' ? recoveryScore.value : null)
  const animatedLoad = useCountUp(trainingLoad.status === 'ok' ? trainingLoad.value : null)

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-6">
        <div className="flex items-center gap-2">
          <AxisMark className="h-5 w-5 text-primary" />
          <span className="text-[15px] font-bold tracking-[0.18em] text-foreground">
            AXTHLETICS
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenPerfil}
          aria-label="Abrir tu perfil"
          className="-mr-2 flex h-11 w-11 items-center justify-center"
        >
          <UserRound className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
        </button>
      </header>

      {/* Greeting */}
      <p className="text-[15px] font-medium text-muted-foreground">Hola, {firstName}.</p>
      <h1 className="mt-1 text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-balance">
        {copy.title}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
        {copy.subtitle}
      </p>

      {/* AXIS recommendation — protagonist */}
      {proposal && (
        <section key={proposal.id} className="ax-enter mt-6 rounded-3xl bg-ink p-5 text-white">
          <button
            type="button"
            onClick={onOpenAxis}
            aria-label="Hablar con AXIS sobre esta recomendación"
            className="ax-press -mx-1 -my-1 flex min-h-11 w-full items-center gap-2 px-1 py-1 text-left"
          >
            <AxisMark className="h-4 w-4 text-white" />
            <span className="flex-1 text-[11px] font-semibold tracking-[0.16em] text-white/60">
              RECOMENDACIÓN DE AXIS
            </span>
            <ChevronRight className="h-4 w-4 text-white/40" />
          </button>
          <h2 className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.01em]">
            {proposal.headline}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">{proposal.reason}</p>

          {proposal.session && (
            <p className="mt-3 text-[12.5px] text-white/45 tabular-nums">
              {proposal.session.estimatedMinutes} min ·{' '}
              {proposal.session.exercises.length} ejercicios
            </p>
          )}

          <button
            type="button"
            onClick={trains ? onStartTraining : onGoRecuperacion}
            className="ax-press mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {trains ? 'Empezar entrenamiento' : 'Ver recuperación'}
            <ArrowRight className="h-4 w-4" />
          </button>

          {proposal && (
            <button
              type="button"
              onClick={() => {
                openChangeConversation()
                onOpenAxis()
              }}
              className="ax-press mt-2 min-h-11 w-full text-[13.5px] font-semibold text-white/70"
            >
              Cambiar entrenamiento
            </button>
          )}
        </section>
      )}

      {/* Estado de hoy */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Tu estado de hoy</h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StateMetric
          index={0}
          label="Recuperación"
          status={recoveryScore.status === 'ok' ? BAND_SHORT[recoveryScore.band] : 'Sin datos'}
          statusColor={
            recoveryScore.status === 'ok' ? BAND_COLOR[recoveryScore.band] : 'text-muted-foreground'
          }
        >
          <CircularMetric
            value={animatedScore}
            tone={recoveryScore.status === 'ok' ? BAND_TONE[recoveryScore.band] : 'neutral'}
            size={68}
          >
            <span className="text-[19px] font-bold leading-none">
              {recoveryScore.status === 'ok' ? animatedScore : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </CircularMetric>
        </StateMetric>

        <StateMetric
          index={1}
          label="Sueño"
          status={recoveryInputs.sleepHours === null ? 'Sin datos' : 'Registrado'}
          statusColor={recoveryInputs.sleepHours === null ? 'text-muted-foreground' : 'text-success'}
        >
          <div className="flex h-[68px] w-[68px] flex-col items-center justify-center gap-1">
            <Moon className="h-6 w-6 text-foreground" strokeWidth={1.75} />
            <span className="text-[15px] font-bold leading-none tabular-nums">
              {formatSleepHours(recoveryInputs.sleepHours)}
            </span>
          </div>
        </StateMetric>

        {/* Carga de los últimos días. Sin entrenamientos recientes no se inventa nada. */}
        <StateMetric
          index={2}
          label="Carga"
          status={
            trainingLoad.status === 'ok'
              ? TRAINING_LOAD_BAND_LABELS[trainingLoad.band]
              : 'Sin datos'
          }
          statusColor={
            trainingLoad.status === 'ok'
              ? LOAD_COLOR[trainingLoad.band]
              : 'text-muted-foreground'
          }
        >
          <CircularMetric
            value={animatedLoad}
            tone={trainingLoad.status === 'ok' ? LOAD_TONE[trainingLoad.band] : 'neutral'}
            size={68}
          >
            <span className="text-[19px] font-bold leading-none">
              {trainingLoad.status === 'ok' ? animatedLoad : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </CircularMetric>
        </StateMetric>
      </div>

      {/* Esta semana */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Esta semana</h3>
      <WeeklyActivity
        completedDays={weeklyActivity.completedDays}
        today={weeklyActivity.todayIndex}
        className="mt-4"
      />

      {/* Accesos rápidos */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Accesos rápidos</h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <QuickAccess icon={Heart} label="Recuperación" onClick={onGoRecuperacion} />
        <QuickAccess icon={Dumbbell} label="Último entrenamiento" onClick={onGoHistorial} />
        <QuickAccess icon={GlassWater} label="Hidratación" onClick={onGoRecuperacion} />
      </div>
    </div>
  )
}


function StateMetric({
  label,
  status,
  statusColor,
  index,
  children,
}: {
  label: string
  status: string
  statusColor: string
  index: number
  children: React.ReactNode
}) {
  return (
    <div
      className="ax-stagger flex flex-col items-center gap-2.5 text-center"
      style={{ '--ax-index': index } as CSSProperties}
    >
      {children}
      <div className="leading-tight">
        <p className="text-[12px] font-medium text-foreground">{label}</p>
        <p className={`text-[12px] font-semibold ${statusColor}`}>{status}</p>
      </div>
    </div>
  )
}

function QuickAccess({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Heart
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ax-press flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-4"
    >
      <Icon className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      <span className="text-[11.5px] font-medium leading-tight text-muted-foreground text-pretty">
        {label}
      </span>
    </button>
  )
}
