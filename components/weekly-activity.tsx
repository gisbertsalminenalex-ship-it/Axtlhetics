import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { WEEKDAY_INITIALS } from '@/lib/domain/shared/dates'
import { cn } from '@/lib/utils'

/**
 * Tira de actividad semanal, de lunes a domingo.
 *
 * `completedDays[i]` indica si ese día tiene una sesión completada; `today` es el
 * índice del día actual. Con `todayDate`, cada día muestra su número del mes,
 * como un calendario (D-075): hoy en azul lleno, lo hecho con un check, el resto
 * en silencio.
 */
export function WeeklyActivity({
  completedDays,
  today,
  todayDate,
  className,
}: {
  completedDays: boolean[]
  today: number
  todayDate?: Date
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      {WEEKDAY_INITIALS.map((initial, i) => {
        const isDone = completedDays[i] ?? false
        const isToday = i === today
        const isPast = i < today
        const date = todayDate
          ? new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - (today - i))
          : null
        return (
          <div
            key={i}
            className="ax-stagger flex flex-col items-center gap-2"
            style={{ '--ax-index': i } as CSSProperties}
          >
            <span
              className={cn(
                'text-caption font-medium',
                isToday ? 'text-foreground' : 'text-muted-nontext',
              )}
            >
              {initial}
            </span>
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-subhead tabular-nums transition-colors duration-200',
                isToday && !isDone && 'bg-primary font-semibold text-primary-foreground',
                isDone && 'bg-secondary text-primary',
                !isDone && !isToday && (isPast ? 'text-muted-nontext' : 'text-foreground'),
              )}
            >
              {isDone ? (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              ) : date ? (
                date.getDate()
              ) : (
                <span className={cn('h-1.5 w-1.5 rounded-full', isToday ? 'bg-primary-foreground' : 'bg-track')} />
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
