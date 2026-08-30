'use client'

import { useState } from 'react'
import { Bell, Dumbbell, Clock, BarChart3, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const RANGES = ['Semana', 'Mes', 'Año'] as const
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const POINTS = [34, 30, 44, 40, 46, 58, 66]

const SUMMARY = [
  { icon: Dumbbell, label: 'Entrenamientos', value: '24' },
  { icon: Clock, label: 'Tiempo total', value: '18h 45m' },
  { icon: BarChart3, label: 'Volumen total', value: '34.250 kg' },
]

const RECENT = [
  { name: 'Fuerza · Tren superior', meta: 'Jue, 24 jul · 60 min' },
  { name: 'Fuerza · Tren inferior', meta: 'Mar, 22 jul · 70 min' },
  { name: 'Cardio · Intervalos', meta: 'Sáb, 19 jul · 45 min' },
]

export function HistorialScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('Semana')

  return (
    <div className="px-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Historial</h1>
        <Bell className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
      </header>

      {/* Segmented control */}
      <div className="flex rounded-2xl bg-muted p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              'flex-1 rounded-xl py-2 text-[14px] font-medium transition-colors',
              range === r
                ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(10,10,11,0.08)]'
                : 'text-muted-foreground',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Rendimiento */}
      <p className="mt-7 text-[13px] font-medium text-muted-foreground">Rendimiento</p>
      <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.02em] text-primary">
        +12%
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">vs. semana pasada</p>

      <LineChart />

      {/* Resumen de la semana */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Resumen de la semana
      </h3>
      <ul className="mt-2 divide-y divide-border">
        {SUMMARY.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-3 py-3.5">
            <Icon className="h-[19px] w-[19px] text-primary" strokeWidth={1.75} />
            <span className="flex-1 text-[15px] font-medium">{label}</span>
            <span className="text-[15px] font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>

      {/* Últimos entrenamientos */}
      <h3 className="mt-8 text-[15px] font-semibold tracking-[-0.01em]">
        Últimos entrenamientos
      </h3>
      <ul className="mt-3 space-y-2.5">
        {RECENT.map((w) => (
          <li key={w.meta}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{w.name}</span>
                <span className="block text-[12.5px] text-muted-foreground">
                  {w.meta}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LineChart() {
  const w = 320
  const h = 130
  const pad = 10
  const max = Math.max(...POINTS)
  const min = Math.min(...POINTS)
  const stepX = (w - pad * 2) / (POINTS.length - 1)

  const coords = POINTS.map((p, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (p - min) / (max - min)) * (h - pad * 2)
    return { x, y }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')

  return (
    <div className="mt-5">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Rendimiento semanal">
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 4.5 : 3}
            fill="var(--background)"
            stroke="var(--primary)"
            strokeWidth="2.5"
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {DAYS.map((d) => (
          <span key={d} className="text-[12px] text-muted-foreground">
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}
