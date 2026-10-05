/**
 * Copia de seguridad de todo lo que hay en el dispositivo.
 *
 * AXTHLETICS es local-first: no hay cuenta, no hay servidor y no hay copia en
 * ningún otro sitio. Eso tiene una consecuencia que la aplicación no puede
 * ignorar: si el navegador desaloja el almacenamiento —iOS lo hace tras unos
 * días sin abrir una PWA—, el historial entero desaparece sin que nadie haya
 * borrado nada. Un archivo que el usuario se guarda donde quiera es la única
 * red que existe sin introducir infraestructura que Core v0.1 no necesita.
 *
 * Todo lo de aquí es **puro**: construye un objeto o interpreta uno. No sabe
 * qué es IndexedDB ni cómo se descarga un archivo; de eso se ocupa la capa de
 * datos y la interfaz. Así se puede probar entero sin navegador.
 */

import { isAssessment, type Assessment } from '../assessment/types'
import { isAxisDayMemory, type AxisDayMemory } from '../axis/memory'
import {
  isScheduledActivity,
  isUserProfile,
  type ScheduledActivity,
  type UserProfile,
} from '../profile/types'
import { isRecoveryInputs, type RecoveryInputs } from '../recovery/types'
import { isRecord } from '../shared/guards'
import { isWorkoutSession, type WorkoutSession } from '../workouts/types'

/**
 * Marca del archivo. Sirve para distinguir «esto no es una copia de AXTHLETICS»
 * de «esto es una copia y está dañada», que son dos problemas distintos y
 * merecen dos mensajes distintos.
 */
export const BACKUP_KIND = 'axtlhetics.backup'

/**
 * Versión del formato del archivo.
 *
 * No es la versión de IndexedDB: son cosas independientes. El esquema de la base
 * puede subir sin que el archivo cambie de forma, y al revés. Cuando este número
 * suba, importar tendrá que saber leer también los anteriores.
 *
 * - **1** (D-015): perfil, actividades, recuperación, sesiones y memoria de AXIS.
 * - **2** (D-021): además, los tests de evolución. Una copia de schema 1 se sigue
 *   leyendo: simplemente no trae tests.
 */
export const BACKUP_SCHEMA = 2

export type BackupContents = {
  profile: UserProfile | null
  activities: ScheduledActivity[]
  recovery: RecoveryInputs[]
  sessions: WorkoutSession[]
  axisMemory: AxisDayMemory[]
  /** Tests de evolución (D-021). Vacío en las copias de schema 1. */
  assessments: Assessment[]
}

export type AxtlheticsBackup = {
  kind: typeof BACKUP_KIND
  schema: number
  /** Cuándo se generó, en ISO. */
  exportedAt: string
  /** Versión del esquema de IndexedDB de la app que lo escribió. Informativa. */
  appSchema: number
  data: BackupContents
}

/** Cuántos registros hay de cada cosa. Es lo que se le enseña al usuario. */
export type BackupCounts = {
  profile: boolean
  activities: number
  recovery: number
  sessions: number
  axisMemory: number
  assessments: number
}

export function countsOf(contents: BackupContents): BackupCounts {
  return {
    profile: contents.profile !== null,
    activities: contents.activities.length,
    recovery: contents.recovery.length,
    sessions: contents.sessions.length,
    axisMemory: contents.axisMemory.length,
    assessments: contents.assessments.length,
  }
}

/** `true` si no hay absolutamente nada que guardar o que restaurar. */
export function isEmptyBackup(counts: BackupCounts): boolean {
  return (
    !counts.profile &&
    counts.activities === 0 &&
    counts.recovery === 0 &&
    counts.sessions === 0 &&
    counts.axisMemory === 0 &&
    counts.assessments === 0
  )
}

export function buildBackup(
  contents: BackupContents,
  options: { exportedAt: string; appSchema: number },
): AxtlheticsBackup {
  return {
    kind: BACKUP_KIND,
    schema: BACKUP_SCHEMA,
    exportedAt: options.exportedAt,
    appSchema: options.appSchema,
    data: contents,
  }
}

