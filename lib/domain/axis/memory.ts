/**
 * Memoria de AXIS: lo que recuerda de un día y no se deduce de los datos.
 *
 * Un solo registro por `dayKey`, con todo lo que antes vivía repartido entre el
 * plan del día, la conversación guardada y tres estados sueltos del store que no
 * se persistían. Que sea uno importa: no puede quedar guardado el plan y no el
 * hilo, ni el hilo sin saber que estaba negociando.
 *
 * Lo que hay aquí:
 *
 * - **Lo decidido hoy**: la sesión que el usuario confirmó y los deportes que ha
 *   dicho que hoy no ocurren.
 * - **Lo que ha contado hoy** y no está registrado: cargas de ayer, esfuerzos.
 *   Cuentan como evidencia en la conversación; no tocan al motor.
 * - **El hilo**: mensajes y estado de cada propuesta de acción.
 * - **Dónde está la conversación**: última intención, si se está negociando y
 *   qué se pidió por última vez. Sin esto, recargar dejaba el hilo a la vista
 *   pero AXIS no sabía de qué iba.
 *
 * Todo son funciones puras. Nada aquí conoce React, IndexedDB ni el motor.
 */

import { isScheduledActivity, type ScheduledActivity } from '../profile/types'
import { addDays, todayKey, type DayKey } from '../shared/dates'
import { isDayKey } from '../shared/guards'
import { nowIso } from '../shared/ids'
import type { AxisActionStatus, DayPlanOverride } from './actions'
import type { AxisConversationMemory, AxisIntent, AxisMessage } from './conversation/types'

/** Versión del registro. Sube cuando cambie la forma, para migrar sin adivinar. */
export const AXIS_MEMORY_SCHEMA = 1

/**
 * Carga que el usuario dice haber hecho y que no consta en ningún sitio.
 *
 * Cuenta para decidir —ignorarla sería absurdo— pero se marca como no registrada,
 * porque AXIS no puede presentarla como un hecho comprobado.
 */
export type ReportedLoad = {
  /** Lo que el usuario escribió, tal cual, recortado. */
  quote: string
  /** Grupos que esa actividad carga, si se puede deducir. */
  muscleGroups: string[]
  demanding: boolean
}

export type ReportedLoadMemory = ReportedLoad & {
  /** Cuándo lo contó. Ordena y evita repetirlo. */
  reportedAt: string
  /** Mensaje que lo contenía, para poder auditarlo. */
  messageId: string
}

export type AxisThreadState = {
  /** Última intención respondida, para entender preguntas de seguimiento. */
  lastIntent: AxisIntent | null
  /** La conversación está acotada a cambiar el entrenamiento de hoy. */
  changeMode: boolean
  /** Lo último que el usuario pidió cambiar, para no ceder por insistencia. */
  lastChangeRequest: { kind: string; focus: string | null } | null
}

export type AxisDayMemory = {
  dayKey: DayKey
  schema: typeof AXIS_MEMORY_SCHEMA

  override: DayPlanOverride | null
  cancelledActivities: string[]
  reportedLoads: ReportedLoadMemory[]

  messages: AxisMessage[]
  actionStatuses: Record<string, AxisActionStatus>

  thread: AxisThreadState

  /**
   * Minutos que el usuario dijo tener hoy y confirmó (D-022). Entran en el
   * contexto del motor. Ausente en los registros anteriores a D-022.
   */
  availableMinutes?: number | null
  /**
   * El entrenamiento de hoy se movió a ese día (D-022). Mañana se lee del
   * registro de ayer para saber que el día está disponible; es lo único de un
   * día anterior que se aplica.
   */
  movedTo?: DayKey | null
  /** Lo necesario para deshacer la última acción aplicada hoy (D-022). */
  lastApplied?: LastApplied | null

  updatedAt: string
}

/** Lo que una acción puede cambiar en la memoria del día (D-022). */
export type DayChanges = {
  override?: DayPlanOverride | null
  availableMinutes?: number | null
  movedTo?: DayKey | null
}

/**
 * La última acción aplicada y cómo estaba todo antes de aplicarla.
 *
 * Solo la última: deshacer no es un historial, es volver un paso atrás. Guarda
 * los valores anteriores de **todo** lo que una acción puede tocar, no solo de
 * lo que tocó, para que restaurar sea copiar y no reconstruir.
 */
export type LastApplied = {
  actionId: string
  previous: {
    override: DayPlanOverride | null
    availableMinutes: number | null
    movedTo: DayKey | null
  }
  /** La actividad que creó la acción, si creó una: deshacer la retira. */
  createdActivity: ScheduledActivity | null
}

