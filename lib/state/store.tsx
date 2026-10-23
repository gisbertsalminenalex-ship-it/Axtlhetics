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

import { getRepositories, STORAGE_SCHEMA_VERSION } from '../data'
import {
  backupFileName,
  buildBackup,
  type BackupContents,
} from '../domain/backup/backup'
import { deleteDatabase } from '../data/indexeddb/db'
import {
  applyAction,
  canUndoAction,
  dismissAction,
  executeAction,
  proposeAction,
  sanitizeActions,
  undoAction,
  type AxisDay,
  type AxisMemoryPort,
} from '../domain/axis/action-engine'
import {
  resolveOverride,
  type AxisActionProposal,
  type AxisActionStatus,
} from '../domain/axis/actions'
import { projectWeek, type WeekDayView } from '../domain/axis/week-view'
import { buildAxisContext, gearToday } from '../domain/axis/context'
import { loadsFor } from '../domain/workouts/equipment'
import { createDeterministicAxisEngine } from '../domain/axis/engine'
import type { AxisDecision, AxisProposal } from '../domain/axis/types'
import { computeHistoryStats, weeklyActivityFor, type HistoryRange, type HistoryStats } from '../domain/history/stats'
import {
  withActivityChanges,
  type ActivityChanges,
  type GoalTarget,
  type ScheduledActivity,
  type UserProfile,
  type UserProfileDraft,
} from '../domain/profile/types'
import { PRIMARY_PROFILE_ID } from '../domain/profile/types'
import { createHealthNoteReader, type HealthReading } from '../domain/profile/health-note'
import { computeRecoveryScore } from '../domain/recovery/score'
import type { RecoveryInputs, RecoveryScore } from '../domain/recovery/types'
import { emptyRecoveryInputs, HYDRATION_GLASS_COUNT } from '../domain/recovery/types'
import { addDays, todayKey, type DayKey } from '../domain/shared/dates'
import { clamp, createId, nowIso } from '../domain/shared/ids'
import type { ActiveWorkout } from '../domain/workouts/active-workout'
import {
  adjustReps as adjustRepsIn,
  adjustWeight as adjustWeightIn,
  cancelWork as cancelWorkIn,
  completeSet as completeSetIn,
  completeWork as completeWorkIn,
  extendRest as extendRestIn,
  hasProgress,
  markProposalChanged,
  reconcileStoredWorkout,
  setReserve as setReserveIn,
  skipExercise as skipExerciseIn,
  skipRest as skipRestIn,
  startWork as startWorkIn,
  startWorkout as startWorkoutFrom,
  toWorkoutSession,
  undoLastSet as undoLastSetIn,
} from '../domain/workouts/active-workout'
import { buildBriefing, type AxisBriefing } from '../domain/axis/briefing'
import {
  clearOverride,
  clearThread,
  closeChangeThread,
  conversationMemoryOf,
  emptyDayMemory,
  markActionError,
  movedFromDayBefore,
  openChangeThread,
  rememberAnswer,
  rememberQuestion,
  undoLastApplied,
  type AxisDayMemory,
} from '../domain/axis/memory'
import { createAxisConversation, fallbackNoticeOf, suggestionsFor } from '../domain/axis/conversation'
import { changeOpeningMessage } from '../domain/axis/conversation/negotiation'
import type { AxisFallbackNotice, AxisMessage, AxisSuggestion } from '../domain/axis/conversation'
import { computeTrainingLoad, type TrainingLoad } from '../domain/workouts/load'
import { bestSetOf } from '../domain/workouts/targets'
import { proactiveNote, type ProactiveNote } from '../domain/axis/proactive'
import { weeklyReview as reviewWeek, type WeeklyReview } from '../domain/axis/weekly-review'
import { withAdjustment, type NutritionGoal } from '../domain/nutrition/targets'
import {
  emptyMeasurement,
  sortMeasurements,
  withPerimeters,
  withProtein,
  withWeight,
  type BodyMeasurement,
  type PerimeterKey,
} from '../domain/body/measurements'
import { EXERCISE_CATALOG, findExercise } from '../domain/workouts/catalog'
import { useAssessments, type AssessmentsApi } from './use-assessment'
import { useScans, type ScansApi } from './use-scans'
import type { RepsInReserve, WorkoutSession } from '../domain/workouts/types'

/** Cuántas sesiones carga la aplicación. Suficiente para historial y para AXIS. */
const SESSION_HISTORY_LIMIT = 200

/** Cuántos días de recuperación se leen: los que mira AXIS (D-049) y los de la semana que se revisa (D-059). */
const RECENT_RECOVERY_DAYS = 14

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
 * Es un route handler de Next del mismo origen (`app/api/axis-ai`). El
 * navegador nunca llama al proveedor ni conoce la credencial: si la ruta falla
 * o no responde, contesta el motor determinista y no se nota más que en el
 * aviso de la interfaz.
 */
const AXIS_AI_ENDPOINT = '/api/axis-ai'

/**
 * Conversación de AXIS.
 *
 * El determinista decide siempre; el modelo, cuando está disponible, redacta.
 */
const conversation = createAxisConversation({ aiEndpoint: AXIS_AI_ENDPOINT })

/** La nota de salud (D-064): la lee el modelo por la misma ruta y, si falla, el dispositivo. */
const readHealthNote = createHealthNoteReader(AXIS_AI_ENDPOINT)

export type AxisChatStatus = 'idle' | 'thinking' | 'error'

export type AppStatus = 'loading' | 'onboarding' | 'ready'

