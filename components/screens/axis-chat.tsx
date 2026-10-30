'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowUp, ArrowUpRight, Check } from 'lucide-react'
import { AxisMark } from '@/components/axis-mark'
import { EmptyNote } from '@/components/section-header'
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
    axisFallback,
    axisSuggestions,
    askAxis,
    briefing,
    axisNote,
  } = useAxtlhetics()

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  const thinking = axisStatus === 'thinking'
  const isEmpty = axisMessages.length === 0
  const lastMessage = axisMessages[axisMessages.length - 1]
  const lastFollowUps = lastMessage?.role === 'axis' && !lastMessage.action ? (lastMessage.followUps ?? []) : []

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
    <div className="flex flex-1 flex-col px-5">
      {/* Header */}
      <header className="flex items-center justify-between pt-2 pb-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="ax-press -ml-2 flex h-11 w-11 items-center justify-center"
        >
          <ArrowLeft className="h-[22px] w-[22px] text-foreground" strokeWidth={1.75} />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <div className="flex items-center gap-2">
            <AxisMark className="h-4 w-4 text-primary" />
            <h1 className="text-callout font-semibold tracking-[0.08em]">AXIS</h1>
          </div>
          <p className="text-overline text-muted-foreground">
            Tu guía de entrenamiento y recuperación
          </p>
        </div>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      {/* Conversación vacía: quién es AXIS y qué se le puede preguntar */}
      {isEmpty && (
        <div className="ax-enter flex flex-1 flex-col justify-center py-6">
          {/* La marca de AXIS sobre su superficie, la misma tinta de su tarjeta en Inicio (D-075). */}
          <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-ink">
            <span aria-hidden="true" className="absolute -top-6 -right-6 h-14 w-14 rounded-full bg-primary/40 blur-xl" />
            <AxisMark className="relative h-6 w-6 text-white" />
          </span>
          <h2 className="mt-6 text-title-lg font-bold text-balance">Pregúntame por tu día.</h2>
          <p className="mt-3 text-callout text-muted-foreground text-pretty">
            Respondo con tus datos: tu recuperación, tu historial, tu calendario y la
            sesión que te he propuesto. Si no tengo un dato, te lo digo.
          </p>

          {/* Lo que AXIS quería decirte (D-038): el punto de partida de la conversación. */}
          {axisNote && (
            <p className="mt-5 flex items-start gap-3 rounded-2xl bg-surface p-4 text-subhead text-foreground/80 text-pretty">
              <AxisMark className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{axisNote.text}</span>
            </p>
          )}

          {axisSuggestions.length > 0 && (
            <ul className="mt-7 overflow-hidden rounded-2xl border border-border">
              {axisSuggestions.map((suggestion, index) => (
                <li
                  key={suggestion.question}
                  className="ax-stagger border-b border-border last:border-b-0"
                  style={{ '--ax-index': index } as CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => void send(suggestion.question)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-callout font-medium transition-colors duration-150 active:bg-surface"
                  >
                    <span className="flex-1">{suggestion.label}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-nontext" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!briefing && (
            <EmptyNote className="mt-7">Todavía estoy cargando tus datos.</EmptyNote>
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
                    'rounded-3xl px-4 py-3 text-callout text-pretty',
                    message.role === 'user'
                      ? 'rounded-br-lg bg-primary text-primary-foreground'
                      : 'rounded-bl-lg bg-surface text-foreground',
                  )}
                >
                  {message.text}
                </div>

                {message.action && <ActionCard action={message.action} />}
              </div>
            </div>
          ))}

          {/* Lo que podría preguntar a continuación (D-070): solo bajo la última respuesta de AXIS. */}
          {!thinking && lastFollowUps.length > 0 && (
            <div className="ax-enter flex flex-wrap gap-2">
              {lastFollowUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void send(question)}
                  className="ax-press min-h-10 rounded-full border border-secondary bg-background px-4 text-left text-footnote font-medium text-primary"
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          {thinking && <ThinkingBubble />}

          {axisError && (
            <div className="ax-enter rounded-2xl bg-surface p-4">
              <p className="text-subhead font-medium">AXIS no ha podido responder.</p>
              <p className="mt-1 text-footnote text-muted-foreground">{axisError}</p>
            </div>
          )}

          <div ref={endRef} />
        </div>
      )}

      {/* Aviso honesto cuando la IA falla y responde el motor local */}
      {axisFallback && (
        <p className="pb-2 text-center text-caption text-muted-foreground">
          {axisFallback === 'offline'
            ? 'Sin conexión: respondo con tus datos locales.'
            : 'Respuesta directa con tus datos.'}
        </p>
      )}

      {/*
        Input. Pegado abajo aunque la conversación sea corta o larga; el campo y
        el botón de enviar van dentro de la misma pastilla.
      */}
      <form onSubmit={onSubmit} className="sticky bottom-0 -mx-5 bg-background px-5 pt-2 pb-5">
        <div className="flex items-center gap-2 rounded-full border border-transparent bg-surface py-1.5 pr-1.5 pl-5 transition-colors focus-within:border-primary/40">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Pregúntale algo a AXIS…"
            aria-label="Escribe tu pregunta"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 bg-transparent text-callout outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={thinking || draft.trim().length === 0}
            aria-label="Enviar"
            className="ax-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity duration-200 disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
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
  const { axisActionStatuses, confirmAxisAction, cancelAxisAction, canUndoAxisAction, undoAxisAction } =
    useAxtlhetics()
  const [working, setWorking] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)

  const status = axisActionStatuses[action.id] ?? { state: 'pending' as const }

  if (status.state === 'applied') {
    // Solo la última acción del día, y solo antes de empezar a entrenar (D-022).
    const undoable = canUndoAxisAction(action.id)
    return (
      <div className="ax-enter mt-2">
        <p className="flex min-h-11 items-center gap-2 rounded-full bg-success/10 px-4 text-subhead font-semibold text-success">
          <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          Cambio aplicado
        </p>
        {undoable && (
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              setWorking(true)
              setUndoError(await undoAxisAction(action))
              setWorking(false)
            }}
            className="ax-press mt-1 min-h-11 px-1 text-footnote font-semibold text-muted-foreground disabled:opacity-50"
          >
            {working ? 'Deshaciendo…' : 'Deshacer cambio'}
          </button>
        )}
        {undoError && <p className="ax-enter px-1 text-footnote text-error">{undoError}</p>}
      </div>
    )
  }

  if (status.state === 'undone') {
    return (
      <p className="mt-2 px-1 text-footnote text-muted-foreground">
        Cambio deshecho: todo vuelve a como estaba.
      </p>
    )
  }

  if (status.state === 'cancelled') {
    return (
      <p className="mt-2 px-1 text-footnote text-muted-foreground">
        No se ha cambiado nada.
      </p>
    )
  }

  // Otra propuesta se aplicó después: esta partía de una sesión que ya no es la que hay.
  if (status.state === 'superseded') {
    return (
      <p className="mt-2 px-1 text-footnote text-muted-foreground">
        Ya aplicaste otro cambio después de esta propuesta.
      </p>
    )
  }

  return (
    <div className="mt-2">
      <p className="px-1 text-footnote text-muted-foreground">{action.summary}</p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={working}
          onClick={async () => {
            setWorking(true)
            await confirmAxisAction(action)
            setWorking(false)
          }}
          className="ax-press flex h-12 flex-1 items-center justify-center rounded-full bg-primary px-4 text-subhead font-semibold text-primary-foreground disabled:opacity-50"
        >
          {working ? 'Aplicando…' : action.label}
        </button>
        <button
          type="button"
          onClick={() => cancelAxisAction(action)}
          disabled={working}
          className="ax-press h-12 rounded-full bg-surface px-5 text-subhead font-medium text-muted-foreground disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>

      {status.state === 'error' && (
        <p className="ax-enter mt-2 px-1 text-footnote text-error">{status.message}</p>
      )}
    </div>
  )
}

/** Estado de espera: tres puntos que laten, sin escribir carácter a carácter. */
function ThinkingBubble() {
  return (
    <div className="ax-enter flex justify-start">
      <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg bg-surface px-5 py-4" aria-label="AXIS está pensando">
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
