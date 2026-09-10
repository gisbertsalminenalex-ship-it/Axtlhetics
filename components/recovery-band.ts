/**
 * Presentación de las bandas del Recovery Score y de la Carga.
 *
 * Un único sitio para el texto y el token de color de cada banda, para que Inicio y
 * Recuperación no se contradigan y para que ningún componente escriba un color suelto.
 *
 * Semántica aprobada del Recovery Score: 0–49 rojo, 50–74 naranja, 75–100 verde.
 */

import type { RecoveryBand } from '@/lib/domain/recovery/types'
import { RECOVERY_BAND_LABELS } from '@/lib/domain/recovery/types'
import type { TrainingLoadBand } from '@/lib/domain/workouts/load'

/** Tonos disponibles en `CircularMetric`. Cada uno apunta a un token semántico. */
export type MetricTone = 'success' | 'warning' | 'error' | 'primary' | 'neutral'

export const BAND_SHORT: Record<RecoveryBand, string> = {
  good: 'Buena',
  moderate: 'Moderada',
  low: 'Baja',
}

/** Titular de la banda. Sale del dominio para que AXIS y la interfaz digan lo mismo. */
export const BAND_HEADLINE = RECOVERY_BAND_LABELS

export const BAND_COLOR: Record<RecoveryBand, string> = {
  good: 'text-success',
  moderate: 'text-warning',
  low: 'text-error',
}

export const BAND_TONE: Record<RecoveryBand, MetricTone> = {
  good: 'success',
  moderate: 'warning',
  low: 'error',
}

/**
 * Carga: aquí «más» no es «mejor». Una carga moderada es la situación buscada, una
 * carga alta es la que conviene vigilar y una baja es simplemente poca actividad.
 */
export const LOAD_COLOR: Record<TrainingLoadBand, string> = {
  baja: 'text-muted-foreground',
  moderada: 'text-success',
  alta: 'text-warning',
}

export const LOAD_TONE: Record<TrainingLoadBand, MetricTone> = {
  baja: 'neutral',
  moderada: 'success',
  alta: 'warning',
}
