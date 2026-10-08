import type { Metadata } from 'next'
import { ScannerLab } from '@/components/lab/scanner-lab'

/**
 * Laboratorio del escáner corporal (D-023). Ruta aislada para validar la
 * medición antes de construir el flujo: no se enlaza desde la app ni se indexa.
 */
export const metadata: Metadata = {
  title: 'Laboratorio del escáner',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ScannerLab />
}
