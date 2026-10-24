/**
 * Preguntas por el escáner corporal (D-023).
 *
 * Desde D-041 el motor **sí** usa el escaneo: prioriza zonas, añade
 * correctivos al calentamiento y pide trabajo unilateral (revoca P-017). AXIS
 * lo cuenta aquí, y además ofrece opciones para hoy: si hay preparada una
 * sesión que trabaja una zona que el usuario quiere desarrollar, se propone
 * como cualquier otro cambio, con su botón de confirmar.
 *
 * Determinista y local: estas respuestas nunca pasan por la capa de lenguaje.
 */

import type { ScanZone } from '../../scanner/summary'
import { formatDayInSentence } from '../../shared/dates'
import { FOCUS_MUSCLE_GROUPS, type SessionFocus } from '../../workouts/types'
import type { AxisBriefing, BriefingAlternative } from '../briefing'
import { isTrainingRecommendation } from '../types'
import { normalizeQuestion } from './intents'
import type { AxisAnswer, AxisIntent } from './types'

/** «escaneo», «escáner», «mi físico», «mi simetría», «mis proporciones». */
const SCAN_TERMS = /\b(escane[oa]s?|escaner|escanear|mi fisico|mi simetria|mis proporciones|mi complexion)\b/

/** Seguimientos que solo se entienden si se venía hablando del escaneo. */
const FOLLOW_UP = /\b(que opciones|mis opciones|que hago|que puedo hacer|y ahora que|como mejoro|que me recomiendas)\b/

export function asksAboutScan(question: string, lastIntent: AxisIntent | null): boolean {
  const text = normalizeQuestion(question)
  if (SCAN_TERMS.test(text)) return true
  return lastIntent === 'scan' && FOLLOW_UP.test(text)
}

const ZONE_GROUP: Record<ScanZone, string> = {
  pecho: 'pecho',
  espalda: 'espalda',
  hombros: 'hombros',
  brazos: 'brazos',
  piernas: 'piernas',
  core: 'core',
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`)

/** Las zonas que una sesión de ese foco trabaja, de entre las que el usuario quiere desarrollar. */
function zonesTrained(focus: SessionFocus | null, zones: readonly ScanZone[]): ScanZone[] {
  if (!focus) return []
  const groups = FOCUS_MUSCLE_GROUPS[focus] as readonly string[]
  return zones.filter((zone) => groups.includes(ZONE_GROUP[zone]))
}

export function answerScan(briefing: AxisBriefing): AxisAnswer {
  const scan = briefing.scan
  if (!scan) {
    return {
      text: 'Todavía no tienes ningún escaneo corporal. Lo encuentras en Entrenamiento, junto al test de evolución: son dos preguntas, tu cinta y cinco fotos que se analizan en tu móvil, sin salir de él.',
      intent: 'scan',
      unknown: true,
    }
  }

  const parts = [`En tu escaneo del ${formatDayInSentence(scan.dayKey)}: ${scan.overview}`]
  if (scan.comparison) {
    const moved = scan.comparison.changes.slice(0, 2).map((c) => c.charAt(0).toLowerCase() + c.slice(1))
    parts.push(`${scan.comparison.headline}${moved.length ? ` Lo más destacado: ${list(moved)}.` : ''}`)
  }
  const options: string[] = []
  let proposed: BriefingAlternative | null = null

  const proposal = briefing.proposal
  const todayFocus = proposal && isTrainingRecommendation(proposal.type) ? proposal.session?.focus ?? null : null
  const covered = zonesTrained(todayFocus, scan.weakZones)

  if (scan.weakZones.length) {
    if (covered.length) {
      options.push(`seguir con la sesión de hoy, que ya trabaja ${list(covered.map((z) => ZONE_GROUP[z]))}`)
    } else {
      // Una alternativa de hoy, ya preparada por el motor, que trabaje alguna zona floja.
      const candidate =
        proposal?.alternatives.find(
          (alt) => isTrainingRecommendation(alt.type) && alt.focus !== todayFocus && zonesTrained(alt.focus, scan.weakZones).length > 0,
        ) ?? null
      if (candidate) {
        proposed = candidate
        options.push(`cambiar hoy a «${candidate.label}», que trabaja ${list(zonesTrained(candidate.focus, scan.weakZones).map((z) => ZONE_GROUP[z]))}`)
      }
      options.push(todayFocus ? 'seguir con la sesión de hoy tal como está' : 'respetar el descanso de hoy y trabajarlo en tu próxima sesión')
    }
  }
  // Con plan, los pasos ya los hace el motor: no son opciones, y no se repiten (D-041).
  if (!scan.plan) for (const action of scan.actions.slice(0, 2)) options.push(`${action.charAt(0).toLowerCase()}${action.slice(1).replace(/\.$/, '')}`)

  // Lo que el escaneo ya hace en tus sesiones, sin que tengas que pedirlo (D-041).
  if (scan.plan) parts.push(`Con tu escaneo ya ajusto tus sesiones: ${scan.plan}. El detalle, en el resumen del escaneo.`)

  if (options.length) {
    parts.push(
      options.length === 1
        ? `Para hoy: ${options[0]}.`
        : `Tus opciones: ${options.map((o, i) => `${i + 1}) ${o}`).join('; ')}. Tú decides.`,
    )
  } else {
    parts.push('No veo nada que cambiar: seguir entrenando con constancia es lo que más te hará avanzar.')
  }

  return {
    text: parts.join(' '),
    intent: 'scan',
    unknown: false,
    proposedTarget: proposed ? { type: proposed.type, focus: proposed.focus } : null,
    proposedReason: proposed ? 'Trabaja una zona que quieres desarrollar según tu escaneo corporal.' : undefined,
  }
}

/** Lo que reconoce la respuesta sobre el escáner, como vocabulario del corrector de faltas (D-026). */
export const SCAN_VOCABULARY: readonly RegExp[] = [SCAN_TERMS, FOLLOW_UP]
