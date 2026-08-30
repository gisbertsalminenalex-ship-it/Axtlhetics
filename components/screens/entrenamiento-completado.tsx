'use client'

import Image from 'next/image'
import { useState } from 'react'
import {
  ArrowLeft,
  Share,
  Check,
  ChevronRight,
  ArrowRight,
  Angry,
  Frown,
  Meh,
  Smile,
  Laugh,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EXERCISES = [
  { n: 1, name: 'Press banca', scheme: '4 × 8', vol: '3.200 kg', img: '/exercises/press-banca.png' },
  { n: 2, name: 'Remo con barra', scheme: '4 × 10', vol: '2.800 kg', img: '/exercises/remo-barra.png' },
  { n: 3, name: 'Press militar', scheme: '3 × 8', vol: '1.920 kg', img: '/exercises/press-militar.png' },
]

const FEELINGS = [
  { icon: Angry, label: 'Muy mal' },
  { icon: Frown, label: '' },
  { icon: Meh, label: '' },
  { icon: Smile, label: '' },
  { icon: Laugh, label: 'Excelente' },
]

export function EntrenamientoCompletado({ onClose }: { onClose: () => void }) {
  const [feeling, setFeeling] = useState(3)

  return (
    <div className="px-6 pb-8">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-2 pb-6">
        <button type="button" onClick={onClose} aria-label="Volver">
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
          Entrenamiento completado
        </h1>
        <Share className="h-5 w-5 text-foreground" strokeWidth={1.75} />
      </header>

      {/* Success */}
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/12">
          <Check className="h-7 w-7 text-success" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">
          ¡Buen entrenamiento!
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Has completado tu sesión.
        </p>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface py-4 text-center">
        <SummaryStat value="58:24" label="Tiempo total" />
        <SummaryStat value="6" label="Ejercicios" divider />
        <SummaryStat value="8.450 kg" label="Volumen total" divider />
      </div>

      {/* Resumen de ejercicios */}
      <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">
        Resumen de ejercicios
      </h3>
      <ul className="mt-3 space-y-3">
        {EXERCISES.map((ex) => (
          <li key={ex.n} className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface">
              <Image
                src={ex.img || "/placeholder.svg"}
                alt={ex.name}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold leading-tight">
                {ex.n}. {ex.name}
              </p>
              <p className="text-[12.5px] text-muted-foreground">{ex.scheme}</p>
            </div>
            <span className="text-[13.5px] font-medium tabular-nums text-muted-foreground">
              {ex.vol}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-4 flex items-center gap-1 text-[13.5px] font-semibold text-primary"
      >
        Ver todos los ejercicios
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Feeling */}
      <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">
        ¿Cómo te has sentido?
      </h3>
      <div className="mt-4 flex items-start justify-between">
        {FEELINGS.map(({ icon: Icon, label }, i) => {
          const selected = i === feeling
          return (
            <button
              key={i}
              type="button"
              onClick={() => setFeeling(i)}
              className="flex flex-col items-center gap-1.5"
              aria-label={label || `Nivel ${i + 1}`}
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
        onClick={onClose}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-[15px] font-semibold text-primary-foreground"
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
}: {
  value: string
  label: string
  divider?: boolean
}) {
  return (
    <div className={cn(divider && 'border-l border-border')}>
      <p className="text-[17px] font-bold tracking-[-0.01em]">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground text-pretty">{label}</p>
    </div>
  )
}
