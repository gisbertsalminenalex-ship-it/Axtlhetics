/**
 * AxisActionEngine: el ciclo de vida de una acción de AXIS.
 *
 *   propuesta → comprobación → confirmación del usuario → aplicación → memoria
 *
 * **No es otro cerebro.** No decide qué entrenar: eso lo hace `AxisEngine`. No
 * juzga si un cambio conviene: eso lo hace la negociación. No lee lo que dice el
 * modelo de lenguaje: eso lo reconcilia `ai.ts` antes de llegar aquí. Lo único
 * que hace es ejecutar **de forma segura** lo que el dominio ya ha permitido, y
 * dejar constancia en la memoria del día.
 *
 * Reglas:
 *
 * - Todo lo que se aplica sale de la decisión vigente (`findProposal`), nunca de
 *   la propuesta tal y como se guardó ni de un texto.
 * - Nada queda como aplicado hasta que la memoria con el cambio se ha guardado.
 * - Una acción se aplica una vez. Cancelada, superada o aplicada, no vuelve.
 * - Al aplicar una, las demás pendientes del día quedan superadas: partían de
 *   una sesión que ya no es la que hay.
 *
 * Este módulo no conoce React, IndexedDB, el hosting ni el proveedor de IA. Para
 * persistir recibe un puerto mínimo; para decidir, nada: solo compone lo que ya
 * existe en `actions.ts` y `memory.ts`.
 */

import type { ScheduledActivity } from '../profile/types'
import {
  activityCreatedBy,
  buildAddDatedActivityAction,
  buildChangeTrainingAction,
  buildMoveToTomorrowAction,
  buildSetMinutesAction,
  buildWithoutEquipmentAction,
  datedActivityDraft,
  dayChangesFor,
  findProposal,
  validateAction,
  type AxisActionProposal,
  type AxisActionRejection,
  type AxisActionStatus,
  type DayPlanOverride,
  type TargetedAction,
} from './actions'
import type { AxisAnswer } from './conversation/types'
import {
  actionStatusOf,
  applyDayChanges,
  cancelAction,
  isLastApplied,
  markActionError,
  supersedeOtherActions,
  undoLastApplied,
  type AxisDayMemory,
} from './memory'
import type { AxisContext, AxisDecision, AxisProposal } from './types'

/**
 * El día contra el que se proponen y comprueban las acciones.
 *
 * Lo construye la aplicación con lo que ya tiene: el contexto, la decisión del
 * motor y la propuesta que el usuario tiene seleccionada ahora (la elección
 * confirmada, o la principal si no ha cambiado nada).
 */
export type AxisDay = {
  context: AxisContext
  decision: AxisDecision
  selected: AxisProposal
}

// ---------------------------------------------------------------------------
// 1. De respuesta a acción
// ---------------------------------------------------------------------------

/**
 * Convierte lo que AXIS ha propuesto en una acción pendiente de confirmar.
 *
 * Devuelve `null` cuando AXIS no ha llegado a una propuesta concreta, cuando se
 * ha negado, o cuando la opción que propone no existe en la decisión vigente o
 * es la que ya está seleccionada: un botón que no lleva a ninguna parte es peor
 * que no tener botón. No inventa destinos: solo lo que el motor generó hoy.
 */
export function proposeAction(
  day: AxisDay,
  answer: Pick<AxisAnswer, 'proposedTarget' | 'proposedReason' | 'proposedEffect'>,
): AxisActionProposal | null {
  const reason = answer.proposedReason ?? ''
  const effect = answer.proposedEffect ?? null
  const base = { context: day.context, origin: day.selected, reason }

  // Reorganizaciones (D-022): cambian algo del día y el motor vuelve a decidir.
  if (effect?.kind === 'set_available_minutes') {
    return buildSetMinutesAction({ ...base, minutes: effect.minutes })
  }
  if (effect?.kind === 'train_without_equipment') {
    return buildWithoutEquipmentAction(base)
  }
  if (effect?.kind === 'add_dated_activity') {
    return buildAddDatedActivityAction({ ...base, activity: datedActivityDraft(day.context, effect.intensity) })
  }
  if (effect?.kind === 'move_to_tomorrow') {
    // Mover exige un destino real para hoy: la recuperación que generó el motor.
    const target = answer.proposedTarget ? findProposal(day.decision, answer.proposedTarget) : null
    return target ? buildMoveToTomorrowAction({ ...base, target }) : null
  }

  if (!answer.proposedTarget) return null

  const target = findProposal(day.decision, answer.proposedTarget)
  if (!target || target.id === day.selected.id) return null

  return buildChangeTrainingAction({ ...base, target })
}

