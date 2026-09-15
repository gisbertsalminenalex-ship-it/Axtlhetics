'use client'

/**
 * Estado de aplicación de Axtlhetics.
 *
 * Es la única capa que habla a la vez con los repositorios y con el dominio. Los
 * componentes leen datos ya calculados y disparan acciones; no conocen IndexedDB ni
 * las reglas de AXIS.
 *
 *   UI → estado de aplicación → repositorios → IndexedDB
 *                ↓
 *             dominio (Recovery Score, AXIS)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { getRepositories } from '../data'
import { deleteDatabase } from '../data/indexeddb/db'
import {
  buildChangeTrainingAction,
  overrideFrom,
  resolveOverride,
  validateAction,
  type AxisActionProposal,
  type AxisActionStatus,
  type AxisActionTarget,
  type DayPlanOverride,
} from '../domain/axis/actions'
import { buildAxisContext } from '../domain/axis/context'
import { createDeterministicAxisEngine } from '../domain/axis/engine'
import type { AxisDecision, AxisProposal } from '../domain/axis/types'
import { computeHistoryStats, weeklyActivityFor, type HistoryRange, type HistoryStats } from '../domain/history/stats'
import type { ScheduledActivity, UserProfile, UserProfileDraft } from '../domain/profile/types'
import { PRIMARY_PROFILE_ID } from '../domain/profile/types'
import { computeRecoveryScore } from '../domain/recovery/score'
import type { RecoveryInputs, RecoveryScore } from '../domain/recovery/types'
import { emptyRecoveryInputs, HYDRATION_GLASS_COUNT } from '../domain/recovery/types'
import { todayKey, type DayKey } from '../domain/shared/dates'
import { clamp, createId, nowIso } from '../domain/shared/ids'
import type { ActiveWorkout } from '../domain/workouts/active-workout'
import {
  adjustReps as adjustRepsIn,
  adjustWeight as adjustWeightIn,
  completeSet as completeSetIn,
  hasProgress,
  markProposalChanged,
  reconcileStoredWorkout,
  skipExercise as skipExerciseIn,
  startWorkout as startWorkoutFrom,
  toWorkoutSession,
} from '../domain/workouts/active-workout'
import { buildBriefing, type AxisBriefing } from '../domain/axis/briefing'
import { createAxisConversation, suggestionsFor } from '../domain/axis/conversation'
import { changeOpeningMessage } from '../domain/axis/conversation/negotiation'
import type { AxisIntent, AxisMessage, AxisSuggestion } from '../domain/axis/conversation'
import { computeTrainingLoad, type TrainingLoad } from '../domain/workouts/load'
import type { WorkoutSession } from '../domain/workouts/types'

/** Cuántas sesiones carga la aplicación. Suficiente para historial y para AXIS. */
const SESSION_HISTORY_LIMIT = 200

/** Inserta o reemplaza una sesión manteniendo el orden del historial. */
function withSession(list: WorkoutSession[], session: WorkoutSession): WorkoutSession[] {
  return [session, ...list.filter((item) => item.id !== session.id)].sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey),
  )
}

const engine = createDeterministicAxisEngine()

/**
 * Endpoint propio que habla con el proveedor de IA.
 *
 * Es una función de Netlify del mismo origen. El navegador nunca llama al
 * proveedor ni conoce la credencial: si la función no existe (servidor estático
 * local) o falla, responde el motor determinista y no se nota más que en el aviso
 * de la interfaz.
 */
const AXIS_AI_ENDPOINT = '/.netlify/functions/axis-ai'

/**
 * Conversación de AXIS.
 *
 * El determinista decide siempre; el modelo, cuando está disponible, redacta.
 */
const conversation = createAxisConversation({ aiEndpoint: AXIS_AI_ENDPOINT })

export type AxisChatStatus = 'idle' | 'thinking' | 'error'

export type AppStatus = 'loading' | 'onboarding' | 'ready'

export type ActivityDraft = Omit<ScheduledActivity, 'id' | 'createdAt' | 'updatedAt'>

