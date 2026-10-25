import { useId } from 'react'
import { cn } from '@/lib/utils'

/** La «A» y su línea (D-072), en las coordenadas de `docs/design/AXTHLETICS_LOGO.svg`. */
const A_PATH =
  'M480 365C494 320 530 320 544 365L676 645Q690 678 660 688Q640 694 628 668L604 618C592 590 554 572 512 572C470 572 432 590 420 618L396 668Q384 694 364 688Q334 678 348 645L480 365Z'
const LINE_PATH = 'M368 613C405 565 470 525 528 483C565 456 590 420 625 384Q642 371 664 369'

/**
 * Marca de AXTHLETICS (D-072): una «A» de trazo sobre una barra con discos y
 * una línea que sube hasta un punto.
 *
 * Es el logo de Alex (`docs/design/AXTHLETICS_LOGO.svg`) sin su cuadro negro y
 * en un solo color, el del texto que la rodea: azul en las tarjetas de AXIS,
 * blanco sobre azul. Los trazos son más gruesos que en el icono para que se lea
 * a 12–14 px, y la máscara abre los huecos donde la «A» y la línea se cruzan
 * con lo que tienen debajo, como en el original.
 */
export function AxisMark({
  className,
  color = 'currentColor',
}: {
  className?: string
  color?: string
}) {
  const mask = useId()
  return (
    <svg
      viewBox="236 242 552 552"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-5 w-5', className)}
      aria-hidden="true"
    >
      <mask id={mask} maskUnits="userSpaceOnUse" x="236" y="242" width="552" height="552">
        <rect x="236" y="242" width="552" height="552" fill="#fff" />
        <path d={A_PATH} stroke="#000" strokeWidth="60" />
        <path d={LINE_PATH} stroke="#000" strokeWidth="58" />
      </mask>
      <g mask={`url(#${mask})`} stroke={color}>
        <path d="M250 616H774" strokeWidth="26" />
        <path d="M248 604v24M776 604v24" strokeWidth="18" />
        <path d="M276 574v88M308 551v134M715 551v134M747 574v88" strokeWidth="28" />
      </g>
      <path d={A_PATH} stroke={color} strokeWidth="32" />
      <path d={LINE_PATH} stroke={color} strokeWidth="32" />
      <circle cx="688" cy="367" r="44" fill={color} />
    </svg>
  )
}
