/**
 * Punto de entrada de la capa de datos.
 *
 * La aplicación pide `getRepositories()` y no sabe si detrás hay IndexedDB o memoria.
 */

import { isIndexedDbAvailable } from './indexeddb/db'
import { createIndexedDbRepositories } from './indexeddb/repositories'
import { createMemoryRepositories } from './memory-repositories'
import type { Repositories } from './repositories'

let instance: Repositories | null = null

export function getRepositories(): Repositories {
  if (!instance) {
    instance = isIndexedDbAvailable()
      ? createIndexedDbRepositories()
      : createMemoryRepositories()
  }
  return instance
}

export type { Repositories } from './repositories'

/**
 * Versión del esquema de almacenamiento local.
 *
 * Se re-exporta aquí para que quien la necesite —hoy solo la copia de seguridad,
 * que la escribe en el archivo a título informativo— no tenga que importar nada
 * de `indexeddb/`. Qué hay detrás sigue siendo asunto de esta capa.
 */
export { DB_VERSION as STORAGE_SCHEMA_VERSION } from './indexeddb/db'
