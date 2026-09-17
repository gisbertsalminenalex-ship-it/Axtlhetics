/**
 * Utilidades de texto del dominio.
 *
 * Lo que aquí vive no sabe nada de AXIS ni de entrenamientos: son piezas de
 * redacción en español que varios módulos necesitan igual.
 */

/** `a, b y c` — sin coma de Oxford, que en español no se usa. */
export function listNames(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}
