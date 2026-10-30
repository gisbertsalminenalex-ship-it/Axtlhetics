'use client'

import { useEffect, useState } from 'react'
import { LogOut, Share2, Unlink } from 'lucide-react'
import { MultiChoiceGroup, SectionTitle } from '@/components/profile/controls'
import { AXTHLETICS_METRICS, DEFAULT_METRICS, METRIC_LABELS, type AxthleticsMetric } from '@/lib/domain/ecosystem/sharing'
import { useEcosystem } from '@/lib/ecosystem/use-ecosystem'
import { useAxtlhetics } from '@/lib/state/store'

const METRIC_OPTIONS = AXTHLETICS_METRICS.map((value) => ({ value, label: METRIC_LABELS[value] }))

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

const pill =
  'ax-press flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface px-4 text-subhead font-semibold disabled:opacity-40'

/**
 * Ecosistema AXIS (D-076): iniciar sesión con Google y elegir qué resumen semanal
 * se comparte con la app AXIS. Nada sale del dispositivo hasta que el usuario lo
 * confirma, y AXTHLETICS funciona igual sin conectar.
 */
export function EcosystemSharing() {
  const { profile } = useAxtlhetics()
  const { account, lastSentAt, failed, signIn, share, stopSharing, signOut } = useEcosystem()
  const sharing = profile?.ecosystem ?? null
  const [metrics, setMetrics] = useState<AxthleticsMetric[]>(sharing?.metrics ?? [...DEFAULT_METRICS])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const sharingKey = sharing?.metrics.join(',')
  useEffect(() => {
    if (sharing) setMetrics(sharing.metrics)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingKey])

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setMessage(null)
    const result = await action()
    setBusy(false)
    if (result) setMessage(result)
  }

  const toggle = (metric: AxthleticsMetric) =>
    setMetrics((current) => (current.includes(metric) ? current.filter((m) => m !== metric) : AXTHLETICS_METRICS.filter((m) => m === metric || current.includes(m))))

  const changed = sharing !== null && sharing.metrics.join(',') !== metrics.join(',')

  return (
    <>
      <SectionTitle>Ecosistema AXIS</SectionTitle>
      <p className="mt-1 text-footnote leading-relaxed text-muted-foreground text-pretty">
        AXIS es también la app que une AXTHLETICS con Finax y Mentax. Si quieres, le mandas un resumen de cada semana: solo
        números por semana, nunca tus series, notas, fotos ni lo que hablas aquí con AXIS.
      </p>

      {account.status === 'checking' && <p className="mt-3 text-footnote text-muted-foreground">Comprobando la conexión…</p>}

      {account.status === 'signedOut' && (
        <>
          {sharing && (
            <p className="mt-3 text-footnote leading-relaxed text-muted-foreground text-pretty">
              Compartías con AXIS, pero has cerrado la sesión. Vuelve a entrar con la misma cuenta para seguir enviando.
            </p>
          )}
          <button type="button" onClick={() => void run(signIn)} disabled={busy} className={`${pill} mt-3 w-full text-primary`}>
            Entrar con Google
          </button>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground text-pretty">
            Usa la misma cuenta de Google en todas las apps: así se conectan solas.
          </p>
        </>
      )}

      {account.status === 'signedIn' && (
        <>
          <p className="mt-3 text-footnote text-muted-foreground">
            Conectado como <span className="font-medium text-foreground">{account.email ?? 'tu cuenta de Google'}</span>
          </p>

          <MultiChoiceGroup
            label="Qué compartes cada semana"
            hint="El peso no va salvo que lo actives."
            options={METRIC_OPTIONS}
            value={metrics}
            onToggle={toggle}
          />

          {sharing && !changed && (
            <p className="text-footnote leading-relaxed text-muted-foreground text-pretty">
              {failed
                ? 'No he podido enviar el último resumen. Lo intento otra vez la próxima vez que abras la app.'
                : lastSentAt
                  ? `Compartiendo. Último envío a las ${time.format(new Date(lastSentAt))}.`
                  : 'Compartiendo. El resumen se envía al abrir y al salir de la app.'}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(!sharing || changed) && (
              <button
                type="button"
                onClick={() => void run(async () => ((await share(metrics)) ? null : 'Guardado, pero no he podido enviarlo ahora. Lo intento al volver a abrir.'))}
                disabled={busy || metrics.length === 0}
                className={`${pill} col-span-2 text-primary`}
              >
                <Share2 className="h-4 w-4" strokeWidth={2} />
                {sharing ? 'Guardar cambios' : 'Compartir con AXIS'}
              </button>
            )}
            {sharing && (
              <button
                type="button"
                onClick={() => void run(async () => ((await stopSharing()) ? 'Has dejado de compartir. AXIS ha borrado lo que recibió.' : 'No he podido dejar de compartir. Inténtalo con conexión.'))}
                disabled={busy}
                className={`${pill} text-muted-foreground`}
              >
                <Unlink className="h-4 w-4" strokeWidth={2} />
                Dejar de compartir
              </button>
            )}
            <button
              type="button"
              onClick={() => void run(async () => (await signOut(), null))}
              disabled={busy}
              className={`${pill} text-muted-foreground ${sharing ? '' : 'col-span-2'}`}
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              Cerrar sesión
            </button>
          </div>
        </>
      )}

      {message && <p className="mt-3 text-footnote leading-relaxed text-muted-foreground text-pretty">{message}</p>}
    </>
  )
}
