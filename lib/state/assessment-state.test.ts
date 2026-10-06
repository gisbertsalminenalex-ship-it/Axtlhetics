/**
 * El estado de los tests de evolución (D-021, bloque 2): cargar, guardar y
 * retirar a través del repositorio, sin reglas del test y sin que nada del
 * entrenamiento los lea.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { createMemoryRepositories } from '../data/memory-repositories'
import type { AssessmentRepository } from '../data/repositories'
import {
  assessmentRestState,
  currentSide,
  currentTest,
  extendAssessmentRest,
  inProgressAssessment,
  recordResult,
  skipAssessmentRest,
  startAssessment,
  undoLeftSide,
} from '../domain/assessment/assessment'
import { at, completed, started } from '../domain/assessment/test-fixtures'
import type { Assessment } from '../domain/assessment/types'
import {
  deleteAssessment,
  EMPTY_ASSESSMENTS_STATE,
  INITIAL_ASSESSMENTS_STATE,
  loadAndReconcile,
  loadAssessments,
  persistAssessment,
  reconcileLoaded,
  withAssessment,
  withoutAssessment,
} from './assessment-state'

/** Un repositorio que falla en la operación indicada. */
function failing(operation: 'list' | 'save' | 'remove'): AssessmentRepository {
  const real = createMemoryRepositories().assessments
  return {
    list: operation === 'list' ? async () => { throw new Error('disco ilegible') } : real.list,
    save: operation === 'save' ? async () => { throw new Error('disco lleno') } : real.save,
    remove: operation === 'remove' ? async () => { throw new Error('disco bloqueado') } : real.remove,
  }
}

// ---------------------------------------------------------------------------
// Cargar
// ---------------------------------------------------------------------------

test('antes de cargar el estado está cargando y vacío', () => {
  assert.deepEqual(INITIAL_ASSESSMENTS_STATE, { status: 'loading', assessments: [], error: null })
})

test('sin tests guardados, la carga termina lista y vacía', async () => {
  const state = await loadAssessments(createMemoryRepositories().assessments)
  assert.deepEqual(state, { status: 'ready', assessments: [], error: null })
})

test('carga los tests guardados, del más reciente al más antiguo', async () => {
  const repository = createMemoryRepositories().assessments
  await repository.save(completed('2026-08-01'))
  await repository.save(completed('2026-09-05'))
  const state = await loadAssessments(repository)
  assert.equal(state.status, 'ready')
  assert.deepEqual(state.assessments.map((item) => item.dayKey), ['2026-09-05', '2026-08-01'])
})

test('si leer falla, el estado lo dice y no inventa una lista', async () => {
  const state = await loadAssessments(failing('list'))
  assert.equal(state.status, 'error')
  assert.deepEqual(state.assessments, [])
  assert.equal(state.error, 'disco ilegible')
})

// ---------------------------------------------------------------------------
// Guardar y retirar
// ---------------------------------------------------------------------------

test('guardar persiste en el repositorio', async () => {
  const repository = createMemoryRepositories().assessments
  const result = await persistAssessment(repository, completed('2026-09-05'))
  assert.deepEqual(result, { ok: true })
  assert.equal((await repository.list()).length, 1)
})

test('un test en curso también se guarda: así sobrevive a una recarga el mismo día', async () => {
  const repository = createMemoryRepositories().assessments
  const ongoing = recordResult(started('2026-10-05'), 14, at('2026-10-05'))
  assert.deepEqual(await persistAssessment(repository, ongoing), { ok: true })
  assert.equal((await repository.list())[0].status, 'in_progress')
})

test('algo que no tiene forma de test no llega al almacén', async () => {
  const repository = createMemoryRepositories().assessments
  const broken = { ...completed('2026-09-05'), results: [] } as Assessment
  const result = await persistAssessment(repository, broken)
  assert.equal(result.ok, false)
  assert.deepEqual(await repository.list(), [])
})

test('si guardar falla, se devuelve el motivo', async () => {
  const result = await persistAssessment(failing('save'), completed('2026-09-05'))
  assert.deepEqual(result, { ok: false, message: 'disco lleno' })
})

test('retirar borra del repositorio; si falla, se devuelve el motivo', async () => {
  const repository = createMemoryRepositories().assessments
  await repository.save(completed('2026-09-05'))
  assert.deepEqual(await deleteAssessment(repository, 'test-2026-09-05'), { ok: true })
  assert.deepEqual(await repository.list(), [])
  assert.deepEqual(await deleteAssessment(failing('remove'), 'x'), { ok: false, message: 'disco bloqueado' })
})

