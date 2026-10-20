/**
 * Capa de lenguaje de AXIS.
 *
 * El modelo **redacta**, no decide. La recomendación del día, el veredicto sobre
 * un cambio y la sesión concreta salen del motor determinista; lo único que aporta
 * la IA es una explicación mejor escrita de eso mismo.
 *
 * Reglas que no se negocian:
 *
 * 1. **El navegador nunca habla con el proveedor.** Se llama a un endpoint propio
 *    del mismo origen que guarda la credencial en el servidor. Aquí no hay ni puede
 *    haber secretos.
 * 2. **El modelo no calcula nada.** Recibe el briefing ya construido por el dominio
 *    —Recovery Score, Training Load, historial, calendario y propuesta— y el
 *    veredicto que el motor ya ha emitido.
 * 3. **El modelo no ejecuta nada.** Puede sugerir un cambio, pero esa sugerencia se
 *    coteja contra lo que el dominio había decidido y después pasa por
 *    `validateAction` y por el botón de confirmar, como cualquier otra.
 * 4. **Si falla, responde el determinista.** La conversación nunca se queda muerta.
 *
 * Este módulo es puro: no conoce React, ni IndexedDB, ni el hosting, ni el SDK de
 * ningún proveedor. Cambiar de proveedor o de modelo no se toca aquí.
 */

import type { AxisActionTarget } from '../actions'
import type { AxisBriefing } from '../briefing'
import { AXIS_PERSONALITY, AXIS_SYSTEM_PROMPT } from '../personality'
import {
  checkModelText,
  DATA_ANSWER_INTENTS,
  lengthLimitsFor,
  LONG_ANSWER_INTENTS,
  type ModelTextRejection,
} from '../safety'
import type { AxisAiReinterpretRequest } from './reinterpret'
import { CHANGE_INVITATION } from './social'
import type { AxisAnswer, AxisConversationEngine, AxisIntent } from './types'

export const AI_CONVERSATION_ID = 'axis-conversation-ai-v1'

/**
 * La personalidad vive en `personality.ts` y el prompt se genera desde ella. Se
 * reexporta aquí para que quien ya lo importaba de la conversación no cambie.
 */
export { AXIS_SYSTEM_PROMPT }

/**
 * Lo que se le pide al proveedor además de la personalidad: formato y límites.
 *
 * Separado del prompt anterior para que siga habiendo una sola fuente de verdad
 * sobre quién es AXIS. Esto es fontanería del proveedor, no personalidad.
 *
 * La longitud depende de la pregunta (D-030): los datos, cortos; las
 * explicaciones y los cambios, largos y desarrollados. Sin intención, corto.
 */
export function aiSystemPrompt(intent?: AxisIntent): string {
  const length = intent ? lengthLimitsFor(intent) : AXIS_PERSONALITY.limits
  const long = intent !== undefined && LONG_ANSWER_INTENTS.includes(intent)
  return [
    AXIS_SYSTEM_PROMPT,
    '',
    'CÓMO RESPONDER.',
    'Recibes un JSON con `briefing` (los datos reales del usuario), `question` (lo que ha escrito) y `domain` (lo que el motor determinista ya ha concluido).',
    '`domain.text` es la respuesta correcta en cuanto al fondo. Tu trabajo es decirla mejor: más natural, más clara, sin perder ni un dato y sin añadir ninguno.',
    'Conserva todas las cifras de `domain.text` escritas con dígitos, tal cual (no «siete horas», sino «7 h»). Si falta una, tu respuesta se descarta.',
    'No contradigas `domain`. Si el motor ha dicho que no, tú dices que no.',
    'No afirmes nada del usuario —historial, sesiones, recuperación, sueño, molestias o preferencias— que no esté en `domain.text` o en `briefing`. Que un dato no aparezca no significa que no haya ocurrido: di que no está registrado, nunca lo conviertas en un hecho.',
    `Responde en ${length.targetSentences}. Nunca más de ${length.maxSentences}.`,
    ...(long
      ? [
          'Aquí se espera una respuesta de entrenador, desarrollada: empieza por el veredicto de `domain.text`, explica el porqué con los datos de `briefing` (recuperación, carga, sesiones recientes, objetivos), di qué cambia en concreto y termina con un consejo práctico para hoy. Usa solo los datos que sí están; no hables de lo que no tienes registrado si `domain.text` no lo menciona. Sin relleno ni frases genéricas.',
        ]
      : []),
    'Devuelve SOLO un objeto JSON con esta forma:',
    '{"message": "tu respuesta", "action": null}',
    'Si `domain.proposedTarget` no es null y la conversación va de cambiar el entrenamiento, copia ese mismo objeto en `action.target` y pon `action.type` a "change_training". No propongas un destino distinto del que te da el dominio: se descartaría.',
  ].join('\n')
}

