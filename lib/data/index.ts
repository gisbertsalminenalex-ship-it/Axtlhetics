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
