'use client'

import { Bell, Moon, ArrowRight, Heart, Dumbbell, GlassWater, X } from 'lucide-react'
import { useState } from 'react'
import { AxisMark } from '@/components/axis-mark'
import { CircularMetric } from '@/components/circular-metric'
import { WeeklyActivity } from '@/components/weekly-activity'

export function InicioScreen({
  onStartTraining,
  onGoRecuperacion,
}: {
  onStartTraining: () => void
  onGoRecuperacion: () => void
}) {
  const [axisOpen, setAxisOpen] = useState(true)

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
        <Bell className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      </header>

      {/* Greeting */}
      <p className="text-[15px] font-medium text-muted-foreground">Hola, Alex.</p>
      <h1 className="mt-1 text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-balance">
        Día de cumplir.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
        Tu cuerpo está listo para avanzar. Aprovecha este momento.
      </p>

      {/* AXIS recommendation — protagonist */}
      {axisOpen && (
        <section className="mt-6 rounded-3xl bg-ink p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AxisMark className="h-4 w-4 text-white" />
              <span className="text-[11px] font-semibold tracking-[0.16em] text-white/60">
                RECOMENDACIÓN DE AXIS
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAxisOpen(false)}
              aria-label="Descartar recomendación"
            >
              <X className="h-4 w-4 text-white/50" />
            </button>
          </div>
          <h2 className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.01em]">
            Entrena tren superior con intensidad moderada.
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">
            Tu recuperación es buena y la carga de ayer fue alta, así que conviene
            estimular sin sobrecargar.
          </p>
          <button
            type="button"
            onClick={onStartTraining}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground"
          >
            Empezar entrenamiento
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {/* Estado de hoy */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Tu estado de hoy
      </h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StateMetric
          label="Recuperación"
          status="Buena"
          statusColor="text-success"
        >
          <CircularMetric value={82} tone="success" size={68}>
            <span className="text-[19px] font-bold leading-none">82</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </CircularMetric>
        </StateMetric>

        <StateMetric label="Sueño" status="Bueno" statusColor="text-success">
          <div className="flex h-[68px] w-[68px] flex-col items-center justify-center gap-1">
            <Moon className="h-6 w-6 text-foreground" strokeWidth={1.75} />
            <span className="text-[15px] font-bold leading-none">7h 32m</span>
          </div>
        </StateMetric>

        <StateMetric label="Carga" status="Moderada" statusColor="text-warning">
          <CircularMetric value={74} tone="warning" size={68}>
            <span className="text-[19px] font-bold leading-none">74</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </CircularMetric>
        </StateMetric>
      </div>

      {/* Esta semana */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Esta semana
      </h3>
      <WeeklyActivity done={3} today={3} className="mt-4" />

      {/* Accesos rápidos */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Accesos rápidos
      </h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <QuickAccess icon={Heart} label="Recuperación" onClick={onGoRecuperacion} />
        <QuickAccess
          icon={Dumbbell}
          label="Último entrenamiento"
          onClick={onStartTraining}
        />
        <QuickAccess icon={GlassWater} label="Hidratación" onClick={onGoRecuperacion} />
      </div>
    </div>
  )
}

function StateMetric({
  label,
  status,
  statusColor,
  children,
}: {
  label: string
  status: string
  statusColor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
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
      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-4"
    >
      <Icon className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      <span className="text-[11.5px] font-medium leading-tight text-muted-foreground text-pretty">
        {label}
      </span>
    </button>
  )
}