/**
 * La charla (D-042): aquí el modelo sí escribe con libertad. No hay veredicto
 * que conservar ni cifras que redactar; `domain.text` es solo una idea. Las
 * puertas de `checkModelText` siguen: sin cifras inventadas, sin afirmar nada
 * del usuario que no esté en el briefing, sin lenguaje médico.
 */
export function chatSystemPrompt(): string {
  return [
    AXIS_SYSTEM_PROMPT,
    '',
    'AHORA ESTÁS CHARLANDO.',
    'El usuario no te pide nada concreto del entrenamiento: te saluda, te pregunta qué tal, te da las gracias, se despide, bromea o comenta algo suelto. Recibes `question` (lo que acaba de escribir) y `briefing` (sus datos de hoy). Los mensajes anteriores son la conversación de hoy hasta ahora.',
    'Contesta como un buen entrenador en un chat con alguien a quien conoce: natural, cercano, con algo de humor si encaja, y sin sonar a plantilla. Responde a lo que ha dicho de verdad: si dice que está aburrido, que está contento o que ha tenido un mal día, reacciona a eso como lo haría una persona.',
    'Escribe con tus palabras y no repitas lo que ya has dicho en la conversación: si ya mencionaste la sesión de hoy, no vuelvas a hacerlo.',
    'No propongas cambios de sesión, de zona ni alternativas: eso lo decide el motor cuando el usuario lo pide. Si parece que quiere cambiar algo, dile que te lo pida.',
    'La sesión de hoy (`briefing.proposal`) la mencionas solo si viene a cuento —en el primer saludo, o si sirve para lo que ha dicho—, en pocas palabras y sin cifras. Muchas respuestas no la necesitan.',
    'Si saluda, saluda y pregúntale algo sencillo: cómo está o cómo llega hoy. No le preguntes cuánto ha dormido: eso se registra en Recuperación.',
    'Si habla de algo ajeno a AXTHLETICS (deberes, noticias, política, código), no lo resuelvas: una frase amable y vuelve a lo suyo. Nunca digas que algo «no es un dato registrado»: estás charlando, no informando.',
    'Si `domain.text` no está vacío, es algo que tu respuesta tiene que incluir, con tus palabras.',
    'Para dirigirte a él por su nombre escribe exactamente {nombre}; se sustituye en el dispositivo. Úsalo poco, como en una conversación real, y nunca escribas otro nombre.',
    'No afirmes nada del usuario que no esté en `briefing` o en la conversación. Sin cifras, sin emojis y sin signos de exclamación. No empieces por «Genial», «Perfecto», «Claro» ni «Por supuesto».',
    'Responde en 1–2 frases, como en un chat.',
    'Devuelve SOLO un objeto JSON con esta forma:',
    '{"message": "tu respuesta", "action": null}',
  ].join('\n')
}

/**
 * Lo que vuelve de la charla, listo para enseñar: el nombre en su sitio y sin
 * exclamaciones, que la personalidad no usa (un «¡Hola!» no merece descartar
 * una buena respuesta).
 */
