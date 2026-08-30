import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'primary'

const toneColor: Record<Tone, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  primary: 'var(--primary)',
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
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
