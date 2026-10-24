import assert from 'node:assert/strict'
import test from 'node:test'

import { AXIS_RATE_LIMIT, clientKeyOf, createRateLimiter } from './rate-limit'

const CONFIG = { url: 'https://redis.example', token: 't' }

/** Un Redis de mentira: cuenta por clave, como `INCR`. */
function fakeRedis() {
  const counts = new Map<string, number>()
  const calls: { url: string; body: unknown }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as (string | number)[][]
    calls.push({ url, body })
    const key = String(body[0][1])
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return new Response(JSON.stringify([{ result: counts.get(key) }, { result: 1 }]), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

test('D-070: 40 peticiones cada 10 minutos por persona; la 41 no pasa y la ventana siguiente vuelve a empezar', async () => {
  assert.deepEqual(AXIS_RATE_LIMIT, { requests: 40, windowSeconds: 600 })
  const { fetchImpl, calls } = fakeRedis()
  let now = 0
  const limit = createRateLimiter(CONFIG, fetchImpl, () => now)
  for (let i = 0; i < 40; i++) assert.equal(await limit('persona'), true, `petición ${i + 1}`)
  assert.equal(await limit('persona'), false)
  assert.equal(await limit('otra'), true, 'cada persona tiene su cuenta')
  now = 600_000
  assert.equal(await limit('persona'), true)
  assert.equal(calls[0].url, 'https://redis.example/pipeline')
  assert.deepEqual(calls[0].body, [['INCR', 'axis-ai:rl:persona:0'], ['EXPIRE', 'axis-ai:rl:persona:0', 600]])
})

test('D-070: sin Redis, o si Redis falla, se deja pasar: la conversación no se rompe por el límite', async () => {
  assert.equal(await createRateLimiter(null)('persona'), true)
  const broken = (async () => {
    throw new Error('caído')
  }) as unknown as typeof fetch
  assert.equal(await createRateLimiter(CONFIG, broken)('persona'), true)
  const error = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
  assert.equal(await createRateLimiter(CONFIG, error)('persona'), true)
})

test('D-070: la persona es un resumen de su IP, que no se guarda', () => {
  const key = clientKeyOf(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))
  assert.match(key ?? '', /^[0-9a-f]{32}$/)
  assert.equal(key?.includes('203.0.113.7'), false)
  assert.equal(key, clientKeyOf(new Headers({ 'x-real-ip': '203.0.113.7' })))
  assert.equal(clientKeyOf(new Headers()), null)
})
