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
  markProposalChanged,
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

const engine = createDeterministicAxisEngine()

/**
 * Conversación de AXIS.
 *
 * Sin endpoint configurado responde el motor determinista, que es el estado actual
 * del proyecto: no hay proveedor de IA. El día que exista, se pasa aquí su URL.
 */
const conversation = createAxisConversation({ aiEndpoint: null })

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

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null)
  const [lastCompleted, setLastCompleted] = useState<WorkoutSession | null>(null)

  // La conversación vive durante la sesión de uso, sin persistencia todavía.
  const [axisMessages, setAxisMessages] = useState<AxisMessage[]>([])
  const [axisStatus, setAxisStatus] = useState<AxisChatStatus>('idle')
  const [axisError, setAxisError] = useState<string | null>(null)
  const [axisUsedFallback, setAxisUsedFallback] = useState(false)
  /** La conversación está acotada a cambiar el entrenamiento de hoy. */
  const [axisChangeMode, setAxisChangeMode] = useState(false)

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
        const [storedProfile, storedActivities, storedRecovery, storedSessions] =
          await Promise.all([
            repositories.profile.get(),
            repositories.activities.list(),
            repositories.recovery.getByDay(dayKey),
            repositories.workouts.list(SESSION_HISTORY_LIMIT),
          ])

        if (cancelled) return

        setToday(dayKey)
        setProfile(storedProfile)
        setActivities(storedActivities)
        setRecoveryInputs(storedRecovery ?? emptyRecoveryInputs(dayKey, nowIso()))
        setSessions(storedSessions)
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

  const decision = useMemo(() => {
    if (status !== 'ready') return null
    const context = buildAxisContext({
      profile,
      recoveryInputs,
      recoveryScore,
      recentSessions: sessions,
      activities,
    })
    return engine.decide(context)
  }, [status, profile, recoveryInputs, recoveryScore, sessions, activities])

  const proposal = useMemo(() => {
    if (!decision) return null
    const all = [decision.primary, ...decision.alternatives]
    return all.find((item) => item.id === selectedProposalId) ?? decision.primary
  }, [decision, selectedProposalId])

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
    if (status !== 'ready' || !decision) return null
    const context = buildAxisContext({
      profile,
      recoveryInputs,
      recoveryScore,
      recentSessions: sessions,
      activities,
    })
    return buildBriefing(context, decision, sessions, proposal)
  }, [status, decision, proposal, profile, recoveryInputs, recoveryScore, sessions, activities])

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

  const beginWorkout = useCallback(() => {
    if (!proposal || !decision) return
    const started = startWorkoutFrom(proposal)
    if (!started) return

    const changed = proposal.id !== decision.primary.id
    setActiveWorkout(changed ? markProposalChanged(started, decision.primary.headline) : started)
  }, [proposal, decision])

  const adjustWeight = useCallback((delta: number) => {
    setActiveWorkout((current) => (current ? adjustWeightIn(current, delta) : current))
  }, [])

  const adjustReps = useCallback((delta: number) => {
    setActiveWorkout((current) => (current ? adjustRepsIn(current, delta) : current))
  }, [])

  const completeSet = useCallback(() => {
    setActiveWorkout((current) => (current ? completeSetIn(current) : current))
  }, [])

  const skipExercise = useCallback(() => {
    setActiveWorkout((current) => (current ? skipExerciseIn(current) : current))
  }, [])

  const saveSession = useCallback(async (session: WorkoutSession) => {
    setSessions((current) =>
      [session, ...current.filter((item) => item.id !== session.id)].sort((a, b) =>
        b.dayKey.localeCompare(a.dayKey),
      ),
    )
    try {
      await getRepositories().workouts.save(session)
    } catch {
      setError('No se pudo guardar el entrenamiento en este dispositivo.')
    }
  }, [])

  const finishWorkout = useCallback(
    async (perceivedEffort: number | null) => {
      if (!activeWorkout) return
      const session = toWorkoutSession(activeWorkout, { status: 'completed', perceivedEffort })
      setLastCompleted(session)
      setActiveWorkout(null)
      setSelectedProposalId(null)
      await saveSession(session)
    },
    [activeWorkout, saveSession],
  )

  const abandonWorkout = useCallback(async () => {
    if (!activeWorkout) return
    const hasProgress = activeWorkout.entries.some((entry) => entry.sets.length > 0)
    setActiveWorkout(null)
    // Una sesión sin ninguna serie no ensucia el historial: no se guarda.
    if (hasProgress) {
      await saveSession(toWorkoutSession(activeWorkout, { status: 'abandoned' }))
    }
  }, [activeWorkout, saveSession])

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
        setAxisMessages((current) => [
          ...current,
          {
            id: createId(),
            role: 'axis',
            text: result.text,
            createdAt: nowIso(),
            intent: result.intent,
            unknown: result.unknown,
          },
        ])

        // Cuando AXIS acepta un cambio, la sesión del día cambia de verdad. Si se
        // ha negado, `applyProposalId` viene vacío y no se toca nada.
        if (result.applyProposalId) {
          setSelectedProposalId(result.applyProposalId)
        }

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
    [briefing, axisChangeMode],
  )

  const clearAxisConversation = useCallback(() => {
    lastIntentRef.current = null
    setAxisMessages([])
    setAxisStatus('idle')
    setAxisError(null)
    setAxisUsedFallback(false)
    setAxisChangeMode(false)
  }, [])

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
    setSelectedProposalId(null)
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
