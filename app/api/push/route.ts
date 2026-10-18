/** Suscripción a los avisos de entreno (D-044). La lógica, en `lib/push/handlers.ts`. */

import { publicKey, subscribe, unsubscribe } from '../../../lib/push/handlers'
import { pushDepsFromEnv } from '../../../lib/push/env'

export const runtime = 'nodejs'
export const maxDuration = 10

export function GET(request: Request): Response {
  return publicKey(pushDepsFromEnv(request))
}

export function POST(request: Request): Promise<Response> {
  return subscribe(request, pushDepsFromEnv(request))
}

export function DELETE(request: Request): Promise<Response> {
  return unsubscribe(request, pushDepsFromEnv(request))
}
