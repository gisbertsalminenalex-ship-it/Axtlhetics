import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { ServiceWorkerRegistrar } from '@/components/service-worker'
import { AxtlheticsProvider } from '@/lib/state/store'
import { EcosystemProvider } from '@/lib/ecosystem/use-ecosystem'
import './globals.css'

// Plus Jakarta Sans (D-077): la fuente de la familia AXIS, la misma que Finax.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
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
  themeColor: '#f3f5f9',
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
    <html lang="es" className={`${jakarta.variable} bg-neutral-100`}>
      <body className="antialiased font-sans">
        <AxtlheticsProvider>
          <EcosystemProvider>{children}</EcosystemProvider>
        </AxtlheticsProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
