'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ArrowRight, Check, Pause } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { ExerciseFigure, hasExerciseFigure } from '@/components/exercise-figure'
import { closingMessage } from '@/lib/domain/axis/closing'
import { formatVolume } from '@/lib/domain/history/stats'
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
    <div className="px-6 pb-8">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-2 pb-6">
        <span className="h-11 w-11" aria-hidden="true" />
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
          {abandoned ? 'Entrenamiento interrumpido' : 'Entrenamiento completado'}
        </h1>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      {/* Cierre. El verde es de éxito: una sesión interrumpida no lo lleva. */}
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full',
            abandoned ? 'bg-surface' : 'bg-success/12',
          )}
        >
          {abandoned ? (
            <Pause className="h-7 w-7 text-muted-foreground" strokeWidth={2} />
          ) : (
            <Check className="h-7 w-7 text-success" strokeWidth={2.5} />
          )}
        </span>
        <h2 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">
          {abandoned ? 'Guardado igualmente.' : 'Sesión completada.'}
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {abandoned ? 'Hemos guardado lo que llegaste a hacer.' : 'Has terminado tu sesión.'}
        </p>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface py-4 text-center">
        <SummaryStat index={0} value={formatDuration(lastCompleted.durationSeconds)} label="Tiempo total" />
        <SummaryStat index={1} value={String(lastCompleted.exercises.filter(isMainExercise).length)} label="Ejercicios" divider />
        <SummaryStat index={2} value={formatVolume(lastCompleted.totalVolumeKg)} label="Volumen total" divider />
      </div>

      {/* Lo que AXIS concluye de la sesión (D-019), no el motivo con el que la propuso. */}
      <div className="mt-4 flex items-start gap-2">
        <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {closingMessage(lastCompleted, records)}
        </p>
      </div>

      {/* Récords: solo frente a algo registrado antes, sin insignias. */}
      {records.length > 0 && (
        <>
          <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">Récords personales</h3>
          <ul className="mt-3 space-y-2">
            {records.map((record) => (
              <li key={`${record.exerciseId}-${record.kind}`} className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="block text-[14.5px] font-semibold">{record.name}</span>
                  {/* La marca cuenta aunque quedara a medias, pero no se confunde con haberlo hecho todo. */}
                  {!completedAsPlanned(record.exerciseId) && (
                    <span className="block text-[12px] text-muted-foreground">
                      Ejercicio sin completar
                    </span>
                  )}
                </span>
                <span className="text-[13px] tabular-nums text-muted-foreground">
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
            <li key={index} className="text-[12.5px] text-muted-foreground">
              {modification.detail}
            </li>
          ))}
        </ul>
      )}

      {/* Resumen de ejercicios */}
      {lastCompleted.exercises.length > 0 ? (
        <>
          <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">
            Resumen de ejercicios
          </h3>
          <ul className="mt-3 space-y-3">
            {lastCompleted.exercises.map((exercise, index) => {
              const catalog = findExercise(exercise.exerciseId)
              const volume = volumeOfExercise(exercise)
              return (
                <li
                  key={`${exercise.exerciseId}-${index}`}
                  className="ax-stagger flex items-center gap-3"
                  style={{ '--ax-index': index } as CSSProperties}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface">
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
                  <div className="flex-1">
                    <p className="text-[14.5px] font-semibold leading-tight">
                      {index + 1}. {exercise.name}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground tabular-nums">
                      {formatSets(exercise.sets, { isTimed: catalog?.work.isTimed ?? false })}
                    </p>
                  </div>
                  {/* Sin carga no hay volumen que enseñar: un «0 kg» no dice nada. */}
                  {volume > 0 && (
                    <span className="text-[13.5px] font-medium tabular-nums text-muted-foreground">
                      {formatVolume(volume)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="mt-7 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
          No llegaste a completar ninguna serie.
        </p>
      )}

      {/* Esfuerzo (D-019): lo que usa la Carga. Números, no caras: no es cómo te sientes. */}
      <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">
        ¿Cuánto te ha costado?
      </h3>
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
                  'flex h-11 w-11 items-center justify-center rounded-full border text-[16px] font-semibold tabular-nums transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                {level}
              </span>
              {edge && (
                <span
                  className={cn(
                    'text-[10.5px] font-medium',
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
        className="ax-press mt-8 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        Finalizar
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** `reps` o `s`: los isométricos se miden en segundos. */
function repsUnit(exerciseId: string): string {
  return findExercise(exerciseId)?.work.isTimed ? 's' : 'reps'
}

function SummaryStat({
  value,
  label,
  divider,
  index,
}: {
  value: string
  label: string
  divider?: boolean
  index: number
}) {
  return (
    <div
      className={cn('ax-stagger', divider && 'border-l border-border')}
      style={{ '--ax-index': index } as CSSProperties}
    >
      <p className="text-[17px] font-bold tracking-[-0.01em] tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground text-pretty">{label}</p>
    </div>
  )
}
