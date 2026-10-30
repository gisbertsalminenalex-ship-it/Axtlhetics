/**
 * Qué comparte AXTHLETICS con la app AXIS del ecosistema (D-076).
 *
 * La app AXIS es otra aplicación: reúne los resúmenes semanales de AXTHLETICS,
 * Finax y Mentax. No es el AXIS entrenador de esta app.
 */
import { METRIC_KEYS, type MetricKey } from './contract'

export type AxthleticsMetric = MetricKey<'axthletics'>

export const AXTHLETICS_METRICS: readonly AxthleticsMetric[] = METRIC_KEYS.axthletics

/** El consentimiento: qué métricas y desde cuándo. Ausente = no se comparte nada. */
export type EcosystemSharing = {
  metrics: AxthleticsMetric[]
  /** Instante ISO en que el usuario confirmó lo que comparte. */
  since: string
}

export const METRIC_LABELS: Record<AxthleticsMetric, string> = {
  sessions_completed: 'Sesiones hechas',
  sessions_abandoned: 'Sesiones dejadas a medias',
  training_minutes: 'Minutos de entreno',
  volume_kg: 'Volumen (kg)',
  sessions_modified: 'Sesiones cambiadas',
  sleep_hours_avg: 'Sueño',
  energy_avg: 'Energía',
  stress_avg: 'Estrés',
  muscle_fatigue_avg: 'Fatiga muscular',
  recovery_score_avg: 'Recuperación',
  weight_kg: 'Peso',
}

/**
 * Activadas al conectar (catálogo de métricas de AXIS). El peso no: AXTHLETICS evita
 * a propósito los objetivos estéticos y AXIS no debe reintroducirlos.
 */
export const DEFAULT_METRICS: readonly AxthleticsMetric[] = AXTHLETICS_METRICS.filter((key) => key !== 'weight_kg')

function isMetric(value: unknown): value is AxthleticsMetric {
  return typeof value === 'string' && (AXTHLETICS_METRICS as readonly string[]).includes(value)
}

export function isEcosystemSharing(value: unknown): value is EcosystemSharing {
  if (typeof value !== 'object' || value === null) return false
  const { metrics, since } = value as Record<string, unknown>
  return Array.isArray(metrics) && metrics.every(isMetric) && typeof since === 'string' && !Number.isNaN(Date.parse(since))
}
