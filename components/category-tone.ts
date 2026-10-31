/**
 * Recuadros de icono por categoría (D-077), como los de Mentax y Finax.
 *
 * Son colores de CATEGORÍA, no de estado: dicen «esto es sueño» o «esto es
 * hidratación», nunca «bien» o «mal». Verde, naranja y rojo siguen reservados a
 * los estados (D-008, `recovery-band.ts`), por eso ninguno de estos tonos lo es.
 * Los valores viven como tokens en `app/globals.css`.
 */
export type CategoryTone = 'brand' | 'sleep' | 'energy' | 'stress' | 'water' | 'neutral'

export const CATEGORY_TILE: Record<CategoryTone, string> = {
  brand: 'bg-secondary text-primary',
  sleep: 'bg-cat-sleep text-cat-sleep-ink',
  energy: 'bg-cat-energy text-cat-energy-ink',
  stress: 'bg-cat-stress text-cat-stress-ink',
  water: 'bg-cat-water text-cat-water-ink',
  neutral: 'bg-fill text-foreground',
}