export const EMPTY_THREAD: AxisThreadState = {
  lastIntent: null,
  changeMode: false,
  lastChangeRequest: null,
}

export function emptyDayMemory(dayKey: DayKey, now: string = nowIso()): AxisDayMemory {
  return {
    dayKey,
    schema: AXIS_MEMORY_SCHEMA,
    override: null,
    cancelledActivities: [],
    reportedLoads: [],
    messages: [],
    actionStatuses: {},
    thread: { ...EMPTY_THREAD },
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Leer lo guardado
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isThreadState(value: unknown): value is AxisThreadState {
  return (
    isRecord(value) &&
    (value.lastIntent === null || typeof value.lastIntent === 'string') &&
    typeof value.changeMode === 'boolean' &&
    (value.lastChangeRequest === null ||
      (isRecord(value.lastChangeRequest) && typeof value.lastChangeRequest.kind === 'string'))
  )
}

/**
 * Comprueba que lo leído del almacenamiento tiene la forma de una memoria.
 *
 * Lo que hay en disco pudo escribirlo cualquier versión. Antes que arrancar con
 * un registro a medias, se descarta y el día empieza vacío; los datos que sí
 * importan —el historial de sesiones— viven en otro almacén.
 */
function isOptionalMinutes(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0)
}

function isOptionalDay(value: unknown): boolean {
  return value === undefined || value === null || isDayKey(value)
}

function isLastAppliedShape(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value) || typeof value.actionId !== 'string') return false
  const previous = value.previous
  return (
    isRecord(previous) &&
    (previous.override === null || isRecord(previous.override)) &&
    isOptionalMinutes(previous.availableMinutes) &&
    isOptionalDay(previous.movedTo) &&
    (value.createdActivity === null || isScheduledActivity(value.createdActivity))
  )
}

export function isAxisDayMemory(value: unknown): value is AxisDayMemory {
  if (!isRecord(value)) return false
  if (!isOptionalMinutes(value.availableMinutes)) return false
  if (!isOptionalDay(value.movedTo)) return false
  if (!isLastAppliedShape(value.lastApplied)) return false
  if (typeof value.dayKey !== 'string' || value.schema !== AXIS_MEMORY_SCHEMA) return false
  if (value.override !== null && !isRecord(value.override)) return false
  if (!Array.isArray(value.cancelledActivities)) return false
  if (!Array.isArray(value.reportedLoads)) return false
  if (!Array.isArray(value.messages)) return false
  if (!isRecord(value.actionStatuses)) return false
  if (!isThreadState(value.thread)) return false
  return typeof value.updatedAt === 'string'
}

export function isMemoryForDay(memory: AxisDayMemory, dayKey: DayKey): boolean {
  return memory.dayKey === dayKey
}

/** La memoria que necesita la conversación para entender un mensaje. */
export function conversationMemoryOf(memory: AxisDayMemory): AxisConversationMemory {
  return {
    lastIntent: memory.thread.lastIntent,
    changeMode: memory.thread.changeMode,
    lastChangeRequest: memory.thread.lastChangeRequest,
  }
}

// ---------------------------------------------------------------------------
// El hilo
// ---------------------------------------------------------------------------

function touch(memory: AxisDayMemory, now: string): AxisDayMemory {
  return { ...memory, updatedAt: now }
}

export function rememberQuestion(
  memory: AxisDayMemory,
  message: AxisMessage,
  now: string = nowIso(),
): AxisDayMemory {
  return touch({ ...memory, messages: [...memory.messages, message] }, now)
}

/** Lo que una respuesta puede dejar en la memoria además del propio mensaje. */
export type AnswerOutcome = {
  intent: AxisIntent
  changeRequest?: { kind: string; focus: string | null } | null
  cancelledActivities?: readonly string[]
  reportedLoad?: ReportedLoad | null
}

/**
 * Guarda una respuesta de AXIS y lo que se ha aprendido con ella.
 *
 * - La intención, para el seguimiento corto («¿y por qué?»).
 * - La petición de cambio, para reconocer la insistencia. Si la hay, la
 *   conversación queda en modo cambio: una negociación abierta escribiendo
 *   («quiero una sesión más corta») sigue igual que una abierta con el botón,
 *   y termina como ella —al confirmar, al cancelar o con «Volver»—.
 * - Lo que el usuario ha dicho que hoy no ocurre, sin duplicar.
 * - La carga que ha contado, una sola vez por frase: repetirla no la hace más
 *   cierta.
 */