// ---------------------------------------------------------------------------
// 2. ¿Puede ejecutarse?
// ---------------------------------------------------------------------------

export type ActionCheckRejection =
  | AxisActionRejection
  /** La acción no tiene la forma que debería. Viene de disco o de fuera. */
  | 'malformada'
  | 'ya_aplicada'
  | 'cancelada'
  /** Otra acción del día se aplicó después: esta ya no tiene sentido. */
  | 'superada'
  /** Se aplicó y se deshizo (D-022). No vuelve a ejecutarse. */
  | 'deshecha'

export type ActionCheck =
  /** `target` es la alternativa elegida, o `null` si la acción no elige ninguna. */
  | { ok: true; target: AxisProposal | null }
  | { ok: false; reason: ActionCheckRejection; message: string }

/** La comprobación de una acción con destino: si pasa, el destino existe. */
export type TargetedCheck =
  | { ok: true; target: AxisProposal }
  | { ok: false; reason: ActionCheckRejection; message: string }

type ClosedRejection = 'malformada' | 'ya_aplicada' | 'cancelada' | 'superada' | 'deshecha'

const REJECTION_MESSAGES: Record<ClosedRejection, string> = {
  malformada: 'Esta propuesta no se puede leer. Pídemelo otra vez y la preparo de nuevo.',
  ya_aplicada: 'Ese cambio ya está aplicado.',
  cancelada: 'Esa propuesta la descartaste. Si la quieres, pídemela otra vez.',
  superada: 'Ya aplicaste otro cambio después de esta propuesta. Pídeme el que quieras ahora.',
  deshecha: 'Ese cambio lo deshiciste. Si lo quieres otra vez, pídemelo.',
}

/**
 * Comprueba si una acción puede ejecutarse ahora mismo.
 *
 * Primero su estado en la memoria —aplicada, cancelada o superada no vuelven—,
 * después lo que decide `validateAction` contra la decisión vigente: día,
 * existencia del destino, catálogo, carga y que de verdad cambie algo.
 */
export function checkAction(
  action: TargetedAction,
  day: AxisDay,
  memory: AxisDayMemory,
): TargetedCheck
export function checkAction(action: AxisActionProposal, day: AxisDay, memory: AxisDayMemory): ActionCheck
export function checkAction(
  action: AxisActionProposal,
  day: AxisDay,
  memory: AxisDayMemory,
): ActionCheck {
  if (!isActionProposal(action)) {
    return { ok: false, reason: 'malformada', message: REJECTION_MESSAGES.malformada }
  }

  const status = actionStatusOf(memory, action.id).state
  if (status === 'applied') {
    return { ok: false, reason: 'ya_aplicada', message: REJECTION_MESSAGES.ya_aplicada }
  }
  if (status === 'cancelled') {
    return { ok: false, reason: 'cancelada', message: REJECTION_MESSAGES.cancelada }
  }
  if (status === 'superseded') {
    return { ok: false, reason: 'superada', message: REJECTION_MESSAGES.superada }
  }
  if (status === 'undone') {
    return { ok: false, reason: 'deshecha', message: REJECTION_MESSAGES.deshecha }
  }

  return validateAction(action, day.decision, day.context, day.selected)
}

// ---------------------------------------------------------------------------
// 3. Aplicar en memoria
// ---------------------------------------------------------------------------

export type ApplyResult =
  | {
      ok: true
      memory: AxisDayMemory
      /** La elección de hoy después de aplicar, o `null` si no hay ninguna. */
      override: DayPlanOverride | null
      /** La actividad que hay que guardar, si la acción crea una (D-022). */
      createdActivity: ScheduledActivity | null
    }
  | { ok: false; memory: AxisDayMemory; reason: ActionCheckRejection; message: string }

/**
 * Aplica la acción sobre la memoria. Puro: devuelve la memoria siguiente, no
 * escribe en ningún sitio.
 *
 * Si no puede aplicarse, la memoria devuelta lleva el motivo en el estado de la
 * acción, salvo cuando ya estaba cerrada (aplicada, cancelada, superada): ahí
 * no hay nada que marcar y la memoria vuelve intacta.
 */