export function tidyChatText(text: string, name: string | null): string {
  const named = name ? text.replace(/\{nombre\}/g, name) : text.replace(/,?\s*\{nombre\}/g, '')
  return named.replace(/¡/g, '').replace(/!+/g, '.').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Qué sale del dispositivo
// ---------------------------------------------------------------------------

/**
 * El briefing recortado para enviar al proveedor.
 *
 * Se quita el nombre: sirve para saludar, no para razonar, y es el único dato del
 * briefing que identifica a una persona. Todo lo demás —edad, objetivos, deportes,
 * recuperación— sí influye en la respuesta, así que se manda.
 *
 * Se quita también el bloque `assessment` (D-021): las respuestas sobre el test de
 * evolución son deterministas y no pasan por el modelo, así que sus fechas, motivos
 * y variante no tienen por qué salir del dispositivo. Si la propuesta del día
 * menciona el test, eso viaja dentro de `proposal`, como cualquier otra razón.
 *
 * Y se quita el bloque `scan` (D-023): el escaneo corporal es lo más personal que
 * guarda la app. Las respuestas sobre él son deterministas y nada de él sale del
 * dispositivo.
 *
 * Y el material (D-046): solo sirve para resolver nombres de ejercicio, que es
 * determinista.
 */
export type AxisAiBriefing = Omit<AxisBriefing, 'profile' | 'assessment' | 'scan' | 'equipment'> & {
  profile: Omit<NonNullable<AxisBriefing['profile']>, 'name'> | null
}

export function toAiBriefing(briefing: AxisBriefing): AxisAiBriefing {
  const { assessment: _assessment, scan: _scan, equipment: _equipment, profile, ...shared } = briefing
  if (!profile) return { ...shared, profile: null }

  const { name: _name, ...rest } = profile
  return { ...shared, profile: rest }
}

/** Lo que el motor determinista ya ha concluido. El modelo lo redacta, no lo sustituye. */
export type AxisAiDomainAnswer = {
  text: string
  intent: AxisIntent
  proposedTarget: AxisActionTarget | null
}

/** Un mensaje anterior de la conversación de hoy, para que la charla tenga memoria (D-042). */
export type AxisChatTurn = { role: 'user' | 'axis'; text: string }

/** Cuántos mensajes anteriores viajan con la charla, y hasta qué largo cada uno. */
export const CHAT_HISTORY_TURNS = 8
export const CHAT_HISTORY_CHARACTERS = 400

export type AxisAiRequest = {
  system: string
  question: string
  briefing: AxisAiBriefing
  domain: AxisAiDomainAnswer
  /** Solo en la charla: los últimos mensajes, con el nombre del usuario sustituido por {nombre}. */
  history?: AxisChatTurn[]
}

/**
 * La conversación reciente, lista para salir: sin el nombre del usuario (que
 * nunca viaja), recortada, y sin el propio mensaje si ya estaba apuntado.
 */
export function chatHistory(recent: readonly AxisChatTurn[], question: string, name: string | null): AxisChatTurn[] {
  const turns = [...recent]
  const last = turns[turns.length - 1]
  if (last?.role === 'user' && last.text.trim() === question.trim()) turns.pop()
  return turns.slice(-CHAT_HISTORY_TURNS).map(({ role, text }) => ({
    role,
    text: (name ? text.split(name).join('{nombre}') : text).slice(0, CHAT_HISTORY_CHARACTERS),
  }))
}

/** Lo que viaja a la ruta: pedir una redacción o, sin briefing, reescribir un mensaje (D-028). */
export type AxisAiTransportRequest = AxisAiRequest | AxisAiReinterpretRequest

/** Lo único que el modelo puede sugerir. Sigue teniendo que pasar por el dominio. */
export type AxisAiAction = {
  type: 'change_training'
  target: AxisActionTarget
}

export type AxisAiResponse = {
  text: string
  action?: AxisAiAction | null
}

// ---------------------------------------------------------------------------
// Cuándo vale la pena llamar al modelo
// ---------------------------------------------------------------------------

/**
 * Preguntas que redacta el modelo.
 *
 * Las explicaciones —por qué hoy no tocan piernas, qué pasa con un cambio— y,
 * desde D-027, las respuestas de datos: recuperación, semana, carga y último
 * entrenamiento. Las cifras siguen saliendo del dominio y la puerta de
 * seguridad comprueba que el texto no invente ninguna ni se deje ninguna.
 *
 * Se quedan en el determinista lo médico, lo que queda fuera de AXTHLETICS, el
 * test de evolución y el escáner (nada de ellos sale del dispositivo), y lo que
 * es una decisión o una pregunta sin respuesta clara.
 */
export const AI_WORTHY_INTENTS: readonly AxisIntent[] = [
  ...DATA_ANSWER_INTENTS,
  'why',
  'why_not',
  'factors',
  'change',
  'tired',
  'can_train',
  'sport_impact',
  'goals',
  'exercise',
  // La charla (D-042): un saludo de plantilla es justo lo que suena a máquina.
  'social',
]

export function benefitsFromAi(intent: AxisIntent): boolean {
  return AI_WORTHY_INTENTS.includes(intent)
}

// ---------------------------------------------------------------------------
// Leer lo que devuelve el proveedor
// ---------------------------------------------------------------------------

/**
 * Convierte la respuesta del endpoint en algo tipado, o falla.
 *
 * Todo lo que llega de fuera es sospechoso hasta que se comprueba. Si no encaja,
 * se lanza: quien llama cae al determinista en lugar de enseñar basura.
 */
export function parseAiResponse(payload: unknown): AxisAiResponse {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('El servicio de AXIS devolvió una respuesta que no se entiende.')
  }

  const raw = payload as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (text.length === 0) {
    throw new Error('El servicio de AXIS devolvió una respuesta vacía.')
  }

  return { text, action: parseAiAction(raw.action) }
}

