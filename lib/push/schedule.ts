/**
 * Cuándo toca avisar (D-044). Puro: sin red, sin almacén, sin reloj propio.
 *
 * El servidor solo sabe tres cosas de cada suscripción: qué días entrena el
 * usuario (los que marcó en su perfil, lunes = 0), a qué hora quiere el aviso y
 * su zona horaria. Con eso decide si hoy, a esta hora, toca avisar.
 *
 * La tarea programada pasa cada hora, pero puede llegar tarde. Por eso no se
 * exige la hora exacta: se avisa en la primera pasada desde la hora elegida y
 * dentro de `SEND_WINDOW_HOURS`, y una sola vez al día (`lastSentDay`).
 */

/** Horas de margen para una pasada que llega tarde. Pasado eso, ese día ya no se avisa. */
export const SEND_WINDOW_HOURS = 3

/** De 6:00 a 22:00: un aviso de madrugada no es un aviso, es un susto. */
export const MIN_HOUR = 6
export const MAX_HOUR = 22

export type PushSchedule = {
  /** Días de entreno, lunes = 0, como en el perfil. */
  weekdays: number[]
  /** Hora local del aviso, en punto. */
  hour: number
  /** Zona horaria IANA del dispositivo, como «Europe/Madrid». */
  timeZone: string
}

export type PushKeys = { p256dh: string; auth: string }
export type PushSubscriptionData = { endpoint: string; keys: PushKeys }

export type StoredSubscription = {
  id: string
  subscription: PushSubscriptionData
  schedule: PushSchedule
  /** Último día local (`YYYY-MM-DD`) en que se avisó. */
  lastSentDay: string | null
  updatedAt: string
}

export type LocalTime = { dayKey: string; weekday: number; hour: number }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** El día, el día de la semana (lunes = 0) y la hora en esa zona horaria. */
export function localTime(now: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour),
  }
}

/** `true` si a esta pasada le toca avisar a esta suscripción. */
export function isDue(stored: Pick<StoredSubscription, 'schedule' | 'lastSentDay'>, now: Date): boolean {
  const local = localTime(now, stored.schedule.timeZone)
  if (!stored.schedule.weekdays.includes(local.weekday)) return false
  if (stored.lastSentDay === local.dayKey) return false
  return local.hour >= stored.schedule.hour && local.hour < stored.schedule.hour + SEND_WINDOW_HOURS
}

/** `true` si la zona horaria existe. Una inválida haría fallar cada pasada. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Lo que llega del navegador, comprobado. `null` si algo no encaja. */
export function parseSchedule(value: unknown): PushSchedule | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const weekdays = raw.weekdays
  if (!Array.isArray(weekdays) || weekdays.length > 7) return null
  if (!weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) return null
  const hour = raw.hour
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < MIN_HOUR || hour > MAX_HOUR) return null
  if (!isTimeZone(raw.timeZone)) return null
  return { weekdays: [...new Set(weekdays as number[])].sort(), hour, timeZone: raw.timeZone }
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

/** Una suscripción de la Push API, comprobada: endpoint https y las dos claves. */
export function parseSubscription(value: unknown): PushSubscriptionData | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.endpoint !== 'string' || raw.endpoint.length > 1024) return null
  let url: URL
  try {
    url = new URL(raw.endpoint)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const keys = raw.keys as Record<string, unknown> | undefined
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null
  if (!BASE64URL.test(keys.p256dh) || !BASE64URL.test(keys.auth) || keys.p256dh.length > 200 || keys.auth.length > 100) return null
  return { endpoint: raw.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}