test('la lista tras guardar sustituye por id y mantiene el orden; tras retirar, lo quita', () => {
  const august = completed('2026-08-01')
  const ongoing = started('2026-10-05')
  let list = withAssessment([], august)
  list = withAssessment(list, ongoing)
  list = withAssessment(list, recordResult(ongoing, 14, at('2026-10-05')))
  assert.deepEqual(list.map((item) => item.id), [ongoing.id, august.id])
  assert.equal(list[0].results.length, 1, 'el mismo test avanzado, no un duplicado')
  assert.deepEqual(withoutAssessment(list, ongoing.id).map((item) => item.id), [august.id])
})

test('tras recargar, lo guardado se vuelve a leer igual', async () => {
  // Misma persistencia, estado nuevo: es lo que ocurre al recargar la app.
  const repository = createMemoryRepositories().assessments
  const saved = [completed('2026-08-01'), completed('2026-09-05')]
  for (const assessment of saved) await persistAssessment(repository, assessment)
  const reloaded = await loadAssessments(repository)
  assert.deepEqual(reloaded.assessments, [...saved].reverse())
})

test('borrar todos los datos deja el estado listo y vacío', () => {
  assert.deepEqual(EMPTY_ASSESSMENTS_STATE, { status: 'ready', assessments: [], error: null })
})

test('los tests no aparecen en los demás almacenes', async () => {
  const repositories = createMemoryRepositories()
  await persistAssessment(repositories.assessments, completed('2026-09-05'))
  assert.deepEqual(await repositories.workouts.list(), [])
  assert.equal(await repositories.axisMemory.getByDay('2026-09-05'), null)
})

// ---------------------------------------------------------------------------
// Arquitectura
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, '..', '..')

function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(path)
  }
  return out
}

function importsOf(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/from '([^']+)'/g)].map((match) => match[1])
}

test('la capa de estado de los tests no decide: delega en el dominio y en el repositorio', () => {
  for (const file of ['assessment-state.ts', 'use-assessment.ts']) {
    const path = join(import.meta.dirname, file)
    const domainImports = importsOf(path).filter((source) => source.includes('domain/'))
    for (const source of domainImports) {
      assert.ok(
        /domain\/(assessment\/(types|assessment)|shared\/dates)$/.test(source),
        `${file} importa ${source}`,
      )
    }
    const text = readFileSync(path, 'utf8')
    // Puede llamar al dominio (reconciliar, avanzar el test); lo que no hace es
    // decidir disponibilidad, comparar o elegir variante, ni hablar con AXIS.
    for (const rule of ['assessmentAvailability', 'compareAssessment', 'recommendedPushUpVariant', 'axis']) {
      assert.ok(!text.includes(rule), `${file} usa ${rule}`)
    }
  }
})

