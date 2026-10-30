'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { FieldLabel, SectionTitle } from '@/components/profile/controls'
import { dailyReminderIcs } from '@/lib/domain/reminders/ics'
import { formatMinutesOfDay } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/** Horas que se pueden elegir: de 5:00 a 23:30, cada media hora. */
const TIMES = Array.from({ length: 38 }, (_, i) => 300 + i * 30)

/**
 * Recordatorio diario (D-039): un evento de calendario que se repite cada día.
 *
 * Lo añade el calendario del móvil: avisa con la app cerrada, sin servidor y
 * sin que salga ningún dato. La descarga la dispara el DOM, como la copia de
 * seguridad; el store no toca el DOM.
 */
export function DailyReminder() {
  const { today } = useAxtlhetics()
  const [minuteOfDay, setMinuteOfDay] = useState(480)

  const download = () => {
    const ics = dailyReminderIcs({ minuteOfDay, startDay: today, url: window.location.origin })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'axtlhetics-recordatorio.ics'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <SectionTitle>Recordatorio diario</SectionTitle>
      <p className="mt-1 text-footnote leading-relaxed text-muted-foreground text-pretty">
        Un aviso cada día para registrar tu recuperación. Lo añades a tu calendario y avisa aunque la app esté cerrada.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 py-2">
        <FieldLabel>Hora</FieldLabel>
        <select
          value={minuteOfDay}
          onChange={(event) => setMinuteOfDay(Number(event.target.value))}
          aria-label="Hora del recordatorio"
          className="h-11 rounded-2xl border border-transparent bg-surface focus-visible:border-primary px-3 text-callout font-semibold tabular-nums outline-none"
        >
          {TIMES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatMinutesOfDay(minutes)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={download}
        className="ax-press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-surface text-subhead font-semibold text-primary"
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={2} />
        Añadir al calendario
      </button>
    </>
  )
}
