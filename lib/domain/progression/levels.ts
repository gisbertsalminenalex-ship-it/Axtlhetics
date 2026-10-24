/**
 * La curva de niveles y los rangos (D-071).
 *
 * Cada nivel cuesta 100 XP más que el anterior: el 1 → 2 cuesta 400, el
 * 2 → 3, 500… La curva es lineal a propósito: al principio se sube más o
 * menos cada semana y cada nivel cuesta algo más, pero los avanzados no se
 * vuelven inalcanzables. Las semanas que tarda cada perfil están simuladas en
 * `levels.test.ts`.
 */

/** Lo que cuesta subir del nivel 1 al 2. */
export const FIRST_LEVEL_XP = 400

/** Lo que cuesta de más cada nivel siguiente. */
export const LEVEL_STEP_XP = 100

/** XP para pasar de `level` a `level + 1`. */
export function levelCost(level: number): number {
  return FIRST_LEVEL_XP + LEVEL_STEP_XP * (Math.max(1, Math.floor(level)) - 1)
}

/** XP acumulados que hacen falta para estar en `level`. El nivel 1 empieza en 0. */
export function xpToReach(level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1
  return FIRST_LEVEL_XP * n + (LEVEL_STEP_XP * n * (n - 1)) / 2
}

export type Rank = 'arranque' | 'plata' | 'oro' | 'legendario' | 'prime'

/** Los rangos, de menor a mayor, con el primer nivel de cada uno. */
export const RANKS: readonly { rank: Rank; label: string; fromLevel: number }[] = [
  { rank: 'arranque', label: 'Arranque', fromLevel: 1 },
  { rank: 'plata', label: 'Plata', fromLevel: 5 },
  { rank: 'oro', label: 'Oro', fromLevel: 10 },
  { rank: 'legendario', label: 'Legendario', fromLevel: 20 },
  { rank: 'prime', label: 'Prime', fromLevel: 35 },
]

export function rankOf(level: number): (typeof RANKS)[number] {
  return [...RANKS].reverse().find((item) => level >= item.fromLevel) ?? RANKS[0]
}

export type LevelState = {
  level: number
  rank: Rank
  rankLabel: string
  /** XP acumulados en total. */
  totalXp: number
  /** XP dentro del nivel actual. */
  intoLevel: number
  /** XP que cuesta el nivel actual entero. */
  levelXp: number
}

/** El nivel que dan unos XP acumulados. */
export function levelState(totalXp: number): LevelState {
  const xp = Math.max(0, Math.floor(totalXp))
  let level = 1
  while (xpToReach(level + 1) <= xp) level += 1
  const { rank, label } = rankOf(level)
  return { level, rank, rankLabel: label, totalXp: xp, intoLevel: xp - xpToReach(level), levelXp: levelCost(level) }
}
