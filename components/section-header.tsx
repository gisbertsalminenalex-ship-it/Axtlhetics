import { cn } from '@/lib/utils'

/**
 * Encabezado de sección (D-075). El mismo en todas las pantallas: un título
 * corto en semibold, con aire por encima para que cada bloque se lea por
 * separado, y como mucho una acción a la derecha o un dato discreto.
 */
export function SectionHeader({
  title,
  detail,
  action,
  onAction,
  className,
}: {
  title: string
  /** Dato discreto a la derecha, cuando no hay acción. */
  detail?: string
  action?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <div className={cn('mt-10 mb-3 flex items-baseline justify-between gap-3', className)}>
      <h3 className="text-body font-semibold">{title}</h3>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="ax-press -my-3 -mr-2 min-h-11 px-2 text-footnote font-medium text-primary"
        >
          {action}
        </button>
      ) : (
        detail && <span className="text-footnote tabular-nums text-muted-foreground">{detail}</span>
      )}
    </div>
  )
}

/**
 * Un hueco que todavía no tiene datos. Superficie lisa y una frase que dice qué
 * falta: el borde discontinuo de antes parecía un boceto (D-075).
 */
export function EmptyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-2xl bg-surface px-5 py-5 text-center text-footnote text-muted-foreground text-pretty',
        className,
      )}
    >
      {children}
    </p>
  )
}