/** Una acción mal formada no se intenta arreglar: se descarta. */
export function parseAiAction(value: unknown): AxisAiAction | null {
  if (typeof value !== 'object' || value === null) return null

  const raw = value as Record<string, unknown>
  if (raw.type !== 'change_training') return null

  const target = raw.target
  if (typeof target !== 'object' || target === null) return null

  const { type, focus } = target as Record<string, unknown>
  if (typeof type !== 'string') return null
  if (focus !== null && typeof focus !== 'string') return null

  return {
    type: 'change_training',
    target: { type, focus } as AxisActionTarget,
  }
}

export type TargetReconciliation = {
  /** Lo que se va a proponer al usuario. Siempre sale del dominio. */
  target: AxisActionTarget | null
  /** `true` si el modelo sugirió algo que el dominio no había aprobado. */
  modelDisagreed: boolean
}

/**
 * El dominio manda, y el desacuerdo se nota.
 *
 * El destino que acaba en el botón es **siempre** el que aprobó el motor. Si el
 * modelo sugiere otro, no se corrige ni se mezcla: se descarta y se deja
 * constancia. Un modelo que propone cambios que el dominio no respalda es un
 * problema que hay que poder ver, no algo que tapar.
 */
export function reconcileTarget(
  fromModel: AxisAiAction | null | undefined,
  fromDomain: AxisActionTarget | null,
): TargetReconciliation {
  if (!fromModel) return { target: fromDomain, modelDisagreed: false }

  if (!fromDomain) {
    // El modelo propone un cambio que el motor no ha aprobado. No hay botón.
    return { target: null, modelDisagreed: true }
  }

  const matches =
    fromModel.target.type === fromDomain.type && fromModel.target.focus === fromDomain.focus

  return { target: fromDomain, modelDisagreed: !matches }
}

// ---------------------------------------------------------------------------
// Rechazar lo que el modelo devuelve
// ---------------------------------------------------------------------------

export type AiRejectionReason =
  | ModelTextRejection
  | 'model_disagreed'
  | 'transport_error'
  /** La reescritura de un mensaje no entendido no vale: larga, rara o con una cifra nueva (D-028). */
  | 'invalid_reinterpretation'

/**
 * El modelo ha respondido, pero lo que ha dicho no se puede enseñar.
 *
 * Es un error a propósito: quien llama ya cae al determinista ante cualquier
 * fallo del proveedor, y esto es un fallo más, solo que con motivo conocido.
 */
export class AxisAiRejection extends Error {
  readonly reason: AiRejectionReason
  /** `true` si el modelo propuso un destino que el dominio no había aprobado. */
  readonly modelDisagreed: boolean

  constructor(reason: AiRejectionReason, detail: string, modelDisagreed = false) {
    super(detail)
    this.name = 'AxisAiRejection'
    this.reason = reason
    this.modelDisagreed = modelDisagreed
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

/**
 * Transporte hacia el endpoint propio.
 *
 * Se inyecta para poder probar el motor sin red y para que cambiar de proveedor
 * sea cambiar la función del servidor, no el dominio.
 */
export type AxisAiTransport = {
  /** `false` mientras no haya endpoint configurado. */
  isConfigured(): boolean
  send(request: AxisAiTransportRequest, signal?: AbortSignal): Promise<AxisAiResponse>
}

/** Cuánto se espera al modelo antes de responder con el determinista. */
export const AI_TIMEOUT_MS = 8000

/**
 * Transporte real contra un endpoint propio del mismo origen.
 *
 * Con `endpoint` a `null` se declara no configurado y la aplicación usa el motor
 * determinista. No hay ninguna URL por defecto ni ninguna credencial.
 */
export function createHttpTransport(endpoint: string | null): AxisAiTransport {
  return {
    isConfigured() {
      return typeof endpoint === 'string' && endpoint.length > 0
    },
    async send(request, signal) {
      if (!endpoint) {
        throw new Error('No hay endpoint de IA configurado.')
      }

      // El propio transporte se pone un límite: una llamada colgada no puede
      // dejar la conversación esperando indefinidamente.
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), AI_TIMEOUT_MS)
      signal?.addEventListener('abort', () => timeout.abort(), { once: true })

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: timeout.signal,
        })

