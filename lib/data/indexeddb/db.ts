/**
 * Apertura y migración de la base de datos local.
 *
 * IndexedDB con versión de esquema y migraciones desde el primer día: subir de
 * versión no debe obligar a borrar los datos del usuario. El historial no se borra
 * nunca por conveniencia.
 */

import {
  mergeIntoAxisMemory,
  needsDayPlanUpgrade,
  needsProfileUpgrade,
  upgradeDayPlanRecord,
  upgradeProfileRecord,
  type StoredConversationRecord,
  type StoredDayPlan,
} from '../migrations'

export const DB_NAME = 'axtlhetics'

/**
 * Versión del esquema. Al subirla, añade un bloque nuevo en `migrate` y deja los
 * anteriores intactos: `onupgradeneeded` los ejecuta en orden para quien venga de
 * una versión antigua.
 */
export const DB_VERSION = 7

export const STORES = {
  profile: 'profile',
  activities: 'activities',
  recovery: 'recovery',
  sessions: 'sessions',
  axisMemory: 'axisMemory',
  activeWorkout: 'activeWorkout',
} as const

/**
 * Almacenes que existieron y ya no. Solo la migración los nombra: nadie más
 * puede leerlos ni escribirlos.
 */
const LEGACY_STORES = {
  dayPlan: 'dayPlan',
  conversation: 'conversation',
} as const

/**
 * Clave fija de la única fila de `activeWorkout`. Que la clave sea constante es
 * lo que garantiza, desde el esquema, que nunca haya dos sesiones en curso.
 */
export const ACTIVE_WORKOUT_KEY = 'current'

export type StoreName = (typeof STORES)[keyof typeof STORES]

export function isIndexedDbAvailable(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined'
}