export function rememberAnswer(
  memory: AxisDayMemory,
  message: AxisMessage,
  outcome: AnswerOutcome,
  now: string = nowIso(),
): AxisDayMemory {
  const cancelled = outcome.cancelledActivities ?? []
  const cancelledActivities =
    cancelled.length > 0
      ? [...new Set([...memory.cancelledActivities, ...cancelled])]
      : memory.cancelledActivities

  const load = outcome.reportedLoad ?? null
  const alreadyKnown = load !== null && memory.reportedLoads.some((item) => item.quote === load.quote)
  const reportedLoads =
    load !== null && !alreadyKnown
      ? [...memory.reportedLoads, { ...load, reportedAt: now, messageId: message.id }]
      : memory.reportedLoads

  return touch(
    {
      ...memory,
      messages: [...memory.messages, message],
      cancelledActivities,
      reportedLoads,
      thread: {
        ...memory.thread,
        lastIntent: outcome.intent,
        changeMode: memory.thread.changeMode || outcome.changeRequest != null,
        lastChangeRequest: outcome.changeRequest ?? memory.thread.lastChangeRequest,
      },
    },
    now,
  )
}

/**
 * Abre la negociación del entrenamiento de hoy.
 *
 * **Añade** el mensaje de apertura al hilo; no lo sustituye. Lo hablado antes
 * sigue ahí, con sus acciones y su estado. Si ya se estaba negociando, no se
 * abre dos veces: se sigue donde se estaba.
 */
export function openChangeThread(
  memory: AxisDayMemory,
  opening: AxisMessage,
  now: string = nowIso(),
): AxisDayMemory {
  if (memory.thread.changeMode) return memory
  return touch(
    {
      ...memory,
      messages: [...memory.messages, opening],
      thread: { lastIntent: 'change', changeMode: true, lastChangeRequest: null },
    },
    now,
  )
}

/** Sale del modo cambio conservando todo lo demás. */
export function closeChangeThread(memory: AxisDayMemory, now: string = nowIso()): AxisDayMemory {
  if (!memory.thread.changeMode) return memory
  return touch(
    { ...memory, thread: { ...memory.thread, changeMode: false, lastChangeRequest: null } },
    now,
  )
}

/**
 * Vacía el hilo. Lo decidido y lo contado hoy son hechos del día, no
 * conversación, y se conservan.
 */
export function clearThread(memory: AxisDayMemory, now: string = nowIso()): AxisDayMemory {
  return touch({ ...memory, messages: [], actionStatuses: {}, thread: { ...EMPTY_THREAD } }, now)
}

// ---------------------------------------------------------------------------
// Acciones y lo decidido
// ---------------------------------------------------------------------------

export function isActionApplied(memory: AxisDayMemory, actionId: string): boolean {
  return memory.actionStatuses[actionId]?.state === 'applied'
}

/** Estado explícito de una acción. Sin registro guardado, está pendiente. */
export function actionStatusOf(memory: AxisDayMemory, actionId: string): AxisActionStatus {
  return memory.actionStatuses[actionId] ?? { state: 'pending' }
}

/** Ids de las acciones del hilo que todavía se pueden confirmar. */
export function pendingActionIds(memory: AxisDayMemory): string[] {
  const ids: string[] = []
  for (const message of memory.messages) {
    const id = message.action?.id
    if (!id || ids.includes(id)) continue
    const state = actionStatusOf(memory, id).state
    if (state === 'pending' || state === 'error') ids.push(id)
  }
  return ids
}

/**
 * Cierra las demás propuestas pendientes del día.
 *
 * Cuando se aplica un cambio, las otras propuestas que quedaban en el hilo
 * partían de una sesión que ya no es la que hay. No se confirman: quedan como
 * `superseded`, sin botón. Las ya aplicadas, canceladas o con error de otro
 * momento no se tocan.
 */
export function supersedeOtherActions(
  memory: AxisDayMemory,
  keepActionId: string,
  now: string = nowIso(),
): AxisDayMemory {
  const others = pendingActionIds(memory).filter((id) => id !== keepActionId)
  if (others.length === 0) return memory
  const actionStatuses = { ...memory.actionStatuses }
  for (const id of others) actionStatuses[id] = { state: 'superseded' }
  return touch({ ...memory, actionStatuses }, now)
}

/**
 * Aplica una acción confirmada: la elección pasa a ser la de hoy, la acción
 * queda como aplicada y la negociación termina.
 *
 * Una acción ya aplicada no se aplica dos veces.
 */
export function applyOverride(
  memory: AxisDayMemory,
  override: DayPlanOverride,
  actionId: string,
  now: string = nowIso(),
): AxisDayMemory {
  return applyDayChanges(memory, actionId, { override }, null, now)
}

