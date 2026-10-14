'use client'

/**
 * Figura animada de un ejercicio (D-024, Design System §23 «Exercise Figure»).
 *
 * Un maniquí que va de la pose inicial a la final y vuelve, con los músculos que
 * trabaja en azul (principales) y azul suave (secundarios), sacados del catálogo.
 * Cada fotograma se escribe directamente en el SVG, sin pasar por React: así la
 * animación no vuelve a renderizar la pantalla del entrenamiento.
 *
 * Sin animación (`animate={false}`, «reducir movimiento» o un ejercicio de
 * mantener una posición) muestra la pose inicial quieta.
 */

import { useEffect, useMemo, useRef } from 'react'
import { findExercise } from '@/lib/domain/workouts/catalog'
import { MUSCLE_GROUP_LABELS } from '@/lib/domain/workouts/types'
import { figureShapes } from '@/lib/exercise-figure/draw'
import { musclesOf } from '@/lib/exercise-figure/muscles'
import { figureFor } from '@/lib/exercise-figure/poses'
import { CANVAS, cycleProgress, poseAt, solveSkeleton } from '@/lib/exercise-figure/skeleton'
import { shapesToSvg, type FigureColors } from '@/lib/exercise-figure/svg'
import { cn } from '@/lib/utils'

/** Tokens del Design System: ningún color propio. */
const COLORS: FigureColors = {
  body: 'var(--muted-nontext)',
  muscle: 'var(--primary)',
  prop: 'var(--track)',
  floor: 'var(--border)',
  ink: 'var(--foreground)',
}

export function hasExerciseFigure(exerciseId: string): boolean {
  return figureFor(exerciseId) !== null && findExercise(exerciseId) !== undefined
}

export function ExerciseFigure({ exerciseId, animate = true, className }: { exerciseId: string; animate?: boolean; className?: string }) {
  const spec = figureFor(exerciseId)
  const exercise = findExercise(exerciseId)
  const group = useRef<SVGGElement>(null)

  const render = useMemo(() => {
    if (!spec || !exercise) return null
    const muscles = musclesOf(exercise)
    return (progress: number) => shapesToSvg(figureShapes(spec, solveSkeleton(poseAt(spec, progress), spec.faces ?? 1, spec.view ?? 'side'), muscles), COLORS)
  }, [spec, exercise])

  // La pose inicial ya va en el HTML: se ve antes de que arranque la animación.
  const still = useMemo(() => (render ? render(0) : ''), [render])

  useEffect(() => {
    const node = group.current
    if (!render || !node || !spec || !animate || spec.frames.length === 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      node.innerHTML = render(cycleProgress(now - start))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.innerHTML = still
    }
  }, [render, still, spec, animate])

  if (!render || !exercise) return null
  const primary = exercise.primaryMuscles.map((m) => MUSCLE_GROUP_LABELS[m].toLowerCase()).join(' y ')
  return (
    <svg
      viewBox={`${CANVAS.x} ${CANVAS.y} ${CANVAS.width} ${CANVAS.height}`}
      role="img"
      aria-label={`Cómo se hace ${exercise.name.toLowerCase()}. Trabaja sobre todo ${primary}.`}
      className={cn('block', className)}
    >
      <g ref={group} dangerouslySetInnerHTML={{ __html: still }} />
    </svg>
  )
}
