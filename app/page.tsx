'use client'

import { useEffect, useRef, useState } from 'react'
import { BottomNav, type Tab } from '@/components/bottom-nav'
import { ErrorBanner } from '@/components/error-banner'
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
import { TestEvolucionScreen } from '@/components/screens/test-evolucion'
import { EscanerScreen } from '@/components/screens/escaner'
import { useAxtlhetics } from '@/lib/state/store'
import { RETURN_TO_PROFILE_KEY } from '@/lib/ecosystem/ecosystem-client'

export default function Page() {
  const store = useAxtlhetics()
  const [tab, setTab] = useState<Tab>('inicio')
  const [perfilOpen, setPerfilOpen] = useState(false)
  const [axisOpen, setAxisOpen] = useState(false)
  // El test de evolución (D-021): un flujo dentro de Entrenamiento, no una pestaña.
  const [testOpen, setTestOpen] = useState(false)
  // El escáner corporal (D-023): otro flujo dentro de Entrenamiento.
  const [scanOpen, setScanOpen] = useState(false)

  // Al volver de entrar con Google para el ecosistema AXIS (D-076), se reabre Perfil, donde se empezó.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(RETURN_TO_PROFILE_KEY) === null) return
      window.sessionStorage.removeItem(RETURN_TO_PROFILE_KEY)
      setPerfilOpen(true)
    } catch {
      // Sin sessionStorage se queda en Inicio.
    }
  }, [])

  const goToRecuperacion = () => setTab('recuperacion')

  const startTraining = () => {
    store.beginWorkout()
    setTab('entrenamiento')
  }

  // El flujo de entrenamiento manda sobre la pestaña: mientras hay una sesión en
  // curso o un resumen pendiente, la aplicación se queda en él.
  const inWorkout = store.activeWorkout !== null
  const inSummary = store.activeWorkout === null && store.lastCompleted !== null
  // Un test a medias de hoy o un resumen pendiente también mandan, como el entrenamiento.
  const inTest =
    !inWorkout &&
    !inSummary &&
    (testOpen || store.assessments.active !== null || store.assessments.summary !== null)
  const inScan = !inWorkout && !inSummary && !inTest && scanOpen
  const immersive = inWorkout || inSummary || inTest || inScan || perfilOpen || axisOpen || store.status !== 'ready'

  /*
   * Todas las vistas comparten el mismo `main` con scroll. Sin esto, abrir el
   * test, el perfil o cambiar de pestaña heredaba el scroll de la vista
   * anterior y la nueva aparecía a mitad, sin su cabecera.
   */
  const testPhase = store.assessments.summary ? 'summary' : store.assessments.active ? 'active' : 'intro'
  const view = [
    store.status,
    axisOpen ? 'axis' : perfilOpen ? 'perfil' : inWorkout ? 'workout' : inSummary ? 'summary' : inTest ? `test-${testPhase}` : inScan ? 'scan' : tab,
  ].join(':')
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [view])

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-neutral-100 sm:py-8">
      <div className="relative flex h-dvh w-full max-w-[400px] flex-col overflow-hidden bg-background sm:h-[860px] sm:rounded-[44px] sm:border-8 sm:border-neutral-900 sm:shadow-2xl">
        <main ref={mainRef} className="no-scrollbar flex-1 overflow-y-auto pt-2">
          {store.status === 'loading' && <AppLoading />}

          {store.status === 'onboarding' && (
            // Toda la altura: «Continuar» queda abajo, al alcance del pulgar.
            <div className="ax-enter flex min-h-full flex-col">
              <OnboardingScreen />
            </div>
          )}

          {store.status === 'ready' && axisOpen && (
            // Ocupa toda la altura, para que el campo de escribir quede abajo aunque haya un solo mensaje.
            <div className="ax-enter flex min-h-full flex-col">
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
              {inTest && (
                <div key="test" className="ax-enter">
                  <TestEvolucionScreen
                    onClose={() => {
                      setTestOpen(false)
                      setTab('entrenamiento')
                    }}
                  />
                </div>
              )}

              {inScan && (
                <div key="scan" className="ax-enter">
                  <EscanerScreen
                    onClose={() => {
                      setScanOpen(false)
                      setTab('entrenamiento')
                    }}
                  />
                </div>
              )}

              {!inWorkout && !inSummary && !inTest && !inScan && (
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
                      onOpenTest={() => setTestOpen(true)}
                      onOpenScan={() => setScanOpen(true)}
                      onOpenPerfil={() => setPerfilOpen(true)}
                    />
                  )}
                  {tab === 'recuperacion' && <RecuperacionScreen />}
                  {tab === 'historial' && <HistorialScreen />}
                </div>
              )}
            </>
          )}
        </main>

        {/*
          El aviso va fuera del scroll y pegado abajo, entre el contenido y la
          barra: así se ve igual en cualquier pantalla y en cualquier punto del
          scroll, sin taparla. `main` es `flex-1`, de modo que el aviso le quita
          alto en vez de superponerse.
        */}
        {(store.error || store.assessments.error || store.scans.error) && (
          <div className="flex shrink-0 flex-col gap-2 px-6 pt-2 pb-3">
            {store.error && <ErrorBanner message={store.error} onDismiss={store.dismissError} />}
            {store.assessments.error && (
              <ErrorBanner message={store.assessments.error} onDismiss={store.assessments.dismissError} />
            )}
            {store.scans.error && <ErrorBanner message={store.scans.error} onDismiss={store.scans.dismissError} />}
          </div>
        )}

        {!immersive && <BottomNav active={tab} onChange={setTab} />}
      </div>
    </div>
  )
}
