import { cn } from '@/lib/utils'

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Weekly activity indicator. `done` = number of completed days,
 * `today` = index (0-6) of the current day, shown as a ringed dot.
 */
export function WeeklyActivity({
  done = 3,
  today = 3,
  className,
}: {
  done?: number
  today?: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      {DAYS.map((d, i) => {
        const isDone = i < done
        const isToday = i === today
        return (
          <div key={d} className="flex flex-col items-center gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">
              {d}
            </span>
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