/**
 * Nombre del archivo: `axtlhetics-2026-09-22.json`.
 *
 * Con la fecha delante se ordenan solos en la carpeta de descargas y se ve de un
 * vistazo cuál es el último.
 */
export function backupFileName(exportedAt: string): string {
  const day = exportedAt.slice(0, 10)
  return `axtlhetics-${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'copia'}.json`
}

/** Por qué no se ha podido leer el archivo, en términos que se pueden enseñar. */
export type BackupRejection =
  | 'no_es_json'
  | 'no_es_una_copia'
  | 'version_desconocida'
  | 'sin_datos'

export const BACKUP_REJECTION_MESSAGES: Record<BackupRejection, string> = {
  no_es_json: 'Ese archivo no se puede leer. Tiene que ser el .json que exportaste.',
  no_es_una_copia: 'Ese archivo no es una copia de AXTHLETICS.',
  version_desconocida:
    'Esa copia la escribió una versión más reciente de AXTHLETICS y no se puede leer aquí.',
  sin_datos: 'Esa copia no contiene nada que restaurar.',
}

export type BackupParseResult =
  | {
      ok: true
      contents: BackupContents
      counts: BackupCounts
      exportedAt: string
      /** Registros que venían en el archivo y no se han entendido. */
      discarded: number
    }
  | { ok: false; reason: BackupRejection }

/** Se queda con lo que pasa la comprobación y cuenta lo que se ha caído. */
function keepValid<T>(
  value: unknown,
  check: (item: unknown) => item is T,
): { items: T[]; discarded: number } {
  if (!Array.isArray(value)) return { items: [], discarded: 0 }
  const items = value.filter(check)
  return { items, discarded: value.length - items.length }
}

/**
 * Interpreta un archivo que el usuario ha elegido.
 *
 * Es entrada no fiable: pudo escribirla otra versión, o el propio usuario con un
 * editor de texto. Dos niveles de exigencia distintos, a propósito:
 *
 * - La **envoltura** (marca y versión) tiene que estar bien, o no se sigue. Si no
 *   es una copia de AXTHLETICS, no hay nada que interpretar.
 * - Los **registros** se filtran uno a uno. Que una sesión de hace dos años esté
 *   corrupta no es razón para no devolverle las otras ciento veinte. Lo que se
 *   descarta se cuenta y se dice; callarlo sería peor que no importar.
 */
export function parseBackup(value: unknown): BackupParseResult {
  if (!isRecord(value)) return { ok: false, reason: 'no_es_json' }
  if (value.kind !== BACKUP_KIND) return { ok: false, reason: 'no_es_una_copia' }

  if (typeof value.schema !== 'number' || !Number.isInteger(value.schema)) {
    return { ok: false, reason: 'no_es_una_copia' }
  }
  // Una copia del futuro puede tener campos que aquí no se sabrían conservar.
  if (value.schema > BACKUP_SCHEMA) return { ok: false, reason: 'version_desconocida' }

  if (!isRecord(value.data)) return { ok: false, reason: 'no_es_una_copia' }
  const data = value.data

  const profile = isUserProfile(data.profile) ? data.profile : null
  const profileDiscarded = data.profile !== null && data.profile !== undefined && !profile ? 1 : 0

  const activities = keepValid(data.activities, isScheduledActivity)
  const recovery = keepValid(data.recovery, isRecoveryInputs)
  const sessions = keepValid(data.sessions, isWorkoutSession)
  const axisMemory = keepValid(data.axisMemory, isAxisDayMemory)
  // Una copia de schema 1 no tiene `assessments`: se lee como ninguno, sin descartar nada.
  const assessments = keepValid(data.assessments, isAssessment)

  const contents: BackupContents = {
    profile,
    activities: activities.items,
    recovery: recovery.items,
    sessions: sessions.items,
    axisMemory: axisMemory.items,
    assessments: assessments.items,
  }

  const counts = countsOf(contents)
  if (isEmptyBackup(counts)) return { ok: false, reason: 'sin_datos' }

  return {
    ok: true,
    contents,
    counts,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    discarded:
      profileDiscarded +
      activities.discarded +
      recovery.discarded +
      sessions.discarded +
      axisMemory.discarded +
      assessments.discarded,
  }
}
