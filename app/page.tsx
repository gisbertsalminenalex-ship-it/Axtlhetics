'use client'

import { useState } from 'react'
import { BottomNav, type Tab } from '@/components/bottom-nav'
import { InicioScreen } from '@/components/screens/inicio'
import { EntrenamientoScreen } from '@/components/screens/entrenamiento'
import { EntrenamientoActivo } from '@/components/screens/entrenamiento-activo'
import { EntrenamientoCompletado } from '@/components/screens/entrenamiento-completado'
import { RecuperacionScreen } from '@/components/screens/recuperacion'
import { HistorialScreen } from '@/components/screens/historial'

type TrainingView = 'idle' | 'active' | 'completado'

export default function Page() {
  const [tab, setTab] = useState<Tab>('inicio')
  const [training, setTraining] = useState<TrainingView>('idle')

  const goTrain = (t: Tab) => {
    setTab(t)
    if (t === 'entrenamiento') setTraining('idle')
  }

  const immersive = tab === 'entrenamiento' && training !== 'idle'

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-neutral-100 sm:py-8">
      <div className="relative flex h-dvh w-full max-w-[400px] flex-col overflow-hidden bg-background sm:h-[860px] sm:rounded-[44px] sm:border-8 sm:border-neutral-900 sm:shadow-2xl">
        <main className="no-scrollbar flex-1 overflow-y-auto pt-2">
          {tab === 'inicio' && (
            <InicioScreen
              onStartTraining={() => {
                setTab('entrenamiento')
                setTraining('active')
              }}
              onGoRecuperacion={() => setTab('recuperacion')}
            />
          )}

          {tab === 'entrenamiento' && training === 'idle' && (
            <EntrenamientoScreen onStart={() => setTraining('active')} />
          )}
          {tab === 'entrenamiento' && training === 'active' && (
            <EntrenamientoActivo
              onBack={() => setTraining('idle')}
              onFinish={() => setTraining('completado')}
            />
          )}
          {tab === 'entrenamiento' && training === 'completado' && (
            <EntrenamientoCompletado
              onClose={() => {
                setTraining('idle')
                setTab('inicio')
              }}
            />
          )}

          {tab === 'recuperacion' && <RecuperacionScreen />}
          {tab === 'historial' && <HistorialScreen />}
        </main>

        {!immersive && <BottomNav active={tab} onChange={goTrain} />}
      </div>
    </div>
  )
}
