'use client'

import { useState } from 'react'
import { BottomNav, type Tab } from '@/components/bottom-nav'
import { AppLoading } from '@/components/screens/app-loading'
import { AxisChatScreen } from '@/components/screens/axis-chat'
import { EntrenamientoScreen } from '@/components/screens/entrenamiento'
import { EntrenamientoActivo } from '@/components/screens/entrenamiento-activo'
import { EntrenamientoCompletado } from '@/components/screens/entrenamiento-completado'
import { HistorialScreen } from '@/components/screens/historial'
import { InicioScreen } from '@/components/screens/inicio'
import { OnboardingScreen } from '@/components/screens/onboarding'
import { PerfilScreen } from '@/components/screens/perfil'
import { RecuperacionScreen } from '@/components/screens/recuperacion'
import { useAxtlhetics } from '@/lib/state/store'

export default function Page() {
  const store = useAxtlhetics()
  const [tab, setTab] = useState<Tab>('inicio')
  const [perfilOpen, setPerfilOpen] = useState(false)
  const [axisOpen, setAxisOpen] = useState(false)

  const goToRecuperacion = () => setTab('recuperacion')

  const startTraining = () => {
    store.beginWorkout()
    setTab('entrenamiento')
  }

  // El flujo de entrenamiento manda sobre la pestaña: mientras hay una sesión en
  // curso o un resumen pendiente, la aplicación se queda en él.
  const inWorkout = store.activeWorkout !== null
  const inSummary = store.activeWorkout === null && store.lastCompleted !== null
  const immersive = inWorkout || inSummary || perfilOpen || axisOpen || store.status !== 'ready'

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-neutral-100 sm:py-8">
      <div className="relative flex h-dvh w-full max-w-[400px] flex-col overflow-hidden bg-background sm:h-[860px] sm:rounded-[44px] sm:border-8 sm:border-neutral-900 sm:shadow-2xl">
        <main className="no-scrollbar flex-1 overflow-y-auto pt-2">
          {store.status === 'loading' && <AppLoading />}

          {store.status === 'onboarding' && (
            <div className="ax-enter">
              <OnboardingScreen />
            </div>
          )}

          {store.status === 'ready' && axisOpen && (
            <div className="ax-enter">
              <AxisChatScreen
                onClose={() => {
                  store.closeAxisChat()
                  setAxisOpen(false)
                }}
              />
            </div>
          )}

          {store.status === 'ready' && !axisOpen && perfilOpen && (
            <div className="ax-enter">
              <PerfilScreen mode="edit" onClose={() => setPerfilOpen(false)} />
            </div>
          )}

          {store.status === 'ready' && !perfilOpen && !axisOpen && (
            <>
              {inWorkout && (
                <div key="activo" className="ax-enter">
                  <EntrenamientoActivo />
                </div>
              )}

              {inSummary && (
                <div key="resumen" className="ax-enter">
                  <EntrenamientoCompletado />
                </div>
              )}

              {/*
                La `key` es el tab: al cambiar de pestaña React monta un contenedor
                nuevo y la animación de entrada se reproduce. La barra inferior queda
                fuera y no se mueve.
              */}
              {!inWorkout && !inSummary && (
                <div key={tab} className="ax-enter">
                  {tab === 'inicio' && (
                    <InicioScreen
                      onStartTraining={startTraining}
                      onGoRecuperacion={goToRecuperacion}
                      onGoHistorial={() => setTab('historial')}
                      onOpenPerfil={() => setPerfilOpen(true)}
                      onOpenAxis={() => setAxisOpen(true)}
                    />
                  )}
                  {tab === 'entrenamiento' && (
                    <EntrenamientoScreen
                      onStart={startTraining}
                      onGoRecuperacion={goToRecuperacion}
                      onGoHistorial={() => setTab('historial')}
                      onOpenAxis={() => setAxisOpen(true)}
                    />
                  )}
                  {tab === 'recuperacion' && <RecuperacionScreen />}
                  {tab === 'historial' && <HistorialScreen />}
                </div>
              )}
            </>
          )}
        </main>

        {!immersive && <BottomNav active={tab} onChange={setTab} />}
      </div>
    </div>
  )
}
