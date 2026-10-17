import assert from 'node:assert/strict'
import test from 'node:test'

import { dailyReminderIcs, REMINDER_UID } from './ics'

const ICS = dailyReminderIcs({
  minuteOfDay: 8 * 60 + 30,
  startDay: '2026-10-18',
  url: 'https://axtlhetics.vercel.app',
  now: new Date('2026-10-17T19:05:00.000Z'),
})
const LINES = ICS.split('\r\n')

test('D-039: un evento diario, a la hora elegida y sin zona horaria, que avisa a esa hora', () => {
  assert.ok(LINES.includes('DTSTART:20261018T083000'), 'hora flotante: sin Z ni TZID')
  assert.ok(LINES.includes('RRULE:FREQ=DAILY'))
  assert.ok(LINES.includes('TRIGGER:PT0M'))
  assert.ok(LINES.includes(`UID:${REMINDER_UID}`), 'siempre el mismo: añadirlo otra vez lo actualiza')
  assert.ok(LINES.includes('DTSTAMP:20261017T190500Z'))
})

test('D-039: es iCalendar válido: CRLF, texto escapado y líneas de 75 octetos como mucho', () => {
  assert.equal(LINES[0], 'BEGIN:VCALENDAR')
  assert.ok(ICS.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ICS), 'todos los saltos son CRLF')
  for (const line of LINES) assert.ok(new TextEncoder().encode(line).length <= 75, line)
  const description = ICS.match(/DESCRIPTION:Abre[\s\S]*?\r\n(?! )/)![0].replace(/\r\n /g, '')
  assert.match(description, /dormido y cómo te sientes: con eso AXIS decide mejor tu día\. https/)
})
