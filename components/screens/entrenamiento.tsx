'use client'

import Image from 'next/image'
import { Bell, Clock, Dumbbell, ChevronRight } from 'lucide-react'
import { WeeklyActivity } from '@/components/weekly-activity'

export function EntrenamientoScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Entrenamiento</h1>
        <Bell className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      </header>
      <p className="text-[15px] text-muted-foreground">Tu próximo paso empieza aquí.</p>

      {/* HOY */}
      <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
        HOY
      </p>

      <section className="mt-3 rounded-3xl border border-border bg-background p-5 shadow-[0_1px_2px_rgba(10,10,11,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
              Fuerza · Tren superior
            </h2>
            <div className="mt-2.5 flex items-center gap-4 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" strokeWidth={1.75} />
                60 min
              </span>
              <span className="flex items-center gap-1.5">
                <Dumbbell className="h-4 w-4" strokeWidth={1.75} />
                6 ejercicios
              </span>
            </div>
          </div>
          <Image
            src="/anatomy-upper.png"
            alt="Grupo muscular del tren superior destacado"
            width={72}
            height={96}
            className="h-24 w-auto object-contain"
          />
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
          Trabaja fuerza y técnica con una intensidad adaptada al estado de hoy.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground"
        >
          Empezar entrenamiento
        </button>
      </section>

      {/* Planificación */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Tu planificación
      </h3>
      <button
        type="button"
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background">
          <Dumbbell className="h-5 w-5 text-foreground" strokeWidth={1.75} />
        </span>
        <span className="flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">
            Último entrenamiento
          </span>
          <span className="block text-[15px] font-semibold">
            Fuerza · Tren inferior
          </span>
          <span className="block text-[12px] text-muted-foreground">Ayer · 55 min</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Esta semana */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">Esta semana</h3>
      <WeeklyActivity done={3} today={3} className="mt-4" />

      {/* Ver historial */}
      <button
        type="button"
        className="mt-8 flex w-full items-center justify-between rounded-2xl border border-border bg-background p-4 text-[14px] font-medium"
      >
        Ver historial de entrenamientos
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  )
}
