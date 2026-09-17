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
 * 2. **La acción lleva una huella del contexto** con el que se generó. Si el
 *    contexto ha cambiado —un deporte nuevo, la recuperación registrada—, no se
 *    aplica a ciegas: se vuelve a resolver contra la decisión actual, y si ya no
 *    existe esa opción se rechaza.
 * 3. **El tipo es una unión discriminada.** No hay texto libre ejecutable: el día
 *    que un modelo de lenguaje produzca una de estas, tendrá que encajar aquí y
 *    pasar por `validateAction` como cualquier otra.
 */

import { EXERCISE_CATALOG, MAX_AVAILABLE_LOAD_KG } from '../workouts/catalog'
import type { SessionFocus } from '../workouts/types'
import type { DayKey } from '../shared/dates'
import { createId, nowIso } from '../shared/ids'
import type { AxisContext, AxisDecision, AxisProposal, AxisRecommendationType } from './types'

/**
 * Qué sabe hacer AXIS.
 *
 * Deliberadamente corto. Acortar una sesión es cambiarla por una más corta, así
 * que no hay un tipo aparte para eso: sería el mismo modelo con otro nombre.
 */
export type AxisActionType = 'change_training'

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

export type AxisActionProposal = {
  id: string
  type: AxisActionType
  dayKey: DayKey
  createdAt: string
  /** Lo que se lee en el botón. Corto y sin jerga: «Confirmar cambio». */
  label: string
  /** Qué va a pasar, en una línea. Se muestra junto al botón. */
  summary: string
  /** Por qué AXIS lo propone. Es lo que queda registrado como motivo. */
  reason: string
  target: AxisActionTarget
  origin: AxisActionOrigin
  /** Estado del contexto cuando se generó, para detectar que quedó obsoleta. */
  contextFingerprint: string
}

/** Estado de una acción dentro de la conversación. Vive en la aplicación. */
export type AxisActionStatus =
  | { state: 'pending' }
  | { state: 'applied' }
  | { state: 'cancelled' }
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
// Huella del contexto
// ---------------------------------------------------------------------------

/**
 * Resumen de lo que, si cambia, invalida una propuesta de acción.
 *
 * No es un hash criptográfico ni pretende serlo: es una lista de lo que el motor
 * mira para decidir. Si algo de esto es distinto al confirmar, la propuesta se
 * generó con otra información y no puede aplicarse tal cual.
 */
export function contextFingerprint(context: AxisContext): string {
  const recovery =
    context.recoveryScore && context.recoveryScore.status === 'ok'
      ? String(context.recoveryScore.value)
      : 'sin-datos'

  const activities = context.activities
    .map((activity) => activity.id)
    .sort()
    .join(',')

  const lastSession = context.recentSessions[0]?.id ?? 'ninguna'

  return [
    context.dayKey,
    recovery,
    activities,
    lastSession,
    String(context.recentSessions.length),
  ].join('|')
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
}): AxisActionProposal {
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
    contextFingerprint: contextFingerprint(context),
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

export type AxisActionValidation =
  | { ok: true; target: AxisProposal; recomputed: boolean }
  | { ok: false; reason: AxisActionRejection; message: string }

/**
 * Comprueba que la acción sigue teniendo sentido y devuelve la propuesta real a
 * aplicar.
 *
 * La resolución es contra la **decisión vigente**, no contra la que había cuando
 * se generó la acción. Si el contexto ha cambiado, se marca `recomputed`: la
 * opción se ha vuelto a calcular con los datos de ahora, no se ha aplicado una
 * sesión antigua.
 */
export function validateAction(
  action: AxisActionProposal,
  decision: AxisDecision,
  context: AxisContext,
): AxisActionValidation {
  // Unión discriminada: un tipo desconocido no llega hasta aquí, y si el día de
  // mañana se añade otro, TypeScript obliga a tratarlo.
  switch (action.type) {
    case 'change_training':
      break
  }

  if (action.dayKey !== context.dayKey) {
    return {
      ok: false,
      reason: 'otro_dia',
      message: 'Esta propuesta era de otro día. Vuelve a pedírmelo y lo miro con los datos de hoy.',
    }
  }

  const target = findProposal(decision, action.target)

  if (!target) {
    return {
      ok: false,
      reason: 'ya_no_disponible',
      message: 'Esa opción ya no está sobre la mesa con tus datos de ahora. Dime qué quieres y lo replanteo.',
    }
  }

  if (!isSessionValid(target)) {
    return {
      ok: false,
      reason: 'sesion_invalida',
      message: 'Esa sesión no me cuadra con el catálogo de ejercicios. No la voy a aplicar.',
    }
  }

  const current = currentProposalId(decision, action)
  if (current === target.id) {
    return {
      ok: false,
      reason: 'sin_efecto',
      message: 'Esa ya es tu sesión de hoy. No hay nada que cambiar.',
    }
  }

  return {
    ok: true,
    target,
    recomputed: action.contextFingerprint !== contextFingerprint(context),
  }
}

/** La propuesta de la que se parte, si sigue existiendo en la decisión vigente. */
function currentProposalId(decision: AxisDecision, action: AxisActionProposal): string | null {
  return findProposal(decision, { type: action.origin.type, focus: action.origin.focus })?.id ?? null
}

/**
 * La sesión solo es válida si cada ejercicio existe en el catálogo real y su
 * carga cabe en lo que el usuario tiene.
 *
 * Hoy las sesiones las construye el motor y por tanto ya son válidas. Esto está
 * aquí para el día en que la propuesta venga de un modelo de lenguaje: entonces
 * esta comprobación es lo único que impide aplicar ejercicios inventados.
 */
export function isSessionValid(proposal: AxisProposal): boolean {
  const session = proposal.session
  if (!session) return true

  return session.exercises.every((planned) => {
    const exercise = EXERCISE_CATALOG.find((item) => item.id === planned.exerciseId)
    if (!exercise) return false
    if (planned.sets <= 0 || planned.reps <= 0) return false

    // La carga sugerida no puede pasarse del material disponible.
    if (planned.suggestedWeightKg !== null) {
      if (planned.suggestedWeightKg < 0) return false
      if (planned.suggestedWeightKg > MAX_AVAILABLE_LOAD_KG) return false
    }
    return true
  })
}

/** Lo que hay en casa: una pesa de 5 kg. Ni barra, ni banco, ni gimnasio. */
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
  action: AxisActionProposal,
  target: AxisProposal,
): DayPlanOverride {
  return {
    dayKey: action.dayKey,
    type: target.type,
    focus: target.session?.focus ?? null,
    originHeadline: action.origin.headline,
    reason: action.reason,
    decidedAt: nowIso(),
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
