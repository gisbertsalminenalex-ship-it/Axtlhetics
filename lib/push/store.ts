/**
 * Dónde se guardan las suscripciones (D-044): Upstash Redis, por su API REST.
 * Solo servidor. Sin SDK: unas pocas órdenes de Redis con `fetch`.
 *
 * Lo que se guarda de cada suscripción es lo mínimo para avisar: la dirección
 * del servicio de push con sus claves, los días de entreno, la hora y la zona
 * horaria. Nada más: ni nombre, ni sesiones, ni datos de salud.
 *
 * Las variables las crea Vercel al conectar Upstash al proyecto: `KV_REST_API_*`
 * o `UPSTASH_REDIS_REST_*`, según la versión de la integración.
 */

import { createHash } from 'node:crypto'
import type { StoredSubscription } from './schedule'

const INDEX = 'push:subscriptions'
const KEY = (id: string) => `push:subscription:${id}`

export type PushStore = {
  save(stored: StoredSubscription): Promise<void>
  get(id: string): Promise<StoredSubscription | null>
  remove(id: string): Promise<void>
  all(): Promise<StoredSubscription[]>
}

/** El id de una suscripción: un resumen de su endpoint, que no se puede revertir. */
export function subscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 32)
}

export function storeConfigFromEnv(env: Record<string, string | undefined>): { url: string; token: string } | null {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL)?.trim()
  const token = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN)?.trim()
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

export function createRedisStore(config: { url: string; token: string }, fetchImpl: typeof fetch = fetch): PushStore {
  async function run<T>(command: (string | number)[]): Promise<T> {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Redis respondió ${response.status}.`)
    const body = (await response.json()) as { result?: T; error?: string }
    if (body.error) throw new Error('Redis devolvió un error.')
    return body.result as T
  }

  const parse = (value: string | null): StoredSubscription | null => {
    if (!value) return null
    try {
      return JSON.parse(value) as StoredSubscription
    } catch {
      return null
    }
  }

  return {
    async save(stored) {
      await run(['SET', KEY(stored.id), JSON.stringify(stored)])
      await run(['SADD', INDEX, stored.id])
    },
    async get(id) {
      return parse(await run<string | null>(['GET', KEY(id)]))
    },
    async remove(id) {
      await run(['DEL', KEY(id)])
      await run(['SREM', INDEX, id])
    },
    async all() {
      const ids = await run<string[]>(['SMEMBERS', INDEX])
      if (ids.length === 0) return []
      const values = await run<(string | null)[]>(['MGET', ...ids.map(KEY)])
      return values.map(parse).filter((value): value is StoredSubscription => value !== null)
    },
  }
}
