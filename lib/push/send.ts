/**
 * Enviar un aviso push (D-044). Solo servidor.
 *
 * El aviso va **sin contenido**: el servicio de push del navegador (en Android,
 * el de Google) solo recibe «despierta a esta app». Sin contenido no hay nada
 * que cifrar ni nada del usuario que viaje; el texto lo compone el service
 * worker en el móvil, con lo que ya tiene guardado.
 *
 * La identificación es VAPID (RFC 8292): un JWT firmado con ES256 y la clave
 * pública. Se firma con `node:crypto`, sin dependencias.
 */

import { createPrivateKey, sign } from 'node:crypto'
import type { PushSubscriptionData } from './schedule'

/** Cuánto guarda el servicio de push un aviso si el móvil está apagado: 12 h. */
export const PUSH_TTL_SECONDS = 12 * 60 * 60

/** El «quién envía» de VAPID: la web de la app. Nunca un correo del usuario. */
export const VAPID_SUBJECT = 'https://axtlhetics.vercel.app'

export type VapidKeys = { publicKey: string; privateKey: string }

export type SendResult =
  | { ok: true }
  /** La suscripción ya no existe (el usuario la quitó o desinstaló): hay que borrarla. */
  | { ok: false; gone: true; status: number }
  | { ok: false; gone: false; status: number | null }

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Las claves del entorno, o `null` si faltan o no tienen la forma de P-256. */
export function vapidKeysFromEnv(env: Record<string, string | undefined>): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  if (fromBase64url(publicKey).length !== 65 || fromBase64url(privateKey).length !== 32) return null
  return { publicKey, privateKey }
}

/** El JWT de VAPID para el servicio de push de `endpoint`. */
export function vapidToken(endpoint: string, keys: VapidKeys, now: Date = new Date()): string {
  const audience = new URL(endpoint).origin
  const header = base64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64url(
    Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now.getTime() / 1000) + PUSH_TTL_SECONDS, sub: VAPID_SUBJECT })),
  )
  const point = fromBase64url(keys.publicKey)
  const key = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: base64url(point.subarray(1, 33)),
      y: base64url(point.subarray(33, 65)),
    },
    format: 'jwk',
  })
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `${header}.${claims}.${base64url(signature)}`
}

/** Envía un aviso sin contenido. Nunca lanza: devuelve qué pasó. */
export async function sendPush(
  subscription: PushSubscriptionData,
  keys: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${vapidToken(subscription.endpoint, keys)}, k=${keys.publicKey}`,
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: 'normal',
        'Content-Length': '0',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) return { ok: true }
    if (response.status === 404 || response.status === 410) return { ok: false, gone: true, status: response.status }
    return { ok: false, gone: false, status: response.status }
  } catch {
    return { ok: false, gone: false, status: null }
  }
}
