import { cn } from '@/lib/utils'

/** Los tonos apuntan a tokens semánticos. Ningún color suelto vive en los componentes. */
type Tone = 'success' | 'warning' | 'error' | 'primary' | 'neutral'

const toneColor: Record<Tone, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  primary: 'var(--primary)',
  neutral: 'var(--muted-foreground)',
}

export function CircularMetric({
  value,
  max = 100,
  size = 72,
  stroke = 5,
  tone = 'success',
  children,
  className,
}: {
  value: number
  max?: number
  size?: number
  stroke?: number
  tone?: Tone
  children?: React.ReactNode
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(Math.max(value / max, 0), 1)
  const dash = c * pct

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {/* Sin valor no se dibuja arco: el remate redondeado dejaría un punto suelto. */}
        {dash > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneColor[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
