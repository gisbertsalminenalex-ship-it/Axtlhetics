/**
 * Acciones que AXIS puede proponer.
 *
 * Una conversación puede terminar en algo más que texto: en una propuesta de
 * acción concreta que el usuario confirma con un botón. Pero el reparto de
 * papeles no cambia:
 *
 *   AXIS propone → el usuario confirma → el dominio valida → la app cambia.
 *
 * Nunca al revés, y nunca sin el paso del medio. Un mensaje de AXIS no ejecuta
 * nada por sí solo, ni siquiera cuando el usuario acaba de escribir «sí»: decir
 * que sí en una frase no es lo mismo que pulsar el botón.
 *
 * Tres decisiones de diseño que sostienen el resto:
 *
 * 1. **La acción no guarda el id de la propuesta destino.** Los ids se generan
 *    en cada `decide()`, así que un id no sobrevive a una recarga ni a un
 *    recálculo. Se guarda la *elección* —tipo y foco—, que sí es estable, y al
 *    aplicar se busca esa opción en la decisión vigente.
 * 2. **La acción no se aplica a ciegas.** Al confirmar se vuelve a resolver
 *    contra la decisión **vigente**: si el contexto ha cambiado —un deporte
 *    nuevo, la recuperación registrada— y esa opción ya no existe, se rechaza.
 *    No hace falta guardar ninguna huella del contexto: revalidar es la
 *    protección.
 * 3. **El tipo es una unión discriminada.** No hay texto libre ejecutable: el día
 *    que un modelo de lenguaje produzca una de estas, tendrá que encajar aquí y
 *    pasar por `validateAction` como cualquier otra.
 */

import {
  sportsFromActivities,
  type ActivityIntensity,
  type ScheduledActivity,
} from '../profile/types'
import { EXERCISE_CATALOG } from '../workouts/catalog'
import { equipmentOf, heaviestLoad, LEGACY_EQUIPMENT, type UserEquipment } from '../workouts/equipment'
import { gearToday } from './context'
import type { Exercise, SessionFocus } from '../workouts/types'
import { addDays, formatDayInSentence, weekdayOfKey, type DayKey } from '../shared/dates'
import { createId, nowIso } from '../shared/ids'
import { assessmentActivityOn } from './assessment'
import { MIN_SESSION_MINUTES } from './facts'
import type { DayChanges } from './memory'
import type { AxisContext, AxisDecision, AxisProposal, AxisRecommendationType } from './types'

/**
 * Qué sabe hacer AXIS.
 *
 * Deliberadamente corto. Acortar una sesión eligiendo una alternativa más corta
 * es `change_training`. Los otros tres son reorganizaciones (D-022) que no
 * eligen una alternativa, sino que cambian algo del día y dejan que el motor
 * vuelva a decidir:
 *
 * - `set_available_minutes`: los minutos que el usuario dice tener hoy.
 * - `move_to_tomorrow`: hoy recuperación, mañana disponible. No copia la sesión.
 * - `add_dated_activity`: registrar el partido de mañana.
 * - `train_without_equipment`: hoy, solo con el cuerpo y una silla (D-046).
 */
export type AxisActionType =
  | 'change_training'
  | 'set_available_minutes'
  | 'move_to_tomorrow'
  | 'add_dated_activity'
  | 'train_without_equipment'

/** La opción concreta a la que se quiere cambiar, en términos estables. */
export type AxisActionTarget = {
  type: AxisRecommendationType
  /** `null` cuando la opción es no entrenar. */
  focus: SessionFocus | null
}

/** De dónde se parte. Sirve para registrar la modificación y para el contexto. */
export type AxisActionOrigin = {
  proposalId: string
  headline: string
  type: AxisRecommendationType
  focus: SessionFocus | null
}

type AxisActionBase = {
  id: string
  dayKey: DayKey
  createdAt: string
  /** Lo que se lee en el botón. Corto y sin jerga: «Confirmar cambio». */
  label: string
  /** Qué va a pasar, en una línea. Se muestra junto al botón. */
  summary: string
  /** Por qué AXIS lo propone. Es lo que queda registrado como motivo. */
  reason: string
  origin: AxisActionOrigin
}

