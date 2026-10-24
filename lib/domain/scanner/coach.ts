/**
 * La valoración de entrenador del escáner (D-069): lo que un entrenador mide el
 * primer día y cada mes, además de mirarte.
 *
 * La foto ve la forma (postura, movimiento, proporciones), no el músculo. El
 * músculo se sigue con la **cinta** (el perímetro de brazo, pecho y muslo sí
 * crece con él) y con la **fuerza** de los tests de evolución. Este módulo lee
 * la cinta y redacta lo que dice, junto con la fuerza. Todo es puro.
 */

import { latestPerimeters, sortMeasurements, type BodyMeasurement, type PerimeterKey } from '../body/measurements'
import { daysBetween, type DayKey } from '../shared/dates'
import { TAPE_REFERENCE } from './scales'

/** Los perímetros que cuentan para el músculo, y la fuerza que los respalda. */
export const MUSCLE_TAPE: readonly { key: PerimeterKey; name: string; plural: boolean; areas: string[] }[] = [
  { key: 'brazo', name: 'tu brazo', plural: false, areas: ['empuje', 'tirón'] },
  { key: 'pecho', name: 'tu pecho', plural: false, areas: ['empuje'] },
  { key: 'muslo', name: 'tu muslo', plural: false, areas: ['piernas'] },
]

/** Lo que se pide medir en el escáner: los del músculo y la cintura, que da la proporción del pecho. */
export const SCAN_TAPE_KEYS: readonly PerimeterKey[] = ['brazo', 'pecho', 'muslo', 'cintura']

export type TapeChange = { key: PerimeterKey; from: number; to: number; days: number }

export type TapeReading = {
  /** Los últimos perímetros medidos en los últimos `recentDays`, en cm. */
  latest: Partial<Record<PerimeterKey, number>>
  /** Frente a la medida de al menos `monthGapDays` antes. */
  changes: TapeChange[]
}

/**
 * La cinta tal como estaba el día del escaneo: solo lo medido hasta ese día y
 * no más antiguo que `recentDays`. `null` si no hay ninguna medida que sirva.
 */
export function readTape(records: readonly BodyMeasurement[], today: DayKey): TapeReading | null {
  const upToToday = records.filter((r) => r.dayKey <= today)
  const latest: Partial<Record<PerimeterKey, number>> = {}
  const latestDay: Partial<Record<PerimeterKey, DayKey>> = {}
  for (const [key, value] of Object.entries(latestPerimeters(upToToday)) as [PerimeterKey, { dayKey: DayKey; cm: number }][]) {
    if (daysBetween(value.dayKey, today) <= TAPE_REFERENCE.recentDays) {
      latest[key] = value.cm
      latestDay[key] = value.dayKey
    }
  }
  if (Object.keys(latest).length === 0) return null

  const changes: TapeChange[] = []
  const sorted = sortMeasurements(upToToday).reverse()
  for (const key of SCAN_TAPE_KEYS) {
    const now = latest[key]
    const day = latestDay[key]
    if (now === undefined || !day) continue
    const before = sorted.find((r) => typeof r.perimeters[key] === 'number' && daysBetween(r.dayKey, day) >= TAPE_REFERENCE.monthGapDays)
    if (before) changes.push({ key, from: before.perimeters[key] as number, to: now, days: daysBetween(before.dayKey, day) })
  }
  return { latest, changes }
}

/**
 * La cinta de un escaneo: del historial de medidas si se tiene; si no (AXIS no
 * lo tiene), la que se guardó con el escaneo, sin cambios.
 */
export function tapeForScan(
  scan: { dayKey: DayKey; tape?: Partial<Record<PerimeterKey, number>> },
  records: readonly BodyMeasurement[] = [],
): TapeReading | null {
  return readTape(records, scan.dayKey) ?? (scan.tape && Object.keys(scan.tape).length ? { latest: { ...scan.tape }, changes: [] } : null)
}

const cm = (n: number) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} cm`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${cm(Math.abs(n))}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`)

export type TapeText = { parts: string[]; details: string[]; strengths: string[]; progress: string[] }

/**
 * Lo que dice la cinta, en la voz de AXIS: los perímetros de hoy y, frente al
 * mes anterior, lo que ha crecido. Un perímetro que crece más que su margen
 * **y** con la fuerza de esa zona subiendo es «coherente con más músculo»; sin
 * fuerza que lo respalde, se dice tal cual. La cintura se dice sin juzgarla.
 */
export function tapeText(tape: TapeReading | null, strengthUp: readonly string[], hasTestTrend: boolean): TapeText {
  if (!tape) {
    return {
      parts: ['La foto no ve el músculo; la cinta sí. Mide tu brazo, tu pecho y tu muslo y en el próximo escaneo te diré cómo crecen, junto con tu fuerza.'],
      details: [],
      strengths: [],
      progress: [],
    }
  }
  const details = SCAN_TAPE_KEYS.filter((k) => tape.latest[k] !== undefined).map((k) => `${cap(k)}: ${cm(tape.latest[k]!)}`)
  const parts: string[] = []
  const strengths: string[] = []
  const progress: string[] = []

  for (const change of tape.changes) {
    const delta = change.to - change.from
    const moved = Math.abs(delta) > TAPE_REFERENCE.changeCm[change.key]
    progress.push(`${cap(change.key)}: ${cm(change.from)} → ${cm(change.to)} (${moved ? signed(delta) : 'sin cambio'}) en ${change.days} días`)
    const muscle = MUSCLE_TAPE.find((m) => m.key === change.key)
    if (!muscle || !moved) continue
    if (delta > 0) {
      const backed = muscle.areas.filter((a) => strengthUp.includes(a))
      if (backed.length) {
        parts.push(`${cap(muscle.name)} ha crecido ${cm(delta)} y tu fuerza de ${list(backed)} ha subido: es coherente con más músculo.`)
        strengths.push(`${cap(muscle.name)} crece junto con tu fuerza (${signed(delta)})`)
      } else {
        parts.push(
          hasTestTrend
            ? `${cap(muscle.name)} ha crecido ${cm(delta)}, pero tu fuerza ahí no ha subido: no puedo atribuirlo a músculo.`
            : `${cap(muscle.name)} ha crecido ${cm(delta)}. Con el próximo test de evolución sabré si es músculo.`,
        )
      }
    } else {
      parts.push(`${cap(muscle.name)} ha bajado ${cm(-delta)} desde la medida anterior.`)
    }
  }

  if (tape.changes.length === 0) {
    parts.unshift('Con la cinta tengo tu punto de partida: el mes que viene veré cuánto crecen tu brazo, tu pecho y tu muslo, junto con tu fuerza.')
  } else if (parts.length === 0) {
    parts.push('Tus perímetros no han cambiado más que el margen de la cinta desde la medida anterior.')
  }
  return { parts, details, strengths, progress }
}
