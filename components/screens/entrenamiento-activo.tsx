'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Check, ChevronRight, Minus, Plus, SkipForward } from 'lucide-react'
import {
  completedSetsTotal,
  currentEntry,
  currentSetNumber,
  currentVolumeKg,
  hasProgress,
  nextEntry,
  WEIGHT_STEP_KG,
} from '@/lib/domain/workouts/active-workout'
import { formatDuration } from '@/lib/domain/shared/dates'
import { formatVolume } from '@/lib/domain/history/stats'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

export function EntrenamientoActivo() {
  const {
    activeWorkout,
    adjustWeight,
    adjustReps,
    completeSet,
    skipExercise,
    finishWorkout,
    abandonWorkout,
  } = useAxtlhetics()

  const [elapsed, setElapsed] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirmingExit, setConfirmingExit] = useState(false)

  const startedAt = activeWorkout?.startedAt

  useEffect(() => {
    if (!startedAt) return
    const started = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
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

  if (!entry) return null

  /*
   * La confirmación ocupa la pantalla en vez de superponerse. No hay nada que
   * mirar detrás mientras se decide, y así no se puede tocar «Completar serie»
   * por error con la pregunta abierta. Una pantalla, una pregunta.
   */
  if (confirmingExit) {
    return (
      <ExitConfirmation
        completedSets={completedSetsTotal(activeWorkout)}
        elapsed={elapsed}
        onStay={() => setConfirmingExit(false)}
        onLeave={() => void abandonWorkout()}
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
            if (hasProgress(activeWorkout)) setConfirmingExit(true)
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
          onClick={skipExercise}
          aria-label="Saltar este ejercicio"
          className="-mr-2 flex h-11 w-11 items-center justify-center"
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

      {/* Current exercise */}
      <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
        EJERCICIO ACTUAL
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
        </div>
        {entry.imageUrl && (
          <div className="h-24 w-32 overflow-hidden rounded-2xl bg-surface">
            <Image
              src={entry.imageUrl}
              alt={`Ejecución de ${entry.name.toLowerCase()}`}
              width={160}
              height={120}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Weight + reps */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <ValueStepper
          value={entry.weightKg === null ? '—' : String(entry.weightKg)}
          unit="kg"
          onDecrease={() => adjustWeight(-1)}
          onIncrease={() => adjustWeight(1)}
          decreaseLabel={`Reducir carga ${WEIGHT_STEP_KG} kg`}
          increaseLabel={`Aumentar carga ${WEIGHT_STEP_KG} kg`}
        />
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

      {/* Next exercise */}
      {upcoming && (
        <>
          <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
            SIGUIENTE EJERCICIO
          </p>
          <div className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left">
            {upcoming.imageUrl ? (
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
                {upcoming.targetSets} series × {upcoming.targetReps}{' '}
                {upcoming.isTimed ? 'seg' : 'reps'}
              </span>
            </span>
          </div>
        </>
      )}

      {/* Stats */}
      <div className="mt-auto pt-7">
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-5 text-center">
          <Stat value={`${doneExercises}/${totalExercises}`} label="Ejercicios" />
          <Stat value={`${activeWorkout.plan.estimatedMinutes} min`} label="Duración estimada" />
          <Stat value={formatVolume(currentVolumeKg(activeWorkout))} label="Volumen" />
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-primary"
        >
          {detailsOpen ? 'Ocultar detalles' : 'Ver detalles del entrenamiento'}
          <ChevronRight
            className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-90')}
          />
        </button>

        {detailsOpen && (
          <ul className="mt-1 divide-y divide-border">
            {activeWorkout.entries.map((item, index) => (
              <li key={item.exerciseId} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    'w-4 text-[13px] font-semibold tabular-nums',
                    index < doneExercises ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {index + 1}
                </span>
                <span className="flex-1 text-[14.5px] font-medium">{item.name}</span>
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
 * Confirmación antes de dejar una sesión a medias.
 *
 * Mismo criterio que el borrado de datos en Perfil: la confirmación es parte de
 * la pantalla, no un `confirm()` del navegador, que bloquea la página entera.
 *
 * Dice exactamente qué pasa —se guarda como interrumpida y no se puede volver a
 * ella— porque es lo que el usuario necesita saber para decidir. Solo aparece
 * cuando hay series hechas: si no hay nada que perder, no se pregunta.
 */
function ExitConfirmation({
  completedSets,
  elapsed,
  onStay,
  onLeave,
}: {
  completedSets: number
  elapsed: number
  onStay: () => void
  onLeave: () => void
}) {
  return (
    /*
      Misma composición que una pregunta del onboarding: titular grande arriba y
      la acción debajo. No se centra en vertical porque el contenedor de pantalla
      de `page.tsx` no impone altura, así que un `min-h-full` aquí no resolvería.
    */
    <div className="ax-enter px-6 pt-10 pb-8">
      <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-balance">
        ¿Dejas el entrenamiento?
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
        Llevas{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {completedSets} {completedSets === 1 ? 'serie' : 'series'}
        </span>{' '}
        en {formatDuration(elapsed)}. Se guardará como sesión interrumpida y no podrás
        retomarla.
      </p>

      <div className="mt-10">
        <button
          type="button"
          onClick={onStay}
          className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          Seguir entrenando
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="ax-press mt-2 min-h-11 w-full text-[13.5px] font-semibold text-error"
        >
          Salir y guardar lo hecho
        </button>
      </div>
    </div>
  )
}

/**
 * Selector de carga y repeticiones.
 *
 * Mantiene la tarjeta grande del diseño aprobado y añade el `Set Stepper` que el
 * Design System §23 ya contemplaba, para poder registrar lo que se hace de verdad.
 */
function ValueStepper({
  value,
  unit,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
}: {
  value: string
  unit: string
  onDecrease: () => void
  onIncrease: () => void
  decreaseLabel: string
  increaseLabel: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-4 text-center">
      <p className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{unit}</p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onDecrease}
          aria-label={decreaseLabel}
          className="ax-press flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
        >
          <Minus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onIncrease}
          aria-label={increaseLabel}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
        >
          <Plus className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[17px] font-bold tracking-[-0.01em] tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground text-pretty">
        {label}
      </p>
    </div>
  )
}