/** El partido que se registraría, ya resuelto: nombre, día e intensidad (D-022). */
export type DatedActivityDraft = {
  name: string
  date: DayKey
  intensity: ActivityIntensity
  loadsMuscleGroups: string[]
}

export type ChangeTrainingAction = AxisActionBase & { type: 'change_training'; target: AxisActionTarget }
export type MoveToTomorrowAction = AxisActionBase & {
  type: 'move_to_tomorrow'
  target: AxisActionTarget
  tomorrow: DayKey
}
export type SetMinutesAction = AxisActionBase & { type: 'set_available_minutes'; minutes: number }
export type AddDatedActivityAction = AxisActionBase & {
  type: 'add_dated_activity'
  activity: DatedActivityDraft
}
export type WithoutEquipmentAction = AxisActionBase & { type: 'train_without_equipment' }

export type AxisActionProposal =
  | ChangeTrainingAction
  | MoveToTomorrowAction
  | SetMinutesAction
  | AddDatedActivityAction
  | WithoutEquipmentAction

/** Las acciones que eligen una alternativa del motor: siempre tienen destino. */
export type TargetedAction = ChangeTrainingAction | MoveToTomorrowAction

/**
 * Lo que una respuesta de AXIS propone además de (o en vez de) elegir otra
 * alternativa (D-022). La aplicación lo convierte en una acción con botón; no se
 * aplica solo.
 */
export type AxisActionEffect =
  | { kind: 'set_available_minutes'; minutes: number }
  | { kind: 'move_to_tomorrow' }
  | { kind: 'add_dated_activity'; intensity: ActivityIntensity }
  | { kind: 'train_without_equipment' }

/**
 * Estado de una acción dentro de la conversación. Vive en la memoria del día.
 *
 * `superseded`: otra acción del mismo día se aplicó después de proponer esta.
 * Ya no tiene sentido ejecutarla: la sesión que quería cambiar ya no es la que
 * hay.
 */
export type AxisActionStatus =
  | { state: 'pending' }
  | { state: 'applied' }
  | { state: 'cancelled' }
  | { state: 'superseded' }
  /** Aplicada y después deshecha (D-022). No vuelve a ejecutarse. */
  | { state: 'undone' }
  | { state: 'error'; message: string }

// ---------------------------------------------------------------------------
// Buscar una opción en la decisión
// ---------------------------------------------------------------------------

/**
 * La propuesta de la decisión que corresponde a una elección estable.
 *
 * Es la única forma de traducir «tipo + foco» a una propuesta concreta, y la
 * usan la validación, la elección guardada y la conversación. Si mañana cambia
 * cómo se identifica una opción, cambia aquí y en ningún otro sitio.
 */
