import { cn } from '@/lib/utils'

/**
 * AXIS identity mark — a small abstract X built from two angled strokes.
 * Not a mascot, not an avatar. Subtle, precise, technical.
 */
export function AxisMark({
  className,
  color = 'currentColor',
}: {
  className?: string
  color?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('h-5 w-5', className)}
      aria-hidden="true"
    >
      <path
        d="M4 3.5 L11 12 L4 20.5"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 3.5 L13 12 L20 20.5"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
    </svg>
  )
}
