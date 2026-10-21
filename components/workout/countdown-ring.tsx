import { CircularMetric } from '@/components/circular-metric'
import { formatDuration } from '@/lib/domain/shared/dates'

/**
 * La cuenta atrás en un anillo. La comparten el descanso (D-019) y el
 * cronómetro de los ejercicios por tiempo (D-054), para que se lean igual.
 */
export function CountdownRing({ remainingSeconds, totalSeconds }: { remainingSeconds: number; totalSeconds: number }) {
  return (
    <div className="mt-5 flex justify-center">
      <CircularMetric value={remainingSeconds} max={totalSeconds} size={200} stroke={8} tone="primary">
        <span className="text-[44px] font-bold tracking-[-0.02em] tabular-nums" role="timer" aria-live="off">
          {formatDuration(remainingSeconds)}
        </span>
      </CircularMetric>
    </div>
  )
}
