'use client'

import { RANKS } from '@/lib/domain/progression/levels'
import { XP } from '@/lib/domain/progression/xp'
import { formatShortDate } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'

/** Cuántos niveles e hitos se enseñan: los más recientes. */
const SHOWN = 5

const RULES: readonly [string, number][] = [
  ['Sesión completada, una al día', XP.session],
  ['Semana cumplida según tu plan', XP.week],
  ['Marca personal, hasta dos al día', XP.record],
  ['Bloque cerrado con su descarga', XP.block],
  ['Test de evolución', XP.test],
  ['Cada prueba del test que mejora', XP.testImprovement],
  ['Revisión del mes: escaneo o cinta', XP.review],
]

/**
 * Tu nivel (D-071): el sitio donde se consulta la progresión entera. Todo sale
 * del historial; nada aquí se guarda aparte.
 */
export function LevelSection() {
  const { progression } = useAxtlhetics()
  const { level, rankLabel, totalXp, intoLevel, levelXp, levelsReached, milestones } = progression
  const nextRank = RANKS.find((item) => item.fromLevel > level) ?? null
  const share = Math.min(1, intoLevel / levelXp)

  return (
    <>
      <p className="mt-4 text-footnote font-medium text-muted-foreground">Tu nivel</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-headline font-bold tracking-[-0.02em]">
          Nivel {level} · {rankLabel}
        </span>
        <span className="text-caption tabular-nums text-muted-foreground">{totalXp.toLocaleString('es-ES')} XP</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-track" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-caption tabular-nums text-muted-foreground">
        {intoLevel} de {levelXp} XP para el nivel {level + 1}
        {nextRank && ` · ${nextRank.label} desde el nivel ${nextRank.fromLevel}`}
      </p>

      {levelsReached.length > 0 && (
        <>
          <p className="mt-5 text-footnote font-medium">Niveles alcanzados</p>
          <ul className="mt-2 space-y-1">
            {levelsReached.slice(0, SHOWN).map((item) => (
              <li key={item.level} className="flex justify-between text-footnote tabular-nums text-muted-foreground">
                <span>Nivel {item.level}</span>
                <span>{formatShortDate(item.dayKey)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {milestones.length > 0 && (
        <>
          <p className="mt-5 text-footnote font-medium">Hitos</p>
          <ul className="mt-2 space-y-1">
            {milestones.slice(0, SHOWN).map((event) => (
              <li key={`${event.kind}-${event.at}`} className="flex justify-between text-footnote tabular-nums text-muted-foreground">
                <span>{event.label}</span>
                <span>{formatShortDate(event.dayKey)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="mt-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-footnote font-medium text-primary">
          Cómo se ganan los XP
        </summary>
        <ul className="space-y-1">
          {RULES.map(([label, xp]) => (
            <li key={label} className="flex justify-between gap-3 text-footnote text-muted-foreground">
              <span>{label}</span>
              <span className="tabular-nums">+{xp}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption leading-relaxed text-muted-foreground text-pretty">
          Descansar no resta y no se pierden niveles. Entrenar más de lo previsto no da más XP.
        </p>
      </details>
    </>
  )
}
