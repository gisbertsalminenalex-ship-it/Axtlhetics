'use client'

/**
 * Los tests de evolución (D-021) en el estado de la aplicación.
 *
 * Una capa fina sobre `assessment-state.ts` y el dominio: carga al montar (y
 * al cambiar de día), y cada paso del flujo —empezar, registrar, descanso,
 * salir— es una función del dominio cuyo resultado se guarda a través del
 * repositorio. La lista solo cambia cuando la escritura se ha confirmado.
 *
 * Aquí no hay reglas del test: el orden, los lados, el descanso, cuándo se
 * completa y qué pasa con uno a medias de otro día los decide el dominio.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getRepositories } from '../data'
import {
  extendAssessmentRest,
  inProgressAssessment,
  interruptAssessment,
  recordResult,
  skipAssessmentRest,
  startAssessment,
  undoLeftSide,
} from '../domain/assessment/assessment'
import type { Assessment } from '../domain/assessment/types'
import { todayKey } from '../domain/shared/dates'
import {
  deleteAssessment,
  EMPTY_ASSESSMENTS_STATE,
  INITIAL_ASSESSMENTS_STATE,
  loadAndReconcile,
  persistAssessment,
  withAssessment,
  withoutAssessment,
  type AssessmentsState,
} from './assessment-state'

export type AssessmentsApi = AssessmentsState & {
  /** El test de hoy a medias, si lo hay: se reanuda donde se dejó. */
  active: Assessment | null
  /** El test recién completado, hasta cerrar su resumen. */
  summary: Assessment | null
  /** Guarda un test (nuevo o el mismo, más avanzado). `false` si no se pudo. */
  saveAssessment(assessment: Assessment): Promise<boolean>
  /** Retira un test. `false` si no se pudo. */
  removeAssessment(id: string): Promise<boolean>
  /** Empieza el test de hoy con esa variante de flexiones. */
  start(pushUpVariantId: string): Promise<boolean>
  /** Registra el resultado de la prueba (o del lado) que toca. */
  record(value: number): Promise<boolean>
  /** Vuelve al lado izquierdo del remo para corregirlo. */
  undoLeftSide(): Promise<boolean>
  skipRest(): Promise<boolean>
  extendRest(): Promise<boolean>
  /** Salir a mitad, ya confirmado: queda interrumpido o, sin nada, no deja rastro. */
  interrupt(): Promise<boolean>
  dismissSummary(): void
  /** Vuelve a leer del almacén. */
  reload(): Promise<void>
  /** Vacía el estado sin escribir nada: lo usa «borrar todos los datos». */
  reset(): void
}

export function useAssessments(): AssessmentsApi {
  const [state, setState] = useState<AssessmentsState>(INITIAL_ASSESSMENTS_STATE)
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  // Una lectura que llega después de un `reset` no debe resucitar lo borrado.
  const generationRef = useRef(0)
  const loadedDayRef = useRef<string | null>(null)

  const reload = useCallback(async () => {
    const generation = generationRef.current
    const today = todayKey()
    const next = await loadAndReconcile(getRepositories().assessments, today)
    if (generation !== generationRef.current) return
    loadedDayRef.current = today
    setState(next)
  }, [])

  useEffect(() => {
    void reload()
    // Como el resto de la app: si al volver ha cambiado el día, se recarga y un
    // test a medias de ayer se cierra con la regla del dominio.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (loadedDayRef.current !== null && loadedDayRef.current !== todayKey()) void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [reload])

  const saveAssessment = useCallback(async (assessment: Assessment) => {
    const result = await persistAssessment(getRepositories().assessments, assessment)
    setState((current) =>
      result.ok
        ? { ...current, assessments: withAssessment(current.assessments, assessment), error: null }
        : { ...current, error: result.message },
    )
    return result.ok
  }, [])

  const removeAssessment = useCallback(async (id: string) => {
    const result = await deleteAssessment(getRepositories().assessments, id)
    setState((current) =>
      result.ok
        ? { ...current, assessments: withoutAssessment(current.assessments, id), error: null }
        : { ...current, error: result.message },
    )
    return result.ok
  }, [])

  /** Aplica un paso del dominio al test en curso y guarda el resultado. */
  const advance = useCallback(
    async (step: (current: Assessment, now: Date) => Assessment) => {
      const current = inProgressAssessment(stateRef.current.assessments, todayKey())
      if (!current) return false
      const next = step(current, new Date())
      if (next === current) return true
      const saved = await saveAssessment(next)
      if (saved && next.status === 'completed') setSummaryId(next.id)
      return saved
    },
    [saveAssessment],
  )

  const start = useCallback(
    async (pushUpVariantId: string) => {
      if (inProgressAssessment(stateRef.current.assessments, todayKey())) return false
      const assessment = startAssessment({ dayKey: todayKey(), pushUpVariantId })
      return assessment ? saveAssessment(assessment) : false
    },
    [saveAssessment],
  )

  const record = useCallback(
    (value: number) => advance((current, now) => recordResult(current, value, now)),
    [advance],
  )
  const undoLeft = useCallback(() => advance((current) => undoLeftSide(current)), [advance])
  const skipRest = useCallback(() => advance((current) => skipAssessmentRest(current)), [advance])
  const extendRest = useCallback(
    () => advance((current, now) => extendAssessmentRest(current, undefined, now)),
    [advance],
  )

  const interrupt = useCallback(async () => {
    const current = inProgressAssessment(stateRef.current.assessments, todayKey())
    if (!current) return false
    const outcome = interruptAssessment(current, new Date())
    return outcome.kind === 'discard' ? removeAssessment(current.id) : saveAssessment(outcome.assessment)
  }, [removeAssessment, saveAssessment])

  const dismissSummary = useCallback(() => setSummaryId(null), [])

  const reset = useCallback(() => {
    generationRef.current += 1
    setSummaryId(null)
    setState(EMPTY_ASSESSMENTS_STATE)
  }, [])

  const active = inProgressAssessment(state.assessments, todayKey())
  const summary = summaryId ? (state.assessments.find((item) => item.id === summaryId) ?? null) : null

  return useMemo(
    () => ({
      ...state,
      active,
      summary,
      saveAssessment,
      removeAssessment,
      start,
      record,
      undoLeftSide: undoLeft,
      skipRest,
      extendRest,
      interrupt,
      dismissSummary,
      reload,
      reset,
    }),
    [state, active, summary, saveAssessment, removeAssessment, start, record, undoLeft, skipRest, extendRest, interrupt, dismissSummary, reload, reset],
  )
}
