/**
 * Recordatorio diario como evento de calendario (D-039).
 *
 * Un archivo iCalendar (RFC 5545) con un evento que se repite cada día a la
 * hora elegida y avisa en ese momento. Lo añade el calendario del móvil, así
 * que avisa con la app cerrada sin servidor y sin que salga ningún dato.
 *
 * La hora va sin zona horaria («hora flotante»): avisa a las 8:00 de donde esté
 * el usuario, que es lo que se espera de un recordatorio.
 */

import type { DayKey } from '../shared/dates'

/** Siempre el mismo: volver a añadirlo actualiza el evento en vez de duplicarlo. */
export const REMINDER_UID = 'recordatorio-diario@axtlhetics'

export const REMINDER_SUMMARY = 'AXTHLETICS · Registra tu recuperación'

export type ReminderOptions = {
  /** Minutos desde medianoche: 8:00 → 480. */
  minuteOfDay: number
  /** Primer día del recordatorio. */
  startDay: DayKey
  /** Dirección de la app, para abrirla desde el evento. */
  url: string
  /** Para \`DTSTAMP\`: cuándo se generó. */
  now?: Date
}

/** El archivo \`.ics\`, con saltos de línea CRLF como pide el estándar. */
export function dailyReminderIcs(options: ReminderOptions): string {
  const start = `${options.startDay.replace(/-/g, '')}T${pad(Math.floor(options.minuteOfDay / 60))}${pad(options.minuteOfDay % 60)}00`
  const stamp = (options.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const description = `Abre AXTHLETICS y registra cómo has dormido y cómo te sientes: con eso AXIS decide mejor tu día. ${options.url}`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AXTHLETICS//Recordatorio diario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${REMINDER_UID}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeText(REMINDER_SUMMARY)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${options.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(REMINDER_SUMMARY)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Comas, puntos y comas, barras y saltos de línea van escapados en el texto. */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Líneas de más de 75 octetos se parten con un espacio al principio de la siguiente. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74
    if (new TextEncoder().encode(current + char).length > limit) {
      parts.push(current)
      current = char
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}
