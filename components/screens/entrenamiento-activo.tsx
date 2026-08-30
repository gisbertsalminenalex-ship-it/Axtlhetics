'use client'

import Image from 'next/image'
import { ArrowLeft, MoreHorizontal, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEGMENTS = 6
const DONE = 3

export function EntrenamientoActivo({
  onBack,
  onFinish,
}: {
  onBack: () => void
  onFinish: () => void
}) {
  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-2 pb-5">
        <button type="button" onClick={onBack} aria-label="Volver">
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
          Fuerza · Tren superior
        </h1>
        <MoreHorizontal className="h-6 w-6 text-foreground" />
      </header>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < DONE ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
        <span className="ml-2 shrink-0 text-right text-[13px] font-semibold tabular-nums">
          32:15
          <span className="block text-[10px] font-normal text-muted-foreground">
            Tiempo total
          </span>
        </span>
      </div>

      {/* Current exercise */}
      <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
        EJERCICIO ACTUAL
      </p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-[-0.02em]">Press banca</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">Serie 3 de 4</p>
        </div>
        <div className="h-24 w-32 overflow-hidden rounded-2xl bg-surface">
          <Image
            src="/exercises/press-banca.png"
            alt="Ejecución de press banca"
            width={160}
            height={120}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Weight + reps */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface py-5 text-center">
          <p className="text-[34px] font-bold leading-none tracking-[-0.02em]">80</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">kg</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface py-5 text-center">
          <p className="text-[34px] font-bold leading-none tracking-[-0.02em]">8</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">reps</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-[15px] font-semibold text-primary-foreground"
      >
        Completar serie
        <Check className="h-4.5 w-4.5" strokeWidth={2.5} />
      </button>

      {/* Next exercise */}
      <p className="mt-7 text-[12px] font-semibold tracking-[0.14em] text-primary">
        SIGUIENTE EJERCICIO
      </p>
      <button
        type="button"
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface">
          <Image
            src="/exercises/remo-barra.png"
            alt="Remo con barra"
            width={64}
            height={64}
            className="h-full w-full object-cover"
          />
        </div>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">Remo con barra</span>
          <span className="block text-[12.5px] text-muted-foreground">
            4 series × 10 reps
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Stats */}
      <div className="mt-auto pt-7">
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-5 text-center">
          <Stat value="6" label="Ejercicios" />
          <Stat value="58:00" label="Duración estimada" />
          <Stat value="8.450 kg" label="Volumen estimado" />
        </div>
        <button
          type="button"
          className="mt-5 flex w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-primary"
        >
          Ver detalles del entrenamiento
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[17px] font-bold tracking-[-0.01em]">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground text-pretty">
        {label}
      </p>
    </div>
  )
}