test('ningún componente ni página toca la capa de datos ni IndexedDB', () => {
  for (const dir of ['components', 'app']) {
    for (const file of sourcesUnder(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8')
      assert.ok(!/lib\/data|indexeddb|indexedDB/.test(text), file)
    }
  }
})

test('progresión, rotación, récords, Carga y estadísticas siguen sin leer los tests', () => {
  for (const file of [
    'lib/domain/workouts/history.ts',
    'lib/domain/workouts/load.ts',
    'lib/domain/workouts/active-workout.ts',
    'lib/domain/axis/session-builder.ts',
    'lib/domain/history/stats.ts',
  ]) {
    assert.ok(!readFileSync(join(ROOT, file), 'utf8').includes('assessment'), file)
  }
})

test('AXIS conoce los tests solo a través del dominio: nunca del almacén ni del estado', () => {
  for (const file of sourcesUnder(join(ROOT, 'lib', 'domain', 'axis'))) {
    for (const source of importsOf(file)) {
      assert.ok(!/lib\/data|\/data\/|indexeddb|state\//i.test(source), `${file} importa ${source}`)
    }
  }
})

// ---------------------------------------------------------------------------
// Bloque 4: el flujo del test con persistencia y recarga (D-021)
// ---------------------------------------------------------------------------

const DAY = '2026-10-05'
const NEXT_DAY = '2026-10-06'

/** Un paso del flujo como lo da el hook: dominio → guardar → recargar del almacén. */
async function step(repository: AssessmentRepository, change: (current: Assessment) => Assessment) {
  const state = await loadAndReconcile(repository, DAY)
  const current = inProgressAssessment(state.assessments, DAY)
  assert.ok(current, 'debería haber un test en curso')
  const next = change(current)
  assert.deepEqual(await persistAssessment(repository, next), { ok: true })
  return next
}

test('flujo completo: orden fijo, remo por lados, descanso, y cada paso sobrevive a una recarga', async () => {
  const repository = createMemoryRepositories().assessments
  const begun = startAssessment({ dayKey: DAY, pushUpVariantId: 'flexiones-inclinadas', now: at(DAY), id: 'flujo' })
  assert.ok(begun)
  await persistAssessment(repository, begun)

  const order: string[] = []
  const seen = async () => {
    const state = await loadAndReconcile(repository, DAY)
    return inProgressAssessment(state.assessments, DAY)
  }

  // Flexiones: 64 repeticiones, por encima del tope de 50 del entrenamiento.
  order.push(currentTest((await seen())!)!.key)
  let after = await step(repository, (current) => recordResult(current, 64, at(DAY, '18:01:00')))
  assert.equal(assessmentRestState(after, at(DAY, '18:01:00'))?.remainingSeconds, 120, 'descanso de 2 min')

  // +15 s y saltar, recargando entre medias.
  after = await step(repository, (current) => extendAssessmentRest(current, 15, at(DAY, '18:01:10')))
  assert.equal(assessmentRestState(after, at(DAY, '18:01:10'))?.remainingSeconds, 125)
  after = await step(repository, (current) => skipAssessmentRest(current))
  assert.equal(assessmentRestState(after, at(DAY, '18:01:11')), null)

  // Plancha y pared, en segundos.
  order.push(currentTest((await seen())!)!.key)
  await step(repository, (current) => recordResult(current, 95, at(DAY, '18:04:00')))
  order.push(currentTest((await seen())!)!.key)
  await step(repository, (current) => recordResult(current, 70, at(DAY, '18:07:00')))

  // Remo: izquierdo, corregir, izquierdo otra vez y derecho.
  order.push(currentTest((await seen())!)!.key)
  assert.equal(currentSide((await seen())!), 'left')
  await step(repository, (current) => recordResult(current, 11, at(DAY, '18:10:00')))
  assert.equal(currentSide((await seen())!), 'right')
  await step(repository, (current) => undoLeftSide(current))
  await step(repository, (current) => recordResult(current, 12, at(DAY, '18:10:30')))
  const done = await step(repository, (current) => recordResult(current, 13, at(DAY, '18:11:00')))

  assert.deepEqual(order, ['push', 'core', 'legs', 'pull'])
  assert.equal(done.status, 'completed')
  const stored = (await repository.list())[0]
  assert.equal(stored.status, 'completed')
  assert.deepEqual(stored.results.map((result) => result.values), [
    { kind: 'single', value: 64 },
    { kind: 'single', value: 95 },
    { kind: 'single', value: 70 },
    { kind: 'sides', left: 12, right: 13 },
  ])
  assert.equal(await seen(), null, 'completado, ya no está en curso')
})

test('un test a medias de hoy se reanuda tras recargar, en la misma prueba', async () => {
  const repository = createMemoryRepositories().assessments
  const ongoing = recordResult(started(DAY), 14, at(DAY))
  await persistAssessment(repository, ongoing)
  const state = await loadAndReconcile(repository, DAY)
  const resumed = inProgressAssessment(state.assessments, DAY)
  assert.equal(resumed?.id, ongoing.id)
  assert.equal(currentTest(resumed!)?.key, 'core')
})

test('al cambiar de día, un test a medias con algo registrado queda interrumpido y guardado', async () => {
  const repository = createMemoryRepositories().assessments
  await persistAssessment(repository, recordResult(started(DAY), 14, at(DAY)))
  const state = await loadAndReconcile(repository, NEXT_DAY)
  assert.equal(inProgressAssessment(state.assessments, NEXT_DAY), null)
  assert.equal(state.assessments[0].status, 'interrupted')
  assert.equal((await repository.list())[0].status, 'interrupted', 'guardado así en el almacén')
})

test('al cambiar de día, un test empezado sin nada registrado se retira', async () => {
  const repository = createMemoryRepositories().assessments
  await persistAssessment(repository, started(DAY))
  const state = await loadAndReconcile(repository, NEXT_DAY)
  assert.deepEqual(state.assessments, [])
  assert.deepEqual(await repository.list(), [])
})

test('reconciliar no toca los completados, los interrumpidos ni el de hoy', () => {
  const list = [completed('2026-09-01'), recordResult(started(DAY), 14, at(DAY))]
  const result = reconcileLoaded(list, DAY)
  assert.deepEqual(result.toSave, [])
  assert.deepEqual(result.toRemove, [])
  assert.equal(result.assessments.length, 2)
})