export function applyAction(
  action: AxisActionProposal,
  day: AxisDay,
  memory: AxisDayMemory,
  now?: string,
): ApplyResult {
  const check = checkAction(action, day, memory)
  if (!check.ok) {
    const closed =
      check.reason === 'ya_aplicada' ||
      check.reason === 'cancelada' ||
      check.reason === 'superada' ||
      check.reason === 'deshecha'
    return {
      ok: false,
      memory: closed ? memory : markActionError(memory, action.id, check.message, now),
      reason: check.reason,
      message: check.message,
    }
  }

  const changes = dayChangesFor(action, check.target, now)
  const createdActivity = activityCreatedBy(action, now)
  const applied = applyDayChanges(memory, action.id, changes, createdActivity, now)
  return {
    ok: true,
    memory: supersedeOtherActions(applied, action.id, now),
    override: applied.override,
    createdActivity,
  }
}

// ---------------------------------------------------------------------------
// 4. Descartar
// ---------------------------------------------------------------------------

/** El usuario descarta la propuesta. No se toca nada más; la negociación termina. */
export function dismissAction(
  action: AxisActionProposal,
  memory: AxisDayMemory,
  now?: string,
): AxisDayMemory {
  return cancelAction(memory, action.id, now)
}

// ---------------------------------------------------------------------------
// 5. Estado
// ---------------------------------------------------------------------------

export function actionStatus(memory: AxisDayMemory, actionId: string): AxisActionStatus {
  return actionStatusOf(memory, actionId)
}

// ---------------------------------------------------------------------------
// 6. Forma de una acción leída de disco
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    (value.focus === null || typeof value.focus === 'string')
  )
}

/**
 * Comprueba que algo tiene la forma de una acción.
 *
 * Lo que hay en disco pudo escribirlo cualquier versión. Una acción que no se
 * entiende no puede tener botón: se descarta antes de llegar a `checkAction`, y
 * si llega, `checkAction` la rechaza como malformada.
 */
function isDatedActivityDraft(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.date === 'string' &&
    (value.intensity === 'baja' || value.intensity === 'media' || value.intensity === 'alta') &&
    Array.isArray(value.loadsMuscleGroups) &&
    value.loadsMuscleGroups.every((group) => typeof group === 'string')
  )
}

/** Lo propio de cada tipo de acción. */
function hasTypeFields(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case 'change_training':
      return isTarget(value.target)
    case 'move_to_tomorrow':
      return isTarget(value.target) && typeof value.tomorrow === 'string'
    case 'set_available_minutes':
      return typeof value.minutes === 'number' && Number.isInteger(value.minutes)
    case 'add_dated_activity':
      return isDatedActivityDraft(value.activity)
    case 'train_without_equipment':
      return true
    default:
      return false
  }
}

export function isActionProposal(value: unknown): value is AxisActionProposal {
  if (!isRecord(value)) return false
  if (!hasTypeFields(value)) return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (typeof value.dayKey !== 'string' || typeof value.createdAt !== 'string') return false
  if (typeof value.label !== 'string' || typeof value.summary !== 'string') return false
  if (typeof value.reason !== 'string') return false
  return (
    isRecord(value.origin) &&
    typeof value.origin.proposalId === 'string' &&
    typeof value.origin.headline === 'string' &&
    isTarget({ type: value.origin.type, focus: value.origin.focus })
  )
}

/**
 * Deja sin acción los mensajes cuya acción no se entiende.
 *
 * Se aplica al leer la memoria: un registro corrupto no puede acabar con un
 * botón de ejecución. El texto del mensaje se conserva.
 */
export function sanitizeActions(memory: AxisDayMemory): AxisDayMemory {
  const broken = memory.messages.some((message) => message.action && !isActionProposal(message.action))
  if (!broken) return memory
  return {
    ...memory,
    messages: memory.messages.map((message) =>
      message.action && !isActionProposal(message.action) ? { ...message, action: null } : message,
    ),
  }
}

// ---------------------------------------------------------------------------
// 7. El ciclo completo, con persistencia
// ---------------------------------------------------------------------------

/**
 * Lo único que el ciclo necesita de la persistencia. El repositorio real lo
 * cumple sin adaptador; los tests le pasan uno que recuerda o que falla.
 */
export type AxisMemoryPort = {
  save(memory: AxisDayMemory): Promise<void>
  /**
   * Guardar y retirar una actividad del calendario. Solo lo necesita registrar
   * el partido de mañana (D-022); sin ellos, esa acción falla sin tocar nada.
   */
  addActivity?(activity: ScheduledActivity): Promise<void>
  removeActivity?(id: string): Promise<void>
}

export type ExecuteResult =
  | { ok: true; memory: AxisDayMemory; override: DayPlanOverride | null; createdActivity: ScheduledActivity | null }
  | {
      ok: false
      /** La memoria a mostrar: con el error marcado, o intacta si la acción ya estaba cerrada. */
      memory: AxisDayMemory
      reason: ActionCheckRejection | 'persistencia'
      message: string
    }

