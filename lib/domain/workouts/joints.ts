/**
 * Qué articulaciones carga cada ejercicio (D-051).
 *
 * Es lo que permite cuidar una zona: con la rodilla marcada en el perfil, AXIS
 * deja fuera lo que la carga. Son datos, como las figuras: un test exige que
 * todo el catálogo tenga su entrada. «Carga» es poner peso, apoyo o impacto
 * relevante sobre la articulación, no solo moverla.
 */

import type { CareZone } from '../profile/types'

export const EXERCISE_JOINTS: Readonly<Record<string, readonly CareZone[]>> = {
  // --- Empuje ----------------------------------------------------------------
  'flexiones-inclinadas': ['hombro', 'codo', 'muneca'],
  'flexiones-negativas': ['hombro', 'codo', 'muneca'],
  flexiones: ['hombro', 'codo', 'muneca'],
  'flexiones-diamante': ['hombro', 'codo', 'muneca'],
  'flexiones-rodillas': ['hombro', 'codo', 'muneca', 'rodilla'],
  'flexiones-declinadas': ['hombro', 'codo', 'muneca'],
  'flexion-pica': ['hombro', 'codo', 'muneca', 'cuello'],
  'press-hombro-unilateral': ['hombro', 'codo'],
  'extension-triceps-unilateral': ['codo', 'hombro'],
  'press-suelo-unilateral': ['hombro', 'codo'],
  'patada-triceps-unilateral': ['codo'],

  // --- Tirón -----------------------------------------------------------------
  superman: ['espalda_baja', 'cuello'],
  'remo-unilateral': ['hombro', 'codo'],
  'remo-renegado': ['hombro', 'codo', 'muneca', 'espalda_baja'],
  'curl-biceps-unilateral': ['codo', 'muneca'],
  'ytw-boca-abajo': ['hombro'],
  'pullover-con-pesa': ['hombro'],
  'curl-martillo-unilateral': ['codo', 'muneca'],

  // --- Piernas ---------------------------------------------------------------
  sentadilla: ['rodilla', 'cadera'],
  'sentadilla-con-pesa': ['rodilla', 'cadera', 'espalda_baja'],
  zancadas: ['rodilla', 'cadera', 'tobillo'],
  'zancada-atras': ['rodilla', 'cadera'],
  'zancada-bulgara': ['rodilla', 'cadera', 'tobillo'],
  'peso-muerto-unilateral': ['espalda_baja', 'cadera', 'tobillo'],
  'puente-gluteos': ['cadera'],
  'elevacion-gemelos': ['tobillo'],
  'elevacion-gemelos-una-pierna': ['tobillo'],
  'sentadilla-isometrica-pared': ['rodilla'],
  'subida-escalon': ['rodilla', 'cadera'],
  'puente-talones-silla': ['cadera', 'rodilla'],
  'hip-thrust-con-pesa': ['cadera', 'espalda_baja'],
  'zancada-lateral': ['rodilla', 'cadera', 'tobillo'],

  // --- Core ------------------------------------------------------------------
  'dead-bug': [],
  'bird-dog': ['muneca', 'rodilla'],
  plancha: ['hombro', 'espalda_baja'],
  'plancha-lateral': ['hombro'],
  'hollow-hold': ['espalda_baja', 'cuello'],
  'plancha-toque-hombro': ['hombro', 'muneca'],

  // --- Pliometría ------------------------------------------------------------
  'saltos-tobillo': ['tobillo', 'rodilla'],
  'aterrizaje-controlado': ['rodilla', 'tobillo'],
  'sentadilla-salto': ['rodilla', 'tobillo', 'cadera'],
  'saltos-patinador': ['rodilla', 'tobillo', 'cadera'],

  // --- Calentamiento y movilidad ---------------------------------------------
  'jumping-jacks': ['tobillo', 'rodilla'],
  escaladores: ['muneca', 'hombro', 'cadera'],
  'gato-camello': ['muneca', 'rodilla'],
  'rotacion-toracica': ['muneca', 'rodilla'],
  'estiramiento-flexor-cadera': ['rodilla'],
  'estiramiento-isquiotibiales': [],
  'tobillo-pared': [],
  'angeles-pared': ['hombro'],
  'equilibrio-una-pierna': ['tobillo'],
  'movilidad-articular': [],

  // --- Material de casa (D-046) ----------------------------------------------
  'colgarse-barra': ['hombro', 'codo'],
  'dominadas-negativas': ['hombro', 'codo'],
  'dominadas-asistidas-goma': ['hombro', 'codo'],
  'dominadas-supinas': ['hombro', 'codo', 'muneca'],
  dominadas: ['hombro', 'codo'],
  'elevaciones-rodillas-colgado': ['hombro', 'espalda_baja'],
  'remo-goma': ['espalda_baja'],
  'jalon-goma': ['hombro'],
  'face-pull-goma': [],
  'separacion-goma': [],
  'press-pecho-goma': ['hombro'],
  'extension-triceps-goma': ['codo'],
  'press-pallof-goma': [],
  'paseo-lateral-goma': ['rodilla', 'cadera'],
  'press-suelo-mancuernas': ['hombro', 'codo'],
  'press-banca-mancuernas': ['hombro', 'codo'],
  'press-hombro-mancuernas': ['hombro', 'codo', 'espalda_baja'],
  'elevaciones-laterales': ['hombro'],
  'remo-inclinado-mancuernas': ['espalda_baja', 'hombro', 'codo'],
  'curl-mancuernas': ['codo', 'muneca'],
  'peso-muerto-rumano-mancuernas': ['espalda_baja', 'cadera'],
  'zancadas-mancuernas': ['rodilla', 'cadera', 'tobillo'],
  'peso-muerto-kettlebell': ['espalda_baja', 'cadera', 'rodilla'],
  'swing-kettlebell': ['espalda_baja', 'cadera'],
  'fondos-banco': ['hombro', 'codo', 'muneca'],

  // --- Acondicionamiento (D-047) ---------------------------------------------
  'rodillas-altas': ['rodilla', 'tobillo', 'cadera'],
  'boxeo-sombra': ['hombro'],
  'plancha-jacks': ['hombro', 'muneca', 'tobillo'],
  'escaladores-cruzados': ['muneca', 'hombro', 'cadera'],
  'subidas-escalon-rapidas': ['rodilla', 'tobillo'],
  'burpees-sin-salto': ['muneca', 'hombro', 'rodilla'],
  burpees: ['muneca', 'hombro', 'rodilla', 'tobillo'],
  'saltos-estrella': ['rodilla', 'tobillo'],
  'zancadas-salto': ['rodilla', 'tobillo', 'cadera'],
}

/** Las articulaciones que carga un ejercicio. Uno que no está en la tabla, ninguna. */
export function jointsOf(exerciseId: string): readonly CareZone[] {
  return EXERCISE_JOINTS[exerciseId] ?? []
}

/** `true` si el ejercicio carga alguna de las zonas que hay que cuidar. */
export function loadsCareZone(exerciseId: string, zones: readonly CareZone[]): boolean {
  if (zones.length === 0) return false
  return jointsOf(exerciseId).some((joint) => zones.includes(joint))
}
