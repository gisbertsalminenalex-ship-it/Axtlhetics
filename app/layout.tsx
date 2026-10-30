import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ServiceWorkerRegistrar } from '@/components/service-worker'
import { AxtlheticsProvider } from '@/lib/state/store'
import { EcosystemProvider } from '@/lib/ecosystem/use-ecosystem'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  // Tamaño óptico (D-075): los titulares usan el corte Display de Inter, más
  // cerrado y fino; el texto pequeño, el de lectura. Lo elige el navegador.
  axes: ['opsz'],
})

export const metadata: Metadata = {
  title: 'AXTHLETICS — The operating system for your body',
  description:
    'AXTHLETICS: entrenamiento, recuperación e historial guiados por AXIS.',
  applicationName: 'AXTHLETICS',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  /**
   * iOS no lee el manifiesto para decidir si abrir a pantalla completa: se guía
   * por estas etiquetas. Sin ellas, el icono de la pantalla de inicio abriría
   * Safari con su barra en lugar de la app.
   */
  appleWebApp: {
    capable: true,
    title: 'AXTHLETICS',
    statusBarStyle: 'default',
  },
  other: {
    // Next 16 emite el estándar `mobile-web-app-capable`. iOS anterior a 16.4
    // solo entiende el prefijado, y sin él abriría con la barra de Safari.
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
  initialScale: 1,
  width: 'device-width',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${inter.variable} bg-neutral-100`}>
      <body className="antialiased font-sans">
        <AxtlheticsProvider>
          <EcosystemProvider>{children}</EcosystemProvider>
        </AxtlheticsProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
