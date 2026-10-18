/** Un aviso ya, para comprobar que llega (D-044). */

import { test } from '../../../../lib/push/handlers'
import { pushDepsFromEnv } from '../../../../lib/push/env'

export const runtime = 'nodejs'
export const maxDuration = 10

export function POST(request: Request): Promise<Response> {
  return test(request, pushDepsFromEnv(request))
}