/**
 * Aplica lo que cambia una acción confirmada (D-022) y deja preparado el
 * deshacer: la acción queda aplicada, la negociación termina y se recuerda cómo
 * estaba todo antes.
 *
 * Una acción ya aplicada, o ya deshecha, no se aplica otra vez (D-012).
 */
export function applyDayChanges(
  memory: AxisDayMemory,
  actionId: string,
  changes: DayChanges,
  createdActivity: ScheduledActivity | null,
  now: string = nowIso(),
): AxisDayMemory {
  const state = memory.actionStatuses[actionId]?.state
  if (state === 'applied' || state === 'undone') return memory

  const lastApplied: LastApplied = {
    actionId,
    previous: {
      override: memory.override,
      availableMinutes: memory.availableMinutes ?? null,
      movedTo: memory.movedTo ?? null,
    },
    createdActivity,
  }

  return touch(
    {
      ...memory,
      ...changes,
      lastApplied,
      actionStatuses: { ...memory.actionStatuses, [actionId]: { state: 'applied' } },
      thread: { ...memory.thread, changeMode: false, lastChangeRequest: null },
    },
    now,
  )
}

/** `true` si esa acción es la última aplicada hoy y por tanto se puede deshacer. */
export function isLastApplied(memory: AxisDayMemory, actionId: string): boolean {
  return memory.lastApplied?.actionId === actionId && isActionApplied(memory, actionId)
}

/**
 * Deshace la última acción aplicada (D-022): restaura exactamente lo que había
 * antes y la deja como deshecha, para que no vuelva a ejecutarse. Cualquier otra
 * acción no cambia nada: solo se deshace la última.
 *
 * La actividad que hubiera creado no se toca aquí; la retira quien persiste.
 */
export function undoLastApplied(
  memory: AxisDayMemory,
  actionId: string,
  now: string = nowIso(),
): AxisDayMemory {
  if (!isLastApplied(memory, actionId) || !memory.lastApplied) return memory
  const { previous } = memory.lastApplied
  return touch(
    {
      ...memory,
      override: previous.override,
      availableMinutes: previous.availableMinutes,
      movedTo: previous.movedTo,
      lastApplied: null,
      actionStatuses: { ...memory.actionStatuses, [actionId]: { state: 'undone' } },
    },
    now,
  )
}

/** El usuario descarta la propuesta. No se toca nada más; la negociación termina. */
export function cancelAction(
  memory: AxisDayMemory,
  actionId: string,
  now: string = nowIso(),
): AxisDayMemory {
  if (isActionApplied(memory, actionId)) return memory
  return touch(
    {
      ...memory,
      actionStatuses: { ...memory.actionStatuses, [actionId]: { state: 'cancelled' } },
      thread: { ...memory.thread, changeMode: false, lastChangeRequest: null },
    },
    now,
  )
}

export function markActionError(
  memory: AxisDayMemory,
  actionId: string,
  message: string,
  now: string = nowIso(),
): AxisDayMemory {
  return touch(
    { ...memory, actionStatuses: { ...memory.actionStatuses, [actionId]: { state: 'error', message } } },
    now,
  )
}

/**
 * Retira la elección del día, y solo eso.
 *
 * Al terminar de entrenar, la sesión elegida deja de tener efecto. Lo que el
 * usuario contó y lo que dijo que hoy no ocurre siguen siendo ciertos.
 */
export function clearOverride(memory: AxisDayMemory, now: string = nowIso()): AxisDayMemory {
  if (memory.override === null) return memory
  return touch({ ...memory, override: null }, now)
}

/** La memoria con la que arranca un día: la guardada si es de hoy, o vacía. */
export function memoryForToday(
  stored: unknown,
  now: Date = new Date(),
): AxisDayMemory {
  const dayKey = todayKey(now)
  if (isAxisDayMemory(stored) && isMemoryForDay(stored, dayKey)) return stored
  return emptyDayMemory(dayKey, now.toISOString())
}

/**
 * `true` si el entrenamiento de ayer se movió a hoy (D-022).
 *
 * Es lo único que se lee de un día anterior (enmienda a D-011): ni la elección,
 * ni el hilo, ni nada más de ayer se aplica hoy. Un registro roto, de otro día o
 * que movió a otra fecha no cuenta.
 */
export function movedFromDayBefore(yesterday: unknown, today: DayKey): boolean {
  return (
    isAxisDayMemory(yesterday) &&
    yesterday.dayKey === addDays(today, -1) &&
    yesterday.movedTo === today
  )
}
