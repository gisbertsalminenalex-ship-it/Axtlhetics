/**
 * Formas de la figura → marcado SVG (D-024). Se escribe como texto para poder
 * redibujar la animación sin pasar por React en cada fotograma, y para que los
 * tests lo comprueben sin navegador.
 *
 * Colores: los del cuerpo, los músculos y los objetos son tokens del Design
 * System. El lado lejano usa el color del cuerpo con transparencia, en un solo
 * grupo para que las uniones no se vean más oscuras; los músculos secundarios,
 * el azul principal con transparencia. Ningún gris nuevo.
 */

import type { Shape, Tone } from './draw'

export type FigureColors = Record<Exclude<Tone, 'bodyFar' | 'muscleSoft'>, string>

/** Transparencia del lado lejano y de los músculos secundarios. */
export const FIGURE_OPACITY = { far: 0.5, soft: 0.45 } as const

const n = (v: number) => (Math.round(v * 10) / 10).toString()

function colorOf(tone: Tone, colors: FigureColors): string {
  if (tone === 'bodyFar') return colors.body
  if (tone === 'muscleSoft') return colors.muscle
  return colors[tone]
}

function shapeToSvg(s: Shape, colors: FigureColors): string {
  const fill = colorOf(s.tone, colors)
  const opacity = s.tone === 'muscleSoft' ? ` opacity="${FIGURE_OPACITY.soft}"` : ''
  switch (s.kind) {
    case 'line':
      return `<line x1="${n(s.a[0])}" y1="${n(s.a[1])}" x2="${n(s.b[0])}" y2="${n(s.b[1])}" stroke="${fill}" stroke-width="${s.width}" stroke-linecap="round"${opacity}/>`
    case 'curve':
      return `<path d="M${n(s.a[0])} ${n(s.a[1])}Q${n(s.control[0])} ${n(s.control[1])} ${n(s.b[0])} ${n(s.b[1])}" fill="none" stroke="${fill}" stroke-width="${s.width}" stroke-linecap="round"${opacity}/>`
    case 'circle':
      return `<circle cx="${n(s.c[0])}" cy="${n(s.c[1])}" r="${s.r}" fill="${fill}"${opacity}/>`
    case 'rect':
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="3" fill="${fill}"${opacity}/>`
  }
}

export function shapesToSvg(shapes: readonly Shape[], colors: FigureColors): string {
  let out = ''
  let far = ''
  for (const s of shapes) {
    if (s.tone === 'bodyFar') {
      far += shapeToSvg(s, colors)
      continue
    }
    if (far) {
      out += `<g opacity="${FIGURE_OPACITY.far}">${far}</g>`
      far = ''
    }
    out += shapeToSvg(s, colors)
  }
  return far ? `${out}<g opacity="${FIGURE_OPACITY.far}">${far}</g>` : out
}
