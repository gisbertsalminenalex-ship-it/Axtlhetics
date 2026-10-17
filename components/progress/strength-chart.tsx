'use client'

import { useState } from 'react'
import { formatShortDate } from '@/lib/domain/shared/dates'
import type { ExercisePoint } from '@/lib/domain/workouts/progress'

const W = 320
const H = 150
const PAD = { top: 12, right: 12, bottom: 22, left: 30 }

/**
 * La mejor serie de cada sesión de un ejercicio, en el tiempo (D-036).
 *
 * Una sola serie, así que sin leyenda: el título dice qué es. Línea fina en el
 * azul primario, puntos con aro del lienzo, guías discretas. Tocar un punto lo
 * fija: línea vertical y, encima, su fecha y su valor. Debajo, los mismos datos
 * en una tabla.
 */
export function StrengthChart({ points, unit }: { points: readonly ExercisePoint[]; unit: string }) {
  const [selected, setSelected] = useState<number | null>(null)
  if (points.length === 0) return null

  const max = Math.max(...points.map((point) => point.best))
  const top = niceCeil(max)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH
  const guides = [0, top / 2, top]
  const active = selected ?? points.length - 1
  const shown = points[active]

  return (
    <figure className="mt-4">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">Mejor serie por sesión</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {formatShortDate(shown.dayKey)} · {shown.best} {unit}
        </span>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Mejor serie por sesión: de ${points[0].best} a ${points[points.length - 1].best} ${unit}`}>
        {guides.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeWidth={1} opacity={value === 0 ? 1 : 0.5} />
            <text x={PAD.left - 6} y={y(value) + 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {formatValue(value)}
            </text>
          </g>
        ))}

        <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border)" strokeWidth={1} />

        {points.length > 1 && (
          <polyline
            points={points.map((point, i) => `${x(i)},${y(point.best)}`).join(' ')}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((point, i) => (
          <circle key={point.dayKey + i} cx={x(i)} cy={y(point.best)} r={i === active ? 5 : 4} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
        ))}

        {/* Zonas de toque más anchas que el punto: cada una, de la mitad al anterior a la mitad al siguiente. */}
        {points.map((point, i) => {
          const left = i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2
          const right = i === points.length - 1 ? W - PAD.right : (x(i) + x(i + 1)) / 2
          return (
            <rect
              key={`hit-${i}`}
              x={left}
              y={0}
              width={Math.max(right - left, 1)}
              height={H}
              fill="transparent"
              onPointerEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
            >
              <title>{`${formatShortDate(point.dayKey)}: ${point.best} ${unit}`}</title>
            </rect>
          )
        })}

        <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--muted-foreground)">
          {formatShortDate(points[0].dayKey)}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
            {formatShortDate(points[points.length - 1].dayKey)}
          </text>
        )}
      </svg>

      {points.length === 1 && (
        <p className="mt-1 text-[12.5px] text-muted-foreground">Una sola sesión: la curva empieza con la siguiente.</p>
      )}

      <details className="mt-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-muted-foreground">Ver los datos</summary>
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Sesión</th>
              <th className="py-1 text-right font-medium">Mejor serie</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point, i) => (
              <tr key={point.dayKey + i} className="border-t border-border">
                <td className="py-1.5">{formatShortDate(point.dayKey)}</td>
                <td className="py-1.5 text-right">
                  {point.best} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Un techo redondo para el eje: 12 → 15, 23 → 25, 48 → 50. */
function niceCeil(value: number): number {
  if (value <= 5) return 5
  const step = value <= 20 ? 5 : value <= 50 ? 10 : 25
  return Math.ceil(value / step) * step
}

function formatValue(value: number): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}