        if (!response.ok) {
          throw new Error(`El servicio de AXIS respondió ${response.status}.`)
        }

        return parseAiResponse(await response.json())
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/**
 * Motor conversacional con IA.
 *
 * `resolveDomain` es lo que el motor determinista responde a esa misma pregunta.
 * Se le pasa por parámetro para que este módulo no dependa del determinista y
 * siga siendo puro: aquí no se decide nada, solo se redacta.
 *
 * La respuesta que sale conserva **todos** los campos estructurados del dominio
 * —intención, petición de cambio, actividades canceladas, destino propuesto— y
 * solo cambia el texto. Es lo que impide que el modelo se convierta en una
 * segunda fuente de verdad.
 */
export function createAiConversation(
  transport: AxisAiTransport,
  resolveDomain: (
    question: string,
    briefing: AxisBriefing,
    memory?: Parameters<AxisConversationEngine['answer']>[2],
  ) => AxisAnswer,
): AxisConversationEngine {
  return {
    id: AI_CONVERSATION_ID,
    async isAvailable() {
      return transport.isConfigured()
    },
    async answer(question, briefing, memory): Promise<AxisAnswer> {
      const domain = resolveDomain(question, briefing, memory)
      const sentBriefing = toAiBriefing(briefing)

      const chat = domain.intent === 'social'
      const name = briefing.profile?.name?.trim() || null
      const response = await transport.send({
        system: chat ? chatSystemPrompt() : aiSystemPrompt(domain.intent),
        question,
        briefing: sentBriefing,
        domain: {
          // En la charla no se manda la respuesta del motor, que el modelo tiende a copiar: solo lo que no puede faltar.
          text: chat ? (domain.text.includes(CHANGE_INVITATION) ? CHANGE_INVITATION : '') : domain.text,
          intent: domain.intent,
          proposedTarget: domain.proposedTarget ?? null,
        },
        ...(chat ? { history: chatHistory(memory?.recent ?? [], question, name) } : {}),
      })

      /*
       * Dos puertas, y las dos son del dominio.
       *
       * La acción: `reconcileTarget` es la autoridad. Si el modelo propone un
       * destino que el motor no aprobó, no se corrige ni se mezcla: se rechaza
       * la respuesta entera y contesta el determinista, dejando constancia de
       * que el modelo discrepó.
       *
       * El texto: `checkModelText` comprueba que la redacción no contradiga el
       * veredicto ni la propuesta, que no dé cifras que no estén en lo que el
       * modelo recibió, y que respete la personalidad. Lo que no pasa no se
       * enseña.
       */
      const reconciliation = reconcileTarget(response.action, domain.proposedTarget ?? null)
      if (reconciliation.modelDisagreed) {
        throw new AxisAiRejection(
          'model_disagreed',
          'El modelo propuso un cambio que el dominio no había aprobado.',
          true,
        )
      }

      // El nombre, como en una conversación real: no en dos respuestas seguidas.
      const lastAxis = [...(memory?.recent ?? [])].reverse().find((turn) => turn.role === 'axis')
      const useName = !(name && lastAxis?.text.includes(name))
      const tidied = chat ? tidyChatText(response.text, useName ? name : null) : response.text.trim()
      // Con «Cambiar entrenamiento» abierto, la invitación no se pierde aunque el modelo la olvide.
      const invite = chat && domain.text.includes(CHANGE_INVITATION) && !/cambi/i.test(tidied)
      const text = invite ? `${tidied} ${CHANGE_INVITATION}` : tidied
      // En la charla, lo que el usuario ha dicho también respalda lo que se le contesta: «estás aburrido» lo dijo él.
      const said = chat ? [question, ...(memory?.recent ?? []).filter((turn) => turn.role === 'user').map((turn) => turn.text)].join(' ') : ''
      const check = checkModelText(text, chat ? { ...domain, text: `${domain.text} ${said}` } : domain, { briefing: sentBriefing })
      if (!check.ok) {
        throw new AxisAiRejection(check.reason, check.detail)
      }

      return { ...domain, text, proposedTarget: reconciliation.target }
    },
  }
}
