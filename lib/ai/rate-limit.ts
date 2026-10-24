/**
 * Límite de uso de AXIS en el servidor (D-070, bloque 3), como en Mentax: 40
 * peticiones cada 10 minutos por persona, para que nadie pueda gastar la cuota
 * de los proveedores.
 *
 * Ventana fija en Redis (el de los avisos de entreno, D-044): una clave por
 * persona y ventana, `INCR` y caducidad. La persona es un resumen de su IP, que
 * no se puede revertir: no se guarda la IP. Sin Redis configurado, o si Redis
 * falla, se deja pasar: la conversación no se rompe por el límite, y el
 * firewall de Vercel (`RATE_LIMIT`) sigue por delante.
 *
 * Sin SDK: una petición REST con el `fetch` que se inyecta.
 */

import { createHash } from 'node:crypto'

export const AXIS_RATE_LIMIT = { requests: 40, windowSeconds: 600 } as const

export type RateLimiter = (clientKey: string) => Promise<boolean>

/** La persona que llama, como resumen de su IP. `null` si no se sabe: entonces no se limita por persona. */
export function clientKeyOf(headers: Headers): string | null {
  const ip = (headers.get('x-forwarded-for')?.split(',')[0] ?? headers.get('x-real-ip') ?? '').trim()
  if (!ip) return null
  return createHash('sha256').update(`axis-ai:${ip}`).digest('hex').slice(0, 32)
}

export function createRateLimiter(
  config: { url: string; token: string } | null,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): RateLimiter {
  return async (clientKey) => {
    if (!config) return true
    const window = Math.floor(now() / (AXIS_RATE_LIMIT.windowSeconds * 1000))
    const key = `axis-ai:rl:${clientKey}:${window}`
    try {
      const response = await fetchImpl(`${config.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, AXIS_RATE_LIMIT.windowSeconds],
        ]),
        signal: AbortSignal.timeout(1500),
      })
      if (!response.ok) return true
      const results = (await response.json()) as { result?: unknown }[]
      const count = results[0]?.result
      return typeof count !== 'number' || count <= AXIS_RATE_LIMIT.requests
    } catch {
      return true
    }
  }
}
