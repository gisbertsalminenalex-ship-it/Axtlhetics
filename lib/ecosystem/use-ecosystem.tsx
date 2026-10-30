'use client'

/**
 * Estado de la conexión con la app AXIS del ecosistema (D-076) y envío automático.
 *
 * Funciona aunque nunca se conecte: sin sesión guardada no carga la librería ni
 * hace ninguna petición. Con sesión y consentimiento, envía los resúmenes al
 * abrir la app y al salir de ella (como mucho cada pocos minutos). Si falla, no
 * molesta: se vuelve a intentar la próxima vez. AXTHLETICS nunca espera a AXIS.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getRepositories } from '@/lib/data'
import { buildWeeklySnapshots } from '@/lib/domain/ecosystem/snapshot'
import type { AxthleticsMetric } from '@/lib/domain/ecosystem/sharing'
import { useAxtlhetics } from '@/lib/state/store'
import {
  deleteSharedData,
  hasEcosystemSignal,
  pushSnapshots,
  signInWithGoogle,
  signOutOfEcosystem,
  watchEcosystemSession,
} from './ecosystem-client'

export type EcosystemAccount =
  | { status: 'checking' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; email: string | null }

export type EcosystemApi = {
  account: EcosystemAccount
  /** Último envío correcto en esta sesión de la app, o `null`. */
  lastSentAt: string | null
  /** El último envío falló (sin red o AXIS no responde). */
  failed: boolean
  signIn(): Promise<string | null>
  /** Confirma qué se comparte y envía la historia completa. */
  share(metrics: AxthleticsMetric[]): Promise<boolean>
  /** Deja de compartir y borra en AXIS todo lo recibido de AXTHLETICS. */
  stopSharing(): Promise<boolean>
  signOut(): Promise<void>
}

const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

const EcosystemContext = createContext<EcosystemApi | null>(null)

export function EcosystemProvider({ children }: { children: ReactNode }) {
  const { status, profile, today, setEcosystemSharing } = useAxtlhetics()
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<EcosystemAccount>({ status: 'checking' })
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!hasEcosystemSignal()) {
      setAccount({ status: 'signedOut' })
      return
    }
    let active = true
    let stop: (() => void) | undefined
    void watchEcosystemSession((next) => {
      setSession(next)
      setAccount(next ? { status: 'signedIn', email: next.user.email ?? null } : { status: 'signedOut' })
    })
      .then((unsubscribe) => {
        if (active) stop = unsubscribe
        else unsubscribe()
      })
      .catch(() => setAccount({ status: 'signedOut' }))
    return () => {
      active = false
      stop?.()
    }
  }, [])

  const push = useCallback(
    async (metrics: readonly AxthleticsMetric[], force: boolean) => {
      const data = await getRepositories().backup.readAll()
      const snapshots = buildWeeklySnapshots({ data, metrics, today, generatedAt: new Date().toISOString(), appVersion: APP_VERSION })
      const result = await pushSnapshots(snapshots, { force })
      if (result === 'sent') {
        setLastSentAt(new Date().toISOString())
        setFailed(false)
      } else if (result === 'failed') {
        setFailed(true)
      }
      return result !== 'failed'
    },
    [today],
  )

  // Envío automático: al abrir con sesión y consentimiento, y al salir de la app.
  const sharedMetrics = status === 'ready' && session ? profile?.ecosystem?.metrics : undefined
  const sharedKey = sharedMetrics?.join(',')
  useEffect(() => {
    if (!sharedMetrics) return
    void push(sharedMetrics, false).catch(() => setFailed(true))
    const onHide = () => {
      if (document.visibilityState === 'hidden') void push(sharedMetrics, false).catch(() => setFailed(true))
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedKey, push])

  // Navega a Google; la sesión se recoge al volver (`hasEcosystemSignal` ve el `?code=`).
  const signIn = useCallback(() => signInWithGoogle(), [])

  const share = useCallback(
    async (metrics: AxthleticsMetric[]) => {
      await setEcosystemSharing({ metrics, since: new Date().toISOString() })
      return push(metrics, true).catch(() => {
        setFailed(true)
        return false
      })
    },
    [setEcosystemSharing, push],
  )

  const stopSharing = useCallback(async () => {
    const deleted = await deleteSharedData().catch(() => false)
    if (!deleted) return false
    await setEcosystemSharing(null)
    setLastSentAt(null)
    return true
  }, [setEcosystemSharing])

  const signOut = useCallback(async () => {
    await signOutOfEcosystem()
  }, [])

  const value = useMemo<EcosystemApi>(
    () => ({ account, lastSentAt, failed, signIn, share, stopSharing, signOut }),
    [account, lastSentAt, failed, signIn, share, stopSharing, signOut],
  )
  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>
}

export function useEcosystem(): EcosystemApi {
  const api = useContext(EcosystemContext)
  if (!api) throw new Error('useEcosystem fuera de EcosystemProvider')
  return api
}
