'use client'

import type { CSSProperties } from 'react'
import { ArrowRight, ChevronRight, Clock, Dumbbell, GlassWater, Heart, Moon, UserRound } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { isMainExercise } from '@/lib/domain/workouts/types'
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
import { fromDayKey } from '@/lib/domain/shared/dates'
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
    movedToTomorrow,
    axisNote,
    progression,
    today,
  } = useAxtlhetics()

  const copy = proposal ? DAY_TITLES[proposal.type] : DAY_TITLES.LIGHT_TRAINING
  const trains = proposal ? isTrainingRecommendation(proposal.type) : false
  const firstName = profile?.name.split(' ')[0] ?? ''

  const animatedScore = useCountUp(recoveryScore.status === 'ok' ? recoveryScore.value : null)
  const animatedLoad = useCountUp(trainingLoad.status === 'ok' ? trainingLoad.value : null)

  const todayDate = fromDayKey(today)
  const dateLabel = todayDate
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, (c) => c.toUpperCase())
  const glasses = recoveryInputs.hydrationGlasses ?? 0

  return (
    <div className="px-5 pb-12">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-7">
        <div className="flex items-center gap-2">
          <AxisMark className="h-[18px] w-[18px] text-primary" />
          <span className="text-footnote font-bold tracking-[0.22em] text-foreground">
            AXTHLETICS
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenPerfil}
          aria-label="Abrir tu perfil"
          className="ax-press -mr-1 flex h-11 w-11 items-center justify-center"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-subhead font-semibold text-foreground">
            {firstName ? firstName[0].toUpperCase() : <UserRound className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </span>
        </button>
      </header>

      {/* Saludo editorial. El nivel (D-071), discreto: el protagonista sigue siendo AXIS. */}
      <div className="ax-enter">
        <div className="flex items-center justify-between gap-3">
          <p className="text-footnote font-medium text-muted-foreground">{dateLabel}</p>
          <LevelBadge level={progression.level} rankLabel={progression.rankLabel} intoLevel={progression.intoLevel} levelXp={progression.levelXp} />
        </div>
        <h1 className="mt-3 text-display font-bold text-balance">
          {firstName && <span className="block text-muted-nontext">Hola, {firstName}.</span>}
          {copy.title}
        </h1>
        <p className="mt-3 max-w-[30ch] text-callout text-muted-foreground text-pretty">
          {copy.subtitle}
        </p>
      </div>

      {/* AXIS recommendation — protagonist */}
      {proposal && (
        <section
          key={proposal.id}
          className="ax-enter relative mt-8 overflow-hidden rounded-3xl bg-ink p-6 text-white"
          style={{ animationDelay: '60ms' }}
        >
          {/* Un único brillo azul, muy tenue, que da profundidad sin decorar. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-primary/30 blur-3xl"
          />
          <button
            type="button"
            onClick={onOpenAxis}
            aria-label="Hablar con AXIS sobre esta recomendación"
            className="ax-press relative -mx-1 -my-1 flex min-h-11 w-full items-center gap-2 px-1 py-1 text-left"
          >
            <AxisMark className="h-3.5 w-3.5 text-white" />
            <span className="flex-1 text-overline font-semibold tracking-[0.16em] text-white/55">
              AXIS RECOMIENDA
            </span>
            <ChevronRight className="h-4 w-4 text-white/35" />
          </button>
          <h2 className="relative mt-3 text-headline font-semibold text-balance">
            {proposal.headline}
          </h2>
          <p className="relative mt-2 line-clamp-3 text-subhead text-white/60 text-pretty">{proposal.reason}</p>
          {movedToTomorrow && !proposal.session && (
            <p className="relative mt-3 text-footnote text-white/45">Tu entrenamiento se ha movido a mañana.</p>
          )}

          {proposal.session && (
            <div className="relative mt-4 flex flex-wrap gap-2">
              <MetaPill icon={Clock}>{proposal.session.estimatedMinutes} min</MetaPill>
              {/* Solo el entrenamiento: el calentamiento y la vuelta a la calma no cuentan (D-032). */}
              <MetaPill icon={Dumbbell}>
                {proposal.session.exercises.filter(isMainExercise).length} ejercicios
              </MetaPill>
            </div>
          )}

          <button
            type="button"
            onClick={trains ? onStartTraining : onGoRecuperacion}
            className="ax-press group relative mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary text-callout font-semibold text-primary-foreground"
          >
            {trains ? 'Empezar entrenamiento' : 'Ver recuperación'}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-active:translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              openChangeConversation()
              onOpenAxis()
            }}
            className="ax-press relative mt-1 min-h-11 w-full text-subhead font-medium text-white/65"
          >
            Habla con AXIS
          </button>
        </section>
      )}

      {/*
        AXIS habla primero (D-038): una nota discreta bajo la recomendación.
        Tocarla abre la conversación.
      */}
      {axisNote && (
        <button
          type="button"
          onClick={onOpenAxis}
          className="ax-enter ax-press mt-3 flex min-h-11 w-full items-start gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left"
          style={{ animationDelay: '120ms' }}
        >
          <AxisMark className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1 text-subhead text-foreground/80 text-pretty">{axisNote.text}</span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-nontext" />
        </button>
      )}

      {/* Estado de hoy: un solo módulo, que lleva a Recuperación. */}
      <SectionHeader title="Tu estado de hoy" action="Ver todo" onAction={onGoRecuperacion} />
      <button
        type="button"
        onClick={onGoRecuperacion}
        aria-label="Ver tu recuperación"
        className="ax-press grid w-full grid-cols-3 rounded-2xl border border-border bg-background py-5"
      >
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
            size={64}
            stroke={4}
          >
            <span className="text-headline font-semibold leading-none tabular-nums">
              {recoveryScore.status === 'ok' ? animatedScore : '—'}
            </span>
          </CircularMetric>
        </StateMetric>

        <StateMetric
          index={1}
          label="Sueño"
          status={recoveryInputs.sleepHours === null ? 'Sin datos' : 'Registrado'}
          statusColor={recoveryInputs.sleepHours === null ? 'text-muted-foreground' : 'text-foreground'}
          divided
        >
          <div className="flex h-16 w-16 flex-col items-center justify-center gap-1.5">
            <Moon className="h-5 w-5 text-muted-nontext" strokeWidth={1.75} />
            <span className="text-callout font-semibold leading-none tabular-nums">
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
          divided
        >
          <CircularMetric
            value={animatedLoad}
            tone={trainingLoad.status === 'ok' ? LOAD_TONE[trainingLoad.band] : 'neutral'}
            size={64}
            stroke={4}
          >
            <span className="text-headline font-semibold leading-none tabular-nums">
              {trainingLoad.status === 'ok' ? animatedLoad : '—'}
            </span>
          </CircularMetric>
        </StateMetric>
      </button>

      {/* Esta semana */}
      <SectionHeader title="Esta semana" />
      <WeeklyActivity
        completedDays={weeklyActivity.completedDays}
        today={weeklyActivity.todayIndex}
        todayDate={todayDate}
      />

      {/* Accesos: una lista agrupada, no una rejilla de iconos. */}
      <SectionHeader title="Accesos" />
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        <QuickRow
          icon={GlassWater}
          label="Hidratación"
          detail={`${glasses} / 8 vasos`}
          progress={glasses / 8}
          onClick={onGoRecuperacion}
        />
        <QuickRow icon={Dumbbell} label="Último entrenamiento" detail="En tu historial" onClick={onGoHistorial} />
        <QuickRow icon={Heart} label="Recuperación" detail="Sueño, energía y fatiga" onClick={onGoRecuperacion} />
      </div>
    </div>
  )
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="mt-10 mb-3 flex items-center justify-between">
      <h3 className="text-body font-semibold">{title}</h3>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="ax-press -my-3 -mr-2 min-h-11 px-2 text-footnote font-medium text-primary"
        >
          {action}
        </button>
      )}
    </div>
  )
}

