/**
 * Comprobaciones de forma para datos que vienen de fuera.
 *
 * «De fuera» es todo lo que la aplicación no acaba de construir en memoria: lo
 * leído del almacenamiento, escrito quizá por otra versión, y sobre todo lo que
 * llega de un archivo que el usuario ha podido editar a mano.
 *
 * La regla es la misma en todos los casos: antes que escribir un registro a
 * medias y dejar la aplicación sin poder abrirse, se descarta.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Una fecha ISO que además se puede interpretar. `'ayer'` no vale. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Clave de día `AAAA-MM-DD`, que es como se indexa casi todo. */
export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Número real y utilizable: ni `NaN`, ni infinito, ni una cadena que lo parezca. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `null`, o un número utilizable. El patrón de casi todos los campos opcionales. */
export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

/** `null`, o una cadena. */
export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/** Pertenencia a un conjunto cerrado de valores, para los tipos union. */
export function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/** Un array cuyos elementos pasan todos la comprobación. */
export function isArrayOf<T>(
  value: unknown,
  check: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(check)
}
