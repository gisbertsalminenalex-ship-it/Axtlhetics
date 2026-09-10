'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import { Angry, ArrowRight, Check, Frown, Laugh, Meh, Smile } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { formatVolume } from '@/lib/domain/history/stats'
import { formatDuration } from '@/lib/domain/shared/dates'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { volumeOfExercise } from '@/lib/domain/workouts/types'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

const FEELINGS = [
  { icon: Angry, label: 'Muy mal' },
  { icon: Frown, label: '' },
  { icon: Meh, label: '' },
  { icon: Smile, label: '' },
  { icon: Laugh, label: 'Excelente' },
]

export function EntrenamientoCompletado() {
  const { lastCompleted, rateLastSession, dismissSummary } = useAxtlhetics()

  if (!lastCompleted) return null

  const feeling = lastCompleted.perceivedEffort
  const abandoned = lastCompleted.status === 'abandoned'

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

      {/* Success */}
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/12">
          <Check className="h-7 w-7 text-success" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">
          {abandoned ? 'Guardado igualmente.' : '¡Buen entrenamiento!'}
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {abandoned
            ? 'Hemos guardado lo que llegaste a hacer.'
            : 'Has completado tu sesión.'}
        </p>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface py-4 text-center">
        <SummaryStat index={0} value={formatDuration(lastCompleted.durationSeconds)} label="Tiempo total" />
        <SummaryStat index={1} value={String(lastCompleted.exercises.length)} label="Ejercicios" divider />
        <SummaryStat index={2} value={formatVolume(lastCompleted.totalVolumeKg)} label="Volumen total" divider />
      </div>

      {/* Lo que AXIS había recomendado para esta sesión */}
      {lastCompleted.proposal && (
        <div className="mt-4 flex items-start gap-2">
          <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {lastCompleted.proposal.reason}
          </p>
        </div>
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
              const image = findExercise(exercise.exerciseId)?.imageUrl ?? null
              const reps = exercise.sets[0]?.reps ?? 0
              return (
                <li
                  key={exercise.exerciseId}
                  className="ax-stagger flex items-center gap-3"
                  style={{ '--ax-index': index } as CSSProperties}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface">
                    {image && (
                      <Image
                        src={image}
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
                      {exercise.sets.length} × {reps}
                    </p>
                  </div>
                  <span className="text-[13.5px] font-medium tabular-nums text-muted-foreground">
                    {formatVolume(volumeOfExercise(exercise))}
                  </span>
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

      {/* Feeling */}
      <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">
        ¿Cómo te has sentido?
      </h3>
      <div className="mt-4 flex items-start justify-between">
        {FEELINGS.map(({ icon: Icon, label }, i) => {
          const level = i + 1
          const selected = feeling === level
          return (
            <button
              key={level}
              type="button"
              onClick={() => void rateLastSession(level)}
              className="ax-press flex flex-col items-center gap-1.5"
              aria-label={label || `Nivel ${level}`}
              aria-pressed={selected}
            >
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                  selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              {label && (
                <span
                  className={cn(
                    'text-[10.5px] font-medium',
                    selected ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {label}
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
