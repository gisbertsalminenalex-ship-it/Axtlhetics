'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Check, ChevronRight, SkipForward, Undo2 } from 'lucide-react'
import { ExerciseFigure, hasExerciseFigure } from '@/components/exercise-figure'
import { Confirmation } from '@/components/workout/confirmation'
import { RestTimer } from '@/components/workout/rest-timer'
import { ValueStepper } from '@/components/workout/value-stepper'
import {
  canUndoLastSet,
  completedSetsTotal,
  currentEntry,
  currentSetNumber,
  currentVolumeKg,
  hasProgress,
  nextEntry,
  reserveQuestionFor,
  restState,
  takesWeight,
  WEIGHT_STEP_KG,
  type ActiveExerciseEntry,
  type RestState,
} from '@/lib/domain/workouts/active-workout'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { formatKg, formatSets, lastPerformedExercise } from '@/lib/domain/workouts/history'
import { phaseLabel, REPS_IN_RESERVE_LABELS, REPS_IN_RESERVE_ORDER, type RepsInReserve } from '@/lib/domain/workouts/types'
import { formatDuration } from '@/lib/domain/shared/dates'
import { formatVolume } from '@/lib/domain/history/stats'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

export function EntrenamientoActivo() {
  const {
    activeWorkout,
    sessions,
    adjustWeight,
    adjustReps,
    completeSet,
    undoLastSet,
    skipExercise,
    skipRest,
    extendRest,
    setReserve,
    finishWorkout,
    abandonWorkout,
  } = useAxtlhetics()

  const [now, setNow] = useState(() => new Date())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirming, setConfirming] = useState<'exit' | 'skip' | null>(null)

  const startedAt = activeWorkout?.startedAt

  // Un solo reloj para la pantalla: el tiempo total y la cuenta atrás del descanso.
  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  // Cuando ya no quedan ejercicios, la sesión pasa sola al resumen.
  const finished = activeWorkout !== null && currentEntry(activeWorkout) === null

  useEffect(() => {
    if (finished) void finishWorkout(null)
  }, [finished, finishWorkout])

  if (!activeWorkout) return null

  const entry = currentEntry(activeWorkout)
  const upcoming = nextEntry(activeWorkout)
  const totalExercises = activeWorkout.entries.length
  const doneExercises = activeWorkout.exerciseIndex
  const elapsed = Math.max(0, Math.round((now.getTime() - new Date(activeWorkout.startedAt).getTime()) / 1000))

  if (!entry) return null

  const rest = restState(activeWorkout, now)
  const canUndo = canUndoLastSet(activeWorkout)

  /*
   * Las confirmaciones ocupan la pantalla en vez de superponerse. No hay nada que
   * mirar detrás mientras se decide, y así no se puede tocar «Completar serie»
   * por error con la pregunta abierta. Una pantalla, una pregunta.
   */
  if (confirming === 'exit') {
    const sets = completedSetsTotal(activeWorkout)
    return (
      <Confirmation
        title="¿Dejas el entrenamiento?"
        body={
          <>
            Llevas{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {sets} {sets === 1 ? 'serie' : 'series'}
            </span>{' '}
            en {formatDuration(elapsed)}. Se guardará como sesión interrumpida y no podrás
            retomarla.
          </>
        }
        stayLabel="Seguir entrenando"
        leaveLabel="Salir y guardar lo hecho"
        leaveTone="error"
        onStay={() => setConfirming(null)}
        onLeave={() => void abandonWorkout()}
      />
    )
  }

  if (confirming === 'skip') {
    return (
      <Confirmation
        title={`¿Saltas ${entry.name.toLowerCase()}?`}
        body="Pasarás al siguiente ejercicio y este quedará registrado como no completado. No se puede deshacer."
        stayLabel="Seguir con el ejercicio"
        leaveLabel="Saltar ejercicio"
        leaveTone="muted"
        onStay={() => setConfirming(null)}
        onLeave={() => {
          skipExercise()
          setConfirming(null)
        }}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-2 pb-5">
        <button
          type="button"
          /*
           * Con series hechas, salir no es gratis: la sesión se cierra como
           * interrumpida y no se puede volver a ella. Se pregunta. Sin nada
           * hecho no hay nada que perder y se sale directo, sin fricción.
           */
          onClick={() => {
            if (hasProgress(activeWorkout)) setConfirming('exit')
            else void abandonWorkout()
          }}
          aria-label="Salir del entrenamiento"
          className="ax-press -ml-2 flex h-11 w-11 items-center justify-center"
        >
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
          {activeWorkout.plan.title}
        </h1>
        <button
          type="button"
          // Saltar no se puede deshacer: se confirma en la propia pantalla (D-019).
          onClick={() => setConfirming('skip')}
          aria-label="Saltar este ejercicio"
          className="ax-press -mr-2 flex h-11 w-11 items-center justify-center"
        >
          <SkipForward className="h-5 w-5 text-foreground" strokeWidth={1.75} />
        </button>
      </header>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalExercises }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < doneExercises ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
        <span className="ml-2 shrink-0 text-right text-[13px] font-semibold tabular-nums">
          {formatDuration(elapsed)}
          <span className="block text-[10px] font-normal text-muted-foreground">
            Tiempo total
          </span>
        </span>
      </div>

      {rest ? (
        <RestPanel
          rest={rest}
          entry={entry}
          setNumber={currentSetNumber(activeWorkout)}
          canUndo={canUndo}
          onSkip={skipRest}
          onExtend={extendRest}
          onUndo={undoLastSet}
          reserve={reserveFor(activeWorkout, setReserve)}
        />
      ) : (
        <>
          {/* Current exercise */}
          <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
            {phaseLabel(entry)?.toUpperCase() ?? 'EJERCICIO ACTUAL'}
          </p>
          <div key={entry.exerciseId} className="ax-enter mt-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[26px] font-bold tracking-[-0.02em]">{entry.name}</h2>
              <p
                key={entry.sets.length}
                className="ax-fade mt-1 text-[14px] text-muted-foreground tabular-nums"
              >
                Serie {currentSetNumber(activeWorkout)} de {entry.targetSets}
                {entry.unilateral ? ' · por lado' : ''}
              </p>
              <LastTime entry={entry} sessions={sessions} />
            </div>
            {hasExerciseFigure(entry.exerciseId) ? (
              <ExerciseFigure exerciseId={entry.exerciseId} className="h-24 w-32 shrink-0 rounded-2xl bg-surface" />
            ) : (
              entry.imageUrl && (
                <div className="h-24 w-32 overflow-hidden rounded-2xl bg-surface">
                  <Image
                    src={entry.imageUrl}
                    alt={`Ejecución de ${entry.name.toLowerCase()}`}
                    width={160}
                    height={120}
                    className="h-full w-full object-cover"
                  />
                </div>
              )
            )}
          </div>

          {/* Carga y repeticiones. Sin pesa no hay kilos que poner: solo repeticiones o segundos. */}
          <div className={cn('mt-6 grid gap-3', takesWeight(entry) ? 'grid-cols-2' : 'grid-cols-1')}>
            {takesWeight(entry) && (
              <ValueStepper
                value={entry.weightKg === null ? '—' : formatKg(entry.weightKg)}
                unit="kg"
                onDecrease={() => adjustWeight(-1)}
                onIncrease={() => adjustWeight(1)}
                decreaseLabel={`Reducir carga ${formatKg(WEIGHT_STEP_KG)} kg`}
                increaseLabel={`Aumentar carga ${formatKg(WEIGHT_STEP_KG)} kg`}
              />
            )}
            <ValueStepper
              value={String(entry.reps)}
              unit={entry.isTimed ? 'seg' : 'reps'}
              onDecrease={() => adjustReps(-1)}
              onIncrease={() => adjustReps(1)}
              decreaseLabel={entry.isTimed ? 'Reducir segundos' : 'Reducir repeticiones'}
              increaseLabel={entry.isTimed ? 'Aumentar segundos' : 'Aumentar repeticiones'}
            />
          </div>

          <button
            type="button"
            onClick={completeSet}
            className="ax-press mt-4 flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            Completar serie
            <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>

          {canUndo && <UndoButton onUndo={undoLastSet} />}

          <HowTo exerciseId={entry.exerciseId} />
        </>
      )}

      {/* Next exercise */}
      {upcoming && (
        <>
          <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
            SIGUIENTE EJERCICIO
          </p>
          <div className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left">
            {hasExerciseFigure(upcoming.exerciseId) ? (
              <ExerciseFigure exerciseId={upcoming.exerciseId} animate={false} className="h-12 w-12 shrink-0 rounded-xl bg-surface" />
            ) : upcoming.imageUrl ? (
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface">
                <Image
                  src={upcoming.imageUrl}
                  alt={upcoming.name}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-xl bg-surface" aria-hidden="true" />
            )}
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{upcoming.name}</span>
              <span className="block text-[12.5px] text-muted-foreground tabular-nums">
                {upcoming.phase
                  ? `${phaseLabel(upcoming)} · ${upcoming.targetReps} ${upcoming.isTimed ? 'seg' : 'reps'}`
                  : `${upcoming.targetSets} series × ${upcoming.targetReps} ${upcoming.isTimed ? 'seg' : 'reps'}`}
              </span>
            </span>
          </div>
        </>
      )}

      {/*
        Stats. Se quedan, pero en segundo plano (D-019): durante la sesión manda
        qué hacer ahora, no cuánto se lleva. Nada aquí compite con el ejercicio,
        la serie o «Completar serie».
      */}
      <div className="mt-auto pt-7">
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
          <Stat value={`${doneExercises}/${totalExercises}`} label="Ejercicios" />
          <Stat value={`${activeWorkout.plan.estimatedMinutes} min`} label="Duración estimada" />
          <Stat value={formatVolume(currentVolumeKg(activeWorkout))} label="Volumen" />
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground"
        >
          {detailsOpen ? 'Ocultar detalles' : 'Ver detalles del entrenamiento'}
          <ChevronRight
            className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-90')}
          />
        </button>

        {detailsOpen && (
          <ul className="mt-1 divide-y divide-border">
            {activeWorkout.entries.map((item, index) => (
              <li key={`${item.exerciseId}-${index}`} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    'w-4 text-[13px] font-semibold tabular-nums',
                    index < doneExercises ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {index + 1}
                </span>
                <span className="flex-1">
                  <span className="block text-[14.5px] font-medium">{item.name}</span>
                  {item.phase && (
                    <span className="block text-[12px] text-muted-foreground">{phaseLabel(item)}</span>
                  )}
                </span>
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  {item.sets.length}/{item.targetSets} series
                </span>
              </li>
            ))}
            <li className="py-3 text-[12.5px] text-muted-foreground tabular-nums">
              {completedSetsTotal(activeWorkout)} series completadas
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * La última vez que se hizo este ejercicio, en una línea discreta (D-019).
 *
 * Solo si hay una sesión completada que lo tenga: sin dato no se dice nada, ni
 * «primera vez», que sería afirmar algo que el historial local no garantiza.
 */
function LastTime({
  entry,
  sessions,
}: {
  entry: ActiveExerciseEntry
  sessions: Parameters<typeof lastPerformedExercise>[1]
}) {
  // En el calentamiento no hay marca que comparar (D-032).
  if (entry.phase) return null
  const last = lastPerformedExercise(entry.exerciseId, sessions)
  if (!last) return null
  return (
    <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
      La última vez: {formatSets(last.sets, { isTimed: entry.isTimed })}
    </p>
  )
}

type ReserveQuestion = { name: string; value: RepsInReserve | null; onSelect: (value: RepsInReserve) => void }

/** La pregunta de la última serie, si toca (D-052). */
function reserveFor(
  workout: Parameters<typeof reserveQuestionFor>[0],
  setReserve: (index: number, value: RepsInReserve) => void,
): ReserveQuestion | null {
  const index = reserveQuestionFor(workout)
  if (index === null) return null
  const finished = workout.entries[index]
  return { name: finished.name, value: finished.reserve ?? null, onSelect: (value) => setReserve(index, value) }
}

/** Descanso entre series (D-019): el RestTimer compartido, con deshacer y, tras la última serie, la pregunta de D-052. */
function RestPanel({
  rest,
  entry,
  setNumber,
  canUndo,
  onSkip,
  onExtend,
  onUndo,
  reserve,
}: {
  rest: RestState
  entry: ActiveExerciseEntry
  setNumber: number
  canUndo: boolean
  onSkip: () => void
  onExtend: () => void
  onUndo: () => void
  reserve: ReserveQuestion | null
}) {
  const next = [
    `Serie ${setNumber} de ${entry.targetSets}`,
    `${entry.reps} ${entry.isTimed ? 's' : 'reps'}`,
    entry.weightKg === null ? null : `${formatKg(entry.weightKg)} kg`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <RestTimer rest={rest} nextName={entry.name} nextDetail={next} onSkip={onSkip} onExtend={onExtend}>
      {reserve && <ReservePicker question={reserve} />}
      {canUndo && <UndoButton onUndo={onUndo} />}
    </RestTimer>
  )
}

/** «¿Cuántas te quedaban?» tras la última serie de un ejercicio (D-052). Opcional. */
function ReservePicker({ question }: { question: ReserveQuestion }) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left">
      <p className="text-[13.5px] font-semibold">¿Cuántas te quedaban en la última serie?</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{question.name} · AXIS ajusta la próxima vez</p>
      <div className="mt-3 flex gap-1.5">
        {REPS_IN_RESERVE_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => question.onSelect(value)}
            aria-pressed={question.value === value}
            className={cn(
              'ax-press h-11 flex-1 rounded-full border text-[14px] font-semibold transition-colors',
              question.value === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {REPS_IN_RESERVE_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Deshacer la última serie: para el toque por error, sin confirmar (D-019). */
function UndoButton({ onUndo }: { onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      className="ax-press mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 text-[13.5px] font-medium text-muted-foreground"
    >
      <Undo2 className="h-4 w-4" strokeWidth={1.75} />
      Deshacer última serie
    </button>
  )
}

/** Cómo se hace el ejercicio actual (D-043): posición, movimiento y el detalle clave, del catálogo. */
function HowTo({ exerciseId }: { exerciseId: string }) {
  const instructions = findExercise(exerciseId)?.instructions
  if (!instructions) return null
  return (
    <section key={exerciseId} className="ax-fade mt-6 rounded-2xl bg-surface px-4 py-3.5">
      <h3 className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground">CÓMO SE HACE</h3>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-pretty">{instructions}</p>
    </section>
  )
}

/** Dato secundario de la sesión: legible, pero sin peso visual (D-019). */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-muted-foreground tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground text-pretty">
        {label}
      </p>
    </div>
  )
}
