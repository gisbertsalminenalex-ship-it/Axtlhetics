/**
 * Avisos de entreno (D-044): cuándo se avisa, la firma VAPID y las rutas.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import test from 'node:test'

import { cron, publicKey, subscribe, test as testPush, unsubscribe, type PushDeps } from './handlers'
import { isDue, localTime, parseSchedule, parseSubscription, type StoredSubscription } from './schedule'
import { sendPush, vapidKeysFromEnv, vapidToken, type VapidKeys } from './send'
import { subscriptionId, type PushStore } from './store'

function keys(): VapidKeys {
  const { publicKey: pub, privateKey: priv } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = pub.export({ format: 'jwk' })
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')])
  return { publicKey: point.toString('base64url'), privateKey: priv.export({ format: 'jwk' }).d! }
}

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BOr5w', auth: 'k9-x' } }
/** Lunes a viernes, a las 17:00 en Madrid. */
const SCHEDULE = { weekdays: [0, 1, 2, 3, 4], hour: 17, timeZone: 'Europe/Madrid' }

function stored(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return {
    id: subscriptionId(SUB.endpoint),
    subscription: SUB,
    schedule: SCHEDULE,
    lastSentDay: null,
    updatedAt: '2026-10-19T00:00:00.000Z',
    ...overrides,
  }
}

// El 19 de octubre de 2026 es lunes; Madrid va en UTC+2 (horario de verano).
const MONDAY_17_MADRID = new Date('2026-10-19T15:10:00Z')

// ---------------------------------------------------------------------------
// Cuándo
// ---------------------------------------------------------------------------

test('D-044: la hora y el día se leen en la zona del usuario, con el lunes como 0', () => {
  assert.deepEqual(localTime(MONDAY_17_MADRID, 'Europe/Madrid'), { dayKey: '2026-10-19', weekday: 0, hour: 17 })
  assert.deepEqual(localTime(MONDAY_17_MADRID, 'America/New_York'), { dayKey: '2026-10-19', weekday: 0, hour: 11 })
  // Las 22:30 UTC del domingo ya son las 0:30 del lunes en Madrid.
  assert.equal(localTime(new Date('2026-10-18T22:30:00Z'), 'Europe/Madrid').weekday, 0)
})

test('D-044: se avisa los días de entreno, desde la hora elegida, una vez al día', () => {
  assert.equal(isDue(stored(), MONDAY_17_MADRID), true)
  // Una pasada que llega tarde aún avisa; demasiado tarde, ya no.
  assert.equal(isDue(stored(), new Date('2026-10-19T17:50:00Z')), true)
  assert.equal(isDue(stored(), new Date('2026-10-19T18:10:00Z')), false)
  // Antes de la hora, no.
  assert.equal(isDue(stored(), new Date('2026-10-19T14:10:00Z')), false)
  // Ya avisado hoy, no.
  assert.equal(isDue(stored({ lastSentDay: '2026-10-19' }), MONDAY_17_MADRID), false)
  // El sábado no es día de entreno.
  assert.equal(isDue(stored(), new Date('2026-10-24T15:10:00Z')), false)
})

test('D-044: lo que llega del navegador se comprueba', () => {
  assert.deepEqual(parseSchedule({ weekdays: [4, 0, 4], hour: 9, timeZone: 'Europe/Madrid' }), {
    weekdays: [0, 4],
    hour: 9,
    timeZone: 'Europe/Madrid',
  })
  for (const bad of [
    { weekdays: [7], hour: 9, timeZone: 'Europe/Madrid' },
    { weekdays: [0], hour: 3, timeZone: 'Europe/Madrid' },
    { weekdays: [0], hour: 9, timeZone: 'Marte/Olympus' },
    { weekdays: [0], hour: 9.5, timeZone: 'Europe/Madrid' },
  ]) {
    assert.equal(parseSchedule(bad), null, JSON.stringify(bad))
  }
  assert.ok(parseSubscription(SUB))
  assert.equal(parseSubscription({ ...SUB, endpoint: 'http://inseguro.example/x' }), null)
  assert.equal(parseSubscription({ endpoint: SUB.endpoint }), null)
})

// ---------------------------------------------------------------------------
// La firma
// ---------------------------------------------------------------------------

test('D-044: el JWT de VAPID va firmado con ES256 para el servicio de push, sin datos del usuario', () => {
  const pair = keys()
  const token = vapidToken(SUB.endpoint, pair, new Date('2026-10-19T00:00:00Z'))
  const [header, claims, signature] = token.split('.')
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString())
  assert.equal(payload.aud, 'https://fcm.googleapis.com')
  assert.equal(payload.sub, 'https://axtlhetics.vercel.app')
  assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString()).alg, 'ES256')

  const point = Buffer.from(pair.publicKey, 'base64url')
  const ok = verify(
    'sha256',
    Buffer.from(`${header}.${claims}`),
    {
      key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
      format: 'jwk',
      dsaEncoding: 'ieee-p1363',
    },
    Buffer.from(signature, 'base64url'),
  )
  assert.equal(ok, true)
})

