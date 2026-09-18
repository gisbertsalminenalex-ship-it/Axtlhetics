'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowUp, Check } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import type { AxisActionProposal } from '@/lib/domain/axis/actions'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * Conversación con AXIS.
 *
 * Pantalla interna, no una pestaña. AXIS responde desde el mismo briefing que
 * alimenta Inicio, así que aquí no puede decir nada distinto de lo que muestra la
 * recomendación del día.
 */
export function AxisChatScreen({ onClose }: { onClose: () => void }) {
  const {
    axisMessages,
    axisStatus,
    axisError,
    axisUsedFallback,
    axisSuggestions,
    askAxis,
    briefing,
  } = useAxtlhetics()

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  const thinking = axisStatus === 'thinking'
  const isEmpty = axisMessages.length === 0

  // Al llegar un mensaje, la conversación se desplaza a lo último escrito.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [axisMessages.length, thinking])

  const send = async (question: string) => {
    if (thinking || question.trim().length === 0) return
    setDraft('')
    await askAxis(question)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  return (
    <div className="flex min-h-full flex-col px-6 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="ax-press -ml-2 flex h-11 w-11 items-center justify-center"
        >
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <div className="flex items-center gap-2">
            <AxisMark className="h-4 w-4 text-primary" />
            <h1 className="text-[16px] font-semibold tracking-[-0.01em]">AXIS</h1>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Tu guía de entrenamiento y recuperación
          </p>
        </div>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      {/* Conversación vacía: quién es AXIS y qué se le puede preguntar */}
      {isEmpty && (
        <div className="ax-enter flex flex-1 flex-col justify-center py-6">
          <h2 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
            Pregúntame por tu día.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Respondo con tus datos: tu recuperación, tu historial, tu calendario y la
            sesión que te he propuesto. Si no tengo un dato, te lo digo.
          </p>

          {axisSuggestions.length > 0 && (
            <ul className="mt-7 space-y-2.5">
              {axisSuggestions.map((suggestion, index) => (
                <li
                  key={suggestion.question}
                  className="ax-stagger"
                  style={{ '--ax-index': index } as CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => void send(suggestion.question)}
                    className="ax-press flex min-h-11 w-full items-center rounded-2xl border border-border bg-surface px-4 py-3 text-left text-[14.5px] font-medium"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!briefing && (
            <p className="mt-7 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">
              Todavía estoy cargando tus datos.
            </p>
          )}
        </div>
      )}

      {/* Mensajes */}
      {!isEmpty && (
        <div className="flex-1 space-y-4 py-2">
          {axisMessages.map((message) => (
            <div
              key={message.id}
              className={cn('ax-enter flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className="max-w-[85%]">
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed text-pretty',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface text-foreground',
                  )}
                >
                  {message.text}
                </div>

                {message.action && <ActionCard action={message.action} />}
              </div>
            </div>
          ))}

          {thinking && <ThinkingBubble />}

          {axisError && (
            <div className="ax-enter rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-[14px] font-medium">AXIS no ha podido responder.</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{axisError}</p>
            </div>
          )}

          <div ref={endRef} />
        </div>
      )}

      {/* Aviso honesto cuando la IA falla y responde el motor local */}
      {axisUsedFallback && (
        <p className="pb-2 text-center text-[12px] text-muted-foreground">
          Respondiendo sin conexión con tus datos locales.
        </p>
      )}

      {/* Input */}
      <form onSubmit={onSubmit} className="flex items-end gap-2 pt-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pregúntale algo a AXIS…"
          aria-label="Escribe tu pregunta"
          enterKeyHint="send"
          className="h-12 flex-1 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-primary"
        />
        <button
          type="submit"
          disabled={thinking || draft.trim().length === 0}
          aria-label="Enviar"
          className="ax-press flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </form>
    </div>
  )
}

/**
 * La acción propuesta, dentro del propio mensaje.
 *
 * Es el único punto desde el que la conversación puede cambiar el estado real de
 * la aplicación, y hace falta pulsarlo: hasta entonces no se ha tocado nada, por
 * mucho que la conversación haya llegado a un acuerdo.
 *
 * Una vez aplicada queda deshabilitada, para que la misma acción no pueda
 * ejecutarse dos veces.
 */
function ActionCard({ action }: { action: AxisActionProposal }) {
  const { axisActionStatuses, confirmAxisAction, cancelAxisAction } = useAxtlhetics()
  const [working, setWorking] = useState(false)

  const status = axisActionStatuses[action.id] ?? { state: 'pending' as const }

  if (status.state === 'applied') {
    return (
      <p className="ax-enter mt-2 flex min-h-11 items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-4 text-[14px] font-semibold text-success">
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        Cambio aplicado
      </p>
    )
  }

  if (status.state === 'cancelled') {
    return (
      <p className="mt-2 px-1 text-[13px] text-muted-foreground">
        No se ha cambiado nada.
      </p>
    )
  }

  // Otra propuesta se aplicó después: esta partía de una sesión que ya no es la que hay.
  if (status.state === 'superseded') {
    return (
      <p className="mt-2 px-1 text-[13px] text-muted-foreground">
        Ya aplicaste otro cambio después de esta propuesta.
      </p>
    )
  }

  return (
    <div className="mt-2">
      <p className="px-1 text-[13px] text-muted-foreground">{action.summary}</p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={working}
          onClick={async () => {
            setWorking(true)
            await confirmAxisAction(action)
            setWorking(false)
          }}
          className="ax-press flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-[14.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {working ? 'Aplicando…' : action.label}
        </button>
        <button
          type="button"
          onClick={() => cancelAxisAction(action)}
          disabled={working}
          className="ax-press h-12 rounded-2xl border border-border bg-background px-4 text-[14px] font-medium text-muted-foreground disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>

      {status.state === 'error' && (
        <p className="ax-enter mt-2 px-1 text-[13px] text-error">{status.message}</p>
      )}
    </div>
  )
}

/** Estado de espera: tres puntos que laten, sin escribir carácter a carácter. */
function ThinkingBubble() {
  return (
    <div className="ax-enter flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl bg-surface px-4 py-4" aria-label="AXIS está pensando">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="ax-stagger-fade h-1.5 w-1.5 rounded-full bg-muted-foreground"
            style={{ '--ax-index': index } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