function MetaPill({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-caption font-medium text-white/75 tabular-nums">
      <Icon className="h-3.5 w-3.5 text-white/50" strokeWidth={1.75} />
      {children}
    </span>
  )
}

function StateMetric({
  label,
  status,
  statusColor,
  index,
  divided = false,
  children,
}: {
  label: string
  status: string
  statusColor: string
  index: number
  divided?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`ax-stagger flex flex-col items-center gap-3 text-center ${divided ? 'border-l border-border' : ''}`}
      style={{ '--ax-index': index } as CSSProperties}
    >
      {children}
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className={`text-caption font-semibold ${statusColor}`}>{status}</p>
      </div>
    </div>
  )
}

function QuickRow({
  icon: Icon,
  label,
  detail,
  progress,
  onClick,
}: {
  icon: typeof Heart
  label: string
  detail: string
  progress?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 active:bg-track/60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background">
        <Icon className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-callout font-medium">{label}</span>
        <span className="block text-footnote text-muted-foreground tabular-nums">{detail}</span>
      </span>
      {progress !== undefined && (
        <span className="h-1 w-12 overflow-hidden rounded-full bg-track" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }}
          />
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-nontext" />
    </button>
  )
}

/** «Nivel 7 · Plata» y una barra pequeña hacia el siguiente (D-071). */
function LevelBadge({ level, rankLabel, intoLevel, levelXp }: { level: number; rankLabel: string; intoLevel: number; levelXp: number }) {
  const share = Math.min(1, intoLevel / levelXp)
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label={`Nivel ${level}, ${rankLabel}: ${intoLevel} de ${levelXp} XP para el siguiente`}>
      <span className="text-caption font-medium tabular-nums text-muted-foreground">
        Nivel {level} · {rankLabel}
      </span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-track" aria-hidden="true">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </div>
  )
}
