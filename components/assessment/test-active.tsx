'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { RestTimer } from '@/components/workout/rest-timer'
import { ValueStepper } from '@/components/workout/value-stepper'
import { assessmentRestState, currentSide, currentTest } from '@/lib/domain/assessment/assessment'
import {
  ASSESSMENT_PROTOCOL,
  exerciseIdFor,
  isValidAssessmentValue,
  MAX_ASSESSMENT_VALUE,
  type AssessmentMeasure,
  type AssessmentTest,
} from '@/lib/domain/assessment/protocol'
import type { Assessment } from '@/lib/domain/assessment/types'
import { formatDuration } from '@/lib/domain/shared/dates'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { cn } from '@/lib/utils'

const UNIT: Record<AssessmentMeasure, string> = { reps: 'repeticiones', seconds: 'segundos' }

function testName(test: AssessmentTest, assessment: Assessment): string {
  return test.key === 'push' ? (findExercise(exerciseIdFor(test, assessment.pushUpVariantId))?.name ?? test.name) : test.name
}

/**
 * Una prueba del test en curso (D-021). La protagonista es la prueba: su nombre,
 * qué hacer y su resultado. Nada de volumen, carga ni estadísticas.
 *
 * Tras registrar una prueba que no es la última, el dominio arranca el descanso
 * y aquí se enseña el descanso compartido; al acabar, vuelve sola a la prueba
 * siguiente. El orden, los lados y el final los decide el dominio.
 */
export function TestActive({
  assessment,
  onRecord,
  onUndoLeft,
  onSkipRest,
  onExtendRest,
  onExit,
}: {
  assessment: Assessment
  onRecord: (value: number) => Promise<boolean>
  onUndoLeft: () => void
  onSkipRest: () => void
  onExtendRest: () => void
  onExit: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  // «Corregir» devuelve al lado izquierdo: se parte del valor que se corrige,
  // no de 0. El dominio no lo guarda al deshacer; basta con recordarlo aquí.
  const [correctingLeft, setCorrectingLeft] = useState<number | null>(null)

  const test = currentTest(assessment)
  if (!test) return null

  const rest = assessmentRestState(assessment, now)
  const index = assessment.results.length
  const side = currentSide(assessment)

  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <header className="flex items-center justify-between pt-2 pb-3">
        <button type="button" onClick={onExit} aria-label="Salir del test" className="ax-press -ml-2 flex h-11 w-11 items-center justify-center">
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        <span className="text-footnote font-semibold text-muted-foreground tabular-nums">
          {/* En el descanso ninguna prueba está activa: se cuentan las hechas. */}
          {rest
            ? `${index} de ${ASSESSMENT_PROTOCOL.length} completadas`
            : `Prueba ${index + 1} de ${ASSESSMENT_PROTOCOL.length}`}
        </span>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {ASSESSMENT_PROTOCOL.map((item, position) => (
          <span key={item.key} className={cn('h-1 rounded-full', (rest ? position < index : position <= index) ? 'bg-primary' : 'bg-track')} />
        ))}
      </div>

      {rest ? (
        <RestTimer
          rest={rest}
          nextLabel={`Siguiente prueba · ${index + 1} de ${ASSESSMENT_PROTOCOL.length}`}
          nextName={testName(test, assessment)}
          nextDetail={`${UNIT[test.measure]}${test.perSide ? ' por lado' : ''}`}
          onSkip={onSkipRest}
          onExtend={onExtendRest}
        />
      ) : (
        <TestBody
          key={`${test.key}-${side ?? 'single'}`}
          assessment={assessment}
          test={test}
          side={side}
          initialValue={side === 'left' ? (correctingLeft ?? 0) : 0}
          onRecord={onRecord}
          onUndoLeft={() => {
            setCorrectingLeft(assessment.pendingLeft)
            onUndoLeft()
          }}
        />
      )}
    </div>
  )
}

function TestBody({
  assessment,
  test,
  side,
  initialValue,
  onRecord,
  onUndoLeft,
}: {
  assessment: Assessment
  test: AssessmentTest
  side: 'left' | 'right' | null
  initialValue: number
  onRecord: (value: number) => Promise<boolean>
  onUndoLeft: () => void
}) {
  const [saving, setSaving] = useState(false)
  const submit = async (value: number) => {
    setSaving(true)
    await onRecord(value)
    setSaving(false)
  }

  return (
    <section className="ax-enter flex flex-1 flex-col">
      <p className="mt-8 text-caption font-semibold tracking-[0.14em] text-muted-foreground uppercase">{test.area}</p>
      <h1 className="mt-1.5 text-title-lg font-bold leading-[1.1] tracking-[-0.03em]">{testName(test, assessment)}</h1>
      <p className="mt-3 text-callout leading-relaxed text-pretty">{test.instruction}</p>

      {test.perSide && (
        <SidesRow assessment={assessment} side={side} onUndoLeft={onUndoLeft} />
      )}

      {test.measure === 'seconds' ? (
        <Stopwatch saving={saving} onFinish={submit} />
      ) : (
        <RepsEntry
          measure={test.measure}
          label={side === 'left' ? 'Lado izquierdo' : side === 'right' ? 'Lado derecho' : 'Resultado'}
          initial={initialValue}
          saving={saving}
          onFinish={submit}
        />
      )}
    </section>
  )
}

