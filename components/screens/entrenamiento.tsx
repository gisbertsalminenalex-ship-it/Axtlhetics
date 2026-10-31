'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ArrowRight, ChevronDown, ChevronRight, Clock, Dumbbell } from 'lucide-react'
import { AssessmentEntry } from '@/components/assessment/assessment-entry'
import { ScanEntry } from '@/components/scanner/scan-entry'
import { EvaluationCard } from '@/components/profile/evaluation-card'
import { WeeklyReviewSection } from '@/components/weekly-review'
import { BlockReviewSection } from '@/components/block-review'
import { AxisBadge } from '@/components/axis-symbol'
import { EmptyNote, SectionHeader } from '@/components/section-header'
import { WeekPlan } from '@/components/week-plan'
import { WeeklyVolume } from '@/components/weekly-volume'
import { ProgressSection } from '@/components/progress/progress-section'
import { EXERCISE_CATALOG } from '@/lib/domain/workouts/catalog'
import { weeklyVolume } from '@/lib/domain/workouts/weekly-volume'
import { describeQuota, weekIndexOf, weeklyQuota } from '@/lib/domain/workouts/weekly-plan'
import { currentBlock, describeBlock } from '@/lib/domain/workouts/blocks'
import { isTrainingRecommendation } from '@/lib/domain/axis/types'
import { formatDuration, formatRelativeDay } from '@/lib/domain/shared/dates'
import {
  EXERCISE_PHASE_LABELS,
  isMainExercise,
  WARMUP_PART_LABELS,
  type PlannedExercise,
} from '@/lib/domain/workouts/types'
import { useAxtlhetics } from '@/lib/state/store'