const PERSISTENCE_MESSAGE = 'No he podido guardar el cambio. Puedes volver a intentarlo.'

/**
 * Comprueba, aplica y guarda. En ese orden, y solo hasta donde llegue.
 *
 * La memoria guardada es la fuente de verdad: la acción no queda aplicada hasta
 * que `save` ha terminado bien. Si el guardado falla, lo que se devuelve es la
 * memoria **sin** el cambio y con la acción en error, lista para reintentar; el
 * error no se oculta.
 *
 * Es idempotente: una segunda llamada con la misma acción recibe `ya_aplicada`
 * y no toca nada.
 */
export async function executeAction(
  action: AxisActionProposal,
  day: AxisDay,
  memory: AxisDayMemory,
  port: AxisMemoryPort,
  now?: string,
): Promise<ExecuteResult> {
  const applied = applyAction(action, day, memory, now)
  if (!applied.ok) return applied

  const failed = (cause: unknown): ExecuteResult => {
    const message = cause instanceof Error && cause.message ? cause.message : PERSISTENCE_MESSAGE
    return { ok: false, memory: markActionError(memory, action.id, message, now), reason: 'persistencia', message }
  }

  /*
   * La actividad va antes que la memoria: si no se puede crear, no se marca
   * nada como aplicado. Si después falla guardar la memoria, se retira la
   * actividad recién creada para no dejar un partido sin acción que lo explique.
   */
  const activity = applied.createdActivity
  if (activity) {
    if (!port.addActivity || !port.removeActivity) return failed(null)
    try {
      await port.addActivity(activity)
    } catch (cause) {
      return failed(cause)
    }
  }

  try {
    await port.save(applied.memory)
  } catch (cause) {
    if (activity) await port.removeActivity?.(activity.id).catch(() => undefined)
    return failed(cause)
  }

  return applied
}

// ---------------------------------------------------------------------------
// 8. Deshacer la última acción (D-022)
// ---------------------------------------------------------------------------

export type UndoRejection = 'no_deshacible' | 'entrenamiento_empezado' | 'persistencia'

export type UndoResult =
  | { ok: true; memory: AxisDayMemory; removedActivityId: string | null }
  | { ok: false; memory: AxisDayMemory; reason: UndoRejection; message: string }

/**
 * `true` si esa acción se puede deshacer ahora: es la última aplicada hoy y el
 * entrenamiento de hoy no ha empezado ni terminado.
 */
export function canUndoAction(
  memory: AxisDayMemory,
  actionId: string,
  options: { workoutStarted: boolean },
): boolean {
  return !options.workoutStarted && isLastApplied(memory, actionId)
}

/**
 * Deshace la última acción aplicada: restaura lo que había antes, retira la
 * actividad que hubiera creado y guarda. Nada queda deshecho antes de guardarse
 * (D-012); si guardar falla, la actividad retirada se vuelve a crear.
 */
export async function undoAction(
  actionId: string,
  memory: AxisDayMemory,
  port: AxisMemoryPort,
  options: { workoutStarted: boolean },
  now?: string,
): Promise<UndoResult> {
  if (options.workoutStarted) {
    return {
      ok: false,
      memory,
      reason: 'entrenamiento_empezado',
      message: 'Ya has empezado a entrenar hoy: el cambio ya no se puede deshacer.',
    }
  }
  if (!isLastApplied(memory, actionId) || !memory.lastApplied) {
    return {
      ok: false,
      memory,
      reason: 'no_deshacible',
      message: 'Solo puedo deshacer el último cambio que aplicaste hoy.',
    }
  }

  const created = memory.lastApplied.createdActivity
  const next = undoLastApplied(memory, actionId, now)
  const failed = (cause: unknown): UndoResult => ({
    ok: false,
    memory,
    reason: 'persistencia',
    message: cause instanceof Error && cause.message ? cause.message : 'No he podido deshacer el cambio. Puedes volver a intentarlo.',
  })

  if (created) {
    if (!port.removeActivity || !port.addActivity) return failed(null)
    try {
      await port.removeActivity(created.id)
    } catch (cause) {
      return failed(cause)
    }
  }

  try {
    await port.save(next)
  } catch (cause) {
    if (created) await port.addActivity?.(created).catch(() => undefined)
    return failed(cause)
  }

  return { ok: true, memory: next, removedActivityId: created?.id ?? null }
}
