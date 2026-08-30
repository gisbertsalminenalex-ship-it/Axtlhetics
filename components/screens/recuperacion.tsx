'use client'

import { useState } from 'react'
import { Bell, Moon, Activity, Dumbbell, Zap, Droplet, ChevronRight } from 'lucide-react'
import { CircularMetric } from '@/components/circular-metric'
import { cn } from '@/lib/utils'

const FACTORS = [
  { icon: Moon, label: 'Sueño', value: '7h 32m', status: 'Bueno', tone: 'text-success' },
  { icon: Activity, label: 'Estrés', value: 'Bajo', status: 'Bueno', tone: 'text-success' },
  { icon: Dumbbell, label: 'Fatiga muscular', value: 'Baja', status: 'Óptimo', tone: 'text-primary' },
  { icon: Zap, label: 'Energía', value: 'Alta', status: 'Bueno', tone: 'text-success' },
]

export function RecuperacionScreen() {
  const [glasses, setGlasses] = useState<boolean[]>(() =>
    Array.from({ length: 8 }, (_, i) => i < 7),
  )
  const filled = glasses.filter(Boolean).length

  const toggle = (i: number) =>
    setGlasses((prev) => prev.map((g, idx) => (idx === i ? !g : g)))

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Recuperación</h1>
        <Bell className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      </header>

      {/* Score — protagonist */}
      <section className="flex flex-col items-center rounded-3xl border border-border bg-background px-5 py-8 text-center shadow-[0_1px_2px_rgba(10,10,11,0.04)]">
        <p className="text-[13px] font-medium text-muted-foreground">
          Tu recuperación
        </p>
        <CircularMetric value={82} tone="success" size={150} stroke={9} className="mt-4">
          <span className="text-[46px] font-bold leading-none tracking-[-0.03em]">
            82
          </span>
          <span className="text-[13px] text-muted-foreground">/100</span>
        </CircularMetric>
        <p className="mt-5 text-[16px] font-semibold text-success">Buen estado</p>
        <p className="mt-2 max-w-[16rem] text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
          Estás recuperado y listo para entrenar. Mantén la consistencia.
        </p>
      </section>

      {/* Factores clave */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Factores clave
      </h3>
      <ul className="mt-2 divide-y divide-border">
        {FACTORS.map(({ icon: Icon, label, value, status, tone }) => (
          <li key={label} className="flex items-center gap-3 py-3.5">
            <Icon className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
            <span className="flex-1 text-[15px] font-medium">{label}</span>
            <span className="text-right">
              <span className="block text-[14px] font-semibold tabular-nums">
                {value}
              </span>
              <span className={cn('block text-[12px] font-medium', tone)}>
                {status}
              </span>
            </span>
          </li>
        ))}

        {/* Hidratación */}
        <li className="py-4">
          <div className="flex items-center gap-3">
            <Droplet className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
            <span className="flex-1 text-[15px] font-medium">Hidratación</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-1.5 pl-8">
            {glasses.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-label={`Vaso ${i + 1}`}
                aria-pressed={f}
                className="flex-1"
              >
                <Glass filled={f} />
              </button>
            ))}
          </div>
          <p className="mt-2 pl-8 text-[12.5px] text-muted-foreground tabular-nums">
            {filled} / 8 vasos
          </p>
        </li>
      </ul>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-between text-[14px] font-semibold text-primary"
      >
        Ver todos los factores
        <ChevronRight className="h-4.5 w-4.5" />
      </button>
    </div>
  )
}

function Glass({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 26" className="mx-auto h-7 w-auto" aria-hidden="true">
      <path
        d="M3 2 H17 L15.3 23 A1.5 1.5 0 0 1 13.8 24.5 H6.2 A1.5 1.5 0 0 1 4.7 23 Z"
        fill={filled ? 'var(--primary)' : 'var(--muted)'}
        stroke={filled ? 'var(--primary)' : 'var(--border)'}
        strokeWidth="1.2"
      />
    </svg>
  )
}
