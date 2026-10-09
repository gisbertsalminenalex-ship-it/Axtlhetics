'use client'

/**
 * Los escaneos corporales (D-023) en el estado de la aplicación.
 *
 * Una capa fina sobre el repositorio, como los tests de evolución: carga al
 * montar, guarda y retira, y la lista solo cambia cuando la escritura se ha
 * confirmado. Aquí no se mide ni se resume nada: eso es del dominio del escáner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getRepositories } from '../data'
import { sortScans, type ScanRecord } from '../domain/scanner/types'

export type ScansStatus = 'loading' | 'ready' | 'error'

export type ScansApi = {
  status: ScansStatus
  /** Del más reciente al más antiguo. */
  scans: ScanRecord[]
  error: string | null
  /** Guarda un escaneo. `false` si no se pudo; el motivo queda en `error`. */
  save(scan: ScanRecord): Promise<boolean>
  remove(id: string): Promise<boolean>
  dismissError(): void
  reload(): Promise<void>
  /** Vacía el estado sin escribir nada: lo usa «borrar todos los datos». */
  reset(): void
}

const LOAD_ERROR = 'No se pudieron cargar tus escaneos.'
const SAVE_ERROR = 'No se pudo guardar el escaneo en este dispositivo.'
const REMOVE_ERROR = 'No se pudo borrar el escaneo.'

export function useScans(): ScansApi {
  const [status, setStatus] = useState<ScansStatus>('loading')
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  // Una lectura que llega después de un `reset` no debe resucitar lo borrado.
  const generationRef = useRef(0)

  const reload = useCallback(async () => {
    const generation = generationRef.current
    try {
      const list = await getRepositories().scans.list()
      if (generation !== generationRef.current) return
      setScans(list)
      setStatus('ready')
    } catch {
      if (generation !== generationRef.current) return
      setScans([])
      setStatus('error')
      setError(LOAD_ERROR)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (scan: ScanRecord) => {
    try {
      await getRepositories().scans.save(scan)
      setScans((current) => sortScans([...current.filter((item) => item.id !== scan.id), scan]))
      setError(null)
      return true
    } catch {
      setError(SAVE_ERROR)
      return false
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      await getRepositories().scans.remove(id)
      setScans((current) => current.filter((item) => item.id !== id))
      setError(null)
      return true
    } catch {
      setError(REMOVE_ERROR)
      return false
    }
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  const reset = useCallback(() => {
    generationRef.current += 1
    setScans([])
    setStatus('ready')
    setError(null)
  }, [])

  return useMemo(
    () => ({ status, scans, error, save, remove, dismissError, reload, reset }),
    [status, scans, error, save, remove, dismissError, reload, reset],
  )
}
