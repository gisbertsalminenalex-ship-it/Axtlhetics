/**
 * Identificadores estables.
 *
 * Los IDs se generan en el dominio y no en la capa de persistencia, para que una
 * entidad tenga el mismo identificador aquí, en IndexedDB y en un backend futuro.
 */

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // Reserva para entornos sin Web Crypto (tests en runtimes antiguos).
  const random = Math.random().toString(16).slice(2)
  return `${Date.now().toString(16)}-${random}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Limita un número al rango `[min, max]`. Devuelve `min` si el valor no es finito. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

/** Redondea a un número entero seguro, tratando `NaN` e `Infinity` como `fallback`. */
export function safeRound(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.round(value) : fallback
}

/**
 * División protegida. Devuelve `fallback` en lugar de `NaN` o `Infinity` cuando el
 * divisor es cero o alguno de los operandos no es finito.
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback
  }
  return numerator / denominator
}