test('D-044: las claves del entorno se exigen con la forma de P-256', () => {
  const pair = keys()
  assert.deepEqual(vapidKeysFromEnv({ VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey }), pair)
  assert.equal(vapidKeysFromEnv({ VAPID_PUBLIC_KEY: 'abc', VAPID_PRIVATE_KEY: pair.privateKey }), null)
  assert.equal(vapidKeysFromEnv({}), null)
})

test('D-044: el aviso va vacío, y 404/410 dicen que la suscripción ya no existe', async () => {
  const pair = keys()
  let sent: RequestInit | undefined
  const ok = await sendPush(SUB, pair, (async (_url: string, init: RequestInit) => {
    sent = init
    return new Response(null, { status: 201 })
  }) as typeof fetch)
  assert.deepEqual(ok, { ok: true })
  assert.equal(sent?.body, undefined)
  assert.match(String((sent?.headers as Record<string, string>).Authorization), /^vapid t=.+, k=/)

  const gone = await sendPush(SUB, pair, (async () => new Response(null, { status: 410 })) as typeof fetch)
  assert.deepEqual(gone, { ok: false, gone: true, status: 410 })
  const down = await sendPush(SUB, pair, (async () => {
    throw new Error('red')
  }) as typeof fetch)
  assert.deepEqual(down, { ok: false, gone: false, status: null })
})

// ---------------------------------------------------------------------------
// Las rutas
// ---------------------------------------------------------------------------

function memoryStore(initial: StoredSubscription[] = []): PushStore & { items: Map<string, StoredSubscription> } {
  const items = new Map(initial.map((item) => [item.id, item]))
  return {
    items,
    async save(item) {
      items.set(item.id, item)
    },
    async get(id) {
      return items.get(id) ?? null
    },
    async remove(id) {
      items.delete(id)
    },
    async all() {
      return [...items.values()]
    },
  }
}

function deps(overrides: Partial<PushDeps> = {}): PushDeps {
  return {
    store: memoryStore(),
    keys: keys(),
    trusted: { hosts: ['axtlhetics.vercel.app'], allowLocalhost: false },
    cronSecret: 'secreto',
    now: () => MONDAY_17_MADRID,
    send: async () => ({ ok: true }),
    ...overrides,
  }
}

function request(method: string, body?: unknown, headers: Record<string, string> = { origin: 'https://axtlhetics.vercel.app' }): Request {
  return new Request('https://axtlhetics.vercel.app/api/push', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test('D-044: sin claves o sin almacén, los avisos se declaran no configurados', async () => {
  assert.equal(publicKey(deps({ keys: null })).status, 503)
  assert.equal((await subscribe(request('POST', { subscription: SUB, schedule: SCHEDULE }), deps({ store: null }))).status, 503)
})

test('D-044: suscribirse guarda la suscripción y el horario, y conserva el último aviso', async () => {
  const store = memoryStore([stored({ lastSentDay: '2026-10-19', schedule: { ...SCHEDULE, hour: 9 } })])
  const response = await subscribe(request('POST', { subscription: SUB, schedule: SCHEDULE }), deps({ store }))
  assert.equal(response.status, 200)
  const saved = store.items.get(subscriptionId(SUB.endpoint))!
  assert.equal(saved.schedule.hour, 17)
  assert.equal(saved.lastSentDay, '2026-10-19')
})

test('D-044: otra web no puede suscribir, quitar ni enviar avisos', async () => {
  const foreign = { origin: 'https://otra.example' }
  assert.equal((await subscribe(request('POST', { subscription: SUB, schedule: SCHEDULE }, foreign), deps())).status, 403)
  assert.equal((await unsubscribe(request('DELETE', { endpoint: SUB.endpoint }, foreign), deps())).status, 403)
  assert.equal((await testPush(request('POST', { endpoint: SUB.endpoint }, foreign), deps())).status, 403)
})

test('D-044: el aviso de prueba solo va a una suscripción guardada', async () => {
  assert.equal((await testPush(request('POST', { endpoint: SUB.endpoint }), deps())).status, 404)
  const store = memoryStore([stored()])
  assert.equal((await testPush(request('POST', { endpoint: SUB.endpoint }), deps({ store }))).status, 200)
})

test('D-044: la pasada exige el secreto, avisa a quien le toca, lo apunta y limpia las muertas', async () => {
  assert.equal((await cron(request('GET', undefined, {}), deps())).status, 403)
  assert.equal((await cron(request('GET', undefined, { authorization: 'Bearer otro' }), deps())).status, 403)

  const dead = { ...stored(), id: 'muerta', subscription: { ...SUB, endpoint: 'https://fcm.googleapis.com/fcm/send/muerta' } }
  const saturday = { ...stored(), id: 'sabado', schedule: { ...SCHEDULE, weekdays: [5] } }
  const store = memoryStore([stored(), dead, saturday])
  const response = await cron(
    request('GET', undefined, { authorization: 'Bearer secreto' }),
    deps({ store, send: async (item) => (item.id === 'muerta' ? { ok: false, gone: true, status: 410 } : { ok: true }) }),
  )
  assert.deepEqual(await response.json(), { ok: true, sent: 1, removed: 1, failed: 0 })
  assert.equal(store.items.get(subscriptionId(SUB.endpoint))!.lastSentDay, '2026-10-19')
  assert.equal(store.items.has('muerta'), false)
  assert.equal(store.items.get('sabado')!.lastSentDay, null)
})