type AxtlheticsStore = {
  status: AppStatus
  /** Mensaje de error de carga o guardado. `null` si todo va bien. */
  error: string | null
  today: DayKey

  profile: UserProfile | null
  activities: ScheduledActivity[]
  recoveryInputs: RecoveryInputs
  recoveryScore: RecoveryScore
  sessions: WorkoutSession[]
  /** Carga de entrenamiento reciente, 0-100, o el motivo por el que no se calcula. */
  trainingLoad: TrainingLoad

  decision: AxisDecision | null
  /** Propuesta seleccionada. Es la principal salvo que el usuario la haya cambiado. */
  proposal: AxisProposal | null
  hasAlternatives: boolean

  activeWorkout: ActiveWorkout | null
  /** Última sesión guardada, para la pantalla de resumen. */
  lastCompleted: WorkoutSession | null

  weeklyActivity: { completedDays: boolean[]; todayIndex: number }
  historyStats(range: HistoryRange): HistoryStats

  saveProfile(draft: UserProfileDraft): Promise<void>
  addActivity(draft: ActivityDraft): Promise<void>
  removeActivity(id: string): Promise<void>

  updateRecovery(patch: Partial<Omit<RecoveryInputs, 'dayKey' | 'updatedAt'>>): Promise<void>
  toggleHydrationGlass(index: number): Promise<void>

  /**
   * Abre la conversación con AXIS acotada a cambiar el entrenamiento de hoy.
   *
   * No rota alternativas: AXIS pide el motivo y decide con los datos.
   */
  openChangeConversation(): void
  /** Borra todos los datos del dispositivo y vuelve al primer arranque. */
  clearAllData(): Promise<void>

  /** Briefing tipado que alimenta la conversación. Es null hasta que hay decisión. */
  briefing: AxisBriefing | null
  axisMessages: AxisMessage[]
  axisStatus: AxisChatStatus
  axisError: string | null
  /** true si la última respuesta la dio el determinista tras fallar la IA. */
  axisUsedFallback: boolean
  axisSuggestions: AxisSuggestion[]
  askAxis(question: string): Promise<void>
  clearAxisConversation(): void

  /** Estado de cada propuesta de acción: pendiente, aplicada, cancelada o error. */
  axisActionStatuses: Record<string, AxisActionStatus>
  /**
   * Aplica una propuesta de acción. Es el ÚNICO camino por el que la
   * conversación cambia el estado real, y solo se llama desde su botón.
   */
  confirmAxisAction(action: AxisActionProposal): Promise<void>
  cancelAxisAction(action: AxisActionProposal): void

  beginWorkout(): void
  adjustWeight(delta: number): void
  adjustReps(delta: number): void
  completeSet(): void
  skipExercise(): void
  finishWorkout(perceivedEffort: number | null): Promise<void>
  abandonWorkout(): Promise<void>
  /** Registra cómo se sintió el usuario sobre la sesión recién guardada. */
  rateLastSession(perceivedEffort: number): Promise<void>
  dismissSummary(): void
}

const StoreContext = createContext<AxtlheticsStore | null>(null)