export function EntrenamientoScreen({
  onStart,
  onGoRecuperacion,
  onGoHistorial,
  onOpenAxis,
  onOpenTest,
  onOpenScan,
  onOpenPerfil,
}: {
  onStart: () => void
  onGoRecuperacion: () => void
  onGoHistorial: () => void
  onOpenAxis: () => void
  /** Abre el test de evolución (D-021). */
  onOpenTest: () => void
  /** Abre el escáner corporal (D-023). */
  onOpenScan: () => void
  /** Abre el perfil, para contestar la evaluación inicial (D-058). */
  onOpenPerfil: () => void
}) {
  const { proposal, openChangeConversation, sessions, weekView, chooseNormalVersion, today, movedToTomorrow, profile, weeklyReview } =
    useAxtlhetics()

  const trains = proposal ? isTrainingRecommendation(proposal.type) : false
  const session = proposal?.session ?? null
  const lastSession = sessions.find((item) => item.status === 'completed') ?? null
  // Series de la semana por grupo frente al objetivo (D-034).
  const volumes = weeklyVolume(sessions, today, EXERCISE_CATALOG, profile?.experience ?? 'intermedio')
  // El reparto de la semana entre los objetivos (D-047), en una frase.
  const quota = profile ? weeklyQuota(profile.goals, profile.availableWeekdays.length, weekIndexOf(today)) : []
  const hard = session?.intensity === 'alta'

  // La sesión por fases: el calentamiento y la vuelta a la calma se pliegan para
  // que lo principal, lo que mide el progreso, se vea primero (D-075).
  const exercises = session?.exercises ?? []
  const warmup = exercises.filter((exercise) => exercise.phase === 'calentamiento')
  const main = exercises.filter(isMainExercise)
  const cooldown = exercises.filter((exercise) => exercise.phase === 'vuelta_calma')

  return (
    <div className="px-5 pb-12">
      {/* Header */}
      <header className="ax-enter pt-6">
        <p className="text-caption font-bold tracking-[0.08em] text-primary uppercase">Tu próximo paso</p>
        <h1 className="mt-1.5 text-title-lg font-extrabold">Entrenamiento</h1>
      </header>

      {/* HOY */}
      <section
        key={proposal?.id}
        className="ax-enter mt-6 rounded-3xl border border-border bg-surface p-5 shadow-card-lg"
        style={{ animationDelay: '60ms' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-overline font-bold tracking-[0.12em] text-muted-foreground">HOY</span>
              {/* D-048: el día fuerte se marca, y se puede cambiar a la versión normal. */}
              {hard && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-overline font-semibold text-primary">
                  Día fuerte
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-title font-extrabold text-balance">
              {session ? session.title : 'Hoy toca recuperar'}
            </h2>
            {/* D-022: el entrenamiento de hoy se movió a mañana. Solo contexto. */}
            {movedToTomorrow && !session && (
              <p className="mt-2 text-footnote font-medium text-muted-foreground">Movido a mañana</p>
            )}
          </div>
          {session?.focus === 'tren_superior' && (
            <Image
              src="/anatomy-upper.png"
              alt="Grupo muscular del tren superior destacado"
              width={72}
              height={96}
              className="-mr-1 h-24 w-auto shrink-0 object-contain mix-blend-multiply"
            />
          )}
        </div>
        {session && (
          <div className="mt-4 flex flex-wrap gap-2">
            <MetaPill icon={Clock}>{session.estimatedMinutes} min</MetaPill>
            {/* Solo el entrenamiento: el calentamiento y la vuelta a la calma no cuentan (D-032). */}
            <MetaPill icon={Dumbbell}>{main.length} ejercicios</MetaPill>
          </div>
        )}

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-axis-soft px-3.5 py-3">
          <AxisBadge />
          <p className="text-subhead text-foreground/85 text-pretty">
            <span className="font-bold text-axis-ink">AXIS · </span>
            {proposal?.reason ?? 'Registra tu recuperación para que AXIS pueda recomendarte algo.'}
          </p>
        </div>

        <button
          type="button"
          onClick={trains ? onStart : onGoRecuperacion}
          className="ax-press group mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary text-callout font-bold text-primary-foreground shadow-action"
        >
          {trains ? 'Empezar entrenamiento' : 'Ver recuperación'}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-active:translate-x-0.5" />
        </button>

        {(hard || proposal) && (
          <div className="mt-1 flex flex-col">
            {hard && (
              <button
                type="button"
                onClick={() => void chooseNormalVersion()}
                className="ax-press min-h-11 text-subhead font-medium text-primary"
              >
                Prefiero la versión normal
              </button>
            )}
            {proposal && (
              <button
                type="button"
                onClick={() => {
                  openChangeConversation()
                  onOpenAxis()
                }}
                className="ax-press min-h-11 text-subhead font-medium text-primary"
              >
                Habla con AXIS
              </button>
            )}
          </div>
        )}
      </section>

      {/* Ejercicios de la sesión propuesta */}
      {session && exercises.length > 0 && (
        <>
          <SectionHeader title="Lo que harás hoy" />
          <div className="space-y-2">
            {warmup.length > 0 && <PhaseGroup label={EXERCISE_PHASE_LABELS.calentamiento} exercises={warmup} />}
            {main.length > 0 && (
              <ol className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card" aria-label="Entrenamiento">
                {main.map((exercise, index) => (
                  <li
                    key={`${exercise.exerciseId}-${index}`}
                    className="ax-stagger flex min-h-16 items-center gap-3.5 border-b border-border px-4 py-3 last:border-b-0"
                    style={{ '--ax-index': index } as CSSProperties}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-caption font-semibold tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-callout font-medium">{exercise.name}</span>
                    <Dose exercise={exercise} />
                  </li>
                ))}
              </ol>
            )}
            {cooldown.length > 0 && <PhaseGroup label={EXERCISE_PHASE_LABELS.vuelta_calma} exercises={cooldown} />}
          </div>
        </>
      )}

      {/* La evaluación inicial (D-058), el test de evolución (D-021) y el escáner
          corporal (D-023): secundarios, después de la sesión de hoy. */}
      <div className="mt-8">
        <EvaluationCard onOpenPerfil={onOpenPerfil} />
        <AssessmentEntry onOpen={onOpenTest} />
        <ScanEntry onOpen={onOpenScan} />
      </div>

      {/* Planificación */}
      <SectionHeader title="Tu planificación" />
      {lastSession ? (
        <button
          type="button"
          onClick={onGoHistorial}
          className="ax-press flex min-h-16 w-full items-center gap-3.5 rounded-2xl bg-surface px-4 py-3.5 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background">
            <Dumbbell className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-caption font-medium text-muted-foreground">Último entrenamiento</span>
            <span className="block text-callout font-semibold">{lastSession.title}</span>
            <span className="block text-footnote tabular-nums text-muted-foreground">
              {formatRelativeDay(lastSession.dayKey, today)} · {formatDuration(lastSession.durationSeconds)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-nontext" />
        </button>
      ) : (
        <EmptyNote>Todavía no has completado ningún entrenamiento.</EmptyNote>
      )}

      {/* Esta semana: la línea de días y, al tocar uno, lo hecho o lo previsto (D-048). */}
      <SectionHeader title="Esta semana" className="mb-1" />
      {quota.length > 1 && <p className="text-footnote text-muted-foreground text-pretty">{describeQuota(quota)}</p>}
      {/* El bloque en que estás (D-057). */}
      <p className="text-footnote text-muted-foreground text-pretty">{describeBlock(currentBlock(sessions, today))}</p>
      <WeekPlan key={today} days={weekView} className="mt-5" />

      <p className="mt-8 mb-3 text-subhead font-semibold">Series por músculo</p>
      <WeeklyVolume volumes={volumes} />

      {/* La revisión de la semana pasada (D-059). */}
      <WeeklyReviewSection review={weeklyReview} />

      {/* El cierre del bloque (D-062). */}
      <BlockReviewSection />

      {/* Tu progreso (D-036): dentro de Entrenamiento, sin pestaña propia (D-040). */}
      <ProgressSection />

      {/* Ver historial */}
      <button
        type="button"
        onClick={onGoHistorial}
        className="ax-press mt-10 flex min-h-14 w-full items-center justify-between rounded-2xl bg-surface px-4 text-callout font-medium"
      >
        Ver historial de entrenamientos
        <ChevronRight className="h-4 w-4 text-muted-nontext" />
      </button>
    </div>
  )
}

function MetaPill({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-background px-3 text-caption font-medium tabular-nums">
      <Icon className="h-3.5 w-3.5 text-muted-nontext" strokeWidth={1.75} />
      {children}
    </span>
  )
}

/** Series × repeticiones (o segundos) y, debajo, la carga sugerida si la hay. */
function Dose({ exercise }: { exercise: PlannedExercise }) {
  return (
    <span className="shrink-0 text-right text-footnote tabular-nums text-muted-foreground">
      {exercise.sets} × {exercise.reps}
      {exercise.isTimed ? ' s' : ''}
      {exercise.suggestedWeightKg !== null && (
        <span className="block text-caption">{exercise.suggestedWeightKg} kg</span>
      )}
    </span>
  )
}

/** Una fase plegable de la sesión: el calentamiento o la vuelta a la calma. */
function PhaseGroup({ label, exercises }: { label: string; exercises: readonly PlannedExercise[] }) {
  return (
    <details className="group overflow-hidden rounded-2xl bg-surface">
      <summary className="ax-press flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">
          <span className="block text-callout font-medium">{label}</span>
          <span className="block text-footnote tabular-nums text-muted-foreground">
            {exercises.length} {exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-nontext transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul className="ax-fade border-t border-border px-4">
        {exercises.map((exercise, index) => (
          <li key={`${exercise.exerciseId}-${index}`} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block text-subhead font-medium">{exercise.name}</span>
              {exercise.warmupPart && (
                <span className="block text-caption text-muted-foreground">{WARMUP_PART_LABELS[exercise.warmupPart]}</span>
              )}
            </span>
            <Dose exercise={exercise} />
          </li>
        ))}
      </ul>
    </details>
  )
}
