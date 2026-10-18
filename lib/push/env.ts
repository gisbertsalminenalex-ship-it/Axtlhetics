/**
 * Las dependencias de las rutas de avisos, leídas del entorno del servidor
 * (D-044). Este y las rutas son los únicos que leen estas variables.
 */

import { trustedOriginsFromEnv } from '../ai/provider-contract'
import type { PushDeps } from './handlers'
import { vapidKeysFromEnv } from './send'
import { createRedisStore, storeConfigFromEnv } from './store'

export function pushDepsFromEnv(request: Request): PushDeps {
  const env = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  }
  const config = storeConfigFromEnv(env)
  let host: string | null = null
  try {
    host = new URL(request.url).host
  } catch {}
  return {
    store: config ? createRedisStore(config) : null,
    keys: vapidKeysFromEnv(env),
    trusted: trustedOriginsFromEnv(process.env, host),
    cronSecret: process.env.CRON_SECRET?.trim() || null,
  }
}