export function AxtlheticsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState<DayKey>('1970-01-01')

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activities, setActivities] = useState<ScheduledActivity[]>([])
  const [recoveryInputs, setRecoveryInputs] = useState<RecoveryInputs>(() =>
    emptyRecoveryInputs('1970-01-01', nowIso()),
  )
  const [sessions, setSessions] = useState<WorkoutSession[]>([])

  /**
   * La elección de hoy, ya confirmada por el usuario y persistida.
   *
   * Antes esto era el id de una propuesta, que se regenera en cada decisión y no
   * sobrevivía a una recarga. Ahora se guarda **qué opción** eligió, que sí es
   * estable: al recargar, el motor vuelve a decidir y se selecciona la
   * equivalente. Si esa opción ya no existe con los datos de ahora, no se aplica
   * nada y manda la recomendación fresca.
   */
  const [dayOverride, setDayOverride] = useState<DayPlanOverride | null>(null)

  /** Estado de cada propuesta de acción de la conversación. */
  const [actionStatuses, setActionStatuses] = useState<Record<string, AxisActionStatus>>({})
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null)
  const [lastCompleted, setLastCompleted] = useState<WorkoutSession | null>(null)

  /**
   * La sesión en curso, de forma síncrona.
   *
   * Es la fuente de verdad para encadenar cambios: cada acción parte de aquí, no
   * del valor que hubiera en el closure. Sin esto, dos toques seguidos al selector
   * de carga antes de que React vuelva a renderizar perderían el primero, y lo que
   * se guardara en disco no sería lo que se ve en pantalla.
   */
  const workoutRef = useRef<ActiveWorkout | null>(null)

  // La conversación vive durante la sesión de uso, sin persistencia todavía.
  const [axisMessages, setAxisMessages] = useState<AxisMessage[]>([])
  const [axisStatus, setAxisStatus] = useState<AxisChatStatus>('idle')
  const [axisError, setAxisError] = useState<string | null>(null)
  const [axisUsedFallback, setAxisUsedFallback] = useState(false)
  /** La conversación está acotada a cambiar el entrenamiento de hoy. */
  const [axisChangeMode, setAxisChangeMode] = useState(false)

  /**
   * Actividades del calendario que hoy no ocurren, según acaba de contar el
   * usuario.
   *
   * El calendario dice lo que suele pasar, no lo que pasa. Si el partido se cae,
   * AXIS tiene que decidir otra vez sin él: seguir reservando piernas para algo
   * que no va a ocurrir sería decidir con datos falsos. Vive en memoria y se
   * pierde al recargar, igual que la propia conversación.
   */
  const [cancelledToday, setCancelledToday] = useState<string[]>([])

  /** Día con el que se cargaron los datos. Permite detectar que ha cambiado la fecha. */
  const loadedDayRef = useRef<DayKey>('1970-01-01')

  /** Última intención respondida, para entender preguntas de seguimiento. */
  const lastIntentRef = useRef<AxisIntent | null>(null)

  /** Última petición de cambio juzgada, para no ceder ante la insistencia. */
  const lastChangeRequestRef = useRef<{ kind: string; focus: string | null } | null>(null)

  // -------------------------------------------------------------------------
  // Carga inicial
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function load() {
      const dayKey = todayKey()
      loadedDayRef.current = dayKey
      try {
        const repositories = getRepositories()
        const [
          storedProfile,
          storedActivities,
          storedRecovery,
          storedSessions,
          storedPlan,
          storedConversation,
          storedWorkout,
        ] = await Promise.all([
          repositories.profile.get(),
          repositories.activities.list(),
          repositories.recovery.getByDay(dayKey),
          repositories.workouts.list(SESSION_HISTORY_LIMIT),
          repositories.dayPlan.getByDay(dayKey),
          repositories.conversation.getByDay(dayKey),
          repositories.activeWorkout.get(),
        ])

        if (cancelled) return

        /*
         * La sesión que quedó a medias al cerrar la aplicación.
         *
         * Solo se mira en un arranque en frío: si hay una sesión viva en memoria
         * —la app se recarga al cambiar el día mientras se entrena— manda esa y
         * lo guardado es su propio reflejo. Lo que se decide con lo guardado vive
         * en el dominio; aquí solo se aplica.
         */
        let sessionsToShow = storedSessions
        if (!workoutRef.current && storedWorkout) {
          const outcome = reconcileStoredWorkout(storedWorkout.workout, {
            today: dayKey,
            savedAt: storedWorkout.updatedAt,
          })
          if (outcome.kind === 'resume') {
            workoutRef.current = outcome.workout
            setActiveWorkout(outcome.workout)
          } else if (outcome.kind === 'archive') {
            // Al historial como abandonada, y solo entonces se suelta la fila: si
            // guardar falla, el registro sigue ahí y se reintenta al arrancar.
            sessionsToShow = withSession(storedSessions, outcome.session)
            void repositories.workouts
              .save(outcome.session)
              .then(() => repositories.activeWorkout.clear())
              .catch(() => {})
          } else {
            void repositories.activeWorkout.clear().catch(() => {})
          }
        }

        setToday(dayKey)
        setProfile(storedProfile)
        setActivities(storedActivities)
        setRecoveryInputs(storedRecovery ?? emptyRecoveryInputs(dayKey, nowIso()))
        setSessions(sessionsToShow)
        /*
         * Lo que el usuario decidió hoy y no se deduce de sus datos: la sesión
         * que eligió y lo que dijo que hoy no ocurre. Ambas cosas sobreviven a
         * una recarga; antes se perdían y AXIS volvía a contar con el partido
         * que ya le habían dicho que se había cancelado.
         */
        setDayOverride(storedPlan?.override ?? null)
        setCancelledToday(storedPlan?.cancelledActivities ?? [])

        // Y el hilo de la conversación, con el estado de sus propuestas.
        setAxisMessages(storedConversation?.messages ?? [])
        setActionStatuses(
          (storedConversation?.actionStatuses as Record<string, AxisActionStatus>) ?? {},
        )
        setStatus(storedProfile ? 'ready' : 'onboarding')
      } catch (cause) {
        if (cancelled) return
        // Sin almacenamiento la aplicación sigue siendo usable, solo no recuerda.
        setToday(dayKey)
        setRecoveryInputs(emptyRecoveryInputs(dayKey, nowIso()))
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus datos.')
        setStatus('onboarding')
      }
    }

    void load()

    /**
     * La aplicación puede quedarse abierta de un día para otro. Sin esto, al volver
     * por la mañana seguiría mostrando la recuperación de ayer y AXIS decidiría con
     * la fecha equivocada. Al recuperar el foco se comprueba si ha cambiado el día y,
     * solo entonces, se recarga.
     */
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (todayKey() === loadedDayRef.current) return
      void load()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Dominio derivado
  // -------------------------------------------------------------------------

  const recoveryScore = useMemo(
    () => computeRecoveryScore(recoveryInputs, { age: profile?.age }),
    [recoveryInputs, profile?.age],
  )

  /**
   * El contexto de AXIS, construido una sola vez.
   *
   * La decisión, el briefing y la validación de las acciones parten de aquí. Si
   * se construyera por separado en cada sitio, dos de ellos podrían acabar
   * mirando estados distintos del mismo día.
   */
  const axisContext = useMemo(() => {
    if (status !== 'ready') return null
    return buildAxisContext({
      profile,
      recoveryInputs,
      recoveryScore,
      recentSessions: sessions,
      activities,
      cancelledToday,
    })
  }, [status, profile, recoveryInputs, recoveryScore, sessions, activities, cancelledToday])

  const decision = useMemo(
    () => (axisContext ? engine.decide(axisContext) : null),
    [axisContext],
  )

  const proposal = useMemo(
    () => resolveOverride(dayOverride, decision, today) ?? decision?.primary ?? null,
    [dayOverride, decision, today],
  )

  const trainingLoad = useMemo(
    () => computeTrainingLoad(sessions, today),
    [sessions, today],
  )

  /**
   * Briefing para la conversación.
   *
   * Se construye del mismo contexto y la misma decisión que alimentan Inicio, así
   * que AXIS conversacional no puede contradecir a AXIS de la pantalla principal.
   */
  const briefing = useMemo(() => {
    if (!axisContext || !decision) return null
    return buildBriefing(axisContext, decision, sessions, proposal, dayOverride)
  }, [axisContext, decision, proposal, sessions, dayOverride])

  const axisSuggestions = useMemo(
    () => (briefing ? suggestionsFor(briefing) : []),
    [briefing],
  )

  const weeklyActivity = useMemo(
    () => weeklyActivityFor(sessions, today),
    [sessions, today],
  )

  const historyStats = useCallback(
    (range: HistoryRange) => computeHistoryStats(sessions, range, today),
    [sessions, today],
  )

  // -------------------------------------------------------------------------
  // Acciones de perfil y actividades
  // -------------------------------------------------------------------------

  const saveProfile = useCallback(
    async (draft: UserProfileDraft) => {
      const timestamp = nowIso()
      const next: UserProfile = {
        ...draft,
        id: PRIMARY_PROFILE_ID,
        createdAt: profile?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      setProfile(next)
      setStatus('ready')
      try {
        await getRepositories().profile.save(next)
      } catch {
        setError('No se pudo guardar tu perfil en este dispositivo.')
      }
    },
    [profile?.createdAt],
  )

  const addActivity = useCallback(async (draft: ActivityDraft) => {
    const timestamp = nowIso()
    const activity: ScheduledActivity = {
      ...draft,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setActivities((current) =>
      [...current, activity].sort((a, b) =>
        a.weekday === b.weekday
          ? (a.startMinute ?? 0) - (b.startMinute ?? 0)
          : a.weekday - b.weekday,
      ),
    )
    try {
      await getRepositories().activities.save(activity)
    } catch {
      setError('No se pudo guardar la actividad.')
    }
  }, [])

  const removeActivity = useCallback(async (id: string) => {
    setActivities((current) => current.filter((activity) => activity.id !== id))
    try {
      await getRepositories().activities.remove(id)
    } catch {
      setError('No se pudo borrar la actividad.')
    }
  }, [])

  // -------------------------------------------------------------------------
  // Acciones de recuperación
  // -------------------------------------------------------------------------

  /**
   * Aplica un cambio sobre la recuperación del día.
   *
   * El nuevo valor se calcula **dentro** del actualizador de estado, a partir del
   * valor vigente y no del que hubiera en el closure. Sin esto, dos toques seguidos
   * antes de que React vuelva a renderizar perderían el primero — algo perfectamente
   * posible llenando los ocho vasos deprisa.
   */
  const applyRecovery = useCallback(
    async (change: (current: RecoveryInputs) => RecoveryInputs) => {
      let next: RecoveryInputs | null = null
      setRecoveryInputs((current) => {
        next = change(current)
        return next
      })
      if (!next) return
      try {
        await getRepositories().recovery.save(next)
      } catch {
        setError('No se pudo guardar tu recuperación.')
      }
    },
    [],
  )

  const updateRecovery = useCallback(
    async (patch: Partial<Omit<RecoveryInputs, 'dayKey' | 'updatedAt'>>) => {
      await applyRecovery((current) => ({ ...current, ...patch, updatedAt: nowIso() }))
    },
    [applyRecovery],
  )

  /**
   * Tocar el vaso `n` deja llenos los `n + 1` primeros; tocar el último lleno los vacía
   * hasta ese punto. Es el comportamiento aprobado: vacío → lleno, lleno → vacío.
   */
  const toggleHydrationGlass = useCallback(
    async (index: number) => {
      const position = clamp(index, 0, HYDRATION_GLASS_COUNT - 1)
      await applyRecovery((current) => {
        const filled = current.hydrationGlasses ?? 0
        const next = filled === position + 1 ? position : position + 1
        return {
          ...current,
          hydrationGlasses: clamp(next, 0, HYDRATION_GLASS_COUNT),
          updatedAt: nowIso(),
        }
      })
    },
    [applyRecovery],
  )

  // -------------------------------------------------------------------------
  // Propuesta de AXIS
  // -------------------------------------------------------------------------

  /** «Cambiar entrenamiento»: rota entre las propuestas que ha generado AXIS. */
  /**
   * Abre la negociación del entrenamiento de hoy.
   *
   * Antes esto rotaba entre las alternativas, lo que convertía a AXIS en un
   * selector: el usuario iba pasando opciones hasta encontrar una que le gustara,
   * sin que nadie juzgara si tenía sentido. Ahora abre una conversación acotada a
   * ese cambio, donde AXIS pide el motivo y decide con los datos.
   */
  const openChangeConversation = useCallback(() => {
    if (!briefing) return
    setAxisChangeMode(true)
    lastIntentRef.current = 'change'
    lastChangeRequestRef.current = null
    setAxisError(null)
    setAxisStatus('idle')
    setAxisMessages([
      {
        id: createId(),
        role: 'axis',
        text: changeOpeningMessage(briefing),
        createdAt: nowIso(),
        intent: 'change',
      },
    ])
  }, [briefing])


  // -------------------------------------------------------------------------
  // Sesión en curso
  // -------------------------------------------------------------------------

  /**
   * Sustituye la sesión en curso y la escribe en el dispositivo.
   *
   * Cada cambio se guarda entero, en el momento: es lo que permite cerrar la
   * aplicación a media serie y seguir exactamente donde se estaba. Con `null` se
   * borra la fila. Las escrituras se encolan en el orden en que se piden, así que
   * la última siempre es la que queda.
   */
  const replaceActiveWorkout = useCallback((next: ActiveWorkout | null) => {
    workoutRef.current = next
    setActiveWorkout(next)

    const repository = getRepositories().activeWorkout
    const write = next ? repository.save({ workout: next, updatedAt: nowIso() }) : repository.clear()
    write.catch(() => {
      setError('No se pudo guardar el entrenamiento en curso en este dispositivo.')
    })
  }, [])

  const updateActiveWorkout = useCallback(
    (change: (current: ActiveWorkout) => ActiveWorkout) => {
      const current = workoutRef.current
      if (!current) return
      const next = change(current)
      if (next !== current) replaceActiveWorkout(next)
    },
    [replaceActiveWorkout],
  )

  const beginWorkout = useCallback(() => {
    // Ya hay una en marcha: se sigue con ella. Nunca dos sesiones a la vez.
    if (workoutRef.current) return
    if (!proposal || !decision) return
    const started = startWorkoutFrom(proposal)
    if (!started) return

    const changed = proposal.id !== decision.primary.id
    replaceActiveWorkout(
      changed ? markProposalChanged(started, decision.primary.headline) : started,
    )
  }, [proposal, decision, replaceActiveWorkout])

  const adjustWeight = useCallback(
    (delta: number) => updateActiveWorkout((current) => adjustWeightIn(current, delta)),
    [updateActiveWorkout],
  )

  const adjustReps = useCallback(
    (delta: number) => updateActiveWorkout((current) => adjustRepsIn(current, delta)),
    [updateActiveWorkout],
  )

  const completeSet = useCallback(
    () => updateActiveWorkout(completeSetIn),
    [updateActiveWorkout],
  )

  const skipExercise = useCallback(
    () => updateActiveWorkout(skipExerciseIn),
    [updateActiveWorkout],
  )

  const saveSession = useCallback(async (session: WorkoutSession) => {
    setSessions((current) => withSession(current, session))
    try {
      await getRepositories().workouts.save(session)
    } catch {
      setError('No se pudo guardar el entrenamiento en este dispositivo.')
    }
  }, [])

  const finishWorkout = useCallback(
    async (perceivedEffort: number | null) => {
      const workout = workoutRef.current
      if (!workout) return
      const session = toWorkoutSession(workout, { status: 'completed', perceivedEffort })
      setLastCompleted(session)
      // La fila de la sesión en curso se borra aquí. Si la app se cerrara justo
      // antes, al volver la sesión aparecería terminada y se cerraría sola con
      // el mismo id: no puede duplicarse en el historial.
      replaceActiveWorkout(null)
      // El día ya está entrenado: la elección deja de tener efecto y se retira
      // también del almacenamiento, no solo de la memoria.
      setDayOverride(null)
      void getRepositories().dayPlan.clear(session.dayKey).catch(() => {})
      await saveSession(session)
    },
    [replaceActiveWorkout, saveSession],
  )

  const abandonWorkout = useCallback(async () => {
    const workout = workoutRef.current
    if (!workout) return
    replaceActiveWorkout(null)
    // Una sesión sin ninguna serie no ensucia el historial: no se guarda.
    if (hasProgress(workout)) {
      await saveSession(toWorkoutSession(workout, { status: 'abandoned' }))
    }
  }, [replaceActiveWorkout, saveSession])

  const rateLastSession = useCallback(
    async (perceivedEffort: number) => {
      if (!lastCompleted) return
      const updated: WorkoutSession = { ...lastCompleted, perceivedEffort }
      setLastCompleted(updated)
      await saveSession(updated)
    },
    [lastCompleted, saveSession],
  )

  const dismissSummary = useCallback(() => {
    setLastCompleted(null)
  }, [])

  // -------------------------------------------------------------------------
  // Conversación con AXIS
  // -------------------------------------------------------------------------

  /**
   * Guarda el plan del día: la sesión elegida y lo que hoy no ocurre.
   *
   * Se escriben juntos porque son un solo registro. Cambiar una cosa no puede
   * borrar la otra, así que quien llame pasa siempre las dos.
   */
  const persistDayPlan = useCallback(
    async (next: { override: DayPlanOverride | null; cancelledActivities: string[] }) => {
      await getRepositories().dayPlan.save({
        dayKey: today,
        override: next.override,
        cancelledActivities: next.cancelledActivities,
      })
    },
    [today],
  )

  /**
   * Convierte lo que AXIS ha propuesto en una acción pendiente de confirmar.
   *
   * Devuelve `null` cuando AXIS no ha llegado a una propuesta concreta, cuando se
   * ha negado, o cuando la opción que propone no existe en la decisión vigente:
   * un botón que no lleva a ninguna parte es peor que no tener botón.
   */
  const buildPendingAction = useCallback(
    (result: { proposedTarget?: AxisActionTarget | null; proposedReason?: string }) => {
      if (!result.proposedTarget || !decision || !proposal || !axisContext) return null

      const all = [decision.primary, ...decision.alternatives]
      const target = all.find(
        (item) =>
          item.type === result.proposedTarget!.type &&
          (item.session?.focus ?? null) === result.proposedTarget!.focus,
      )
      if (!target || target.id === proposal.id) return null

      return buildChangeTrainingAction({
        context: axisContext,
        origin: proposal,
        target,
        reason: result.proposedReason ?? '',
      })
    },
    [decision, proposal, axisContext],
  )

  const askAxis = useCallback(
    async (question: string) => {
      const text = question.trim()
      if (text.length === 0 || !briefing) return

      const asked: AxisMessage = {
        id: createId(),
        role: 'user',
        text,
        createdAt: nowIso(),
      }

      setAxisMessages((current) => [...current, asked])
      setAxisStatus('thinking')
      setAxisError(null)

      try {
        const result = await conversation.ask(text, briefing, {
          lastIntent: lastIntentRef.current,
          changeMode: axisChangeMode,
          lastChangeRequest: lastChangeRequestRef.current,
        })
        lastIntentRef.current = result.intent
        if (result.changeRequest) lastChangeRequestRef.current = result.changeRequest

        // El usuario dice que hoy algo del calendario no ocurre. Se descarta y el
        // motor vuelve a decidir sin ello, así que la sesión, las alternativas y
        // la propia conversación se recalculan a la vez.
        if (result.cancelledActivities && result.cancelledActivities.length > 0) {
          const merged = [...new Set([...cancelledToday, ...result.cancelledActivities])]
          setCancelledToday(merged)
          // Se guarda para que al recargar AXIS no vuelva a contar con el
          // partido que el usuario ya le ha dicho que se ha cancelado.
          void persistDayPlan({ override: dayOverride, cancelledActivities: merged }).catch(
            () => {},
          )
        }
        setAxisMessages((current) => [
          ...current,
          {
            id: createId(),
            role: 'axis',
            text: result.text,
            createdAt: nowIso(),
            intent: result.intent,
            unknown: result.unknown,
            /*
             * La propuesta viaja con el mensaje, pendiente de confirmar. Aquí no
             * se cambia nada: el estado real solo se toca en `confirmAxisAction`,
             * cuando el usuario pulsa el botón. Que haya escrito «sí» en la
             * conversación no es una confirmación.
             */
            action: buildPendingAction(result),
          },
        ])

        setAxisUsedFallback(result.usedFallback)
        setAxisStatus('idle')
      } catch (cause) {
        // `conversation.ask` ya cae al determinista por su cuenta, así que llegar
        // aquí significa que ha fallado incluso eso. Se dice, no se disimula.
        setAxisError(
          cause instanceof Error ? cause.message : 'AXIS no ha podido responder.',
        )
        setAxisStatus('error')
      }
    },
    [briefing, axisChangeMode, cancelledToday, dayOverride, persistDayPlan],
  )

  /**
   * Aplica una propuesta de acción, y solo cuando el usuario pulsa el botón.
   *
   * Este es el único camino por el que la conversación puede cambiar el estado
   * real. Antes de llegar aquí no se ha tocado nada, por muchos «sí» que haya
   * habido en el chat.
   *
   * El orden importa: primero se valida contra la decisión **vigente**, no
   * contra la que había cuando AXIS lo propuso. Si el usuario ha registrado un
   * deporte o su recuperación mientras el botón estaba en pantalla, la opción se
   * vuelve a buscar con los datos de ahora; si ya no existe, se rechaza en lugar
   * de aplicar una sesión calculada con información vieja.
   */
  const confirmAxisAction = useCallback(
    async (action: AxisActionProposal) => {
      // Una acción ya aplicada no se aplica dos veces.
      if (actionStatuses[action.id]?.state === 'applied') return

      if (!decision || !axisContext) {
        setActionStatuses((current) => ({
          ...current,
          [action.id]: { state: 'error', message: 'Todavía no tengo tu día calculado.' },
        }))
        return
      }

      const validation = validateAction(action, decision, axisContext)
      if (!validation.ok) {
        setActionStatuses((current) => ({
          ...current,
          [action.id]: { state: 'error', message: validation.message },
        }))
        return
      }

      const override = overrideFrom(action, validation.target)

      try {
        await persistDayPlan({ override, cancelledActivities: cancelledToday })
      } catch (cause) {
        // Si no se ha podido guardar, no se finge que sí: el estado real no
        // cambia y el botón queda en error, listo para reintentar.
        setActionStatuses((current) => ({
          ...current,
          [action.id]: {
            state: 'error',
            message:
              cause instanceof Error ? cause.message : 'No he podido guardar el cambio.',
          },
        }))
        return
      }

      setDayOverride(override)
      setActionStatuses((current) => ({ ...current, [action.id]: { state: 'applied' } }))
    },
    [actionStatuses, decision, axisContext, cancelledToday, persistDayPlan],
  )

  /** El usuario descarta la propuesta. No se toca nada. */
  const cancelAxisAction = useCallback((action: AxisActionProposal) => {
    setActionStatuses((current) =>
      current[action.id]?.state === 'applied'
        ? current
        : { ...current, [action.id]: { state: 'cancelled' } },
    )
  }, [])

  /*
   * La conversación se guarda al cambiar.
   *
   * Vive en el dispositivo, como todo lo demás: no hay servidor ni historial de
   * conversaciones en ningún sitio. Solo sirve para que recargar no borre el
   * hilo ni deje una propuesta aplicada con aspecto de pendiente.
   *
   * El guardado no arranca hasta que la carga inicial ha terminado: si no, el
   * primer render con la lista vacía borraría lo que se acaba de leer.
   */
  useEffect(() => {
    if (status !== 'ready') return
    if (loadedDayRef.current !== today) return

    void getRepositories()
      .conversation.save({
        dayKey: today,
        messages: axisMessages,
        actionStatuses,
        updatedAt: nowIso(),
      })
      .catch(() => {
        // Perder el hilo no es motivo para molestar al usuario: la app sigue.
      })
  }, [status, today, axisMessages, actionStatuses])


  const clearAxisConversation = useCallback(() => {
    lastIntentRef.current = null
    setAxisMessages([])
    setAxisStatus('idle')
    setAxisError(null)
    setAxisUsedFallback(false)
    setAxisChangeMode(false)
    setActionStatuses({})
    void getRepositories().conversation.clear(today).catch(() => {})
  }, [today])

  /**
   * Borra todo y devuelve la app al primer arranque.
   *
   * No hay cuenta que cerrar: los datos viven solo en este dispositivo, así que
   * «cerrar sesión» aquí significa exactamente eso, borrarlos. Es irreversible y
   * no hay copia en ningún sitio, por lo que la interfaz pide confirmación antes
   * de llamar aquí.
   */
  const clearAllData = useCallback(async () => {
    try {
      await deleteDatabase()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron borrar los datos.')
      return
    }

    // Se vacía todo el estado en memoria, no solo la base: si no, la pantalla
    // seguiría mostrando los datos de quien acaba de borrarlos.
    const dayKey = todayKey()
    setProfile(null)
    setActivities([])
    setSessions([])
    setRecoveryInputs(emptyRecoveryInputs(dayKey, nowIso()))
    setDayOverride(null)
    setActionStatuses({})
    setCancelledToday([])
    // La base ya no existe: se vacía la memoria sin volver a escribir en ella.
    workoutRef.current = null
    setActiveWorkout(null)
    setLastCompleted(null)
    clearAxisConversation()
    setError(null)
    setStatus('onboarding')
  }, [clearAxisConversation])

  const value = useMemo<AxtlheticsStore>(
    () => ({
      status,
      error,
      today,
      profile,
      activities,
      recoveryInputs,
      recoveryScore,
      sessions,
      trainingLoad,
      decision,
      proposal,
      hasAlternatives: (decision?.alternatives.length ?? 0) > 0,
      activeWorkout,
      lastCompleted,
      weeklyActivity,
      historyStats,
      saveProfile,
      addActivity,
      removeActivity,
      updateRecovery,
      toggleHydrationGlass,
      openChangeConversation,
      clearAllData,
      briefing,
      axisMessages,
      axisStatus,
      axisError,
      axisUsedFallback,
      axisSuggestions,
      askAxis,
      clearAxisConversation,
      axisActionStatuses: actionStatuses,
      confirmAxisAction,
      cancelAxisAction,
      beginWorkout,
      adjustWeight,
      adjustReps,
      completeSet,
      skipExercise,
      finishWorkout,
      abandonWorkout,
      rateLastSession,
      dismissSummary,
    }),
    [
      status,
      error,
      today,
      profile,
      activities,
      recoveryInputs,
      recoveryScore,
      sessions,
      trainingLoad,
      decision,
      proposal,
      activeWorkout,
      lastCompleted,
      weeklyActivity,
      historyStats,
      saveProfile,
      addActivity,
      removeActivity,
      updateRecovery,
      toggleHydrationGlass,
      openChangeConversation,
      clearAllData,
      briefing,
      axisMessages,
      axisStatus,
      axisError,
      axisUsedFallback,
      axisSuggestions,
      askAxis,
      clearAxisConversation,
      actionStatuses,
      confirmAxisAction,
      cancelAxisAction,
      beginWorkout,
      adjustWeight,
      adjustReps,
      completeSet,
      skipExercise,
      finishWorkout,
      abandonWorkout,
      rateLastSession,
      dismissSummary,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useAxtlhetics(): AxtlheticsStore {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error('useAxtlhetics debe usarse dentro de <AxtlheticsProvider>.')
  }
  return store
}
