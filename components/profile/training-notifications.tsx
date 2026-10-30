'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { FieldLabel, SectionTitle } from '@/components/profile/controls'
import { WEEKDAY_LABELS } from '@/lib/domain/shared/dates'
import { listNames } from '@/lib/domain/shared/text'
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupported,
  readPushHour,
  savePushHour,
  sendTestPush,
  syncPush,
  type EnableResult,
} from '@/lib/notifications/push-client'
import { useAxtlhetics } from '@/lib/state/store'

/** De 6:00 a 22:00, en punto. */
const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i)

const PROBLEMS: Record<Exclude<EnableResult, 'ok'>, string> = {
  denied: 'El navegador tiene bloqueadas las notificaciones de AXTHLETICS. Actívalas en los ajustes del sitio y vuelve a intentarlo.',
  unsupported: 'Este navegador no admite avisos. En Android, abre AXTHLETICS en Chrome.',
  not_configured: 'Los avisos todavía no están disponibles en el servidor.',
  error: 'No he podido activar los avisos. Inténtalo de nuevo en un momento.',
}

type Status = 'loading' | 'off' | 'on' | 'unsupported'

/**
 * Avisos de entreno (D-044): una notificación los días que el usuario marcó
 * para entrenar, a la hora que elija. Los días salen del perfil; si cambian,
 * el horario del servidor se pone al día solo.
 */
export function TrainingNotifications() {
  const { profile } = useAxtlhetics()
  const weekdays = profile?.availableWeekdays ?? []
  const weekdaysKey = weekdays.join(',')
  const [status, setStatus] = useState<Status>('loading')
  const [hour, setHour] = useState(17)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setHour(readPushHour())
    if (!pushSupported()) {
      setStatus('unsupported')
      return
    }
    void currentSubscription().then((subscription) => setStatus(subscription ? 'on' : 'off'))
  }, [])

  // Con los avisos activos, los días de entreno del perfil mandan.
  useEffect(() => {
    if (status === 'on') void syncPush({ weekdays, hour: readPushHour() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, weekdaysKey])

  const enable = async () => {
    setBusy(true)
    setMessage(null)
    const result = await enablePush({ weekdays, hour })
    setBusy(false)
    if (result === 'ok') {
      setStatus('on')
      setMessage('Avisos activados.')
    } else {
      setMessage(PROBLEMS[result])
    }
  }

  const disable = async () => {
    setBusy(true)
    await disablePush()
    setBusy(false)
    setStatus('off')
    setMessage('Avisos desactivados.')
  }

  const changeHour = (value: number) => {
    setHour(value)
    savePushHour(value)
    if (status === 'on') void syncPush({ weekdays, hour: value })
  }

  const test = async () => {
    setBusy(true)
    setMessage(null)
    const ok = await sendTestPush()
    setBusy(false)
    setMessage(ok ? 'Aviso de prueba enviado: te llegará en unos segundos.' : 'No he podido enviar el aviso de prueba.')
  }

  const days = weekdays.length === 7 ? 'todos los días' : listNames(weekdays.map((day) => WEEKDAY_LABELS[day as keyof typeof WEEKDAY_LABELS].toLowerCase()))

  return (
    <>
      <SectionTitle>Avisos de entreno</SectionTitle>
      <p className="mt-1 text-footnote leading-relaxed text-muted-foreground text-pretty">
        {weekdays.length > 0
          ? `Una notificación los días que entrenas (${days}) para que no se te pase la sesión.`
          : 'Marca en tu perfil los días que puedes entrenar y te aviso esos días.'}
      </p>

      {status === 'unsupported' ? (
        <p className="mt-3 text-footnote leading-relaxed text-muted-foreground text-pretty">{PROBLEMS.unsupported}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 py-2">
            <FieldLabel>Hora</FieldLabel>
            <select
              value={hour}
              onChange={(event) => changeHour(Number(event.target.value))}
              aria-label="Hora del aviso de entreno"
              className="h-11 rounded-2xl border border-transparent bg-surface focus-visible:border-primary px-3 text-callout font-semibold tabular-nums outline-none"
            >
              {HOURS.map((value) => (
                <option key={value} value={value}>
                  {value}:00
                </option>
              ))}
            </select>
          </div>

          {status === 'on' ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void test()}
                disabled={busy}
                className="ax-press flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface text-subhead font-semibold text-primary disabled:opacity-40"
              >
                <Send className="h-4 w-4" strokeWidth={2} />
                Probar aviso
              </button>
              <button
                type="button"
                onClick={() => void disable()}
                disabled={busy}
                className="ax-press flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface text-subhead font-semibold text-muted-foreground disabled:opacity-40"
              >
                <BellOff className="h-4 w-4" strokeWidth={2} />
                Desactivar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy || status === 'loading' || weekdays.length === 0}
              className="ax-press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-subhead font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Bell className="h-4 w-4" strokeWidth={2} />
              {busy ? 'Activando…' : 'Activar avisos'}
            </button>
          )}
        </>
      )}

      {message && <p className="mt-2 text-footnote leading-relaxed text-muted-foreground text-pretty">{message}</p>}
    </>
  )
}
