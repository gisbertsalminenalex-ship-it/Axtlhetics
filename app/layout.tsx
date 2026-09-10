import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AxtlheticsProvider } from '@/lib/state/store'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'AXTHLETICS — The operating system for your body',
  description:
    'AXTHLETICS: entrenamiento, recuperación e historial guiados por AXIS.',
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
        <AxtlheticsProvider>{children}</AxtlheticsProvider>
      </body>
    </html>
  )
}
