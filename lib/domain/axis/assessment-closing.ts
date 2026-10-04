/**
 * Lo que AXIS dice al terminar un test de evolución (D-021).
 *
 * Resume los datos y nada más: cuántas pruebas mejoran respecto al test
 * anterior y qué pasa con las demás. No afirma que el usuario esté más en forma
 * ni más fuerte, ni atribuye causas. Sin números: las cifras están en las filas.
 *
 * Como el resto de AXIS: la primera frase es el veredicto, sin cumplidos ni
 * exclamaciones.
 */

import type { TestComparison } from '../assessment/compare'
import { listNames } from '../shared/text'

function nameOf(comparison: TestComparison): string {
  return comparison.test.name.toLowerCase()
}

/** Qué hace cada lado en un resultado mixto, sin cifras. */
function describeSides(comparison: TestComparison): string {
  const delta = comparison.delta
  if (delta.kind !== 'sides') return 'el resultado es mixto'
  const verb = (diff: number) => (diff > 0 ? 'sube' : diff < 0 ? 'baja' : 'se mantiene')
  const [first, second] = [verb(delta.left), verb(delta.right)].sort((x, y) => order(x) - order(y))
  return `un lado ${first} y el otro ${second}`
}

function order(verb: string): number {
  return verb === 'sube' ? 0 : verb === 'baja' ? 1 : 2
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function assessmentClosingMessage(comparisons: readonly TestComparison[]): string {
  const compared = comparisons.filter((comparison) => comparison.delta.kind !== 'baseline')
  const baseline = comparisons.filter((comparison) => comparison.delta.kind === 'baseline')

  if (compared.length === 0) {
    return 'Este es tu primer test. A partir de ahora tendremos una línea base para comparar tu evolución.'
  }

  const trendOf = (comparison: TestComparison) =>
    comparison.delta.kind === 'baseline' ? null : comparison.delta.trend
  const names = (trend: string) => compared.filter((c) => trendOf(c) === trend).map(nameOf)

  const improved = names('up')
  const same = names('same')
  const worse = names('down')
  const mixed = compared.filter((c) => trendOf(c) === 'mixed')

  const parts: string[] = []
  const total = compared.length

  if (improved.length === total) {
    parts.push(
      total === 1
        ? `Has mejorado en ${improved[0]} respecto a tu test anterior.`
        : `Has mejorado en las ${total} pruebas respecto a tu test anterior.`,
    )
  } else if (improved.length > 0) {
    parts.push(
      `Has mejorado en ${improved.length} de ${total} pruebas respecto a tu test anterior: ${listNames(improved)}.`,
    )
  } else {
    parts.push(
      total === 1
        ? 'Respecto a tu test anterior, la prueba comparable no mejora.'
        : `Respecto a tu test anterior, ninguna de las ${total} pruebas mejora.`,
    )
  }

  if (same.length > 0) parts.push(`${capitalize(listNames(same))} sin cambio.`)
  if (worse.length > 0) parts.push(`${capitalize(listNames(worse))} ${worse.length === 1 ? 'baja' : 'bajan'}.`)
  for (const comparison of mixed) parts.push(`En ${nameOf(comparison)}, ${describeSides(comparison)}.`)

  if (baseline.length > 0) {
    const variantNames = listNames(baseline.map(nameOf))
    parts.push(`${capitalize(variantNames)} ${baseline.length === 1 ? 'empieza' : 'empiezan'} una línea base nueva.`)
  }

  return parts.join(' ')
}
