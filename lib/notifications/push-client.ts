/**
 * Los avisos de entreno en el navegador (D-044): permiso, suscripción y horario.
 *
 * Lo único que sale hacia el servidor propio (`/api/push`) es la suscripción
 * de la Push API, los días de entreno, la hora y la zona horaria. La hora se
 * recuerda en este dispositivo; los días salen del perfil.
 */

/** Dónde se recuerda la hora elegida, en este dispositivo. */
export const PUSH_HOUR_KEY = 'axtlhetics.push.hour'
export const DEFAULT_PUSH_HOUR = 17

export type PushScheduleInput = { weekdays: number[]; hour: number }

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'not_configured' | 'error'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function readPushHour(): number {
  try {
    const value = Number(window.localStorage.getItem(PUSH_HOUR_KEY))
    return Number.isInteger(value) && value >= 6 && value <= 22 ? value : DEFAULT_PUSH_HOUR
  } catch {
    return DEFAULT_PUSH_HOUR
  }
}

export function savePushHour(hour: number): void {
  try {
    window.localStorage.setItem(PUSH_HOUR_KEY, String(hour))
  } catch {}
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** La suscripción de este dispositivo, si la hay. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

async function save(subscription: PushSubscription, input: PushScheduleInput): Promise<boolean> {
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      schedule: { ...input, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
  })
  return response.ok
}

/** Pide permiso, se suscribe y guarda el horario. */
export async function enablePush(input: PushScheduleInput): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'

    const keyResponse = await fetch('/api/push')
    if (keyResponse.status === 503) return 'not_configured'
    const { publicKey } = (await keyResponse.json()) as { publicKey?: string }
    if (!keyResponse.ok || !publicKey) return 'error'

    const registration = await navigator.serviceWorker.ready
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64url(publicKey) }))
    return (await save(subscription, input)) ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

/** Con los avisos activos, pone al día el horario (otra hora, otros días). */
export async function syncPush(input: PushScheduleInput): Promise<void> {
  try {
    const subscription = await currentSubscription()
    if (subscription) await save(subscription, input)
  } catch {}
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  try {
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } finally {
    await subscription.unsubscribe().catch(() => false)
  }
}

/** Un aviso ya, por el mismo camino que los de verdad. */
export async function sendTestPush(): Promise<boolean> {
  try {
    const subscription = await currentSubscription()
    if (!subscription) return false
    const response = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    return response.ok
  } catch {
    return false
  }
}