export function findProposal(
  decision: AxisDecision,
  target: AxisActionTarget,
): AxisProposal | null {
  const all = [decision.primary, ...decision.alternatives]
  return (
    all.find(
      (proposal) =>
        proposal.type === target.type && (proposal.session?.focus ?? null) === target.focus,
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
// Construir la propuesta de acción
// ---------------------------------------------------------------------------

/**
 * Crea la propuesta de cambio de entrenamiento.
 *
 * `target` sale siempre de una alternativa que el motor ya ha generado: AXIS no
 * inventa sesiones, elige entre las que existen.
 */
export function buildChangeTrainingAction(params: {
  context: AxisContext
  origin: AxisProposal
  target: AxisProposal
  reason: string
}): ChangeTrainingAction {
  const { context, origin, target, reason } = params

  return {
    id: createId(),
    type: 'change_training',
    dayKey: context.dayKey,
    createdAt: nowIso(),
    label: 'Confirmar cambio',
    summary: summaryFor(target),
    reason,
    target: { type: target.type, focus: target.session?.focus ?? null },
    origin: {
      proposalId: origin.id,
      headline: origin.headline,
      type: origin.type,
      focus: origin.session?.focus ?? null,
    },
  }
}

function summaryFor(target: AxisProposal): string {
  if (!target.session) return `Cambiar a: ${target.headline.toLowerCase()}`
  return `Cambiar a ${target.session.title.toLowerCase()}, ${target.session.estimatedMinutes} min`
}

// ---------------------------------------------------------------------------
// Validar antes de aplicar
// ---------------------------------------------------------------------------

export type AxisActionRejection =
  /** El día ha cambiado desde que se propuso. */
  | 'otro_dia'
  /** La opción ya no existe en la decisión vigente. */
  | 'ya_no_disponible'
  /** La sesión destino contiene algo que no está en el catálogo. */
  | 'sesion_invalida'
  /** Aplicarla no cambiaría nada. */
  | 'sin_efecto'
  /** El contexto ya no la permite: entrenó, ya se movió, hay partido mañana… (D-022). */
  | 'no_permitida'

export type AxisActionValidation =
  /** `target` es la alternativa elegida, o `null` si la acción no elige ninguna. */
  | { ok: true; target: AxisProposal | null }
  | { ok: false; reason: AxisActionRejection; message: string }

/** La validación de una acción con destino: si pasa, el destino existe. */
export type TargetedValidation =
  | { ok: true; target: AxisProposal }
  | { ok: false; reason: AxisActionRejection; message: string }

/**
 * Comprueba que la acción sigue teniendo sentido y devuelve la propuesta real a
 * aplicar.
 *
 * La resolución es contra la **decisión vigente**, no contra la que había cuando
 * se generó la acción. Si el contexto ha cambiado, la opción se vuelve a
 * calcular con los datos de ahora; si ya no existe, se rechaza.
 *
 * Esto responde a «¿puede ejecutarse?». Nunca a «¿debería recomendarse?»: eso
 * ya lo decidió el motor al generar las alternativas.
 */
export function validateAction(
  action: TargetedAction,
  decision: AxisDecision,
  context: AxisContext,
  selected: AxisProposal,
): TargetedValidation
export function validateAction(
  action: AxisActionProposal,
  decision: AxisDecision,
  context: AxisContext,
  selected: AxisProposal,
): AxisActionValidation
export function validateAction(
  action: AxisActionProposal,
  decision: AxisDecision,
  context: AxisContext,
  /** La propuesta que el usuario tiene seleccionada ahora mismo. */
  selected: AxisProposal,
): AxisActionValidation {
  if (action.dayKey !== context.dayKey) {
    return {
      ok: false,
      reason: 'otro_dia',
      message: 'Esta propuesta era de otro día. Vuelve a pedírmelo y lo miro con los datos de hoy.',
    }
  }

  // Unión discriminada: si mañana se añade otro tipo, TypeScript obliga a tratarlo.
  switch (action.type) {
    case 'change_training':
      return validateChangeTraining(action.target, decision, context, selected)
    case 'move_to_tomorrow':
      return validateMoveToTomorrow(action, decision, context)
    case 'set_available_minutes':
      return validateMinutes(action.minutes, context)
    case 'add_dated_activity':
      return validateDatedActivity(action.activity, context)
    case 'train_without_equipment':
      return validateWithoutEquipment(context)
  }
}

/** Hoy sin material (D-046): solo si hoy había material que quitar. */
function validateWithoutEquipment(context: AxisContext): AxisActionValidation {
  if (trainedOn(context)) return TRAINED_TODAY
  if (context.withoutEquipmentToday) {
    return { ok: false, reason: 'sin_efecto', message: 'Ya tengo en cuenta que hoy entrenas sin material.' }
  }
  const gear = equipmentOf(context.profile)
  if (gear.items.length === 0 && gear.weights.length === 0) {
    return { ok: false, reason: 'sin_efecto', message: 'Tus sesiones ya son solo con tu peso corporal.' }
  }
  return { ok: true, target: null }
}

/** Hoy ya hubo actividad: una sesión completada o un test de evolución (D-021). */
function trainedOn(context: AxisContext): boolean {
  const session = context.recentSessions.some(
    (item) => item.status === 'completed' && item.dayKey === context.dayKey,
  )
  return session || assessmentActivityOn(context)
}

const TRAINED_TODAY: AxisActionValidation = {
  ok: false,
  reason: 'no_permitida',
  message: 'Hoy ya has entrenado: no hay nada que reorganizar.',
}

/**
 * Hoy recuperación, mañana disponible.
 *
 * Desde D-030 se puede aplazar otra vez o encima de un partido: AXIS avisa en
 * la conversación, pero decide el usuario. Aquí solo queda si se puede hacer.
 */
function validateMoveToTomorrow(
  action: Extract<AxisActionProposal, { type: 'move_to_tomorrow' }>,
  decision: AxisDecision,
  context: AxisContext,
): AxisActionValidation {
  if (trainedOn(context)) return TRAINED_TODAY
  if (action.tomorrow !== addDays(context.dayKey, 1)) {
    return { ok: false, reason: 'otro_dia', message: 'Esa propuesta era para otro día. Vuelve a pedírmelo.' }
  }
  const target = findProposal(decision, action.target)
  if (!target) {
    return {
      ok: false,
      reason: 'ya_no_disponible',
      message: 'Esa opción ya no está sobre la mesa con tus datos de ahora. Dime qué quieres y lo replanteo.',
    }
  }
  return { ok: true, target }
}

/** Minutos de hoy: solo por encima del mínimo de sesión y solo si cambian algo. */
function validateMinutes(minutes: number, context: AxisContext): AxisActionValidation {
  if (trainedOn(context)) return TRAINED_TODAY
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES) {
    return {
      ok: false,
      reason: 'no_permitida',
      message: `Por debajo de ${MIN_SESSION_MINUTES} minutos no preparo una sesión estructurada.`,
    }
  }
  if (context.availableMinutesToday === minutes) {
    return { ok: false, reason: 'sin_efecto', message: `Ya tengo en cuenta que hoy tienes ${minutes} minutos.` }
  }
  return { ok: true, target: null }
}

const INTENSITIES: readonly ActivityIntensity[] = ['baja', 'media', 'alta']

/** El partido de mañana: solo para mañana y solo si no está ya registrado. */
function validateDatedActivity(activity: DatedActivityDraft, context: AxisContext): AxisActionValidation {
  if (activity.date !== addDays(context.dayKey, 1)) {
    return { ok: false, reason: 'otro_dia', message: 'Esa propuesta era para otro día. Vuelve a pedírmelo.' }
  }
  if (!INTENSITIES.includes(activity.intensity)) {
    return { ok: false, reason: 'no_permitida', message: 'Necesito saber cómo de exigente es para registrarlo.' }
  }
  const already = context.activities.some(
    (existing) =>
      existing.date === activity.date && existing.name.toLowerCase() === activity.name.toLowerCase(),
  )
  if (already) {
    return {
      ok: false,
      reason: 'sin_efecto',
      message: `Ya tengo registrado ${activity.name.toLowerCase()} para mañana.`,
    }
  }
  return { ok: true, target: null }
}

function validateChangeTraining(
  actionTarget: AxisActionTarget,
  decision: AxisDecision,
  context: AxisContext,
  selected: AxisProposal,
): AxisActionValidation {
  const target = findProposal(decision, actionTarget)

  if (!target) {
    return {
      ok: false,
      reason: 'ya_no_disponible',
      message: 'Esa opción ya no está sobre la mesa con tus datos de ahora. Dime qué quieres y lo replanteo.',
    }
  }

  if (!isSessionValid(target, context.catalog, gearToday(context))) {
    return {
      ok: false,
      reason: 'sesion_invalida',
      message: 'Esa sesión no me cuadra con el catálogo de ejercicios. No la voy a aplicar.',
    }
  }

  // Se compara con lo que el usuario tiene **ahora**, no con el origen que la
  // acción recuerda: si mientras tanto aplicó otro cambio y ya está en esa
  // sesión, no hay nada que cambiar.
  if (selected.id === target.id) {
    return {
      ok: false,
      reason: 'sin_efecto',
      message: 'Esa ya es tu sesión de hoy. No hay nada que cambiar.',
    }
  }

  return { ok: true, target }
}

/**
 * La sesión solo es válida si cada ejercicio existe en el catálogo real y su
 * carga cabe en lo que el usuario tiene.
 *
 * Hoy las sesiones las construye el motor y por tanto ya son válidas. Esto está
 * aquí para el día en que la propuesta venga de un modelo de lenguaje: entonces
 * esta comprobación es lo único que impide aplicar ejercicios inventados.
 */
export function isSessionValid(
  proposal: AxisProposal,
  /** El catálogo con el que decidió el motor. Por defecto, el real. */
  catalog: readonly Exercise[] = EXERCISE_CATALOG,
  /** El material del usuario (D-046). Por defecto, el de un perfil anterior. */
  gear: UserEquipment = LEGACY_EQUIPMENT,
): boolean {
  const session = proposal.session
  if (!session) return true
  const heaviest = heaviestLoad(gear)

  return session.exercises.every((planned) => {
    const exercise = catalog.find((item) => item.id === planned.exerciseId)
    if (!exercise) return false
    if (planned.sets <= 0 || planned.reps <= 0) return false

    // La carga sugerida no puede pasarse del peso más pesado que tiene el usuario.
    if (planned.suggestedWeightKg !== null) {
      if (planned.suggestedWeightKg < 0) return false
      if (heaviest === null || planned.suggestedWeightKg > heaviest) return false
    }
    return true
  })
}

// ---------------------------------------------------------------------------
// Lo que se guarda para que el cambio sobreviva a una recarga
// ---------------------------------------------------------------------------

/**
 * La elección del día, en términos que sobreviven a un recálculo.
 *
 * No guarda la sesión: guarda **qué opción eligió el usuario**. Al recargar, el
 * motor vuelve a decidir con los datos de ese momento y se selecciona la opción
 * equivalente. Si ya no existe, no se aplica nada y manda la recomendación
 * fresca, que es lo correcto: los datos de hoy pesan más que una elección de
 * hace unas horas.
 */
export type DayPlanOverride = {
  dayKey: DayKey
  type: AxisRecommendationType
  focus: SessionFocus | null
  /** Titular de lo que AXIS recomendaba, para poder decir de qué se cambió. */
  originHeadline: string
  reason: string
  decidedAt: string
  source: 'axis_conversation'
}

/**
 * Todo lo que el usuario ha decidido hoy y que no se deduce de sus datos.
 *
 * Son dos cosas distintas y las dos tienen que sobrevivir a una recarga:
 *
 * - `override`: qué sesión eligió, si cambió la que AXIS recomendaba.
 * - `cancelledActivities`: qué del calendario dijo que hoy no ocurre. Sin esto,
 *   al recargar AXIS volvía a dar por hecho el partido que el usuario ya le
 *   había dicho que se había cancelado.
 *
 * Vive en un único registro por día. Un día puede tener cancelaciones sin haber
 * cambiado de sesión, y al revés.
 */
export function overrideFrom(
  action: Pick<AxisActionProposal, 'dayKey' | 'origin' | 'reason'>,
  target: AxisProposal,
  /** El mismo reloj que el resto de la aplicación de la acción. */
  now: string = nowIso(),
): DayPlanOverride {
  return {
    dayKey: action.dayKey,
    type: target.type,
    focus: target.session?.focus ?? null,
    originHeadline: action.origin.headline,
    reason: action.reason,
    decidedAt: now,
    source: 'axis_conversation',
  }
}

/** Busca en la decisión vigente la opción que el usuario eligió. */
export function resolveOverride(
  override: DayPlanOverride | null,
  decision: AxisDecision | null,
  dayKey: DayKey,
): AxisProposal | null {
  if (!override || !decision) return null
  if (override.dayKey !== dayKey) return null

  return findProposal(decision, { type: override.type, focus: override.focus })
}


// ---------------------------------------------------------------------------
// Reorganizaciones (D-022)
// ---------------------------------------------------------------------------

function originOf(origin: AxisProposal): AxisActionOrigin {
  return {
    proposalId: origin.id,
    headline: origin.headline,
    type: origin.type,
    focus: origin.session?.focus ?? null,
  }
}

function baseOf(context: AxisContext, origin: AxisProposal, reason: string) {
  return {
    id: createId(),
    dayKey: context.dayKey,
    createdAt: nowIso(),
    label: 'Confirmar cambio',
    reason,
    origin: originOf(origin),
  }
}

/** Hoy pasa a `target` (recuperación) y mañana queda disponible. */
export function buildMoveToTomorrowAction(params: {
  context: AxisContext
  origin: AxisProposal
  target: AxisProposal
  reason: string
}): MoveToTomorrowAction {
  const { context, origin, target, reason } = params
  return {
    ...baseOf(context, origin, reason),
    type: 'move_to_tomorrow',
    summary: 'Hoy descansas y mañana queda como día de entrenamiento',
    target: { type: target.type, focus: target.session?.focus ?? null },
    tomorrow: addDays(context.dayKey, 1),
  }
}

export function buildSetMinutesAction(params: {
  context: AxisContext
  origin: AxisProposal
  minutes: number
  reason: string
}): AxisActionProposal {
  const { context, origin, minutes, reason } = params
  return {
    ...baseOf(context, origin, reason),
    type: 'set_available_minutes',
    summary: `Ajustar la sesión de hoy a ${minutes} minutos`,
    minutes,
  }
}

export function buildWithoutEquipmentAction(params: {
  context: AxisContext
  origin: AxisProposal
  reason: string
}): AxisActionProposal {
  const { context, origin, reason } = params
  return {
    ...baseOf(context, origin, reason),
    type: 'train_without_equipment',
    summary: 'Rehacer la sesión de hoy solo con tu peso corporal',
  }
}

export function buildAddDatedActivityAction(params: {
  context: AxisContext
  origin: AxisProposal
  activity: DatedActivityDraft
  reason: string
}): AxisActionProposal {
  const { context, origin, activity, reason } = params
  return {
    ...baseOf(context, origin, reason),
    type: 'add_dated_activity',
    label: 'Registrar',
    summary: `Registrar ${activity.name.toLowerCase()} para el ${formatDayInSentence(activity.date)}`,
    activity,
  }
}

/**
 * El partido de mañana, sin inventar nada (D-022).
 *
 * Con un único deporte habitual, es un partido de ese deporte y carga lo mismo
 * que él. Con varios o ninguno no se sabe de cuál: se registra como «Partido»,
 * sin grupos musculares.
 */
export function datedActivityDraft(
  context: AxisContext,
  intensity: ActivityIntensity,
): DatedActivityDraft {
  const sports = sportsFromActivities(context.activities)
  const date = addDays(context.dayKey, 1)
  const sport = sports.length === 1 ? sports[0] : null
  return {
    name: matchName(sports.map((item) => item.name)),
    date,
    intensity,
    loadsMuscleGroups: sport ? [...sport.loadsMuscleGroups] : [],
  }
}

/** «Partido de baloncesto» con un único deporte habitual; «Partido» si no (D-022). */
export function matchName(sportNames: readonly string[]): string {
  return sportNames.length === 1 ? `Partido de ${sportNames[0].toLowerCase()}` : 'Partido'
}

/**
 * Lo que la acción cambia en la memoria del día. `target` es lo que devolvió la
 * validación.
 */
export function dayChangesFor(
  action: AxisActionProposal,
  target: AxisProposal | null,
  now: string = nowIso(),
): DayChanges {
  switch (action.type) {
    case 'change_training':
      return target ? { override: overrideFrom(action, target, now) } : {}
    case 'move_to_tomorrow':
      return target
        ? { override: overrideFrom(action, target, now), movedTo: action.tomorrow }
        : { movedTo: action.tomorrow }
    case 'set_available_minutes':
      // Con otro tiempo, la elección anterior puede no existir: se retira y
      // manda la decisión nueva. Deshacer la restaura.
      return { availableMinutes: action.minutes, override: null }
    case 'add_dated_activity':
      return {}
    case 'train_without_equipment':
      // Con otro material, la elección anterior puede no existir: manda la decisión nueva.
      return { withoutEquipment: true, override: null }
  }
}

/** La actividad que crea la acción, si crea una. Con id y fechas estables. */
export function activityCreatedBy(
  action: AxisActionProposal,
  now: string = nowIso(),
): ScheduledActivity | null {
  if (action.type !== 'add_dated_activity') return null
  const { activity } = action
  return {
    id: createId(),
    name: activity.name,
    weekday: weekdayOfKey(activity.date),
    date: activity.date,
    startMinute: null,
    endMinute: null,
    intensity: activity.intensity,
    loadsMuscleGroups: [...activity.loadsMuscleGroups],
    createdAt: now,
    updatedAt: now,
  }
}
