'use client'

import { AssessmentResults } from '@/components/assessment/assessment-results'
import { AxisMark } from '@/components/axis-mark'
import { TargetRecommendations } from '@/components/assessment/target-recommendations'
import { isFirstCompletedTest } from '@/lib/domain/assessment/targets'
import { ASSESSMENT_PROTOCOL_VERSION } from '@/lib/domain/assessment/protocol'
import { summarizeAssessment } from '@/lib/domain/assessment/summary'
import type { Assessment } from '@/lib/domain/assessment/types'
import { assessmentClosingMessage } from '@/lib/domain/axis/assessment-closing'
import { formatDayInSentence } from '@/lib/domain/shared/dates'

/**
 * El final del test (D-021): la evolución es la protagonista. Las cuatro
 * pruebas con su diferencia frente al test anterior y la mejor marca en test, y
 * el cierre determinista de AXIS. Sin récords de entrenamiento, volumen, carga
 * ni puntuación.
 */
export function TestSummary({
  assessment,
  history,
  onDone,
}: {
  assessment: Assessment
  history: readonly Assessment[]
  onDone: () => void
}) {
  const summary = summarizeAssessment(assessment, history)
  if (!summary) return null
  const day = formatDayInSentence(assessment.dayKey)

  return (
    <div className="flex min-h-full flex-col px-5 pb-8">
      <p className="mt-8 text-footnote text-muted-foreground">
        {day.charAt(0).toUpperCase() + day.slice(1)} · Protocolo {ASSESSMENT_PROTOCOL_VERSION}
      </p>
      <h1 className="mt-1 text-title-lg font-bold">Test completado</h1>

      <div className="mt-4 flex items-start gap-2">
        <AxisMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-subhead leading-relaxed text-muted-foreground text-pretty">
          {assessmentClosingMessage(summary.comparisons)}
        </p>
      </div>

      <div className="mt-6">
        <AssessmentResults rows={summary.rows} />
      </div>

      {/* Con el primer test, AXIS propone objetivos medibles (D-040). */}
      {isFirstCompletedTest(assessment, history) && <TargetRecommendations assessment={assessment} />}

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onDone}
          className="ax-press h-[52px] w-full rounded-full bg-primary text-callout font-semibold text-primary-foreground"
        >
          Hecho
        </button>
      </div>
    </div>
  )
}
