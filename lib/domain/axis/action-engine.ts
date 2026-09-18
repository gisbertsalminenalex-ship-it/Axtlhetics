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
 * Este módulo no conoce React, IndexedDB, Netlify ni el proveedor de IA. Para
 * persistir recibe un puerto mínimo; para decidir, nada: solo compone lo que ya
 * existe en `actions.ts` y `memory.ts`.
 */

import {
  buildChangeTrainingAction,
  findProposal,
  overrideFrom,
  validateAction,
  type AxisActionProposal,
  type AxisActionRejection,
  type AxisActionStatus,
  type DayPlanOverride,
} from './actions'
import type { AxisAnswer } from './conversation/types'
import {
  actionStatusOf,
  applyOverride,
  cancelAction,
  markActionError,
  supersedeOtherActions,
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
  answer: Pick<AxisAnswer, 'proposedTarget' | 'proposedReason'>,
): AxisActionProposal | null {
  if (!answer.proposedTarget) return null

  const target = findProposal(day.decision, answer.proposedTarget)
  if (!target || target.id === day.selected.id) return null

  return buildChangeTrainingAction({
    context: day.context,
    origin: day.selected,
    target,
    reason: answer.proposedReason ?? '',
  })
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

export type ActionCheck =
  | { ok: true; target: AxisProposal }
  | { ok: false; reason: ActionCheckRejection; message: string }

const REJECTION_MESSAGES: Record<'malformada' | 'ya_aplicada' | 'cancelada' | 'superada', string> = {
  malformada: 'Esta propuesta no se puede leer. Pídemelo otra vez y la preparo de nuevo.',
  ya_aplicada: 'Ese cambio ya está aplicado.',
  cancelada: 'Esa propuesta la descartaste. Si la quieres, pídemela otra vez.',
  superada: 'Ya aplicaste otro cambio después de esta propuesta. Pídeme el que quieras ahora.',
}

/**
 * Comprueba si una acción puede ejecutarse ahora mismo.
 *
 * Primero su estado en la memoria —aplicada, cancelada o superada no vuelven—,
 * después lo que decide `validateAction` contra la decisión vigente: día,
 * existencia del destino, catálogo, carga y que de verdad cambie algo.
 */
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

  return validateAction(action, day.decision, day.context, day.selected)
}

// ---------------------------------------------------------------------------
// 3. Aplicar en memoria
// ---------------------------------------------------------------------------

export type ApplyResult =
  | { ok: true; memory: AxisDayMemory; override: DayPlanOverride }
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
    const closed = check.reason === 'ya_aplicada' || check.reason === 'cancelada' || check.reason === 'superada'
    return {
      ok: false,
      memory: closed ? memory : markActionError(memory, action.id, check.message, now),
      reason: check.reason,
      message: check.message,
    }
  }

  const override = overrideFrom(action, check.target)
  const applied = applyOverride(memory, override, action.id, now)
  return { ok: true, memory: supersedeOtherActions(applied, action.id, now), override }
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
export function isActionProposal(value: unknown): value is AxisActionProposal {
  if (!isRecord(value)) return false
  if (value.type !== 'change_training') return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (typeof value.dayKey !== 'string' || typeof value.createdAt !== 'string') return false
  if (typeof value.label !== 'string' || typeof value.summary !== 'string') return false
  if (typeof value.reason !== 'string') return false
  if (!isTarget(value.target)) return false
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
}

export type ExecuteResult =
  | { ok: true; memory: AxisDayMemory; override: DayPlanOverride }
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

  try {
    await port.save(applied.memory)
  } catch (cause) {
    const message = cause instanceof Error && cause.message ? cause.message : PERSISTENCE_MESSAGE
    return {
      ok: false,
      memory: markActionError(memory, action.id, message, now),
      reason: 'persistencia',
      message,
    }
  }

  return applied
}