function migrate(
  db: IDBDatabase,
  oldVersion: number,
  transaction: IDBTransaction | null,
): void {
  if (oldVersion < 1) {
    db.createObjectStore(STORES.profile, { keyPath: 'id' })

    const activities = db.createObjectStore(STORES.activities, { keyPath: 'id' })
    activities.createIndex('weekday', 'weekday', { unique: false })

    db.createObjectStore(STORES.recovery, { keyPath: 'dayKey' })

    const sessions = db.createObjectStore(STORES.sessions, { keyPath: 'id' })
    sessions.createIndex('dayKey', 'dayKey', { unique: false })
  }

  // v2: objetivo único → varios. v3: los deportes salen del perfil y pasan a ser
  // actividades del calendario. Ambas reescriben el perfil sin perder nada.
  if (oldVersion >= 1 && oldVersion < 3 && transaction) {
    const store = transaction.objectStore(STORES.profile)
    const cursorRequest = store.openCursor()

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return

      const stored = cursor.value
      if (needsProfileUpgrade(stored)) {
        cursor.update(upgradeProfileRecord(stored))
      }
      cursor.continue()
    }
  }

  /*
   * v4: la elección del día.
   *
   * Cuando el usuario acepta un cambio propuesto por AXIS, esa elección tiene
   * que sobrevivir a una recarga. Antes vivía solo en memoria y se perdía. No
   * guarda la sesión, sino qué opción se eligió: al recargar, el motor vuelve a
   * decidir y se selecciona la equivalente.
   */
  if (oldVersion < 4) {
    db.createObjectStore(LEGACY_STORES.dayPlan, { keyPath: 'dayKey' })
  }

  /*
   * v5: el registro del día deja de ser solo la sesión elegida y pasa a guardar
   * también las actividades que el usuario ha dicho que hoy no ocurren. Sin
   * esto, al recargar AXIS volvía a contar con el partido que le habían dicho
   * que se había cancelado.
   */
  if (oldVersion >= 4 && oldVersion < 5 && transaction) {
    const store = transaction.objectStore(LEGACY_STORES.dayPlan)
    const cursorRequest = store.openCursor()

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return

      const stored = cursor.value
      if (needsDayPlanUpgrade(stored)) {
        cursor.update(upgradeDayPlanRecord(stored))
      }
      cursor.continue()
    }
  }

  /*
   * v5: la conversación con AXIS. Vivía solo en memoria y se perdía al recargar,
   * junto con cualquier propuesta pendiente de confirmar. Un registro por día.
   */
  if (oldVersion < 5) {
    db.createObjectStore(LEGACY_STORES.conversation, { keyPath: 'dayKey' })
  }

  /*
   * v6: la sesión de entrenamiento en curso (P-014). Vivía solo en memoria y
   * cerrar la aplicación a media sesión la perdía. Una única fila con clave
   * fija: no hay dos entrenamientos a la vez.
   */
  if (oldVersion < 6) {
    db.createObjectStore(STORES.activeWorkout, { keyPath: 'id' })
  }

  /*
   * v7: la memoria de AXIS. El plan del día y la conversación eran dos
   * registros del mismo día escritos por caminos distintos, y tres estados de
   * la conversación no se guardaban en ningún sitio. Pasan a ser un solo
   * registro por día.
   *
   * Los almacenes antiguos se leen enteros, se funden y **solo entonces** se
   * eliminan, dentro de esta misma transacción de subida de versión: si algo
   * falla a medias, la transacción se aborta y la base queda como estaba.
   */
  if (oldVersion < 7) {
    const memory = db.createObjectStore(STORES.axisMemory, { keyPath: 'dayKey' })

    // Una instalación nueva no tiene nada que fundir.
    if (!transaction || oldVersion < 4) return

    const plans = new Map<string, StoredDayPlan>()
    const conversations = new Map<string, StoredConversationRecord>()

    const finish = () => {
      const days = new Set([...plans.keys(), ...conversations.keys()])
      for (const dayKey of days) {
        memory.put(mergeIntoAxisMemory(dayKey, plans.get(dayKey) ?? null, conversations.get(dayKey) ?? null))
      }
      db.deleteObjectStore(LEGACY_STORES.dayPlan)
      if (oldVersion >= 5) db.deleteObjectStore(LEGACY_STORES.conversation)
    }

    const readConversations = () => {
      if (oldVersion < 5) {
        finish()
        return
      }
      const cursorRequest = transaction.objectStore(LEGACY_STORES.conversation).openCursor()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) {
          finish()
          return
        }
        const stored = cursor.value as StoredConversationRecord
        if (typeof stored.dayKey === 'string') conversations.set(stored.dayKey, stored)
        cursor.continue()
      }
    }

    const readPlans = transaction.objectStore(LEGACY_STORES.dayPlan).openCursor()
    readPlans.onsuccess = () => {
      const cursor = readPlans.result
      if (!cursor) {
        readConversations()
        return
      }
      const stored = cursor.value as StoredDayPlan
      if (typeof stored.dayKey === 'string') plans.set(stored.dayKey, stored)
      cursor.continue()
    }
  }
}

let connection: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'))
  }

  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        migrate(request.result, event.oldVersion, request.transaction)
      }
      request.onsuccess = () => {
        // Si otra pestaña sube la versión, cerramos para no bloquearla.
        request.result.onversionchange = () => {
          request.result.close()
          connection = null
        }
        resolve(request.result)
      }
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'))
      request.onblocked = () =>
        reject(new Error('Otra pestaña de Axtlhetics está bloqueando la actualización.'))
    }).catch((error: unknown) => {
      connection = null
      throw error
    })
  }

  return connection
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB.'))
  })
}

/** Ejecuta una operación de lectura dentro de una transacción. */
export async function read<T>(
  store: StoreName,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  const transaction = db.transaction(store, 'readonly')
  return promisify(operation(transaction.objectStore(store)))
}

/** Ejecuta una escritura y espera a que la transacción se confirme de verdad. */
export async function write(
  store: StoreName,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    operation(transaction.objectStore(store))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Error al guardar.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Guardado cancelado.'))
  })
}

/** Solo para tests manuales y para reiniciar el dispositivo desde ajustes. */
export async function deleteDatabase(): Promise<void> {
  connection = null
  if (!isIndexedDbAvailable()) return
  await new Promise<void>((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('No se pudo borrar la base.'))
    request.onblocked = () => resolve()
  })
}
