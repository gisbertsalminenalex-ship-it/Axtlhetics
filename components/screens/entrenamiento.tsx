'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ChevronRight, Clock, Dumbbell } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { WeeklyActivity } from '@/components/weekly-activity'
import { isTrainingRecommendation } from '@/lib/domain/axis/types'
import { formatDuration, formatRelativeDay } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

export function EntrenamientoScreen({
  onStart,
  onGoRecuperacion,
  onGoHistorial,
  onOpenAxis,
}: {
  onStart: () => void
  onGoRecuperacion: () => void
  onGoHistorial: () => void
  onOpenAxis: () => void
}) {
  const { proposal, openChangeConversation, sessions, weeklyActivity, today } =
    useAxtlhetics()

  const trains = proposal ? isTrainingRecommendation(proposal.type) : false
  const session = proposal?.session ?? null
  const lastSession = sessions.find((item) => item.status === 'completed') ?? null

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Entrenamiento</h1>
      </header>
      <p className="text-[15px] text-muted-foreground">Tu próximo paso empieza aquí.</p>

      {/* HOY */}
      <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">HOY</p>

      <section
        key={proposal?.id}
        className="ax-enter mt-3 rounded-3xl border border-border bg-background p-5 shadow-[0_1px_2px_rgba(10,10,11,0.04)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
              {session ? session.title : 'Hoy toca recuperar'}
            </h2>
            {session && (
              <div className="mt-2.5 flex items-center gap-4 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Clock className="h-4 w-4" strokeWidth={1.75} />
                  {session.estimatedMinutes} min
                </span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Dumbbell className="h-4 w-4" strokeWidth={1.75} />
                  {session.exercises.length} ejercicios
                </span>
              </div>
            )}
          </div>
          {session?.focus === 'tren_superior' && (
            <Image
              src="/anatomy-upper.png"
              alt="Grupo muscular del tren superior destacado"
              width={72}
              height={96}
              className="h-24 w-auto object-contain"
            />
          )}
        </div>

        <div className="mt-3 flex items-start gap-2">
          <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
            {proposal?.reason ?? 'Registra tu recuperación para que AXIS pueda recomendarte algo.'}
          </p>
        </div>

        <button
          type="button"
          onClick={trains ? onStart : onGoRecuperacion}
          className="ax-press mt-4 h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          {trains ? 'Empezar entrenamiento' : 'Ver recuperación'}
        </button>

        {proposal && (
          <button
            type="button"
            onClick={() => {
              openChangeConversation()
              onOpenAxis()
            }}
            className="ax-press mt-2 min-h-11 w-full text-[13.5px] font-semibold text-primary"
          >
            Cambiar entrenamiento
          </button>
        )}
      </section>

      {/* Ejercicios de la sesión propuesta */}
      {session && session.exercises.length > 0 && (
        <>
          <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
            Lo que harás hoy
          </h3>
          <ul className="mt-3 divide-y divide-border">
            {session.exercises.map((exercise, index) => (
              <li
                key={exercise.exerciseId}
                className="ax-stagger flex items-center gap-3 py-3"
                style={{ '--ax-index': index } as CSSProperties}
              >
                <span className="w-4 text-[13px] font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex-1 text-[15px] font-medium">{exercise.name}</span>
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  {exercise.sets} × {exercise.reps}
                  {exercise.isTimed ? ' s' : ''}
                  {exercise.suggestedWeightKg !== null && ` · ${exercise.suggestedWeightKg} kg`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Planificación */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Tu planificación</h3>
      {lastSession ? (
        <button
          type="button"
          onClick={onGoHistorial}
          className="ax-press mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background">
            <Dumbbell className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          </span>
          <span className="flex-1">
            <span className="block text-[11px] font-medium text-muted-foreground">
              Último entrenamiento
            </span>
            <span className="block text-[15px] font-semibold">{lastSession.title}</span>
            <span className="block text-[12px] text-muted-foreground">
              {formatRelativeDay(lastSession.dayKey, today)} ·{' '}
              {formatDuration(lastSession.durationSeconds)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
          Todavía no has completado ningún entrenamiento.
        </p>
      )}

      {/* Esta semana */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Esta semana</h3>
      <WeeklyActivity
        completedDays={weeklyActivity.completedDays}
        today={weeklyActivity.todayIndex}
        className="mt-4"
      />

      {/* Ver historial */}
      <button
        type="button"
        onClick={onGoHistorial}
        className="ax-press mt-8 flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-background p-4 text-[14px] font-medium"
      >
        Ver historial de entrenamientos
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  )
}
