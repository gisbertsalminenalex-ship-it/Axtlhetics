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
  return (
    <nav className="border-t border-border bg-background/95 backdrop-blur">
      <div className="flex items-stretch justify-around px-2 pt-2 pb-6">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="flex flex-1 flex-col items-center gap-1.5 py-1"
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'h-[22px] w-[22px]',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
                strokeWidth={2}
                fill={id === 'recuperacion' && isActive ? 'currentColor' : 'none'}
              />
              <span
                className={cn(
                  'text-[11px] font-medium tracking-tight',
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
