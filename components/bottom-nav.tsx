'use client'

import { Home, Dumbbell, Heart, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Tab = 'inicio' | 'entrenamiento' | 'recuperacion' | 'historial'

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'entrenamiento', label: 'Entrenamiento', icon: Dumbbell },
  { id: 'recuperacion', label: 'Recuperación', icon: Heart },
  { id: 'historial', label: 'Historial', icon: BarChart3 },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  const activeIndex = TABS.findIndex((t) => t.id === active)

  return (
    <nav className="border-t border-border bg-background/85 backdrop-blur-xl">
      <div className="relative flex items-stretch px-2 pt-2 pb-[max(env(safe-area-inset-bottom),20px)]">
        {/*
          Indicador del tab activo (D-075). Una sola pieza que se desliza de un
          tab a otro en lugar de cuatro que se encienden y apagan: el ojo sigue
          el movimiento y entiende dónde ha ido.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 flex h-8 justify-center"
          style={{
            width: 'calc((100% - 16px) / 4)',
            transform: `translateX(${activeIndex * 100}%)`,
            transition: 'transform var(--ax-slide) var(--ax-spring)',
          }}
        >
          <span className="h-full w-14 rounded-full bg-secondary/70" />
        </span>

        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="ax-press relative flex flex-1 flex-col items-center gap-1"
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="flex h-8 items-center justify-center">
                <Icon
                  className={cn(
                    'h-[21px] w-[21px] transition-colors duration-200',
                    isActive ? 'text-primary' : 'text-muted-nontext',
                  )}
                  strokeWidth={isActive ? 2 : 1.75}
                  fill={id === 'recuperacion' && isActive ? 'currentColor' : 'none'}
                />
              </span>
              <span
                className={cn(
                  'text-overline font-medium transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
