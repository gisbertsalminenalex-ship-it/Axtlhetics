/**
 * Comprobación de la luz de una foto del escáner (D-023, enmienda del
 * 2026-10-14). Con poca luz o una luz lateral fuerte, la silueta y sus sombras
 * falsean el contorno: en vez de medir, se avisa de repetir la foto.
 *
 * Recibe el brillo medio (0–255) del cuerpo y de cada mitad, izquierda y derecha
 * de la imagen, calculado por quien lee los píxeles. Umbrales en `scales.ts`,
 * provisionales (P-015).
 */

import { LIGHTING } from './scales'

export type LightingStats = { meanLuma: number; leftLuma: number; rightLuma: number }

export type LightingProblem = 'dark' | 'side_light'

export function lightingProblem(stats: LightingStats): LightingProblem | null {
  if (stats.meanLuma < LIGHTING.minMeanLuma) return 'dark'
  const darker = Math.min(stats.leftLuma, stats.rightLuma)
  const brighter = Math.max(stats.leftLuma, stats.rightLuma)
  if (darker <= 0 || brighter / darker > LIGHTING.maxSideRatio) return 'side_light'
  return null
}

/** Brillo percibido de un píxel RGB (Rec. 601), 0–255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}