export type ActivityDraft = Omit<ScheduledActivity, 'id' | 'createdAt' | 'updatedAt'>

/** Por día de la semana y hora de inicio, como las devuelve el repositorio. */
function sortActivities(activities: ScheduledActivity[]): ScheduledActivity[] {
  return activities.sort((a, b) =>
    a.weekday === b.weekday
      ? (a.startMinute ?? 0) - (b.startMinute ?? 0)
      : a.weekday - b.weekday,
  )
}

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
  /** La semana de lunes a domingo: lo hecho, hoy y lo previsto (D-048). */
  weekView: WeekDayView[]
  /** En un día fuerte, cambia a la misma sesión a intensidad normal (D-048). */
  chooseNormalVersion(): Promise<void>
  historyStats(range: HistoryRange): HistoryStats

  saveProfile(draft: UserProfileDraft): Promise<void>
  /** Lee lo que el usuario escribió sobre su salud (D-064). No guarda nada: lo aplica el formulario. */
  readHealthNote(note: string): Promise<HealthReading>
  /** Añade un objetivo medible (D-035). Su punto de partida es la mejor serie de hoy. */
  addTarget(draft: { exerciseId: string; target: number; deadline: DayKey }): Promise<void>
  removeTarget(id: string): Promise<void>
  /** Añade de una vez los objetivos que AXIS propone tras el primer test (D-040). */
  addTargets(drafts: readonly { exerciseId: string; target: number; deadline: DayKey; startValue: number }[]): Promise<void>
  /** Lo que AXIS dice sin que se lo pregunten (D-038), o `null` si no hay nada. */
  axisNote: ProactiveNote | null
  /** La revisión de la semana pasada (D-059), o `null` si no se entrenó. */
  weeklyReview: WeeklyReview | null
  /** Peso y medidas (D-060), del día más antiguo al más reciente. */
  measurements: BodyMeasurement[]
  /** Apunta el peso de hoy. */
  saveWeight(weightKg: number): Promise<void>
  /** Apunta los perímetros de hoy (en cm). */
  savePerimeters(perimeters: Partial<Record<PerimeterKey, number>>): Promise<void>
  /** Apunta si hoy llegó a su proteína (D-061). */
  saveProteinCheck(reached: boolean): Promise<void>
  /** Elige el objetivo de alimentación (D-061). Empieza sin ajustes. */
  setNutritionGoal(goal: NutritionGoal): Promise<void>
  /** Acepta el ajuste de calorías que propone AXIS (D-061). */
  applyNutritionAdjustment(deltaKcal: number): Promise<void>
  /** Apunta o quita un ejercicio que no gusta (D-037). */
  setExerciseDisliked(exerciseId: string, disliked: boolean): Promise<void>
  addActivity(draft: ActivityDraft): Promise<void>
  updateActivity(id: string, changes: ActivityChanges): Promise<void>
  removeActivity(id: string): Promise<void>

  updateRecovery(patch: Partial<Omit<RecoveryInputs, 'dayKey' | 'updatedAt'>>): Promise<void>
  toggleHydrationGlass(index: number): Promise<void>

  /**
   * Abre la conversación con AXIS acotada a cambiar el entrenamiento de hoy.
   *
   * No rota alternativas: AXIS pide el motivo y decide con los datos.
   */
  openChangeConversation(): void
  /** El usuario ha leído el aviso de error. Se retira hasta que vuelva a fallar algo. */
  dismissError(): void
  /**
   * Lee todo el dispositivo y lo devuelve como archivo listo para descargar.
   *
   * No toca el DOM: quien llama decide qué hacer con el texto. `null` si no se
   * ha podido leer el almacenamiento.
   */
  exportBackup(): Promise<{ fileName: string; json: string } | null>
  /**
   * Sustituye todo lo del dispositivo por el contenido de una copia.
   *
   * Es destructivo: lo que hubiera antes se pierde. Recibe el contenido ya
   * validado por el dominio, nunca un archivo en bruto.
   */
  importBackup(contents: BackupContents): Promise<boolean>
  /** Borra todos los datos del dispositivo y vuelve al primer arranque. */
  clearAllData(): Promise<void>

  /**
   * Los tests de evolución (D-021): lo cargado y cómo se guarda. De momento
   * nadie los muestra; los bloques siguientes los conectarán a AXIS y a la
   * interfaz. Nada del entrenamiento los lee.
   */
  assessments: AssessmentsApi
  /** Los escaneos corporales (D-023). Nada del entrenamiento los lee: solo AXIS, para explicarlos. */
  scans: ScansApi

  /** Briefing tipado que alimenta la conversación. Es null hasta que hay decisión. */
  briefing: AxisBriefing | null
  axisMessages: AxisMessage[]
  axisStatus: AxisChatStatus
  axisError: string | null
  /** Por qué la última respuesta la dio el determinista tras fallar la IA; `null` si no fue así. */
  axisFallback: AxisFallbackNotice | null
  axisSuggestions: AxisSuggestion[]
  askAxis(question: string): Promise<void>
  clearAxisConversation(): void
  /**
   * El usuario sale del chat. Si estaba negociando un cambio, la negociación
   * termina; el hilo y todo lo demás se conservan.
   */
  closeAxisChat(): void

  /** Estado de cada propuesta de acción: pendiente, aplicada, cancelada o error. */
  axisActionStatuses: Record<string, AxisActionStatus>
  /**
   * Aplica una propuesta de acción. Es el ÚNICO camino por el que la
   * conversación cambia el estado real, y solo se llama desde su botón.
   */
  confirmAxisAction(action: AxisActionProposal): Promise<void>
  cancelAxisAction(action: AxisActionProposal): void
  /**
   * `true` si esa acción es la última aplicada hoy y el entrenamiento de hoy no
   * ha empezado ni terminado (D-022).
   */
  canUndoAxisAction(actionId: string): boolean
  /** Deshace la última acción aplicada. Devuelve el motivo si no se pudo. */
  undoAxisAction(action: AxisActionProposal): Promise<string | null>
  /** El entrenamiento de hoy se movió a mañana (D-022). */
  movedToTomorrow: boolean

  beginWorkout(): void
  adjustWeight(delta: number): void
  adjustReps(delta: number): void
  completeSet(): void
  /** Deshace la última serie registrada (D-019). */
  undoLastSet(): void
  skipExercise(): void
  /** Termina el descanso ahora (D-019). */
  skipRest(): void
  /** Añade 15 s al descanso en curso (D-019). */
  extendRest(): void
  /** Cuántas quedaban en la última serie de ese ejercicio (D-052). */
  setReserve(exerciseIndex: number, reserve: RepsInReserve): void
  /** Arranca el cronómetro del ejercicio por tiempo actual (D-054). */
  startWork(): void
  /** Cierra el cronómetro y registra la serie con los segundos hechos (D-054). */
  finishWork(): void
  /** Para el cronómetro sin registrar nada (D-054). */
  cancelWork(): void
  finishWorkout(effort: number | null): Promise<void>
  abandonWorkout(): Promise<void>
  /** Registra cuánto costó la sesión recién guardada, 1–5 (D-019). */
  rateLastSession(effort: number): Promise<void>
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
  /** La recuperación de días anteriores: sin la de hoy, decide si el día es normal o ligero (D-049). */
  const [recentRecovery, setRecentRecovery] = useState<RecoveryInputs[]>([])
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [sessions, setSessions] = useState<WorkoutSession[]>([])

  /**
   * La memoria de AXIS para hoy: la elección confirmada, lo que el usuario ha
   * dicho que hoy no ocurre, lo que ha contado, el hilo con sus acciones y
   * dónde estaba la conversación. Un solo valor y un solo registro en disco.
   *
   * La elección se guarda como **qué opción** eligió (tipo y foco), que es
   * estable: al recargar, el motor vuelve a decidir y se selecciona la
   * equivalente. Si esa opción ya no existe con los datos de ahora, no se aplica
   * nada y manda la recomendación fresca.
   */
  const [memory, setMemoryState] = useState<AxisDayMemory>(() => emptyDayMemory('1970-01-01'))
  /** Los tests de evolución (D-021). Su propia capa: el store solo la expone. */
  const assessments = useAssessments()
  const resetAssessments = assessments.reset
  const scans = useScans()
  const resetScans = scans.reset
  /**
   * La memoria, de forma síncrona.
   *
   * Cada cambio parte de aquí y no del valor que hubiera en un closure: así el
   * ciclo de una acción recibe siempre la memoria más reciente, y dos cambios
   * seguidos no se pisan. Mismo patrón que `workoutRef`.
   */
  const memoryRef = useRef<AxisDayMemory>(memory)
  const commitMemory = useCallback((change: (current: AxisDayMemory) => AxisDayMemory) => {
    const next = change(memoryRef.current)
    if (next === memoryRef.current) return
    memoryRef.current = next
    setMemoryState(next)
  }, [])
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

  // Lo efímero de la conversación: cómo está ahora mismo, no qué se ha dicho.
  const [axisStatus, setAxisStatus] = useState<AxisChatStatus>('idle')
  const [axisError, setAxisError] = useState<string | null>(null)
  /** El entrenamiento de ayer se movió a hoy (D-022). Lo único que se lee de ayer. */
  const [movedFromYesterday, setMovedFromYesterday] = useState(false)
  /**
   * Lo que el usuario contó ayer (D-037): sus cargas siguen contando hoy al
   * negociar, y sus molestias permiten preguntar cómo van.
   */
  const [yesterdayMemory, setYesterdayMemory] = useState<AxisDayMemory | null>(null)
  const [axisFallback, setAxisFallback] = useState<AxisFallbackNotice | null>(null)

  /** Día con el que se cargaron los datos. Permite detectar que ha cambiado la fecha. */
  const loadedDayRef = useRef<DayKey>('1970-01-01')

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
          storedMemory,
          storedWorkout,
          storedYesterday,
          storedRecent,
          storedMeasurements,
        ] = await Promise.all([
          repositories.profile.get(),
          repositories.activities.list(),
          repositories.recovery.getByDay(dayKey),
          repositories.workouts.list(SESSION_HISTORY_LIMIT),
          repositories.axisMemory.getByDay(dayKey),
          repositories.activeWorkout.get(),
          // De ayer solo se mira si movió el entrenamiento a hoy (D-022, D-011).
          repositories.axisMemory.getByDay(addDays(dayKey, -1)),
          // Los últimos días registrados (D-049); AXIS mira ayer y anteayer.
          repositories.recovery.recent(RECENT_RECOVERY_DAYS),
          // Peso y medidas (D-060): pocos registros, se leen todos.
          repositories.measurements.list(),
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
        setRecentRecovery(storedRecent.filter((inputs) => inputs.dayKey < dayKey))
        setMeasurements(storedMeasurements)
        setSessions(sessionsToShow)
        /*
         * Lo que AXIS recuerda de hoy: la sesión elegida, lo que hoy no ocurre,
         * lo que el usuario contó, el hilo y dónde estaba la conversación. Si
         * no hay registro de hoy, el día empieza vacío: la memoria de ayer no
         * se aplica a las preguntas de hoy.
         */
        // Una acción guardada que no se entiende no puede tener botón.
        commitMemory(() =>
          storedMemory && storedMemory.dayKey === dayKey
            ? sanitizeActions(storedMemory)
            : emptyDayMemory(dayKey),
        )
        setMovedFromYesterday(movedFromDayBefore(storedYesterday, dayKey))
        setYesterdayMemory(storedYesterday && storedYesterday.dayKey === addDays(dayKey, -1) ? storedYesterday : null)
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
      cancelledToday: memory.cancelledActivities,
      availableMinutesToday: memory.availableMinutes ?? null,
      movedFromYesterday,
      withoutEquipmentToday: memory.withoutEquipment ?? false,
      recentRecovery,
      // Modelos del dominio, ya validados por el repositorio: AXIS no ve el almacén.
      assessments: assessments.assessments,
      scans: scans.scans,
    })
  }, [
    status,
    profile,
    recoveryInputs,
    recoveryScore,
    sessions,
    activities,
    memory.cancelledActivities,
    memory.availableMinutes,
    movedFromYesterday,
    memory.withoutEquipment,
    recentRecovery,
    assessments.assessments,
    scans.scans,
  ])

  const decision = useMemo(
    () => (axisContext ? engine.decide(axisContext) : null),
    [axisContext],
  )

  const proposal = useMemo(
    () => resolveOverride(memory.override, decision, today) ?? decision?.primary ?? null,
    [memory.override, decision, today],
  )

  const trainingLoad = useMemo(
    () => computeTrainingLoad(sessions, today),
    [sessions, today],
  )

  /**
   * El día contra el que se proponen y ejecutan las acciones: contexto,
   * decisión y propuesta seleccionada. Es lo único que el ciclo de vida de una
   * acción necesita saber del estado de la aplicación.
   */
  const day = useMemo<AxisDay | null>(
    () => (axisContext && decision && proposal ? { context: axisContext, decision, selected: proposal } : null),
    [axisContext, decision, proposal],
  )

  /**
   * Briefing para la conversación.
   *
   * Se construye del mismo contexto y la misma decisión que alimentan Inicio, así
   * que AXIS conversacional no puede contradecir a AXIS de la pantalla principal.
   */
  const briefing = useMemo(() => {
    if (!axisContext || !decision) return null
    return buildBriefing(
      axisContext,
      decision,
      sessions,
      proposal,
      memory.override,
      // Lo contado ayer sigue siendo cierto hoy; lo de hoy va después y, si hay, manda (D-037).
      [...(yesterdayMemory?.reportedLoads ?? []), ...memory.reportedLoads],
      memory.movedTo ?? null,
    )
  }, [axisContext, decision, proposal, sessions, memory.override, memory.reportedLoads, memory.movedTo, yesterdayMemory])

  // La revisión de la semana pasada (D-059).
  const weeklyReview = useMemo(
    () =>
      status === 'ready'
        ? reviewWeek({ today, profile, sessions, recovery: recentRecovery, catalog: EXERCISE_CATALOG, measurements })
        : null,
    [status, today, profile, sessions, recentRecovery, measurements],
  )

  // AXIS habla primero (D-038): una nota, la más importante, con lo que la app ya sabe.
  const axisNote = useMemo(
    () =>
      status === 'ready'
        ? proactiveNote({
            review: weeklyReview,
            dayKey: today,
            profile,
            sessions,
            catalog: EXERCISE_CATALOG,
            discomfortsYesterday: (yesterdayMemory?.discomforts ?? []).map((item) => item.zone),
            recoveryRegistered: recoveryScore.status === 'ok',
            assessments: assessments.assessments,
          })
        : null,
    [status, today, profile, sessions, yesterdayMemory, recoveryScore.status, assessments.assessments, weeklyReview],
  )

  const axisSuggestions = useMemo(
    () => (briefing ? suggestionsFor(briefing) : []),
    [briefing],
  )

  const weeklyActivity = useMemo(
    () => weeklyActivityFor(sessions, today),
    [sessions, today],
  )

  // Lo previsto se recalcula con el mismo motor cada vez que cambia el día (D-048).
  const weekView = useMemo(
    () => (axisContext ? projectWeek(axisContext, proposal, { movedTo: memory.movedTo ?? null }) : []),
    [axisContext, proposal, memory.movedTo],
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
        // El formulario no edita los objetivos (D-035) ni lo que no gusta (D-037): se conservan.
        ...(profile?.targets ? { targets: profile.targets } : {}),
        ...(profile?.dislikedExercises ? { dislikedExercises: profile.dislikedExercises } : {}),
        // Ni la alimentación (D-061), que tiene sus propias acciones.
        ...(profile?.nutrition ? { nutrition: profile.nutrition } : {}),
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
    [profile?.createdAt, profile?.targets, profile?.dislikedExercises, profile?.nutrition],
  )

  /**
   * Guarda un cambio del perfil que no pasa por su formulario: objetivos
   * medibles (D-035) y ejercicios que no gustan (D-037). Sin perfil no hay
   * dónde guardarlo.
   */
  const updateProfile = useCallback(
    async (change: (current: UserProfile) => UserProfile, failure: string) => {
      if (!profile) return
      const next: UserProfile = { ...change(profile), updatedAt: nowIso() }
      setProfile(next)
      try {
        await getRepositories().profile.save(next)
      } catch {
        setError(failure)
      }
    },
    [profile],
  )

  // Alimentación (D-061): el objetivo se elige aquí y los ajustes solo se aceptan, nunca se aplican solos.
  const setNutritionGoal = useCallback(
    (goal: NutritionGoal) =>
      updateProfile(
        (current) => ({ ...current, nutrition: { goal, adjustmentKcal: 0, since: today } }),
        'No se pudo guardar tu objetivo de alimentación en este dispositivo.',
      ),
    [updateProfile, today],
  )

  const applyNutritionAdjustment = useCallback(
    (deltaKcal: number) =>
      updateProfile(
        (current) => (current.nutrition ? { ...current, nutrition: withAdjustment(current.nutrition, deltaKcal, today) } : current),
        'No se pudo guardar el ajuste en este dispositivo.',
      ),
    [updateProfile, today],
  )

  const saveTargets = useCallback(
    (change: (current: GoalTarget[]) => GoalTarget[]) =>
      updateProfile((current) => ({ ...current, targets: change(current.targets ?? []) }), 'No se pudo guardar el objetivo en este dispositivo.'),
    [updateProfile],
  )

  /** Apunta o quita un ejercicio que no gusta (D-037). */
  const setExerciseDisliked = useCallback(
    (exerciseId: string, disliked: boolean) =>
      updateProfile((current) => {
        const list = (current.dislikedExercises ?? []).filter((id) => id !== exerciseId)
        return { ...current, dislikedExercises: disliked ? [...list, exerciseId] : list }
      }, 'No se pudo guardar la preferencia en este dispositivo.'),
    [updateProfile],
  )

  const addTarget = useCallback(
    async (draft: { exerciseId: string; target: number; deadline: DayKey }) => {
      const target: GoalTarget = {
        id: createId(),
        ...draft,
        startValue: bestSetOf(draft.exerciseId, sessions, assessments.assessments),
        createdAt: nowIso(),
      }
      await saveTargets((current) => [...current, target])
    },
    [saveTargets, sessions, assessments.assessments],
  )

  /**
   * Varios objetivos a la vez, con su punto de partida ya conocido: los que AXIS
   * propone tras el primer test (D-040). En una sola escritura: añadirlos uno a
   * uno partiría cada vez del mismo perfil y solo quedaría el último.
   */
  const addTargets = useCallback(
    async (drafts: readonly { exerciseId: string; target: number; deadline: DayKey; startValue: number }[]) => {
      const createdAt = nowIso()
      const added: GoalTarget[] = drafts.map((draft) => ({
        id: createId(),
        exerciseId: draft.exerciseId,
        target: draft.target,
        deadline: draft.deadline,
        startValue: draft.startValue,
        createdAt,
      }))
      await saveTargets((current) => [
        ...current,
        ...added.filter((target) => !current.some((other) => other.exerciseId === target.exerciseId)),
      ])
    },
    [saveTargets],
  )

  const removeTarget = useCallback(
    (id: string) => saveTargets((current) => current.filter((target) => target.id !== id)),
    [saveTargets],
  )

  const addActivity = useCallback(async (draft: ActivityDraft) => {
    const timestamp = nowIso()
    // Sin cambios, solo alinea el día de la semana con la fecha si la tiene.
    const activity = withActivityChanges(
      { ...draft, id: createId(), createdAt: timestamp, updatedAt: timestamp },
      {},
      timestamp,
    )
    setActivities((current) => sortActivities([...current, activity]))
    try {
      await getRepositories().activities.save(activity)
    } catch {
      setError('No se pudo guardar la actividad.')
    }
  }, [])

  /** Cambia una actividad sin borrarla: el mismo id, con su `createdAt` (D-018). */
  const updateActivity = useCallback(
    async (id: string, changes: ActivityChanges) => {
      const current = activities.find((activity) => activity.id === id)
      if (!current) return
      const updated = withActivityChanges(current, changes, nowIso())
      setActivities((list) =>
        sortActivities(list.map((activity) => (activity.id === id ? updated : activity))),
      )
      try {
        await getRepositories().activities.save(updated)
      } catch {
        setError('No se pudo guardar la actividad.')
      }
    },
    [activities],
  )

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
    setAxisError(null)
    setAxisStatus('idle')
    // Se añade al hilo del día, no lo sustituye: lo hablado antes sigue ahí.
    // Si ya se estaba negociando, no se abre una segunda vez.
    commitMemory((current) =>
      openChangeThread(current, {
        id: createId(),
        role: 'axis',
        text: changeOpeningMessage(briefing),
        createdAt: nowIso(),
        intent: 'change',
      }),
    )
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
    // Los pesos del usuario viajan con cada ejercicio: con ellos se ajusta la serie siguiente (D-055).
    const gear = axisContext ? gearToday(axisContext) : null
    const started = startWorkoutFrom(proposal, new Date(), (exerciseId) => {
      const exercise = findExercise(exerciseId)
      return exercise && gear ? loadsFor(exercise, gear) : []
    })
    if (!started) return

    const changed = proposal.id !== decision.primary.id
    replaceActiveWorkout(
      changed ? markProposalChanged(started, decision.primary.headline) : started,
    )
  }, [proposal, decision, axisContext, replaceActiveWorkout])

  const adjustWeight = useCallback(
    (delta: number) => updateActiveWorkout((current) => adjustWeightIn(current, delta)),
    [updateActiveWorkout],
  )

  const adjustReps = useCallback(
    (delta: number) => updateActiveWorkout((current) => adjustRepsIn(current, delta)),
    [updateActiveWorkout],
  )

  const completeSet = useCallback(
    () => updateActiveWorkout((current) => completeSetIn(current, new Date())),
    [updateActiveWorkout],
  )

  const undoLastSet = useCallback(
    () => updateActiveWorkout(undoLastSetIn),
    [updateActiveWorkout],
  )

  const skipExercise = useCallback(
    () => updateActiveWorkout(skipExerciseIn),
    [updateActiveWorkout],
  )

  const skipRest = useCallback(
    () => updateActiveWorkout(skipRestIn),
    [updateActiveWorkout],
  )

  const extendRest = useCallback(
    () => updateActiveWorkout((current) => extendRestIn(current, undefined, new Date())),
    [updateActiveWorkout],
  )

  const setReserve = useCallback(
    (exerciseIndex: number, reserve: RepsInReserve) =>
      updateActiveWorkout((current) => setReserveIn(current, exerciseIndex, reserve)),
    [updateActiveWorkout],
  )

  const startWork = useCallback(
    () => updateActiveWorkout((current) => startWorkIn(current, new Date())),
    [updateActiveWorkout],
  )

  const finishWork = useCallback(
    () => updateActiveWorkout((current) => completeWorkIn(current, new Date())),
    [updateActiveWorkout],
  )

  const cancelWork = useCallback(() => updateActiveWorkout(cancelWorkIn), [updateActiveWorkout])

  const saveSession = useCallback(async (session: WorkoutSession) => {
    setSessions((current) => withSession(current, session))
    try {
      await getRepositories().workouts.save(session)
    } catch {
      setError('No se pudo guardar el entrenamiento en este dispositivo.')
    }
  }, [])

  const finishWorkout = useCallback(
    async (effort: number | null) => {
      const workout = workoutRef.current
      if (!workout) return

      /*
       * Saltar todos los ejercicios no es haber entrenado.
       *
       * La sesión se agota igual —no queda ejercicio en curso— pero sin una sola
       * serie hecha no se guarda: una sesión vacía en el historial contaría como
       * día entrenado en `trainedToday` y en la Carga, y AXIS recomendaría
       * descansar mañana por un entrenamiento que no existió. Mismo criterio que
       * al abandonar. Tampoco se borra la elección del día: el día sigue sin
       * entrenar, así que lo que el usuario eligió sigue en pie.
       */
      if (!hasProgress(workout)) {
        replaceActiveWorkout(null)
        return
      }

      const session = toWorkoutSession(workout, { status: 'completed', effort })
      setLastCompleted(session)
      // La fila de la sesión en curso se borra aquí. Si la app se cerrara justo
      // antes, al volver la sesión aparecería terminada y se cerraría sola con
      // el mismo id: no puede duplicarse en el historial.
      replaceActiveWorkout(null)
      // El día ya está entrenado: la elección deja de tener efecto. Solo ella:
      // lo que el usuario contó y lo que hoy no ocurre siguen siendo ciertos.
      commitMemory((current) => clearOverride(current))
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
      const session = toWorkoutSession(workout, { status: 'abandoned' })
      // También pasa por el resumen (D-019): lo hecho se ve y se puede valorar.
      setLastCompleted(session)
      await saveSession(session)
    }
  }, [replaceActiveWorkout, saveSession])

  const rateLastSession = useCallback(
    async (effort: number) => {
      if (!lastCompleted) return
      const updated: WorkoutSession = { ...lastCompleted, effort }
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

      commitMemory((current) => rememberQuestion(current, asked))
      setAxisStatus('thinking')
      setAxisError(null)

      try {
        const result = await conversation.ask(text, briefing, conversationMemoryOf(memory))

        const answer: AxisMessage = {
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
          action: day ? proposeAction(day, result) : null,
          ...(result.modelDisagreed ? { modelDisagreed: true } : {}),
        }

        /*
         * La respuesta y lo que se ha aprendido con ella van juntos a la memoria:
         * la intención, la petición de cambio, lo que el usuario ha dicho que hoy
         * no ocurre —el motor vuelve a decidir sin ello— y la carga que ha
         * contado, que seguirá contando en las peticiones siguientes.
         */
        commitMemory((current) => rememberAnswer(current, answer, result))
        // «No me gustan las zancadas» queda en el perfil (D-037).
        if (result.preference) void setExerciseDisliked(result.preference.exerciseId, !result.preference.liked)

        setAxisFallback(fallbackNoticeOf(result, navigator.onLine))
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
    [briefing, memory, day, commitMemory, setExerciseDisliked],
  )

  /** Acciones que se están ejecutando ahora mismo, para no lanzar dos veces la misma. */
  const inFlightRef = useRef<Set<string>>(new Set())

  /**
   * Dónde guarda una acción: la memoria del día y, para el partido de mañana,
   * el calendario (D-022). Cada escritura lanza si falla: qué deshacer lo
   * decide el dominio, no la pantalla.
   */
  const actionPort = useMemo<AxisMemoryPort>(
    () => ({
      save: (next) => getRepositories().axisMemory.save(next),
      async addActivity(activity) {
        await getRepositories().activities.save(activity)
        setActivities((current) =>
          sortActivities([...current.filter((item) => item.id !== activity.id), activity]),
        )
      },
      async removeActivity(id) {
        await getRepositories().activities.remove(id)
        setActivities((current) => current.filter((item) => item.id !== id))
      },
    }),
    [],
  )

  /** El entrenamiento de hoy ha empezado o ha terminado: ya no se deshace nada (D-022). */
  const workoutStartedToday =
    activeWorkout?.dayKey === today || sessions.some((session) => session.dayKey === today)

  /**
   * Aplica una propuesta de acción, y solo cuando el usuario pulsa el botón.
   *
   * Este es el único camino por el que la conversación puede cambiar el estado
   * real. El ciclo entero —comprobar contra la decisión vigente, aplicar,
   * guardar— vive en el dominio (`executeAction`); aquí solo se le da el día,
   * la memoria más reciente y el sitio donde guardar, y se refleja lo que
   * devuelve. Nada queda aplicado hasta que la memoria se ha guardado.
   */
  const confirmAxisAction = useCallback(
    async (action: AxisActionProposal) => {
      if (inFlightRef.current.has(action.id)) return
      inFlightRef.current.add(action.id)
      try {
        if (!day) {
          commitMemory((current) =>
            markActionError(current, action.id, 'Todavía no tengo tu día calculado.'),
          )
          return
        }
        const snapshot = memoryRef.current
        const result = await executeAction(action, day, snapshot, actionPort)
        commitMemory((current) => {
          if (current === snapshot) return result.memory
          // Llegó algo al hilo mientras se guardaba: se vuelve a aplicar sobre lo
          // último, que el guardado general recogerá.
          return result.ok
            ? applyAction(action, day, current).memory
            : markActionError(current, action.id, result.message)
        })
      } finally {
        inFlightRef.current.delete(action.id)
      }
    },
    [day, commitMemory, actionPort],
  )

  const canUndoAxisAction = useCallback(
    (actionId: string) => canUndoAction(memory, actionId, { workoutStarted: workoutStartedToday }),
    [memory, workoutStartedToday],
  )

  /**
   * Deshace la última acción aplicada (D-022). El ciclo —comprobar, retirar lo
   * creado, guardar— vive en el dominio; aquí se le da la memoria y el sitio
   * donde guardar, y se refleja lo que devuelve.
   */
  const undoAxisAction = useCallback(
    async (action: AxisActionProposal): Promise<string | null> => {
      if (inFlightRef.current.has(action.id)) return null
      inFlightRef.current.add(action.id)
      try {
        const snapshot = memoryRef.current
        const result = await undoAction(action.id, snapshot, actionPort, {
          workoutStarted: workoutStartedToday,
        })
        if (!result.ok) return result.message
        commitMemory((current) =>
          current === snapshot ? result.memory : undoLastApplied(current, action.id),
        )
        return null
      } finally {
        inFlightRef.current.delete(action.id)
      }
    },
    [commitMemory, actionPort, workoutStartedToday],
  )

  /**
   * «Prefiero la versión normal» (D-048): el mismo cambio que confirmaría la
   * conversación, propuesto y ejecutado por el motor de acciones (D-012), así
   * que queda registrado y se puede deshacer desde AXIS.
   */
  const chooseNormalVersion = useCallback(async () => {
    if (!day) return
    const target = day.decision.alternatives.find((item) => item.rule === 'alternative_normal')
    if (!target?.session) return
    const action = proposeAction(day, {
      proposedTarget: { type: target.type, focus: target.session.focus },
      proposedReason: 'Hoy prefiero la versión normal.',
    })
    if (action) await confirmAxisAction(action)
  }, [day, confirmAxisAction])

  const movedToTomorrow = memory.movedTo != null && memory.movedTo === addDays(today, 1)

  /** El usuario descarta la propuesta. No se toca nada más; la negociación termina. */
  const cancelAxisAction = useCallback(
    (action: AxisActionProposal) => {
      commitMemory((current) => dismissAction(action, current))
    },
    [commitMemory],
  )

  /*
   * La memoria del día se guarda al cambiar.
   *
   * Vive en el dispositivo, como todo lo demás: no hay servidor ni historial de
   * conversaciones en ningún sitio. Un solo registro: no puede quedar guardado
   * el plan y no el hilo, ni el hilo sin saber que estaba negociando.
   *
   * El guardado no arranca hasta que la carga inicial ha terminado y solo
   * escribe la memoria del día cargado: si no, el primer render con el valor
   * vacío borraría lo que se acaba de leer.
   */
  useEffect(() => {
    if (status !== 'ready') return
    if (loadedDayRef.current !== today || memory.dayKey !== today) return

    void getRepositories()
      .axisMemory.save(memory)
      .catch(() => {
        // Perder el hilo no es motivo para molestar al usuario: la app sigue.
      })
  }, [status, today, memory])

  /** Vacía el hilo. Lo decidido y lo contado hoy se conservan. */
  const clearAxisConversation = useCallback(() => {
    setAxisStatus('idle')
    setAxisError(null)
    setAxisFallback(null)
    commitMemory((current) => clearThread(current))
  }, [])

  const closeAxisChat = useCallback(() => {
    commitMemory((current) => closeChangeThread(current))
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  // -------------------------------------------------------------------------
  // Copia de seguridad
  // -------------------------------------------------------------------------

  const exportBackup = useCallback(async () => {
    try {
      const contents = await getRepositories().backup.readAll()
      const exportedAt = nowIso()
      const backup = buildBackup(contents, { exportedAt, appSchema: STORAGE_SCHEMA_VERSION })
      return {
        fileName: backupFileName(exportedAt),
        // Con sangría: si alguien abre el archivo, debería poder leerlo.
        json: JSON.stringify(backup, null, 2),
      }
    } catch {
      setError('No se pudieron leer tus datos para exportarlos.')
      return null
    }
  }, [])

  /**
   * Restaura una copia.
   *
   * Tras escribir, se recarga la página en vez de reconstruir el estado a mano.
   * No es pereza: al restaurar cambia **todo** a la vez —perfil, historial,
   * recuperación del día, memoria de AXIS— y de ahí cuelgan la decisión del día,
   * el briefing y la Carga. Rehidratar eso pieza a pieza es la forma segura de
   * que algo se quede apuntando a los datos anteriores. Lo importado ya está en
   * disco, así que el arranque normal lo lee y lo deja todo coherente por el
   * mismo camino de siempre.
   */
  /**
   * Cambia el registro de peso y medidas de hoy (D-060). Primero la pantalla,
   * luego el disco; si guardar falla, se dice.
   */
  const updateTodayMeasurement = useCallback(
    async (change: (current: BodyMeasurement) => BodyMeasurement) => {
      const timestamp = nowIso()
      const current = measurements.find((record) => record.dayKey === today) ?? emptyMeasurement(today, timestamp)
      const next = change(current)
      setMeasurements((list) => sortMeasurements([...list.filter((record) => record.dayKey !== today), next]))
      try {
        await getRepositories().measurements.save(next)
      } catch {
        setError('No se pudieron guardar tus medidas en este dispositivo.')
      }
    },
    [measurements, today],
  )

  const saveWeight = useCallback(
    (weightKg: number) => updateTodayMeasurement((current) => withWeight(current, weightKg, nowIso())),
    [updateTodayMeasurement],
  )

  const savePerimeters = useCallback(
    (perimeters: Partial<Record<PerimeterKey, number>>) =>
      updateTodayMeasurement((current) => withPerimeters(current, perimeters, nowIso())),
    [updateTodayMeasurement],
  )

  const saveProteinCheck = useCallback(
    (reached: boolean) => updateTodayMeasurement((current) => withProtein(current, reached, nowIso())),
    [updateTodayMeasurement],
  )

  const importBackup = useCallback(async (contents: BackupContents) => {
    try {
      await getRepositories().backup.replaceAll(contents)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No se pudo restaurar la copia en este dispositivo.',
      )
      return false
    }
    // La sesión en curso ya no existe: no hay nada que guardar al descargar.
    workoutRef.current = null
    window.location.reload()
    return true
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
    setRecentRecovery([])
    setMeasurements([])
    // La base ya no existe: se vacía la memoria sin volver a escribir en ella.
    // El guardado no se dispara porque la app deja de estar `ready`.
    commitMemory(() => emptyDayMemory(dayKey))
    workoutRef.current = null
    setActiveWorkout(null)
    setLastCompleted(null)
    resetAssessments()
    resetScans()
    setAxisStatus('idle')
    setAxisError(null)
    setAxisFallback(null)
    setError(null)
    setStatus('onboarding')
  }, [resetAssessments, resetScans])

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
      weekView,
      chooseNormalVersion,
      historyStats,
      saveProfile,
      readHealthNote,
      addTarget,
      addTargets,
      setExerciseDisliked,
      axisNote,
      weeklyReview,
      measurements,
      saveWeight,
      savePerimeters,
      saveProteinCheck,
      setNutritionGoal,
      applyNutritionAdjustment,
      removeTarget,
      addActivity,
      updateActivity,
      removeActivity,
      updateRecovery,
      toggleHydrationGlass,
      openChangeConversation,
      dismissError,
      exportBackup,
      importBackup,
      assessments,
      scans,
      clearAllData,
      briefing,
      axisMessages: memory.messages,
      axisStatus,
      axisError,
      axisFallback,
      axisSuggestions,
      askAxis,
      clearAxisConversation,
      closeAxisChat,
      axisActionStatuses: memory.actionStatuses,
      confirmAxisAction,
      cancelAxisAction,
      canUndoAxisAction,
      undoAxisAction,
      movedToTomorrow,
      beginWorkout,
      adjustWeight,
      adjustReps,
      completeSet,
      undoLastSet,
      skipExercise,
      skipRest,
      extendRest,
      setReserve,
      startWork,
      finishWork,
      cancelWork,
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
      weekView,
      chooseNormalVersion,
      historyStats,
      saveProfile,
      addTarget,
      addTargets,
      setExerciseDisliked,
      axisNote,
      weeklyReview,
      measurements,
      saveWeight,
      savePerimeters,
      saveProteinCheck,
      setNutritionGoal,
      applyNutritionAdjustment,
      removeTarget,
      addActivity,
      updateActivity,
      removeActivity,
      updateRecovery,
      toggleHydrationGlass,
      openChangeConversation,
      dismissError,
      exportBackup,
      importBackup,
      assessments,
      scans,
      clearAllData,
      briefing,
      memory.messages,
      axisStatus,
      axisError,
      axisFallback,
      axisSuggestions,
      askAxis,
      clearAxisConversation,
      closeAxisChat,
      memory.actionStatuses,
      confirmAxisAction,
      cancelAxisAction,
      canUndoAxisAction,
      undoAxisAction,
      movedToTomorrow,
      beginWorkout,
      adjustWeight,
      adjustReps,
      completeSet,
      undoLastSet,
      skipExercise,
      skipRest,
      extendRest,
      setReserve,
      startWork,
      finishWork,
      cancelWork,
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
