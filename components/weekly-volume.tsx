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
    // Una línea por grupo (D-075): nombre, barra y cifra en la misma fila, para
    // que siete grupos no ocupen media pantalla.
    <ul className={cn('rounded-2xl border border-border px-4 py-1.5', className)}>
      {volumes.map((volume) => {
        const done = Math.min(fulfilmentOf(volume), 1)
        return (
          <li key={volume.group} className="flex min-h-10 items-center gap-3 text-footnote">
            <span className="w-[72px] shrink-0 font-medium">{MUSCLE_GROUP_LABELS[volume.group]}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.round(done * 100)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
              {volume.sets.toLocaleString('es-ES', { maximumFractionDigits: 1 })} / {volume.target}
              <span className="sr-only"> series</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
