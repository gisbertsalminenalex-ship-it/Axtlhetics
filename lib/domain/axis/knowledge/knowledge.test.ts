/**
 * El conocimiento de AXIS tiene una sola fuente.
 *
 * Aquí se comprueba que las tablas que AXIS usa para hablar de músculos, focos
 * y deportes no estén definidas dos veces, y que el vocabulario sea coherente
 * con el dominio de entrenamientos.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { detectIntent } from '../conversation/intents'
import { MAX_AVAILABLE_LOAD_KG } from '../../workouts/catalog'
import {
  FOCUS_MUSCLE_GROUPS as FOCUS_GROUPS_FROM_TYPES,
  MUSCLE_GROUP_LABELS as LABELS_FROM_TYPES,
} from '../../workouts/types'
import { describeFocus, FOCUS_MUSCLE_GROUPS, FOCUS_TERMS, SESSION_FOCUSES } from './focus'
import { isMuscleGroup, MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, muscleGroupLabel } from './muscles'
import {
  ACTIVITY_MENTION_TERMS,
  ACTIVITY_TERMS,
  EFFORT_TERMS,
  REPORTED_ACTIVITY_LOADS,
  SPORT_TERMS,
} from './sports'

const LIB = join(process.cwd(), 'lib')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, acc)
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) acc.push(path)
  }
  return acc
}

function definitionsOf(name: string): string[] {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\b`)
  return sourceFiles(LIB)
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => path.replace(process.cwd(), '').replace(/\\/g, '/'))
}

// ---------------------------------------------------------------------------
// Una sola tabla
// ---------------------------------------------------------------------------

test('los grupos musculares por foco se definen una sola vez', () => {
  assert.deepEqual(definitionsOf('FOCUS_MUSCLE_GROUPS'), ['/lib/domain/workouts/types.ts'])
  assert.equal(FOCUS_MUSCLE_GROUPS, FOCUS_GROUPS_FROM_TYPES, 'AXIS reexporta, no copia')
})

test('las etiquetas de grupos musculares y de focos se definen una sola vez', () => {
  assert.deepEqual(definitionsOf('MUSCLE_GROUP_LABELS'), ['/lib/domain/workouts/types.ts'])
  assert.deepEqual(definitionsOf('SESSION_FOCUS_LABELS'), ['/lib/domain/workouts/types.ts'])
  assert.equal(MUSCLE_GROUP_LABELS, LABELS_FROM_TYPES)
  assert.deepEqual(definitionsOf('FOCUS_LABELS'), [], 'no queda ninguna tabla paralela de etiquetas')
})

test('la carga máxima disponible se define una sola vez', () => {
  assert.deepEqual(definitionsOf('MAX_AVAILABLE_LOAD_KG'), ['/lib/domain/workouts/catalog.ts'])
  assert.deepEqual(definitionsOf('MAX_LOAD_KG'), [])
  assert.equal(MAX_AVAILABLE_LOAD_KG, 5)
})

test('el vocabulario de focos y deportes vive solo en knowledge', () => {
  assert.deepEqual(definitionsOf('FOCUS_TERMS'), ['/lib/domain/axis/knowledge/focus.ts'])
  assert.deepEqual(definitionsOf('SPORT_TERMS'), ['/lib/domain/axis/knowledge/sports.ts'])
  assert.deepEqual(definitionsOf('REPORTED_ACTIVITY_LOADS'), ['/lib/domain/axis/knowledge/sports.ts'])
  assert.deepEqual(definitionsOf('ACTIVITY_WORDS'), [])
  assert.deepEqual(definitionsOf('REPORTED_ACTIVITIES'), [])
})

test('knowledge solo contiene datos: nada de React, persistencia ni proveedor', () => {
  for (const path of sourceFiles(join(LIB, 'domain', 'axis', 'knowledge'))) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /from 'react'|indexedDB|getRepositories|gemini|fetch\(/i, path)
    assert.doesNotMatch(source, /from '\.\.\/(engine|rules|facts|actions|briefing|conversation)/, `${path} importa lógica`)
  }
})

// ---------------------------------------------------------------------------
// Coherencia
// ---------------------------------------------------------------------------

test('cada foco tiene grupos válidos y una descripción en minúscula', () => {
  for (const focus of SESSION_FOCUSES) {
    assert.ok(FOCUS_MUSCLE_GROUPS[focus].length > 0, focus)
    for (const group of FOCUS_MUSCLE_GROUPS[focus]) assert.ok(isMuscleGroup(group), `${focus} → ${group}`)
    assert.equal(describeFocus(focus), describeFocus(focus).toLowerCase())
  }
  assert.equal(describeFocus('core_movilidad'), 'core y movilidad')
})

test('cada término de foco apunta a un foco que existe y no se repite entre focos', () => {
  const seen = new Map<string, string>()
  for (const entry of FOCUS_TERMS) {
    assert.ok(SESSION_FOCUSES.includes(entry.focus), entry.focus)
    for (const term of entry.terms) {
      assert.equal(seen.get(term), undefined, `«${term}» está en ${seen.get(term)} y en ${entry.focus}`)
      seen.set(term, entry.focus)
    }
  }
})

test('lo que una actividad contada carga son grupos musculares reales', () => {
  for (const entry of REPORTED_ACTIVITY_LOADS) {
    assert.ok(entry.terms.length > 0)
    for (const group of entry.muscleGroups) assert.ok(isMuscleGroup(group), group)
  }
  assert.ok(MUSCLE_GROUPS.includes('gluteos'))
  assert.equal(muscleGroupLabel('gluteos'), 'glúteos')
  assert.equal(muscleGroupLabel('desconocido'), 'desconocido')
})

test('las menciones a actividad reúnen genéricos y deportes, sin repetir', () => {
  assert.deepEqual(ACTIVITY_MENTION_TERMS, [...ACTIVITY_TERMS, ...SPORT_TERMS])
  assert.equal(new Set(ACTIVITY_MENTION_TERMS).size, ACTIVITY_MENTION_TERMS.length)
  assert.equal(new Set(EFFORT_TERMS).size, EFFORT_TERMS.length)
})

test('un deporte que entiende la negociación también lo entiende la clasificación', () => {
  // Antes «básquet» y «tenis» se reconocían al negociar pero no al preguntar.
  for (const question of ['¿hoy tengo básquet?', '¿qué pasa con el tenis?', '¿tengo piscina hoy?']) {
    assert.equal(detectIntent(question), 'sport_today', question)
  }
})