/** Remo: los dos lados, simétricos. El izquierdo, una vez registrado, se puede corregir. */
function SidesRow({
  assessment,
  side,
  onUndoLeft,
}: {
  assessment: Assessment
  side: 'left' | 'right' | null
  onUndoLeft: () => void
}) {
  const left = assessment.pendingLeft
  return (
    <div className="mt-6 grid grid-cols-2 divide-x divide-border border-y border-border text-center">
      <div className="py-3">
        <p className="text-caption font-medium text-muted-foreground">Izquierdo</p>
        <p className={cn('mt-0.5 text-body font-semibold tabular-nums', side === 'left' && 'text-primary')}>
          {left !== null ? `${left} reps` : side === 'left' ? 'Ahora' : '—'}
        </p>
        {left !== null && (
          <button type="button" onClick={onUndoLeft} className="ax-press min-h-11 px-2 text-footnote font-semibold text-primary">
            Corregir
          </button>
        )}
      </div>
      <div className="py-3">
        <p className="text-caption font-medium text-muted-foreground">Derecho</p>
        <p className={cn('mt-0.5 text-body font-semibold tabular-nums', side === 'right' && 'text-primary')}>
          {side === 'right' ? 'Ahora' : '—'}
        </p>
      </div>
    </div>
  )
}

/** Un número editable con − y +, sin el tope de 50 del entrenamiento. */
function useResultValue(measure: AssessmentMeasure, initial = 0) {
  const [text, setText] = useState(String(initial))
  const value = text === '' ? NaN : Number(text)
  const valid = isValidAssessmentValue(value, measure)
  const set = (next: number) => setText(String(Math.min(MAX_ASSESSMENT_VALUE[measure], Math.max(0, next))))
  return {
    text,
    value,
    valid,
    onInput: (raw: string) => setText(raw.replace(/\D/g, '').slice(0, 4)),
    decrease: () => set((Number.isFinite(value) ? value : 0) - 1),
    increase: () => set((Number.isFinite(value) ? value : 0) + 1),
    set,
  }
}

function RepsEntry({
  measure,
  label,
  initial = 0,
  saving,
  onFinish,
}: {
  measure: AssessmentMeasure
  label: string
  initial?: number
  saving: boolean
  onFinish: (value: number) => void
}) {
  const result = useResultValue(measure, initial)
  return (
    <div className="mt-auto pt-8">
      <p className="mb-2 text-center text-footnote font-semibold text-muted-foreground">{label}</p>
      <ValueStepper
        value={result.text}
        unit={UNIT[measure]}
        onInput={result.onInput}
        inputLabel={`${label}, en ${UNIT[measure]}`}
        onDecrease={result.decrease}
        onIncrease={result.increase}
        decreaseLabel="Una menos"
        increaseLabel="Una más"
      />
      <FinishButton
        label={label === 'Lado izquierdo' ? 'Guardar lado izquierdo' : 'Terminar prueba'}
        disabled={!result.valid || saving}
        onClick={() => onFinish(result.value)}
      />
    </div>
  )
}

/**
 * Cronómetro integrado para la plancha y la sentadilla en pared. Al parar, el
 * resultado se puede corregir antes de registrarlo.
 *
 * Riesgo conocido y aceptado (revisión de D-021): el cronómetro vive solo en el
 * estado de este componente. Si la app se recarga con la prueba cronometrada en
 * marcha, la medición se pierde y hay que repetirla; el test y lo ya registrado
 * se conservan. Guardarlo con el test es una mejora pendiente de decisión.
 */
function Stopwatch({ saving, onFinish }: { saving: boolean; onFinish: (value: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [stopped, setStopped] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const result = useResultValue('seconds')

  useEffect(() => {
    if (startedAt === null || stopped) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [startedAt, stopped])

  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))

  if (stopped) {
    return (
      <div className="mt-auto pt-8">
        <p className="mb-2 text-center text-footnote font-semibold text-muted-foreground">Resultado · puedes corregirlo</p>
        <ValueStepper
          value={result.text}
          unit="segundos"
          onInput={result.onInput}
          inputLabel="Resultado, en segundos"
          onDecrease={result.decrease}
          onIncrease={result.increase}
          decreaseLabel="Un segundo menos"
          increaseLabel="Un segundo más"
        />
        <FinishButton disabled={!result.valid || saving} onClick={() => onFinish(result.value)} />
        <button
          type="button"
          onClick={() => {
            setStartedAt(null)
            setStopped(false)
          }}
          className="ax-press mt-2 min-h-11 w-full text-subhead font-semibold text-muted-foreground"
        >
          Repetir cronómetro
        </button>
      </div>
    )
  }

  return (
    <div className="mt-auto flex flex-col items-center pt-8">
      <span role="timer" aria-live="off" className="text-hero font-bold leading-none tracking-[-0.04em] tabular-nums">
        {formatDuration(elapsed)}
      </span>
      <p className="mt-2 text-subhead text-muted-foreground">
        {startedAt === null ? 'Ponte en posición y empieza' : 'Para cuando la técnica deje de ser válida'}
      </p>
      {startedAt === null ? (
        <button
          type="button"
          onClick={() => {
            const start = Date.now()
            setNow(start)
            setStartedAt(start)
          }}
          className="ax-press mt-8 h-[52px] w-full rounded-2xl bg-primary text-callout font-semibold text-primary-foreground"
        >
          Empezar cronómetro
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            result.set(elapsed)
            setStopped(true)
          }}
          className="ax-press mt-8 h-[52px] w-full rounded-2xl bg-foreground text-callout font-semibold text-background"
        >
          Parar
        </button>
      )}
    </div>
  )
}

function FinishButton({
  label = 'Terminar prueba',
  disabled,
  onClick,
}: {
  label?: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="ax-press mt-5 h-[52px] w-full rounded-2xl bg-primary text-callout font-semibold text-primary-foreground disabled:opacity-50"
    >
      {label}
    </button>
  )
}
