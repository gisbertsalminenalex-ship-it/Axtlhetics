/** La pasada de cada hora (D-044): la llama GitHub Actions con `CRON_SECRET`. */

import { cron } from '../../../../lib/push/handlers'
import { pushDepsFromEnv } from '../../../../lib/push/env'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export function GET(request: Request): Promise<Response> {
  return cron(request, pushDepsFromEnv(request))
}
