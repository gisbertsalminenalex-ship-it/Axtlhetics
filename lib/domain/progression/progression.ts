/**
 * Tu nivel (D-071): lo que enseñan Inicio, el resumen de la sesión y «Tu
 * progreso», todo sacado de `xpLedger`.
 *
 * AXIS reconoce con hechos, no con cumplidos: «Has completado las cuatro
 * sesiones previstas esta semana», nunca «¡Increíble!». Las frases y los XP
 * salen de aquí, deterministas; la IA no decide cuántos XP da nada.
 */

import type { DayKey } from '../shared/dates'
import { levelState, rankOf, type LevelState } from './levels'
import { totalXp, xpLedger, type XpEvent, type XpInput } from './xp'

export type LevelReached = { level: number; dayKey: DayKey }

export type Progression = LevelState & {
  events: XpEvent[]
  /** Cada nivel alcanzado desde el 2, del más reciente al más antiguo. */
  levelsReached: LevelReached[]
  /** Bloques cerrados y tests hechos, del más reciente al más antiguo. */
  milestones: XpEvent[]
}

export function progression(input: XpInput): Progression {
  const events = xpLedger(input)
  const levelsReached: LevelReached[] = []
  let running = 0
  let level = 1
  for (const event of events) {
    running += event.xp
    const now = levelState(running).level
    for (let reached = level + 1; reached <= now; reached++) levelsReached.push({ level: reached, dayKey: event.dayKey })
    level = now
  }
  return {
    ...levelState(totalXp(events)),
    events,
    levelsReached: levelsReached.reverse(),
    milestones: events.filter((event) => event.kind === 'block' || event.kind === 'test').reverse(),
  }
}

export type SessionAward = {
  events: XpEvent[]
  xp: number
  levelBefore: number
  levelAfter: number
  /** El rango nuevo, si la sesión lo cambió. */
  newRank: string | null
  /** Lo que AXIS dice, con hechos. Vacío si no hay nada que reconocer. */
  facts: string[]
}

const NUMBER_WORDS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']

/** Los XP que ganó una sesión y lo que cambiaron. */
export function sessionAward(sessionId: string, progress: Progression, plannedDaysPerWeek: number): SessionAward {
  const events = progress.events.filter((event) => event.sessionId === sessionId)
  const xp = totalXp(events)
  const upToSession = totalXp(progress.events.slice(0, lastIndexOf(progress.events, sessionId) + 1))
  const levelAfter = levelState(upToSession).level
  const levelBefore = levelState(upToSession - xp).level
  const rankBefore = rankOf(levelBefore)
  const rankAfter = rankOf(levelAfter)

  const facts: string[] = []
  if (events.some((event) => event.kind === 'week')) {
    const planned = Math.round(plannedDaysPerWeek)
    facts.push(
      planned === 1
        ? 'Has completado la sesión prevista esta semana.'
        : `Has completado las ${NUMBER_WORDS[planned] ?? planned} sesiones previstas esta semana.`,
    )
  }
  if (events.some((event) => event.kind === 'block')) facts.push('Has cerrado tu bloque de entrenamiento.')
  if (levelAfter > levelBefore) facts.push(`Subes al nivel ${levelAfter}.`)

  return {
    events,
    xp,
    levelBefore,
    levelAfter,
    newRank: rankAfter.rank !== rankBefore.rank ? rankAfter.label : null,
    facts,
  }
}

function lastIndexOf(events: readonly XpEvent[], sessionId: string): number {
  for (let index = events.length - 1; index >= 0; index--) if (events[index].sessionId === sessionId) return index
  return -1
}
