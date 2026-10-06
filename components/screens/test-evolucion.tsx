'use client'

import { useState } from 'react'
import { TestActive } from '@/components/assessment/test-active'
import { TestIntro } from '@/components/assessment/test-intro'
import { TestSummary } from '@/components/assessment/test-summary'
import { Confirmation } from '@/components/workout/confirmation'
import { useAxtlhetics } from '@/lib/state/store'

/**
 * El flujo del test de evolución (D-021), dentro de Entrenamiento: introducción,
 * prueba, descanso, siguiente prueba y resumen. Qué se ve sale del estado del
 * test: uno a medias de hoy se reanuda donde estaba; uno recién completado,
 * su resumen. Sin pestaña ni sección propia.
 */
export function TestEvolucionScreen({ onClose }: { onClose: () => void }) {
  const { assessments } = useAxtlhetics()
  const [confirmingExit, setConfirmingExit] = useState(false)

  if (assessments.summary) {
    return (
      <TestSummary
        assessment={assessments.summary}
        history={assessments.assessments}
        onDone={() => {
          assessments.dismissSummary()
          onClose()
        }}
      />
    )
  }

  const active = assessments.active
  if (!active) {
    return <TestIntro onStart={(variant) => void assessments.start(variant)} onBack={onClose} />
  }

  const done = active.results.length
  const hasProgress = done > 0 || active.pendingLeft !== null

  if (confirmingExit) {
    return (
      <Confirmation
        title="¿Salir del test?"
        body={
          <>
            Has hecho{' '}
            <span className="font-semibold text-foreground tabular-nums">{done} de 4 pruebas</span>. Si sales, el test
            queda interrumpido: no podrás continuarlo y no se comparará con los demás. Si solo necesitas una pausa, no
            salgas: cierra la app y hoy seguirás donde lo dejaste.
          </>
        }
        stayLabel="Seguir con el test"
        leaveLabel="Salir del test"
        leaveTone="error"
        onStay={() => setConfirmingExit(false)}
        onLeave={async () => {
          await assessments.interrupt()
          setConfirmingExit(false)
          onClose()
        }}
      />
    )
  }

  return (
    <TestActive
      assessment={active}
      onRecord={assessments.record}
      onUndoLeft={() => void assessments.undoLeftSide()}
      onSkipRest={() => void assessments.skipRest()}
      onExtendRest={() => void assessments.extendRest()}
      onExit={async () => {
        // Sin nada registrado no hay nada que perder: se sale sin preguntar.
        if (hasProgress) {
          setConfirmingExit(true)
          return
        }
        await assessments.interrupt()
        onClose()
      }}
    />
  )
}
