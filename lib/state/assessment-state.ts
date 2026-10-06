/**
 * Estado de los tests de evolución (D-021): lo que la aplicación tiene cargado
 * y cómo se escribe a través del repositorio.
 *
 * Sin React, para poder probarlo con `node:test`. Aquí no se decide nada: no hay
 * disponibilidad, ni comparaciones, ni reglas del test. Se carga, se guarda y se
 * retira; lo que el test es y cuándo tiene sentido lo dice el dominio
 * (`lib/domain/assessment/`), y la persistencia, el repositorio.
 *
 * Una escritura solo cambia el estado cuando el repositorio la ha confirmado:
 * lo que se ve es siempre lo que está guardado.
 */

import { reconcileStoredAssessment, sortAssessments } from '../domain/assessment/assessment'
import { isAssessment, type Assessment } from '../domain/assessment/types'
import type { AssessmentRepository } from '../data/repositories'

export type AssessmentsStatus = 'loading' | 'ready' | 'error'

export type AssessmentsState = {
  status: AssessmentsStatus
  /** Del más reciente al más antiguo, como los devuelve el repositorio. */
  assessments: Assessment[]
  /** El último error de lectura o escritura, en lenguaje de usuario. */
  error: string | null
}

export const INITIAL_ASSESSMENTS_STATE: AssessmentsState = {
  status: 'loading',
  assessments: [],
  error: null,
}

/** Tras borrar todos los datos: listo y sin tests. */
export const EMPTY_ASSESSMENTS_STATE: AssessmentsState = {
  status: 'ready',
  assessments: [],
  error: null,
}

const LOAD_ERROR = 'No se pudieron cargar tus tests de evolución.'
const SAVE_ERROR = 'No se pudo guardar el test de evolución.'
const REMOVE_ERROR = 'No se pudo retirar el test de evolución.'
const INVALID = 'Ese test de evolución no tiene una forma válida y no se ha guardado.'

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

/** Lee todos los tests válidos. Si falla, el estado lo dice y la lista queda vacía. */
export async function loadAssessments(repository: AssessmentRepository): Promise<AssessmentsState> {
  try {
    return { status: 'ready', assessments: await repository.list(), error: null }
  } catch (cause) {
    return { status: 'error', assessments: [], error: messageOf(cause, LOAD_ERROR) }
  }
}

/** La lista tras guardar uno: lo sustituye si ya estaba (mismo id) y mantiene el orden. */
export function withAssessment(list: readonly Assessment[], assessment: Assessment): Assessment[] {
  return sortAssessments([...list.filter((item) => item.id !== assessment.id), assessment])
}

/** La lista tras retirar uno. */
export function withoutAssessment(list: readonly Assessment[], id: string): Assessment[] {
  return list.filter((item) => item.id !== id)
}

export type WriteResult = { ok: true } | { ok: false; message: string }

/**
 * Guarda un test. Lo que no tiene forma de test no llega al almacén: es la
 * misma comprobación que se aplica al leer, para que nunca se escriba algo que
 * después no se podría leer.
 */
export async function persistAssessment(
  repository: AssessmentRepository,
  assessment: Assessment,
): Promise<WriteResult> {
  if (!isAssessment(assessment)) return { ok: false, message: INVALID }
  try {
    await repository.save(assessment)
    return { ok: true }
  } catch (cause) {
    return { ok: false, message: messageOf(cause, SAVE_ERROR) }
  }
}

export async function deleteAssessment(repository: AssessmentRepository, id: string): Promise<WriteResult> {
  try {
    await repository.remove(id)
    return { ok: true }
  } catch (cause) {
    return { ok: false, message: messageOf(cause, REMOVE_ERROR) }
  }
}

// ---------------------------------------------------------------------------
// Al cargar: un test a medias de otro día (D-021)
// ---------------------------------------------------------------------------

export type LoadedAssessments = {
  assessments: Assessment[]
  /** Tests que la reconciliación cerró y hay que guardar así. */
  toSave: Assessment[]
  /** Tests vacíos de otro día que se retiran. */
  toRemove: string[]
}

/**
 * Aplica a lo leído la regla del dominio para un test a medias de otro día:
 * con algo registrado queda interrumpido; vacío, se retira. El de hoy se
 * conserva para reanudarlo. La decisión es de `reconcileStoredAssessment`.
 */
export function reconcileLoaded(list: readonly Assessment[], today: string): LoadedAssessments {
  const toSave: Assessment[] = []
  const toRemove: string[] = []
  const kept: Assessment[] = []

  for (const assessment of list) {
    if (assessment.status !== 'in_progress' || assessment.dayKey === today) {
      kept.push(assessment)
      continue
    }
    const outcome = reconcileStoredAssessment(assessment, { today })
    if (outcome.kind === 'archive') {
      toSave.push(outcome.assessment)
      kept.push(outcome.assessment)
    } else if (outcome.kind === 'discard') {
      toRemove.push(assessment.id)
    } else {
      kept.push(outcome.assessment)
    }
  }
  return { assessments: sortAssessments(kept), toSave, toRemove }
}

/** Carga, reconcilia y deja guardado lo reconciliado. */
export async function loadAndReconcile(
  repository: AssessmentRepository,
  today: string,
): Promise<AssessmentsState> {
  const loaded = await loadAssessments(repository)
  if (loaded.status !== 'ready') return loaded
  const reconciled = reconcileLoaded(loaded.assessments, today)
  try {
    for (const assessment of reconciled.toSave) await repository.save(assessment)
    for (const id of reconciled.toRemove) await repository.remove(id)
  } catch (cause) {
    // Lo leído sigue siendo válido: se enseña, y al volver a abrir se reintenta.
    return { ...loaded, error: messageOf(cause, SAVE_ERROR) }
  }
  return { status: 'ready', assessments: reconciled.assessments, error: null }
}
