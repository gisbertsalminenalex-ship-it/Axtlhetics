import { WEEKDAY_INITIALS } from '@/lib/domain/shared/dates'
import { cn } from '@/lib/utils'

/**
 * Tira de actividad semanal, de lunes a domingo.
 *
 * `completedDays[i]` indica si ese día tiene una sesión completada; `today` es el
 * índice del día actual, que se dibuja como punto con anillo.
 */
export function WeeklyActivity({
  completedDays,
  today,
  className,
}: {
  completedDays: boolean[]
  today: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      {WEEKDAY_INITIALS.map((initial, i) => {
        const isDone = completedDays[i] ?? false
        const isToday = i === today
        return (
          <div key={i} className="flex flex-col items-center gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{initial}</span>
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded-full',
                isDone && 'bg-primary',
                !isDone && isToday && 'border-2 border-primary bg-background',
                !isDone && !isToday && 'border border-border bg-background',
              )}
            />
          </div>
        )
      })}
    </div>
  )
}
