import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * La escala tipográfica propia (D-075, `app/globals.css`). Sin declararla,
 * tailwind-merge toma `text-footnote` por un color y lo borra en cuanto aparece
 * otro `text-*`, como `text-primary`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'overline',
        'caption',
        'footnote',
        'subhead',
        'callout',
        'body',
        'headline',
        'title',
        'title-lg',
        'display',
        'hero',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
