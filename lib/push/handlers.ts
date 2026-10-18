/**
 * Las rutas de los avisos (D-044), sin Next: reciben sus dependencias para
 * poder probarlas sin red. Las de `app/api/push/` solo las conectan al entorno.
 *
 * - `GET /api/push`: la clave pública, para suscribirse.
 * - `POST /api/push`: guardar o actualizar la suscripción y su horario.
 * - `DELETE /api/push`: quitarla.
 * - `POST /api/push/test`: un aviso ya, para comprobar que llega.
 * - `GET /api/push/cron`: la pasada de cada hora; solo con el secreto.
 *
 * Las que llama el navegador pasan el mismo filtro de origen que la IA.
 */

import { checkRequestOrigin, type TrustedOrigins } from '../ai/provider-contract'
import { isDue, localTime, parseSchedule, parseSubscription, type StoredSubscription } from './schedule'
import { sendPush, type SendResult, type VapidKeys } from './send'
import { subscriptionId, type PushStore } from './store'

export type PushDeps = {
  store: PushStore | null
  keys: VapidKeys | null
  trusted: TrustedOrigins
  cronSecret: string | null
  now?: () => Date
  send?: (stored: StoredSubscription, keys: VapidKeys) => Promise<SendResult>
}

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

const MAX_BODY_BYTES = 4 * 1024

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Lo común de lo que llama el navegador: origen y configuración. */
function guard(request: Request, deps: PushDeps): Response | null {
  if (!checkRequestOrigin(request.headers, deps.trusted).ok) return json({ ok: false, code: 'FORBIDDEN' }, 403)
  if (!deps.store || !deps.keys) return json({ ok: false, code: 'PUSH_NOT_CONFIGURED' }, 503)
  return null
}

export function publicKey(deps: PushDeps): Response {
  return deps.keys ? json({ ok: true, publicKey: deps.keys.publicKey }) : json({ ok: false, code: 'PUSH_NOT_CONFIGURED' }, 503)
}

export async function subscribe(request: Request, deps: PushDeps): Promise<Response> {
  const blocked = guard(request, deps)
  if (blocked) return blocked
  const body = (await readBody(request)) as Record<string, unknown> | null
  const subscription = parseSubscription(body?.subscription)
  const schedule = parseSchedule(body?.schedule)
  if (!subscription || !schedule) return json({ ok: false, code: 'INVALID_REQUEST' }, 400)

  const id = subscriptionId(subscription.endpoint)
  const previous = await deps.store!.get(id)
  await deps.store!.save({
    id,
    subscription,
    schedule,
    lastSentDay: previous?.lastSentDay ?? null,
    updatedAt: (deps.now?.() ?? new Date()).toISOString(),
  })
  return json({ ok: true })
}

export async function unsubscribe(request: Request, deps: PushDeps): Promise<Response> {
  const blocked = guard(request, deps)
  if (blocked) return blocked
  const body = (await readBody(request)) as Record<string, unknown> | null
  if (typeof body?.endpoint !== 'string') return json({ ok: false, code: 'INVALID_REQUEST' }, 400)
  await deps.store!.remove(subscriptionId(body.endpoint))
  return json({ ok: true })
}

/** Un aviso ya, solo a una suscripción guardada: no sirve para avisar a cualquiera. */
export async function test(request: Request, deps: PushDeps): Promise<Response> {
  const blocked = guard(request, deps)
  if (blocked) return blocked
  const body = (await readBody(request)) as Record<string, unknown> | null
  if (typeof body?.endpoint !== 'string') return json({ ok: false, code: 'INVALID_REQUEST' }, 400)
  const stored = await deps.store!.get(subscriptionId(body.endpoint))
  if (!stored) return json({ ok: false, code: 'NOT_SUBSCRIBED' }, 404)
  const result = await (deps.send ?? defaultSend)(stored, deps.keys!)
  if (!result.ok && result.gone) await deps.store!.remove(stored.id)
  return json({ ok: result.ok }, result.ok ? 200 : 502)
}

function defaultSend(stored: StoredSubscription, keys: VapidKeys): Promise<SendResult> {
  return sendPush(stored.subscription, keys)
}

/** La pasada de cada hora: avisa a quien le toque y limpia las suscripciones muertas. */
export async function cron(request: Request, deps: PushDeps): Promise<Response> {
  if (!deps.cronSecret || request.headers.get('authorization') !== `Bearer ${deps.cronSecret}`) {
    return json({ ok: false, code: 'FORBIDDEN' }, 403)
  }
  if (!deps.store || !deps.keys) return json({ ok: false, code: 'PUSH_NOT_CONFIGURED' }, 503)

  const now = deps.now?.() ?? new Date()
  const send = deps.send ?? defaultSend
  let sent = 0
  let removed = 0
  let failed = 0
  for (const stored of await deps.store.all()) {
    if (!isDue(stored, now)) continue
    const result = await send(stored, deps.keys)
    if (result.ok) {
      sent++
      await deps.store.save({ ...stored, lastSentDay: localTime(now, stored.schedule.timeZone).dayKey })
    } else if (result.gone) {
      removed++
      await deps.store.remove(stored.id)
    } else {
      failed++
    }
  }
  // Solo recuentos: ni endpoints ni horarios en la respuesta ni en los logs.
  console.info(JSON.stringify({ event: 'push_cron', sent, removed, failed }))
  return json({ ok: true, sent, removed, failed })
}
