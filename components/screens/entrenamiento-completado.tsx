'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ArrowRight, Check, Pause } from 'lucide-react'
import { AxisBadge } from '@/components/axis-symbol'
import { ExerciseFigure, hasExerciseFigure } from '@/components/exercise-figure'
import { EmptyNote } from '@/components/section-header'
import { closingMessage } from '@/lib/domain/axis/closing'
import { formatVolume } from '@/lib/domain/history/stats'
import { sessionAward } from '@/lib/domain/progression/progression'
import { formatDuration } from '@/lib/domain/shared/dates'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { formatKg, formatSets, personalRecords } from '@/lib/domain/workouts/history'
import { EFFORT_LABELS, EFFORT_LEVELS, isMainExercise, metTarget, volumeOfExercise } from '@/lib/domain/workouts/types'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

export function EntrenamientoCompletado() {
  const { lastCompleted, sessions, rateLastSession, dismissSummary } = useAxtlhetics()

  if (!lastCompleted) return null

  const effort = lastCompleted.effort ?? null
  const abandoned = lastCompleted.status === 'abandoned'
  // Los récords se miden contra lo completado antes; una sesión interrumpida no bate marcas.
  const records = abandoned ? [] : personalRecords(lastCompleted, sessions)
  const completedAsPlanned = (exerciseId: string) => {
    // El del entrenamiento, no su serie de aproximación (D-045).
    const exercise = lastCompleted.exercises.find((item) => item.exerciseId === exerciseId && isMainExercise(item))
    return exercise ? metTarget(exercise) : false
  }

  return (
    <div className="px-5 pb-10">
      {/* Top bar */}
      <header className="pt-5 pb-8 text-center">
        <h1 className="text-overline font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {abandoned ? 'Entrenamiento interrumpido' : 'Entrenamiento completado'}
        </h1>
      </header>

      {/* Cierre. El verde es de éxito: una sesión interrumpida no lo lleva. */}
      <div className="ax-enter flex flex-col items-center text-center">
        <span
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            abandoned ? 'bg-surface' : 'bg-success/12',
          )}
        >
          {abandoned ? (
            <Pause className="h-7 w-7 text-muted-foreground" strokeWidth={2} />
          ) : (
            <Check className="h-7 w-7 text-success" strokeWidth={2.5} />
          )}
        </span>
        <h2 className="mt-5 text-title-lg font-extrabold">
          {abandoned ? 'Guardado igualmente.' : 'Sesión completada.'}
        </h2>
        <p className="mt-2 text-callout text-muted-foreground">
          {abandoned ? 'Hemos guardado lo que llegaste a hacer.' : 'Has terminado tu sesión.'}
        </p>
      </div>

      {/* Summary */}
      <div className="mt-8 grid grid-cols-3 gap-2">
        <SummaryStat index={0} value={formatDuration(lastCompleted.durationSeconds)} label="Tiempo total" />
        <SummaryStat index={1} value={String(lastCompleted.exercises.filter(isMainExercise).length)} label="Ejercicios" />
        <SummaryStat index={2} value={formatVolume(lastCompleted.totalVolumeKg)} label="Volumen total" />
      </div>

      {/* Lo que AXIS concluye de la sesión (D-019), no el motivo con el que la propuso. */}
      <div className="mt-3 flex items-start gap-3 rounded-2xl bg-surface shadow-card p-4">
        <AxisBadge size="sm" />
        <p className="text-subhead text-foreground/80 text-pretty">{closingMessage(lastCompleted, records)}</p>
      </div>

      {/* Los XP de la sesión (D-071): lo ganado y, solo si sube, el nivel. */}
      {!abandoned && <SessionXp sessionId={lastCompleted.id} />}

      {/* Récords: solo frente a algo registrado antes, sin insignias. */}
      {records.length > 0 && (
        <>
          <h3 className="mt-10 mb-3 text-body font-semibold">Récords personales</h3>
          <ul className="divide-y divide-border rounded-2xl border border-border px-4">
            {records.map((record) => (
              <li key={`${record.exerciseId}-${record.kind}`} className="flex items-baseline justify-between gap-3 py-3">
                <span>
                  <span className="block text-subhead font-semibold">{record.name}</span>
                  {/* La marca cuenta aunque quedara a medias, pero no se confunde con haberlo hecho todo. */}
                  {!completedAsPlanned(record.exerciseId) && (
                    <span className="block text-caption text-muted-foreground">
                      Ejercicio sin completar
                    </span>
                  )}
                </span>
                <span className="text-footnote tabular-nums text-muted-foreground">
                  <span className="font-semibold text-primary">
                    {record.kind === 'weight' ? `${formatKg(record.value)} kg` : `${record.value} ${repsUnit(record.exerciseId)}`}
                  </span>{' '}
                  · antes {record.kind === 'weight' ? `${formatKg(record.previous)} kg` : record.previous}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Cambios respecto a la propuesta */}
      {lastCompleted.modifications.length > 0 && (
        <ul className="mt-3 space-y-1">
          {lastCompleted.modifications.map((modification, index) => (
            <li key={index} className="text-caption text-muted-foreground">
              {modification.detail}
            </li>
          ))}
        </ul>
      )}

      {/* Resumen de ejercicios */}
      {lastCompleted.exercises.length > 0 ? (
        <>
          <h3 className="mt-10 mb-3 text-body font-semibold">Resumen de ejercicios</h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {lastCompleted.exercises.map((exercise, index) => {
              const catalog = findExercise(exercise.exerciseId)
              const volume = volumeOfExercise(exercise)
              return (
                <li
                  key={`${exercise.exerciseId}-${index}`}
                  className="ax-stagger flex min-h-16 items-center gap-3.5 border-b border-border px-4 py-2.5 last:border-b-0"
                  style={{ '--ax-index': index } as CSSProperties}
                >
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-fill">
                    {hasExerciseFigure(exercise.exerciseId) ? (
                      <ExerciseFigure exerciseId={exercise.exerciseId} animate={false} className="h-full w-full" />
                    ) : catalog?.imageUrl && (
                      <Image
                        src={catalog.imageUrl}
                        alt={exercise.name}
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-callout font-medium">{exercise.name}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">
                      {formatSets(exercise.sets, { isTimed: catalog?.work.isTimed ?? false })}
                    </p>
                  </div>
                  {/* Sin carga no hay volumen que enseñar: un «0 kg» no dice nada. */}
                  {volume > 0 && (
                    <span className="text-footnote font-medium tabular-nums text-muted-foreground">
                      {formatVolume(volume)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <EmptyNote className="mt-10">No llegaste a completar ninguna serie.</EmptyNote>
      )}

      {/* Esfuerzo (D-019): lo que usa la Carga. Números, no caras: no es cómo te sientes. */}
      <h3 className="mt-10 text-body font-semibold">¿Cuánto te ha costado?</h3>
      <div className="mt-4 flex items-start justify-between">
        {EFFORT_LEVELS.map((level) => {
          const selected = effort === level
          const edge = level === 1 || level === EFFORT_LEVELS.length
          return (
            <button
              key={level}
              type="button"
              onClick={() => void rateLastSession(level)}
              className="ax-press flex w-14 flex-col items-center gap-1.5"
              aria-label={`${level} · ${EFFORT_LABELS[level]}`}
              aria-pressed={selected}
            >
              <span
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full text-body font-semibold tabular-nums transition-colors duration-200',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground',
                )}
              >
                {level}
              </span>
              {edge && (
                <span
                  className={cn(
                    'text-overline font-medium',
                    selected ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {EFFORT_LABELS[level]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={dismissSummary}
        className="ax-press group mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-callout font-semibold text-primary-foreground"
      >
        Finalizar
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-active:translate-x-0.5" />
      </button>
    </div>
  )
}

/**
 * «+100 XP · Sesión», «+50 XP · Marca personal…». Al subir de nivel, un
 * aviso breve; el resto de días, solo la lista. AXIS dice los hechos.
 */
function SessionXp({ sessionId }: { sessionId: string }) {
  const { progression, profile } = useAxtlhetics()
  const award = sessionAward(sessionId, progression, profile?.availableWeekdays.length ?? 0)
  if (award.events.length === 0) return null
  const levelUp = award.levelAfter > award.levelBefore

  return (
    <section className="mt-6">
      {levelUp && (
        <div className="ax-enter mb-4 rounded-2xl bg-secondary p-4">
          <p className="text-overline font-semibold tracking-[0.16em] text-primary">NUEVO NIVEL</p>
          <p className="mt-1 text-headline font-bold">
            Nivel {award.levelAfter}
            {award.newRank && <span className="text-muted-foreground"> · {award.newRank}</span>}
          </p>
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {award.events.map((event, index) => (
          <li
            key={`${event.kind}-${index}`}
            className="ax-stagger inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-footnote"
            style={{ '--ax-index': index } as CSSProperties}
          >
            <span className="font-semibold tabular-nums text-primary">+{event.xp} XP</span>
            <span className="text-primary/70">{event.label}</span>
          </li>
        ))}
      </ul>
      {award.facts.length > 0 && (
        <div className="mt-3 flex items-start gap-2">
          <AxisBadge size="sm" />
          <p className="text-footnote text-muted-foreground text-pretty">{award.facts.join(' ')}</p>
        </div>
      )}
    </section>
  )
}

/** `reps` o `s`: los isométricos se miden en segundos. */
function repsUnit(exerciseId: string): string {
  return findExercise(exerciseId)?.work.isTimed ? 's' : 'reps'
}

function SummaryStat({ value, label, index }: { value: string; label: string; index: number }) {
  return (
    <div className="ax-stagger rounded-2xl bg-surface shadow-card px-3 py-4 text-center" style={{ '--ax-index': index } as CSSProperties}>
      <p className="text-headline font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-caption text-muted-foreground">{label}</p>
    </div>
  )
}
