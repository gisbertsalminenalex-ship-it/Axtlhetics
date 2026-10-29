import { MUSCLE_GROUP_LABELS } from '@/lib/domain/workouts/types'
import { fulfilmentOf, type GroupVolume } from '@/lib/domain/workouts/weekly-volume'
import { cn } from '@/lib/utils'

/**
 * Series de la semana por grupo muscular frente a su objetivo (D-034).
 *
 * Una fila por grupo: nombre, `hechas / objetivo` y una barra fina en el
 * lenguaje de la Circular Metric (pista neutra, progreso en azul). Cumplido el
 * objetivo, la barra se queda llena: pasarse no se premia.
 */
export function WeeklyVolume({ volumes, className }: { volumes: readonly GroupVolume[]; className?: string }) {
  return (
    <ul className={cn('space-y-3', className)}>
      {volumes.map((volume) => {
        const done = Math.min(fulfilmentOf(volume), 1)
        return (
          <li key={volume.group}>
            <div className="flex items-baseline justify-between text-footnote">
              <span className="font-medium">{MUSCLE_GROUP_LABELS[volume.group]}</span>
              <span className="tabular-nums text-muted-foreground">
                {volume.sets.toLocaleString('es-ES', { maximumFractionDigits: 1 })} / {volume.target} series
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(done * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
